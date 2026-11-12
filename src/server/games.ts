// The game service: load → engine → compare-and-swap commit → retry on conflict.
// Every rule lives in src/core; this file only works out who is asking and persists the result.
import { randomInt } from 'node:crypto';
import { applyAction, createGame, isGameCode, projectView } from '@/core';
import type { Actor, CreateGameInput, GameAction, GameState, GameView } from '@/core';
import { HTTP_COPY, serviceError, statusFor } from './http';
import type { ServiceResult } from './http';
import { getStore } from './store';
import type { GameStore, PlayerWrite, StoredGame } from './store';

/** How many times an action is retried when someone else commits first. */
export const MAX_COMMIT_ATTEMPTS = 5;
/** A member opening the game counts as activity, but at most this often (keeps reads cheap). */
const TOUCH_EVERY_MS = 30 * 60_000;

/** Uniform in [0, 1), from the OS random source: numbers are drawn on the server. */
export const secureRng = (): number => randomInt(0, 0x1_0000_0000) / 0x1_0000_0000;

interface Deps {
  store?: GameStore;
  now?: () => number;
  rng?: () => number;
}

function toState(g: StoredGame): GameState {
  const players: GameState['players'] = {};
  for (const p of g.players) players[p.pid] = { pid: p.pid, ticket: p.ticket, marks: p.marks };
  return { doc: g.doc, players };
}

/** Who is this device in this game? Decided only by the token hash — never by anything in the request body. */
function actorFor(g: StoredGame, tokenHash: string | null): Actor {
  if (!tokenHash) return { isHost: false, pid: null };
  return {
    isHost: g.hostTokenHash === tokenHash,
    pid: g.players.find((p) => p.tokenHash === tokenHash)?.pid ?? null,
  };
}

export function normaliseCodeParam(raw: string): string {
  return raw.trim().toUpperCase();
}

export async function createGameForDevice(tokenHash: string, input: unknown, deps: Deps = {}): Promise<ServiceResult<{ code: string }>> {
  const store = deps.store ?? getStore();
  const rng = deps.rng ?? secureRng;
  const made = createGame(input as CreateGameInput, 'XXXXX', { now: (deps.now ?? Date.now)(), rng });
  if (!made.ok) return serviceError(statusFor(made.code), made.code, made.error);
  const players: PlayerWrite[] = made.touched.map((pid) => ({ ...made.state.players[pid], rev: null, tokenHash }));
  const code = await store.create({ doc: made.state.doc, hostTokenHash: tokenHash, players }, rng);
  return { ok: true, code };
}

export async function viewGame(rawCode: string, tokenHash: string | null, deps: Deps = {}): Promise<ServiceResult<{ game: GameView }>> {
  const store = deps.store ?? getStore();
  const now = (deps.now ?? Date.now)();
  const code = normaliseCodeParam(rawCode);
  const stored = isGameCode(code) ? await store.load(code) : null;
  if (!stored) return serviceError(404, 'not_found', HTTP_COPY.notFound(code.slice(0, 12)), true);
  const actor = actorFor(stored, tokenHash);
  if ((actor.isHost || actor.pid) && now - stored.updatedAt > TOUCH_EVERY_MS) {
    await store.touch(code).catch(() => undefined);
  }
  return { ok: true, game: projectView(toState(stored), actor, now) };
}

export async function actOnGame(
  rawCode: string, tokenHash: string, action: unknown, deps: Deps = {},
): Promise<ServiceResult<{ game: GameView; changedVersion: number | null }>> {
  const store = deps.store ?? getStore();
  const code = normaliseCodeParam(rawCode);
  if (!isGameCode(code)) return serviceError(404, 'not_found', HTTP_COPY.notFound(code.slice(0, 12)), true);

  for (let attempt = 0; attempt < MAX_COMMIT_ATTEMPTS; attempt++) {
    const stored = await store.load(code);
    if (!stored) return serviceError(404, 'not_found', HTTP_COPY.notFound(code), true);
    const now = (deps.now ?? Date.now)();
    const actor = actorFor(stored, tokenHash);
    const result = applyAction(toState(stored), action as GameAction, actor, { now, rng: deps.rng ?? secureRng });
    if (!result.ok) return serviceError(statusFor(result.code), result.code, result.error);

    const viewer: Actor = { isHost: actor.isHost, pid: result.pid ?? actor.pid };
    if (!result.changed && result.touched.length === 0) {
      // Nothing to write (e.g. joining twice from the same device).
      return { ok: true, game: projectView(result.state, viewer, now), changedVersion: null };
    }

    const players: PlayerWrite[] = result.touched.map((pid) => {
      const existing = stored.players.find((p) => p.pid === pid);
      return existing
        ? { ...result.state.players[pid], rev: existing.rev }
        : { ...result.state.players[pid], rev: null, tokenHash };
    });
    const outcome = await store.commit(code, stored.version, { doc: result.changed ? result.state.doc : null, players });
    if (outcome === 'ok') {
      return {
        ok: true,
        game: projectView(result.state, viewer, now),
        changedVersion: result.changed ? result.state.doc.version : null,
      };
    }
    // Someone else committed first: reload and run the rules again on the fresh state
    // (a second claim for the same prize then gets "already won").
  }
  return serviceError(503, 'busy', HTTP_COPY.busy);
}

export async function saveNotifyNumber(phone: unknown, deps: Deps = {}): Promise<ServiceResult<object>> {
  const digits = typeof phone === 'string' ? phone.replace(/[\s-]/g, '') : '';
  if (!/^[0-9]{10}$/.test(digits)) return serviceError(400, 'invalid', HTTP_COPY.badPhone);
  await (deps.store ?? getStore()).saveNotifyNumber(digits);
  return { ok: true };
}
