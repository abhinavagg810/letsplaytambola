// GET /api/admin/notify.csv — the "Notify me" numbers as a CSV file (up to 5,000). Admin only.
import { requireAdminApi } from '@/server/admin/guard';
import { EXPORT_MAX_ROWS, csvResponse } from '@/server/admin/queries';
import { csv } from '@/server/admin/stats';
import { formatIst, istDay } from '@/server/admin/time';
import { json } from '@/server/http';
import { ADMIN_MAX_PAGE, getStore } from '@/server/store';
import type { AdminNotifyRow } from '@/server/store';

export async function GET(request: Request): Promise<Response> {
  const admin = await requireAdminApi(request);
  if (admin instanceof Response) return admin;
  try {
    const store = getStore();
    const rows: AdminNotifyRow[] = [];
    for (let offset = 0; offset < EXPORT_MAX_ROWS; offset += ADMIN_MAX_PAGE) {
      const page = await store.adminListNotifyNumbers({ limit: ADMIN_MAX_PAGE, offset });
      rows.push(...page.rows);
      if (page.rows.length < ADMIN_MAX_PAGE || rows.length >= page.total) break;
    }
    // A phone number is all digits, so it cannot be read as a formula; keep it as text for spreadsheets.
    return csvResponse(csv(['WhatsApp number', 'Added (IST)'], rows.map((r) => [r.phone, formatIst(r.createdAt)])), `letsplaytambola-notify-${istDay(Date.now())}.csv`);
  } catch (e) {
    console.error('[api] GET /api/admin/notify.csv', e);
    return json({ ok: false, error: 'Something went wrong' }, 500);
  }
}
