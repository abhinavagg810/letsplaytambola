// The only write path for games. Verifies the caller, runs the shared engine, and persists the
// result atomically through commit_game() (see migrations/0001_init.sql).
//   POST { op: 'create', input }        -> { ok, code } | { ok: false, error }
//   POST { op: 'act', code, action }    -> { ok }       | { ok: false, error }
// `../_shared/core` is a copy of packages/game-core/src made by `npm run sync:core`.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { applyAction, createGameDoc, newCode, type Ctx } from '../_shared/core/engine.ts';
import type { Actor, ContactInvite, CreateGameInput, GameAction, GameDoc, Tickets, TicketState } from '../_shared/core/types.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const fail = (error: string, status = 200) => json({ ok: false, error }, status);

const MAX_TRIES = 5;
const BUSY = 'The game is busy — try again';
const CONFLICT = '40001';   // commit_game: someone else wrote first
const DUPLICATE = '23505';  // commit_game: game code already taken

/** Which private tickets the engine needs for each action. Everything else needs none. */
const NEEDS_ALL: Record<string, true> = { restart: true, nextRound: true };
const NEEDS_MINE: Record<string, true> = { join: true, dab: true, claim: true };
const NEEDS_CONTACTS: Record<string, true> = { addContacts: true, markContactSent: true };

type Body = { op: 'create'; input: CreateGameInput } | { op: 'act'; code: string; action: GameAction };
interface TicketRow { user_id: string; ticket: TicketState['ticket']; dabs: number[]; rev: number }

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const ctx = (): Ctx => ({ now: Date.now(), rng: () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32 });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return fail('Method not allowed', 405);
  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: auth } = await db.auth.getUser(token);
    if (!auth?.user) return fail('Please sign in first', 401);
    const { data: p } = await db.from('profiles').select('id, name, username, color').eq('id', auth.user.id).maybeSingle();
    if (!p) return fail('Profile not found', 401);
    const actor: Actor = { uid: p.id, name: p.name || 'Player', username: p.username, color: p.color };

    const body = (await req.json()) as Body;
    if (body?.op === 'create' && body.input) return json(await create(body.input, actor));
    if (body?.op === 'act' && typeof body.code === 'string' && body.action) return json(await act(body.code.trim().toUpperCase(), body.action, actor));
    return fail('Bad request', 400);
  } catch (e) {
    console.error(e);
    return fail('Something went wrong — try again', 500);
  }
});

/** One atomic write; raises CONFLICT when `version` (or a ticket's rev) is no longer current. */
function commit(code: string, version: number | null, doc: GameDoc | null, tickets: unknown[], contacts: ContactInvite[] | null) {
  return db.rpc('commit_game', { p_code: code, p_version: version, p_doc: doc, p_tickets: tickets, p_contacts: contacts });
}

async function create(input: CreateGameInput, host: Actor) {
  for (let i = 0; i < MAX_TRIES; i++) {
    const c = ctx();
    const code = newCode(c.rng);
    const { doc, tickets, error } = createGameDoc(input, host, code, c);
    if (error) return { ok: false, error };
    const rows = Object.entries(tickets).map(([uid, t]) => ({ uid, ticket: t.ticket, dabs: t.dabs, rev: null }));
    const { error: dbError } = await commit(code, null, doc, rows, doc.contacts);
    if (!dbError) return { ok: true, code };
    if (dbError.code !== DUPLICATE) throw dbError;   // else: code already in use, roll another
  }
  return { ok: false, error: BUSY };
}

async function act(code: string, action: GameAction, actor: Actor) {
  const type = String((action as { type?: unknown }).type ?? '');
  for (let i = 0; i < MAX_TRIES; i++) {
    const { data: game, error: gameError } = await db.from('games').select('doc, version, host_id').eq('code', code).maybeSingle();
    if (gameError) throw gameError;
    if (!game) return { ok: false, error: 'Game not found' };
    const doc = game.doc as GameDoc;

    // The host's contact invites live outside the public doc; only these two (host-only) actions use them.
    if (NEEDS_CONTACTS[type] && game.host_id === actor.uid) {
      const { data: c } = await db.from('game_contacts').select('contacts').eq('code', code).maybeSingle();
      doc.contacts = (c?.contacts as ContactInvite[] | undefined) ?? [];
    }

    // Load only the private tickets this action needs.
    const tickets: Tickets = {};
    const revs: Record<string, number> = {};
    if (NEEDS_ALL[type] || NEEDS_MINE[type]) {
      let q = db.from('tickets').select('user_id, ticket, dabs, rev').eq('code', code);
      if (!NEEDS_ALL[type]) q = q.eq('user_id', actor.uid);
      const { data: rows, error: ticketError } = await q;
      if (ticketError) throw ticketError;
      for (const r of (rows ?? []) as TicketRow[]) {
        tickets[r.user_id] = { ticket: r.ticket, dabs: r.dabs };
        revs[r.user_id] = r.rev;
      }
    }

    const r = applyAction(doc, tickets, action, actor, ctx());
    if (!r.ok) return { ok: false, error: r.error ?? 'Something went wrong' };
    if (!r.docChanged && !r.touched.length) return { ok: true };

    const rows = r.touched.map((uid) => ({ uid, ticket: r.tickets[uid].ticket, dabs: r.tickets[uid].dabs, rev: revs[uid] ?? null }));
    const contactsChanged = r.docChanged && JSON.stringify(r.doc.contacts) !== JSON.stringify(doc.contacts);
    const { error } = await commit(code, game.version, r.docChanged ? r.doc : null, rows, contactsChanged ? r.doc.contacts : null);
    if (!error) return { ok: true };
    // First write wins. Reload and re-run: the engine now sees the winner's state, so e.g. a second
    // simultaneous claim comes back as "Full House already went to Asha".
    if (error.code !== CONFLICT && error.code !== DUPLICATE) throw error;
  }
  return { ok: false, error: BUSY };
}
