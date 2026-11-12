import styles from './admin.module.css';

/** Shown on every /admin page when ADMIN_EMAIL or ADMIN_PASSWORD is not set. Says nothing else on purpose. */
export function AdminOff() {
  return (
    <div className={styles.center}>
      <div className={styles.loginCard}>
        <h1 className={styles.loginTitle}>Admin is not set up</h1>
        <p className={styles.loginSub}>This part of the site is switched off.</p>
      </div>
    </div>
  );
}
