import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AdminOff } from '@/features/admin/AdminOff';
import { LoginForm } from '@/features/admin/LoginForm';
import styles from '@/features/admin/admin.module.css';
import { adminConfigured } from '@/server/admin/auth';
import { getAdminSession } from '@/server/admin/guard';

export const metadata: Metadata = { title: 'Sign in' };

export default async function AdminLoginPage() {
  const session = await getAdminSession();
  if (!adminConfigured()) return <AdminOff />;
  if (session) redirect('/admin');
  return (
    <div className={styles.center}>
      <LoginForm />
    </div>
  );
}
