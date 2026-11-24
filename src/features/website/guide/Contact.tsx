import { CONTACT_EMAIL, TEAM_CITY, TEAM_COUNTRY } from '@/lib/site';
import { ContactForm } from './ContactForm';
import { GuideShell } from './GuideShell';
import styles from './contact.module.css';

/** /contact — who we are, how to reach us, and the message form. */
export function Contact() {
  return (
    <GuideShell
      kicker="CONTACT US"
      title="Contact us"
      trail={[{ href: '/contact', label: 'Contact' }]}
      intro={<p>Need help with a game, have an idea, or want your data removed? Write to us — a real person reads every message.</p>}
    >
      <div className={styles.grid}>
        <div className={styles.info}>
          <section className={styles.card} aria-labelledby="reach-h">
            <h2 id="reach-h" className={styles.cardTitle}>Write to us</h2>
            <p className={styles.text}>
              Email{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className={styles.email}>
                {CONTACT_EMAIL}
              </a>
              , or send a message with the form. We try to reply within a few days.
            </p>
            <p className={styles.text}>
              <b>The Letsplaytambola team</b>
              <br />
              {TEAM_CITY}, {TEAM_COUNTRY}
            </p>
          </section>

          <section className={styles.card} aria-labelledby="about-what-h">
            <h2 id="about-what-h" className={styles.cardTitle}>What to write about</h2>
            <ul className={styles.list}>
              <li><b>Help with a game.</b> Tell us the game code (five characters, such as K7RQ2), roughly when you played and what went wrong.</li>
              <li><b>Feedback or an idea.</b> A pattern you play at your kitty, a call your family uses, something that confused you — we would love to hear it.</li>
              <li><b>Remove my data.</b> Tell us the game code and the name you used, so we can find your device’s records and erase them. See our <a href="/privacy#rights">Privacy Policy</a>.</li>
              <li><b>Business or advertising.</b> Partnerships, events or advertising enquiries.</li>
            </ul>
          </section>

          <p className={styles.small}>
            Looking for how to play? Start with <a href="/how-to-play">How to play Tambola</a>, the <a href="/ways-to-win">26 ways to win</a> and the{' '}
            <a href="/tambola-number-calls">number calls</a>.
          </p>
        </div>

        <section className={`${styles.card} ${styles.formCard}`} aria-labelledby="form-h">
          <h2 id="form-h" className={styles.cardTitle}>Send us a message</h2>
          <p className={styles.text}>Your name and a way to reply are optional — without them we cannot write back, but we still read it.</p>
          <ContactForm email={CONTACT_EMAIL} />
        </section>
      </div>
    </GuideShell>
  );
}
