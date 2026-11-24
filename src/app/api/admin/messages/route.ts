// POST /api/admin/messages { action: 'read' | 'unread' | 'delete', id } — Admin → Messages. Admin only; JSON + same-origin
// only (CSRF), like every state-changing admin route. A delete writes one audit line (id and topic, never the text).
import { requireAdminApi } from '@/server/admin/guard';
import { json, readJson } from '@/server/http';
import { getStore } from '@/server/store';

const ACTIONS = ['read', 'unread', 'delete'] as const;

export async function POST(request: Request): Promise<Response> {
  const admin = await requireAdminApi(request, { mutation: true });
  if (admin instanceof Response) return admin;
  try {
    const body = await readJson(request, 1024);
    const action = body?.action;
    const id = body?.id;
    if (typeof action !== 'string' || !(ACTIONS as readonly string[]).includes(action)) return json({ ok: false, error: 'Unknown action' }, 400);
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1) return json({ ok: false, error: 'A message id is a whole number' }, 400);
    const store = getStore();
    const done = action === 'delete' ? await store.adminDeleteContactMessage(id) : await store.adminSetContactRead(id, action === 'read');
    if (!done) return json({ ok: false, error: 'That message is not there any more' }, 404);
    if (action === 'delete') console.info(`[admin] deleted contact message ${id}`);
    return json({ ok: true });
  } catch (e) {
    console.error('[api] POST /api/admin/messages', e instanceof Error ? e.message : e);
    const needsMigration = e instanceof Error && /0004_contact/.test(e.message);
    return json({ ok: false, error: needsMigration ? 'Run supabase/migrations/0004_contact.sql first — nothing was changed' : 'Something went wrong — nothing was changed' }, needsMigration ? 409 : 500);
  }
}
