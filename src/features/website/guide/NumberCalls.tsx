import { Button } from '@/components/Button';
import { CALLOUTS, calloutFor, spokenNumber } from '@/core';
import { Bullets, CtaBand, GuideShell, P, Section } from './GuideShell';
import { PrintButton } from './PrintButton';
import styles from './calls.module.css';

/** The calls with an Indian story behind them, in our own words. */
const INDIAN: Record<number, string> = {
  18: 'In India you can vote from the age of 18.',
  42: 'The Quit India movement was launched in August 1942.',
  47: 'India became independent on 15 August 1947.',
  57: 'The uprising of 1857, also remembered as the First War of Independence.',
  60: 'Sixty is the age at which many Indian schemes count you as a senior citizen.',
  80: '“Eight-oh” sounds like “ate nothing” — a nod to Gandhiji’s famous fasts.',
};

const DECADES: [number, number][] = [[1, 9], [10, 19], [20, 29], [30, 39], [40, 49], [50, 59], [60, 69], [70, 79], [80, 90]];
const range = (lo: number, hi: number): number[] => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);

export function NumberCalls() {
  return (
    <GuideShell
      wide
      kicker={`GUIDE · ALL ${CALLOUTS.length} CALLS`}
      title="All 90 Tambola number calls"
      trail={[{ href: '/tambola-number-calls', label: 'Number calls' }]}
      intro={
        <p>
          Every Housie number has a nickname — a rhyme, a joke or a bit of history — and calling them out is half the fun. Here is the full list our caller uses, from
          Kelly’s eye to Top of the house, with the way each number is read out after it.
        </p>
      }
      actions={
        <>
          <Button href="/host" size={56}>Host a game with the caller</Button>
          <PrintButton className={styles.printBtn} />
        </>
      }
    >
      <div className={styles.introGrid}>
        <Section id="tradition" title="Why numbers have calls">
          <P>
            Tambola and Housie grew out of the same family of number games as bingo, played for generations at clubs, fairs and family get-togethers. Callers gave the
            numbers nicknames so that everyone in a noisy room heard the right one — and so that waiting for the next number was entertaining in itself.
          </P>
          <P>
            Many calls rhyme with the number (“Rise and shine, 29”), some describe its shape (“Two fat ladies” for 88, the two eights looking like two round ladies), and in
            India a few remember moments from our own history. Families add their own too — every kitty group has a call that only they understand.
          </P>
        </Section>
        <Section id="how-said" title="How our caller says a number">
          <P>
            On Letsplaytambola the caller first says the nickname, then reads the digits one by one and the whole number, so nobody mishears: “Two fat ladies! … 8 and 8,
            88”. Numbers below ten are read as “Single number, 7”. Your phone’s own voice does the talking; it picks an Indian English voice when your phone has one.
          </P>
          <P>Every player’s phone can switch the sound on or off with the Sound button at the top of the game.</P>
        </Section>
      </div>

      <section id="indian-calls" className={styles.indian} aria-labelledby="indian-calls-h">
        <h2 id="indian-calls-h" className={styles.h2}>The Indian ones</h2>
        <ul className={styles.indianList}>
          {Object.entries(INDIAN).map(([n, note]) => (
            <li key={n} className={styles.indianItem}>
              <span className={styles.ball} aria-hidden="true">{n}</span>
              <span>
                <b className={styles.indianCall}>{n} · {calloutFor(Number(n))}</b>
                <span className={styles.indianNote}>{note}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section id="all-calls" aria-labelledby="all-calls-h">
        <h2 id="all-calls-h" className={styles.h2}>The full list, 1 to 90</h2>
        <div className={styles.decades}>
          {DECADES.map(([lo, hi]) => (
            <div key={lo} className={styles.decade}>
              <table className={styles.table}>
                <caption className={styles.decadeTitle}>{lo} to {hi}</caption>
                <thead>
                  <tr>
                    <th scope="col">No.</th>
                    <th scope="col">Call</th>
                    <th scope="col">Read out as</th>
                  </tr>
                </thead>
                <tbody>
                  {range(lo, hi).map((n) => (
                    <tr key={n} id={`n${n}`}>
                      <th scope="row"><span className={styles.num}>{n}</span></th>
                      <td className={styles.call}>
                        {calloutFor(n)}
                        {INDIAN[n] ? <span className={styles.flag}>Indian call</span> : null}
                      </td>
                      <td className={styles.said}>{spokenNumber(n)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </section>

      <div className={styles.tips}>
        <Section id="tips" title="Tips for calling at home">
          <Bullets
            items={[
              'Say the call, pause a moment, then the number — the pause is where the laughter happens.',
              'Make a few calls your own: a nickname for the birthday girl’s age, or the year of a family wedding.',
              'Playing with elders? Keep the sound on, so every number is read out clearly on every phone.',
              <>New to the game? Read <a href="/how-to-play">How to play Tambola</a> and the <a href="/ways-to-win">26 ways to win</a>.</>,
            ]}
          />
        </Section>
      </div>

      <CtaBand title="Let the caller do the shouting." body="Host a free game, share one link on WhatsApp, and every number is called out with its rhyme on every phone." />
    </GuideShell>
  );
}
