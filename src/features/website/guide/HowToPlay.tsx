import { Button } from '@/components/Button';
import { Ticket } from '@/components/Ticket';
import { EXAMPLE_TICKET, MAX_PLAYERS, RULES, columnRange } from '@/core';
import type { RuleId } from '@/core';
import { SAMPLE_DABS, SAMPLE_TICKET } from '../content';
import { Bullets, CtaBand, GuideShell, Note, P, Section, Steps } from './GuideShell';
import { JsonLd } from './JsonLd';
import { waysHref } from './slug';
import styles from './guide.module.css';

const TOC = [
  { id: 'what', title: 'What is Tambola?' },
  { id: 'ticket', title: 'The ticket' },
  { id: 'calling', title: 'How numbers are called' },
  { id: 'dabbing', title: 'Dabbing your numbers' },
  { id: 'claiming', title: 'Claiming a prize' },
  { id: 'ways', title: 'Ways to win' },
  { id: 'host', title: 'Host a game here' },
  { id: 'join', title: 'Join a game' },
  { id: 'room-or-whatsapp', title: 'Same room or WhatsApp' },
  { id: 'house-rules', title: 'House rules' },
  { id: 'host-tips', title: 'Tips for hosts' },
  { id: 'occasions', title: 'Kitty parties & festivals' },
  { id: 'faq', title: 'Questions' },
];

/** Questions answered on this page. The same text feeds the FAQPage structured data — nothing that is not shown here. */
const FAQ: [q: string, a: string][] = [
  ['Is Tambola the same as Housie?', 'Yes. It is the same game: many families in India call it Tambola, others call it Housie. It is a cousin of bingo, played with tickets of 15 numbers from 1 to 90.'],
  ['How many numbers are on a Tambola ticket?', 'Fifteen: three lines of five numbers, spread over nine columns. The other twelve boxes are blank.'],
  ['What happens if I claim by mistake?', 'On Letsplaytambola nothing bad happens. The claim is checked at once, you see “Not yet — keep playing!” and the game carries on. There is no penalty.'],
  ['Can one person win more than one prize?', 'Yes. Each prize can be won once per round, but the same player may win several of them.'],
  ['How many people can play in one game?', `Up to ${MAX_PLAYERS} people can join one game, each with their own ticket.`],
  ['Do players need to sign up or download an app?', 'No. The host types a name and gets a link; players open the link in their phone’s browser and type their name. There is nothing to install and no sign-up.'],
  ['Can we play for money?', 'The app never handles money. A host can note a ticket price and prize amounts to keep track; any money is collected and settled between you, outside the app.'],
  ['How long does a game link work?', 'Until 24 hours after the last activity in the game. After that the link and the code stop working and you simply host a new game.'],
];

const COMMON: RuleId[] = ['early5', 'top', 'middle', 'bottom', 'corners', 'full'];

export function HowToPlay() {
  return (
    <GuideShell
      kicker="GUIDE · FOR BEGINNERS AND HOSTS"
      title="How to play Tambola (Housie)"
      trail={[{ href: '/how-to-play', label: 'How to play' }]}
      toc={TOC}
      intro={
        <p>
          Everything you need for your first game: what is on a ticket, how numbers are called, how to claim a prize — and how to host a game for your family or kitty group
          on Letsplaytambola, with one link on WhatsApp.
        </p>
      }
      actions={
        <>
          <Button href="/host" size={56}>Host a game free</Button>
          <Button href="/join" variant="outline" size={56}>Join with a code</Button>
        </>
      }
    >
      <Section id="what" title="What is Tambola?">
        <P>
          Tambola, also called Housie, is a number game for any number of people. Every player has a ticket with fifteen numbers between 1 and 90. A caller draws the
          numbers one by one, in no particular order, and everyone marks — “dabs” — the numbers on their own ticket as they are called. The first person to complete a
          pattern, such as a full line, claims a prize.
        </P>
        <P>
          It needs no skill, which is exactly why it brings everyone together: grandparents, teenagers and the friend who has never played before all have the same chance.
          In India it is a fixture of kitty parties, family functions, club evenings and festival nights.
        </P>
      </Section>

      <Section id="ticket" title="The ticket">
        <P>
          A ticket has three lines (rows) and nine columns. Each line has exactly five numbers and four blank boxes, so a ticket has fifteen numbers in all. Every column
          has at least one number, and the numbers in a column go from smallest at the top to biggest at the bottom.
        </P>
        <figure className={styles.figure}>
          <Ticket ticket={EXAMPLE_TICKET} title="A sample ticket" />
          <figcaption className={styles.caption}>
            A sample ticket. Top line: 3, 21, 44, 62, 85. Middle line: 14, 37, 48, 76, 88. Bottom line: 7, 26, 53, 69, 90. The striped boxes are blanks.
          </figcaption>
        </figure>
        <P>Each column holds its own group of numbers:</P>
        <ul className={styles.cards} aria-label="Which numbers each column holds">
          {Array.from({ length: 9 }, (_, c) => {
            const [lo, hi] = columnRange(c);
            return (
              <li key={c} className={styles.card}>
                <span className={styles.cardTitle}>Column {c + 1}</span>
                <span className={styles.cardBody}>{lo} to {hi}</span>
              </li>
            );
          })}
        </ul>
        <P>On Letsplaytambola every player gets a fresh, random ticket the moment they join, and only you can see your ticket.</P>
      </Section>

      <Section id="calling" title="How numbers are called">
        <P>
          The caller picks numbers from 1 to 90 at random until a prize is won — or all 90 are out. In a paper game someone pulls tokens from a bag. Here the host taps
          <b> Call next number</b>, or switches on <b>Auto call</b>, and the next number is drawn at random on our server, so neither the host nor anyone else can choose it.
        </P>
        <P>
          Every number has a traditional call: “Two little ducks, 22”, “Quit India movement, 42”, “Two fat ladies, 88”. Our caller says the call and then reads the digits
          clearly, on every phone, and the number lights up on the shared 1–90 board that everyone can see. See <a href="/tambola-number-calls">all 90 number calls</a>.
        </P>
      </Section>

      <Section id="dabbing" title="Dabbing your numbers">
        <P>
          When a number on your ticket is called, tap it to dab it — a pink circle appears. Tap again if you dabbed the wrong one. You can only dab numbers that have
          actually been called; tap one that has not been called and the app tells you so. The app does not dab for you: listening and dabbing is part of the fun.
        </P>
        <figure className={styles.figure}>
          <Ticket ticket={SAMPLE_TICKET} marked={SAMPLE_DABS} tilt title="Sapna’s ticket" />
          <figcaption className={styles.caption}>A ticket part-way through a game: the pink circles are the numbers Sapna has dabbed so far (nine of fifteen).</figcaption>
        </figure>
        <Note label="Missed a call?">Look at the board: every number called so far is lit up, and the latest numbers are shown under the caller.</Note>
      </Section>

      <Section id="claiming" title="Claiming a prize">
        <P>
          When you have completed a pattern, tap <b>Claim!</b> above your ticket and choose the prize. The claim is checked straight away against the numbers that have
          been called and the numbers you dabbed — so make sure every number of the pattern is dabbed first.
        </P>
        <Bullets
          items={[
            <>If it is right, everyone sees the win on their screen (“Meera wins Top Line!”), the caller announces it, and the prize is marked as won.</>,
            <>If it is not complete yet, only you see a gentle “Not yet — keep playing!”. There is no penalty and the game simply carries on.</>,
            <>If someone else got there first, you see who won it. Each prize has one winner per round: the first correct claim.</>,
            <>The same person can win more than one prize. A round ends when every prize you chose has a winner, or when all 90 numbers have been called.</>,
          ]}
        />
      </Section>

      <Section id="ways" title="Ways to win">
        <P>The host decides which patterns are played. The most common set — called Classic when you host here — is:</P>
        <Bullets items={COMMON.map((id) => { const r = RULES.find((x) => x.id === id)!; return <><a href={waysHref(id)}>{r.name}</a>: {r.rule.toLowerCase()}.</>; })} />
        <P>
          Kitty groups love the extras: Laddoo (the centre number), Breakfast, Lunch and Dinner, Devrani and Jethani, Pyramid and more. See <a href="/ways-to-win">all 26
          ways to win, with pictures</a>.
        </P>
      </Section>

      <Section id="host" title="How to host a game on Letsplaytambola">
        <Steps
          items={[
            { title: 'Open Host a game', body: <>Go to <a href="/host">Host a game</a>. Type your name — players will see “Priya invited you”.</> },
            { title: 'Name the game and pick ways to win', body: 'Choose a name such as Diwali Night, then a ready-made set (Classic, Lines + House, Just Full House) or your own mix. You can note a ticket price and prize amounts if you like — they are only a record; money is settled outside the app.' },
            { title: 'Create the game and share the link', body: 'Tap Create game & get link. Share it on WhatsApp in one tap, or copy it. In the same room, read out the five-character code instead.' },
            { title: 'Start and call', body: 'When everyone has a ticket, tap Start the game. Call each number yourself, or switch on Auto call and the next number comes every 6 seconds.' },
            { title: 'Play again', body: 'When the round ends, everyone sees the winners. Tap Play again with same people and every player gets a fresh ticket on the same link.' },
          ]}
        />
        <P>“Deal me a ticket” is on by default, so the host can play while calling. Switch it off if you only want to call.</P>
      </Section>

      <Section id="join" title="How to join a game">
        <Steps
          items={[
            { title: 'Open the link', body: 'Tap the link your host shared. If you only have the code, go to Join a game and type it.' },
            { title: 'Type your name', body: 'A first name or nickname is enough. There is no sign-up, password or OTP.' },
            { title: 'Get your ticket', body: 'Your ticket is dealt at once. Wait for the host to start, then listen and dab.' },
          ]}
        />
        <P>
          Late? You can still join while the game is being played and get a ticket. Once a round has finished, wait for the host to start the next one. Keep using the same
          phone and browser: that is how the game remembers your ticket.
        </P>
      </Section>

      <Section id="room-or-whatsapp" title="Playing in the same room or over WhatsApp">
        <P>
          <b>Same room:</b> everyone plays on their own phone. The host reads out the code or puts the link in the family group, and one phone with the sound on is often
          enough for the whole room to hear the calls.
        </P>
        <P>
          <b>Across cities:</b> share the link in your WhatsApp group. Every number appears on every phone at the same moment, so Nani in Lucknow and the cousins in
          Bengaluru play the same game. Many families also keep a video call running for the chatter — the game itself needs no call.
        </P>
      </Section>

      <Section id="house-rules" title="House rules people often agree">
        <P>Every group has its own customs. Settle these before the first number — they are choices for your group, not rules the app enforces unless we say so:</P>
        <Bullets
          items={[
            'The ticket price and how the prize money is shared. Letsplaytambola only records the amounts you type; money is collected and paid outside the app, in cash or UPI.',
            'Whether Full House is the last prize. Some groups stop the game as soon as Full House is won; here a round ends when every prize you picked has a winner.',
            'What happens on a wrong claim. In paper games a “bogey” claim sometimes costs a forfeit. Here a wrong claim costs nothing — though some groups make the claimer sing a song.',
            'Ties. If two people complete a prize on the same number, the app gives it to the first correct claim. Groups that prefer to share can agree that among themselves.',
            'Children. Small children can play on a parent’s phone, with the parent typing their name.',
          ]}
        />
      </Section>

      <Section id="host-tips" title="Tips for hosts">
        <Bullets
          items={[
            'Sound is on unless someone switched it off: check that the button at the top of the game says Sound on, and keep your volume up. On iPhones the voice only starts after you have tapped something on the page, such as Start the game.',
            'Auto call keeps a steady pace. If your page closes or the phone locks, calling pauses until you come back, so keep the host phone on charge with the screen on.',
            'In the same room, read the code aloud slowly: it is five characters, and there are no easily confused letters like O and 0.',
            'Wait until the number of players matches the people present before you tap Start the game.',
            'Short of time? Pick fewer ways to win, or just Full House. Avoid Lucky Three in a short game: if nobody can win it, the round runs until all 90 numbers.',
          ]}
        />
      </Section>

      <Section id="occasions" title="Kitty parties, festivals and family Sundays">
        <P>
          <b>Kitty party:</b> name the game after the month’s theme, play Laddoo and Early Five for quick laughs, and keep the bigger prizes for Full House. <b>Diwali:</b>
          after the puja, bring in relatives from other cities with one link. <b>Teej:</b> a Teej Special with the whole kitty dressed in green. <b>Family Sunday:</b>
          grandparents call the numbers, grandchildren dab — and prizes can be sweets or small gifts instead of money.
        </P>
      </Section>

      <Section id="faq" title="Questions people ask">
        <div className={styles.faqList}>
          {FAQ.map(([q, a], i) => (
            <details key={q} className={styles.faqItem} open={i === 0}>
              <summary className={styles.faqQ}>{q}</summary>
              <div className={styles.faqA}>{a}</div>
            </details>
          ))}
        </div>
        <P>Still stuck? <a href="/contact">Write to us</a> — we are happy to help.</P>
      </Section>

      <CtaBand title="Ready for your first game?" body="It takes a minute to host, and nobody needs to sign up. Share one link and start calling." />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
        }}
      />
    </GuideShell>
  );
}
