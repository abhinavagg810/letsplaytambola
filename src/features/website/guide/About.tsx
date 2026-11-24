import { Button } from '@/components/Button';
import { CONTACT_EMAIL, SITE_NAME, SITE_URL, TEAM_CITY, TEAM_COUNTRY, TEAM_NAME } from '@/lib/site';
import { Bullets, CtaBand, GuideShell, P, Section, Steps } from './GuideShell';
import { JsonLd } from './JsonLd';
import styles from './guide.module.css';

const DIFFERENT: [title: string, body: string][] = [
  ['No sign-up, ever', 'Nobody creates an account — not the host, not the players. You type a name and play. Easy for Nani, easy for the grandkids.'],
  ['One WhatsApp link', 'The host shares one link in the family or kitty group. Tap it, type your name, and your ticket is ready. Nothing to download.'],
  ['A caller with a voice', 'Every number is announced with its traditional call — “Two fat ladies, 88!” — on every phone, so the host can play too.'],
  ['Fair, automatic claim checks', 'Numbers are drawn at random on our server and every claim is checked against the numbers really called. No arguments over who had the line first.'],
  ['Works on any phone', 'Any phone browser, any screen size, in the same room or across cities. Everyone sees the same live board.'],
  ['Free to play', 'Hosting and playing are free. To keep it that way, a few ads may appear before a game starts and after it ends — never while you are playing.'],
];

const MORE: [href: string, title: string, sub: string][] = [
  ['/how-to-play', 'How to play', 'Tickets, calls, claims and hosting, step by step'],
  ['/ways-to-win', 'Ways to win', 'All 26 patterns, with a picture of each'],
  ['/tambola-number-calls', 'Number calls', 'The traditional call for every number, 1 to 90'],
  ['/contact', 'Contact us', 'Help, feedback, or a request about your data'],
  ['/privacy', 'Privacy Policy', 'What we keep, why, and for how long'],
  ['/terms', 'Terms of Use', 'The rules of the site, in plain words'],
];

export function About() {
  return (
    <GuideShell
      kicker="ABOUT US"
      title="About Letsplaytambola"
      trail={[{ href: '/about', label: 'About us' }]}
      intro={
        <p>
          Letsplaytambola is a free website for playing Tambola (Housie) with the people you love — at a kitty party, a family function or a festival night. It is made by{' '}
          {TEAM_NAME}, based in {TEAM_CITY}, {TEAM_COUNTRY}.
        </p>
      }
      actions={<Button href="/host" size={56}>Host a game free</Button>}
    >
      <div className={styles.aboutGrid}>
        <Section id="who" title="Who we are">
          <P>
            We are {TEAM_NAME}, based in {TEAM_CITY}, {TEAM_COUNTRY}. We build and run this website. Tambola is part of so many Indian get-togethers — the
            Sunday family lunch, the monthly kitty, Diwali with the cousins — and we wanted a way to play it that keeps all of the fun and none of the fuss.
          </P>
        </Section>

        <Section id="why" title="Why it exists">
          <P>
            Paper tickets need printing and cutting. Somebody has to shout every number, and somebody always misses one. Checking a claim means leaning over a shoulder and
            counting. And when half the family lives in another city, they cannot play at all.
          </P>
          <P>
            Letsplaytambola fixes exactly that, and nothing more. One person hosts, everyone else joins from a WhatsApp link, and the website deals the tickets, calls the
            numbers out loud, shows a shared live board and checks every claim in a second. It is made for family, kitty-party and festival games — not for strangers, and
            not for betting.
          </P>
        </Section>

        <Section id="how" title="How it works">
          <Steps
            items={[
              { title: 'Host a game', body: 'Type your name, name the game and pick the ways to win. You get a link and a short code.' },
              { title: 'Share the link', body: 'Send it on WhatsApp, or read out the code in the same room. Players type their name and get a ticket.' },
              { title: 'Play together', body: 'Call each number or switch on auto-call. Everyone dabs their own ticket and claims prizes, checked instantly.' },
            ]}
          />
          <P>The full guide is on <a href="/how-to-play">How to play Tambola</a>.</P>
        </Section>

        <Section id="different" title="What makes it different">
          <ul className={styles.cards}>
            {DIFFERENT.map(([title, body]) => (
              <li key={title} className={styles.card}>
                <h3 className={styles.cardTitle}>{title}</h3>
                <p className={styles.cardBody}>{body}</p>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="promise" title="Our promise">
          <Bullets
            items={[
              <><b>Light on data.</b> No sign-up and no phone number needed to play. Tickets and dabs are erased 24 hours after a game’s last activity, other records after 90 days, and we never sell your data. The details are in our <a href="/privacy">Privacy Policy</a>.</>,
              <><b>No real-money play.</b> The website never collects, holds or pays money. A host can note a ticket price to keep track; anything else is settled between you, outside the app.</>,
              <><b>No ads during the game.</b> If ads are shown, they appear only in the waiting room before a game starts and on the results screen after it ends.</>,
              <><b>Fair for everyone.</b> Nobody — not the host, not us — can choose which number comes next.</>,
            ]}
          />
        </Section>

        <Section id="contact" title="Talk to us">
          <P>
            Questions, ideas or a problem with a game? Write to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> or use the form on our <a href="/contact">Contact
            page</a>. We read every message and try to reply within a few days.
          </P>
        </Section>

        <section className={styles.moreSection} aria-labelledby="more-h">
          <h2 id="more-h" className={styles.moreTitle}>Read more</h2>
          <ul className={styles.linkList}>
            {MORE.map(([href, title, sub]) => (
              <li key={href}>
                <a href={href} className={styles.linkCard}>
                  <span className={styles.linkTitle}>{title}</span>
                  <span className={styles.linkSub}>{sub}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <CtaBand title="Tonight’s game is one link away." body="Free to host. No sign-up to play. Works on any phone." />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: SITE_NAME,
          url: `${SITE_URL}/`,
          logo: `${SITE_URL}/icon.png`,
          description: 'A free website for playing Tambola (Housie) online with family and friends. No sign-up; one link on WhatsApp.',
          address: { '@type': 'PostalAddress', addressLocality: TEAM_CITY, addressCountry: 'IN' },
          contactPoint: { '@type': 'ContactPoint', contactType: 'customer support', email: CONTACT_EMAIL, areaServed: 'IN', availableLanguage: ['English'] },
        }}
      />
    </GuideShell>
  );
}
