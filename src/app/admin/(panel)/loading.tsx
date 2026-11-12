import styles from '@/features/admin/admin.module.css';

/** Shown the instant an admin tab is clicked, while the server gathers that page's numbers. */
export default function AdminLoading() {
  return (
    <div className={styles.loading} role="status" aria-live="polite">
      <span className={styles.spinner} aria-hidden="true" />
      Loading…
    </div>
  );
}
