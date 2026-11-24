import { Button } from '@/components/Button';
import { Ticket } from '@/components/Ticket';
import { RULES, RULE_GROUPS, describeCells, miniCells } from '@/core';
import type { RuleId } from '@/core';
import { CtaBand, GuideShell } from './GuideShell';
import { JsonLd } from './JsonLd';
import { ruleSlug, slugify } from './slug';
import styles from './ways.module.css';

type Level = 'Quick' | 'Medium' | 'Takes longer';

/** Our own words about each pattern: how hard it is, when it usually goes, a tip. The rule itself comes from src/core/data.ts. */
const ABOUT: Record<RuleId, { level: Level; text: string }> = {
  early5: { level: 'Quick', text: 'Usually the first prize of the evening, so it gets everyone dabbing from the very first calls. Watch the board closely — the fifth number can come before you expect it.' },
  early7: { level: 'Quick', text: 'Two numbers more than Early Five, so it goes a little later. A good second quick prize when a big family group is playing.' },
  early9: { level: 'Medium', text: 'Nine of your fifteen numbers — more than half the ticket. It keeps the middle of the game lively for people who are not close to a line yet.' },
  lucky3: { level: 'Quick', text: 'Only the first five numbers called count, so it is decided right at the start. If no ticket has three of those five, nobody can win it, and the round then carries on until all 90 numbers are called — so pick it when you are happy to play the full board.' },
  laddoo: { level: 'Quick', text: 'Just one number: the middle one of the middle line. Pure luck and a favourite at kitty parties, because anyone can win it in the first few calls.' },
  temp: { level: 'Medium', text: 'Your smallest and your biggest number — the low and the high, like a temperature or BP reading. Look at the first and last numbers of your ticket and wait for those two.' },
  top: { level: 'Medium', text: 'All five numbers of the top row. One of the classic prizes, and usually the first line to go.' },
  middle: { level: 'Medium', text: 'All five numbers of the middle row. As likely as the top line — it just feels slower when the top line has already gone.' },
  bottom: { level: 'Medium', text: 'All five numbers of the bottom row. Together with Top and Middle it makes the three-line set most groups play.' },
  railway: { level: 'Takes longer', text: 'Every number in the first column (1–9) and the last column (80–90), running down the ticket like two rails. How many numbers you need depends on your ticket — anything from two to six.' },
  bamboo: { level: 'Medium', text: 'Every number you have in the 40s — the middle column, standing tall like a bamboo stick. Some tickets have one number there, some have three.' },
  corners: { level: 'Medium', text: 'The first and last numbers of the top line and of the bottom line. Only four numbers, so it often goes before any full line.' },
  star: { level: 'Medium', text: 'The four corners plus the centre number (the Laddoo). Five numbers that make a star shape on the ticket.' },
  six: { level: 'Takes longer', text: 'The first and last number of every line — six numbers down both edges of the ticket.' },
  kings: { level: 'Quick', text: 'The first number of each of the three lines — the left edge. Only three numbers, so it can go early.' },
  queens: { level: 'Quick', text: 'The last number of each of the three lines — the right edge. The partner of King’s Corner; many groups play both.' },
  pyramid: { level: 'Takes longer', text: 'One number at the top, two in the middle and three at the bottom, making a triangle. On this site the six cells are fixed by position in each line, as the picture shows.' },
  rpyramid: { level: 'Takes longer', text: 'The pyramid turned upside down: three at the top, two in the middle, one at the bottom.' },
  diamond: { level: 'Medium', text: 'The centre of the top line, the two ends of the middle line and the centre of the bottom line — four numbers in a diamond.' },
  one24: { level: 'Takes longer', text: 'Say it the Hindi way: one, two, then four. The first number of the top line, the first two of the middle line and the first four of the bottom line — seven in all.' },
  breakfast: { level: 'Takes longer', text: 'Every number on your ticket from 1 to 29 — the morning part of the day. Breakfast, Lunch and Dinner together split the board like the day’s meals.' },
  lunch: { level: 'Takes longer', text: 'Every number on your ticket from 30 to 59. Often the hardest of the three meals, because the middle numbers are spread over three columns.' },
  dinner: { level: 'Takes longer', text: 'Every number on your ticket from 60 to 90 — the last meal of the day, and the biggest range of the three.' },
  day: { level: 'Takes longer', text: 'Every number from 1 to 45 on your ticket. A playful family pair: Devrani, the younger sister-in-law, takes the smaller numbers…' },
  night: { level: 'Takes longer', text: '…and Jethani, the elder sister-in-law, takes 46 to 90. Play both and the whole board is shared between them.' },
  full: { level: 'Takes longer', text: 'Every number on the ticket — the big one. Traditionally the last prize of the round; on this site the round ends when every prize you picked has a winner or all 90 numbers have been called.' },
};

const GROUP_INTRO: Record<string, string> = {
  Quick: 'Small prizes that are won early. They keep everyone interested from the very first number.',
  Lines: 'A whole row, or a whole column of numbers. The heart of a classic Housie game.',
  Corners: 'Numbers at the edges of the ticket. Fewer numbers than a line, so they often go sooner.',
  Shapes: 'Patterns drawn across the three lines. The positions count, not the values.',
  'Number ranges': 'Every number of yours inside a range. The number of dabs you need depends on your ticket.',
  'Full ticket': 'All fifteen numbers.',
};

export function WaysToWinGuide() {
  return (
    <GuideShell
      wide
      kicker="GUIDE · 26 PATTERNS"
      title="All 26 ways to win in Tambola"
      trail={[{ href: '/ways-to-win', label: 'Ways to win' }]}
      intro={
        <p>
          Every pattern you can play on Letsplaytambola, with a picture of the numbers it needs. The host picks any mix of them when setting up a game — each one can be won
          once per round, and the same player may win more than one. Claims are checked against the numbers actually called, so nobody has to count by hand.
        </p>
      }
      actions={
        <>
          <Button href="/host" size={56}>Host a game with these</Button>
          <Button href="/how-to-play" variant="outline" size={56}>How to play</Button>
        </>
      }
    >
      <nav className={styles.jump} aria-label="Jump to a pattern">
        {RULE_GROUPS.map((g) => (
          <div key={g} className={styles.jumpGroup}>
            <a href={`#${slugify(g)}`} className={styles.jumpHead}>{g}</a>
            <ul className={styles.jumpList}>
              {RULES.filter((r) => r.group === g).map((r) => (
                <li key={r.id}><a href={`#${ruleSlug(r.id)}`} className={styles.jumpLink}>{r.name}</a></li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <p className={styles.howTo}>
        <b>How to read the pictures:</b> each one is the same example ticket. Pink circles are the numbers the pattern needs on that ticket; striped boxes are blanks. On
        your own ticket the numbers will be different, but the positions work the same way. Patterns that ask for “any” numbers show one example.
      </p>

      {RULE_GROUPS.map((g) => (
        <section key={g} id={slugify(g)} className={styles.group} aria-labelledby={`${slugify(g)}-h`}>
          <div className={styles.groupHead}>
            <h2 id={`${slugify(g)}-h`} className={styles.groupTitle}>{g}</h2>
            <p className={styles.groupIntro}>{GROUP_INTRO[g]}</p>
          </div>
          <div className={styles.cards}>
            {RULES.filter((r) => r.group === g).map((r) => {
              const m = miniCells(r.id);
              const where = describeCells(m);
              const about = ABOUT[r.id];
              return (
                <article key={r.id} id={ruleSlug(r.id)} className={styles.card} aria-labelledby={`${ruleSlug(r.id)}-h`}>
                  <div className={styles.cardHead}>
                    <h3 id={`${ruleSlug(r.id)}-h`} className={styles.cardTitle}>{r.name}</h3>
                    <span className={styles.level} data-level={about.level}>{about.level}</span>
                  </div>
                  <p className={styles.rule}><span className={styles.ruleLabel}>RULE</span> {r.rule}</p>
                  <figure className={styles.figure}>
                    <div aria-hidden="true">
                      <Ticket ticket={m.ticket} marked={m.numbers} bare className={styles.mini} />
                    </div>
                    <figcaption className={styles.caption}>
                      {m.example ? 'For example, on this ticket: ' : 'On this ticket it needs: '}
                      {where}.
                    </figcaption>
                  </figure>
                  <p className={styles.text}>{about.text}</p>
                </article>
              );
            })}
          </div>
        </section>
      ))}

      <CtaBand title="Pick your favourites and play tonight." body="Classic, Lines + House, or your own mix — choose them in one tap when you host. Free, and nobody needs to sign up." />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: 'Ways to win in Tambola',
          numberOfItems: RULES.length,
          itemListElement: RULES.map((r, i) => ({ '@type': 'ListItem', position: i + 1, name: r.name, description: r.rule })),
        }}
      />
    </GuideShell>
  );
}
