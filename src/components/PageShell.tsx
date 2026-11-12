import type { ReactNode } from 'react';
import { cx } from './cx';
import { SiteFooter } from './SiteFooter';
import { SiteHeader } from './SiteHeader';
import styles from './PageShell.module.css';

export interface PageShellProps {
  children: ReactNode;
  /** Paint the page background gradient (plum + soft pink glow, top left). Default true. The website home turns it off (its sections have their own). */
  gradient?: boolean;
  /** Show the shared footer. Default true. */
  footer?: boolean;
  /** Class for the `<main>` element. */
  className?: string;
}

/**
 * Page frame used by every route: full-height column with the sticky SiteHeader, `<main>`, and the SiteFooter.
 * See docs/COMPONENTS.md.
 */
export function PageShell({ children, gradient = true, footer = true, className }: PageShellProps) {
  return (
    <div className={cx(styles.shell, gradient && styles.gradient)}>
      <SiteHeader />
      <main className={cx(styles.main, className)}>{children}</main>
      {footer ? <SiteFooter /> : null}
    </div>
  );
}
