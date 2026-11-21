import styles from '@/features/admin/ui.module.css';

/** Shown the instant an admin section is opened, while the server gathers that page's numbers: the page's outline. */
export default function AdminLoading() {
  return (
    <div role="status" aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <span className="visually-hidden">Loading…</span>
      <div className={styles.skel} style={{ height: 38, width: 'min(280px, 60%)' }} />
      <div className={styles.kpis} aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => <div key={i} className={styles.skel} style={{ height: 104 }} />)}
      </div>
      <div className={styles.grid2} aria-hidden="true">
        <div className={styles.skel} style={{ height: 300 }} />
        <div className={styles.skel} style={{ height: 300 }} />
      </div>
    </div>
  );
}
