import type { ReactNode } from 'react';
import { AdminShell } from '@/features/admin/AdminShell';
import { MigrationNotice } from '@/features/admin/bits';
import { requireAdmin } from '@/server/admin/guard';
import { DAY_MS, istDay } from '@/server/admin/time';
import { ADMIN_RETENTION_DAYS, getStore } from '@/server/store';

/** The frame around every signed-in admin page. Each page ALSO calls requireAdmin() itself. */
export default async function AdminPanelLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdmin();
  // Admin switched off: the page itself renders the plain "not set up" message, without the frame.
  if (admin.off) return children;
  // Has the database been given migration 0003? If the check itself fails, say nothing here: the page will report it.
  const store = getStore();
  const [insights, unread] = await Promise.all([
    store.insightsStatus().catch(() => 'ok' as const),
    // Unread contact messages for the sidebar badge (0 before migration 0004, or when the count cannot be read).
    store.adminCountUnreadContact().catch(() => 0),
  ]);
  return (
    <AdminShell
      email={admin.session.email}
      minDay={istDay(admin.now - (ADMIN_RETENTION_DAYS - 1) * DAY_MS)}
      maxDay={istDay(admin.now)}
      notice={insights === 'missing' ? <MigrationNotice /> : null}
      badges={{ '/admin/messages': unread }}
    >
      {children}
    </AdminShell>
  );
}
