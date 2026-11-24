import type { ReactNode } from 'react';
import { Button } from '@/components/Button';
import { PageShell } from '@/components/PageShell';
import legal from '../legal.module.css';
import { Breadcrumbs } from './Breadcrumbs';
import type { Crumb } from './Breadcrumbs';
import styles from './guide.module.css';

export interface TocItem {
  id: string;
  title: string;
}

/**
 * The frame of the content pages (/about, /contact and the guides): breadcrumbs, kicker, h1 and intro in the legal
 * pages' reading layout, then either an "On this page" list beside the sections (`toc`) or a full-width body.
 * No ads on these pages.
 */
export function GuideShell({ kicker, title, intro, trail, toc, actions, children, wide }: {
  kicker: string;
  title: ReactNode;
  intro: ReactNode;
  trail: Crumb[];
  toc?: TocItem[];
  actions?: ReactNode;
  children: ReactNode;
  /** Let the body use the full content width (the pattern and number grids). */
  wide?: boolean;
}) {
  return (
    <PageShell gradient={false}>
      <div className={`${legal.head} ${styles.head}`}>
        <Breadcrumbs trail={trail} />
        <span className={styles.kicker}>{kicker}</span>
        <h1 className={legal.h1}>{title}</h1>
        <div className={legal.intro}>{intro}</div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>
      {toc ? (
        <div className={legal.body}>
          <nav className={legal.toc} aria-label="On this page">
            <span className={legal.tocLabel}>ON THIS PAGE</span>
            {toc.map((s) => (
              <a key={s.id} href={`#${s.id}`} className={legal.tocLink}>
                {s.title}
              </a>
            ))}
          </nav>
          <div className={`${legal.content} ${styles.content}`}>{children}</div>
        </div>
      ) : (
        <div className={wide ? styles.wideBody : styles.body}>{children}</div>
      )}
    </PageShell>
  );
}

/** One section of a guide: an anchor, an h2 and its content. */
export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className={legal.section} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className={legal.h2}>
        {title}
      </h2>
      {children}
    </section>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p className={legal.para}>{children}</p>;
}

export function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className={legal.bullets}>
      {items.map((b, i) => (
        <li key={i} className={legal.bullet}>
          <span className={legal.dot} aria-hidden="true" />
          <span>{b}</span>
        </li>
      ))}
    </ul>
  );
}

/** Numbered steps with the home page's coloured number balls. */
export function Steps({ items }: { items: { title: string; body: ReactNode }[] }) {
  const tones = ['var(--pink)', 'var(--marigold)', 'var(--teal)'];
  return (
    <ol className={styles.steps}>
      {items.map((s, i) => (
        <li key={s.title} className={styles.step}>
          <span className={styles.stepBall} style={{ background: tones[i % 3] }} aria-hidden="true">
            {i + 1}
          </span>
          <div className={styles.stepText}>
            <h3 className={styles.h3}>{s.title}</h3>
            <div className={legal.para}>{s.body}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** A marigold note box (the legal pages' "In short" look). */
export function Note({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className={legal.short}>
      {label ? <b>{label} </b> : null}
      {children}
    </div>
  );
}

/** The marigold band at the end of a guide: one clear next step. */
export function CtaBand({ title, body, href = '/host', label = 'Host a game free' }: { title: string; body: string; href?: string; label?: string }) {
  return (
    <div className={styles.band}>
      <div className={styles.bandCopy}>
        <h2 className={styles.bandTitle}>{title}</h2>
        <p className={styles.bandBody}>{body}</p>
      </div>
      <Button href={href} variant="ink" size={60} fontSize={20}>
        {label}
      </Button>
    </div>
  );
}
