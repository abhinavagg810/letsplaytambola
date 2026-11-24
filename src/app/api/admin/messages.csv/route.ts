// GET /api/admin/messages.csv?topic=&q=&status= — Admin → Messages as a CSV file (up to 5,000). Admin only.
// Messages are what people typed: every cell goes through csv(), which defuses formulas (a leading = + - @).
import { requireAdminApi } from '@/server/admin/guard';
import { MESSAGE_CSV_HEAD, messageCsvRow, messagesQuery, parseMessagesFilter } from '@/server/admin/messages';
import { EXPORT_MAX_ROWS, csvResponse } from '@/server/admin/queries';
import { csv } from '@/server/admin/stats';
import { istDay } from '@/server/admin/time';
import { json } from '@/server/http';
import { ADMIN_MAX_PAGE, getStore } from '@/server/store';
import type { AdminContactMessage } from '@/server/store';

export async function GET(request: Request): Promise<Response> {
  const admin = await requireAdminApi(request);
  if (admin instanceof Response) return admin;
  try {
    const filter = parseMessagesFilter(new URL(request.url).searchParams);
    const store = getStore();
    const rows: AdminContactMessage[] = [];
    for (let offset = 0; offset < EXPORT_MAX_ROWS; offset += ADMIN_MAX_PAGE) {
      const page = await store.adminListContactMessages({ ...messagesQuery({ ...filter, page: 1 }, ADMIN_MAX_PAGE), offset });
      rows.push(...page.rows);
      if (page.rows.length < ADMIN_MAX_PAGE || rows.length >= page.total) break;
    }
    return csvResponse(csv(MESSAGE_CSV_HEAD, rows.map(messageCsvRow)), `letsplaytambola-messages-${istDay(Date.now())}.csv`);
  } catch (e) {
    console.error('[api] GET /api/admin/messages.csv', e);
    return json({ ok: false, error: 'Something went wrong' }, 500);
  }
}
