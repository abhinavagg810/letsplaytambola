import type { ReactNode } from 'react';
import { AdminShell } from '@/features/admin/AdminShell';
import { requireAdmin } from '@/server/admin/guard';

/** The frame around every signed-in admin page. Each page ALSO calls requireAdmin() itself. */
export default async function AdminPanelLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdmin();
  // Admin switched off: the page itself renders the plain "not set up" message, without the frame.
  if (admin.off) return children;
  return <AdminShell email={admin.session.email}>{children}</AdminShell>;
}
