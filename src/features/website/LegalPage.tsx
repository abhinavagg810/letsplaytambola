import { PageShell } from '@/components/PageShell';
import { CONTACT_EMAIL_PLACEHOLDER, LEGAL_LAST_UPDATED, type LegalSection } from './legal';
import styles from './legal.module.css';

export interface LegalPageProps {
  title: string;
  intro: string;
  /** The "In short:" box. */
  summary: string;
  sections: LegalSection[];
}

/** Turns the {email} marker in legal text into a mail link. */
function withEmail(text: string) {
  const parts = text.split('{email}');
  return parts.flatMap((part, i) =>
    i === 0
      ? [part]
      : [
          <a key={i} href={`mailto:${CONTACT_EMAIL_PLACEHOLDER}`}>
            {CONTACT_EMAIL_PLACEHOLDER}
          </a>,
          part,
        ],
  );
}

/** Layout shared by /privacy and /terms: heading, "On this page" list, numbered sections. */
export function LegalPage({ title, intro, summary, sections }: LegalPageProps) {
  return (
    <PageShell gradient={false}>
      <div className={styles.head}>
        <span className={styles.updated}>LAST UPDATED · {LEGAL_LAST_UPDATED.toUpperCase()}</span>
        <h1 className={styles.h1}>{title}</h1>
        <p className={styles.intro}>{intro}</p>
      </div>
      <div className={styles.body}>
        <nav className={styles.toc} aria-label="On this page">
          <span className={styles.tocLabel}>ON THIS PAGE</span>
          {sections.map((s) => (
            <a key={s.id} href={`#${s.id}`} className={styles.tocLink}>
              {s.title}
            </a>
          ))}
        </nav>
        <div className={styles.content}>
          <div className={styles.short}>
            <b>In short:</b> {summary}
          </div>
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className={styles.section}>
              <h2 className={styles.h2}>
                {i + 1}. {s.title}
              </h2>
              {s.paras?.map((p) => (
                <p key={p} className={styles.para}>
                  {withEmail(p)}
                </p>
              ))}
              {s.bullets?.length ? (
                <ul className={styles.bullets}>
                  {s.bullets.map((b) => (
                    <li key={b} className={styles.bullet}>
                      <span className={styles.dot} aria-hidden="true" />
                      <span>{withEmail(b)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
