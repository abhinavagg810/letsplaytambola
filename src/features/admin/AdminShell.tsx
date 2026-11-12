import type { ReactNode } from 'react';
import { AdminNav } from './AdminNav';
import { SignOutButton } from './SignOutButton';
import styles from './admin.module.css';

/** The admin frame: a compact top bar (sections, who is signed in, sign out) and the page below. Not the public header/footer. */
export function AdminShell({ email, children }: { email: string; children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          {/* A plain link (full page load) keeps this out of the client router's cache. */}
          <a href="/admin" className={styles.brand}>
            Letsplaytambola <span className={styles.brandTag}>Admin</span>
          </a>
          <AdminNav />
          <div className={styles.who}>
            <span className={styles.whoEmail} title={email}>
              <span className="visually-hidden">Signed in as </span>
              {email}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
