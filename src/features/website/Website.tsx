import { AdSlot } from '@/components/AdSlot';
import type { CSSProperties, ReactNode } from 'react';
import { Avatar } from '@/components/Avatar';
import { Ball } from '@/components/Ball';
import { Board } from '@/components/Board';
import { Button } from '@/components/Button';
import { PageShell } from '@/components/PageShell';
import { Ticket } from '@/components/Ticket';
import { RULES } from '@/core/data';
import { CodeBox } from './CodeBox';
import { BOARD_CALLED, BOARD_LATEST, COMPARE, FACTS, FAQS, MARQUEE, SAMPLE_DABS, SAMPLE_TICKET, STEPS } from './content';
import { NotifyForm } from './NotifyForm';
import styles from './website.module.css';

const CHIP_TONES = ['var(--pink)', 'var(--marigold)', 'var(--teal)'];

/** The marketing home page (`/`). A Server Component; only the code box, notify form and header menu ship JavaScript. */
export function Website() {
  return (
    <PageShell gradient={false} className={styles.page}>
      <Hero />
      <Facts />
      <Marquee />
      <HowItWorks />
      <AdSlot placement="home" />
      <Features />
      <Compare />
      <WaysToWin />
      <AppComingSoon />
      <Faq />
      <ClosingBand />
    </PageShell>
  );
}

function Hero() {
  return (
    <section className={styles.hero}>
      <div className={styles.heroGrid}>
        <div className={styles.heroCopy}>
          <div className={styles.heroPill}>FREE · NO SIGN-UP · NO DOWNLOAD</div>
          <h1 className={styles.h1}>
            Housie night, <span className={styles.accent}>sorted.</span>
          </h1>
          <p className={styles.lede}>
            Host a game, share one link on WhatsApp, and everyone plays by just typing their name. Our caller does the shouting — a rhyme for every number.
          </p>
          <div className={styles.ctaRow}>
            <Button href="/host" size={60}>
              Host a game free
            </Button>
          </div>
          <CodeBox />
          <div className={styles.madeFor}>
            <div className={styles.avatars} aria-hidden="true">
              {['P', 'M', 'S', 'K'].map((n, i) => (
                <Avatar key={n} name={n} color={i} size={34} ring className={styles.stacked} />
              ))}
            </div>
            Made for your kitty, your family group, your Diwali night.
          </div>
        </div>

        <div className={styles.heroArt} aria-hidden="true">
          <div className={styles.heroStack}>
            <div className={styles.callerCard}>
              <div className={styles.dots} />
              <div className={styles.callerBody}>
                <Ball number={47} size={124} float label="" />
                <div className={styles.callerText}>
                  <span className={styles.callerKicker}>NUMBER 23 · PRIYA CALLING</span>
                  <span className={styles.callerCall}>Year of Independence</span>
                  <span className={styles.callerSay}>“Four and seven, forty-seven!”</span>
                </div>
              </div>
            </div>
            <Ticket
              className={styles.sampleTicket}
              ticket={SAMPLE_TICKET}
              marked={SAMPLE_DABS}
              tilt
              title="Sapna’s ticket"
              headerRight={<span className={styles.sampleMeta}>9/15 · NEEDS 6</span>}
            />
            <div className={styles.winChip}>
              <span className={styles.winChipKicker}>CLAIM VERIFIED</span>
              <span className={styles.winChipText}>Meera won Top Line!</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Facts() {
  return (
    <section className={styles.facts} aria-label="At a glance">
      <ul className={styles.factGrid}>
        {FACTS.map((f) => (
          <li key={f.title} className={styles.fact}>
            <span className={styles.factBig} style={{ color: f.color }}>
              {f.big}
            </span>
            <span className={styles.factTitle}>{f.title}</span>
            <span className={styles.factBody}>{f.body}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Marquee() {
  const row = (hidden: boolean) =>
    MARQUEE.map((c) => (
      <span key={c} className={styles.marqueeItem} aria-hidden={hidden || undefined}>
        {c}
        <span className={styles.marqueeDot} />
      </span>
    ));
  return (
    <div className={styles.marquee} role="group" aria-label="Number callouts">
      <div className={styles.marqueeTrack}>
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}

function HowItWorks() {
  return (
    <section id="how" className={styles.how}>
      <div className={styles.sectionHead} style={{ maxWidth: 640 }}>
        <span className={styles.kicker}>HOW IT WORKS</span>
        <h2 className={styles.h2}>Three taps from chai to “Full House!”</h2>
      </div>
      <ol className={styles.steps}>
        {STEPS.map((s) => (
          <li key={s.n} className={styles.step}>
            <div className={styles.stepBall} style={{ background: s.color }} aria-hidden="true">
              <div className={styles.stepNum}>{s.n}</div>
            </div>
            <h3 className={styles.stepTitle}>{s.title}</h3>
            <p className={styles.stepBody}>{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function FeatureRow({ kicker, title, body, bullets, reverse, children }: { kicker: string; title: string; body: string; bullets: string[]; reverse?: boolean; children: ReactNode }) {
  return (
    <div className={reverse ? styles.featureRowReverse : styles.featureRow}>
      <div className={styles.featureCopy}>
        <span className={styles.kicker}>{kicker}</span>
        <h3 className={styles.h3}>{title}</h3>
        <p className={styles.featureBody}>{body}</p>
        <ul className={styles.bullets}>
          {bullets.map((b) => (
            <li key={b} className={styles.bullet}>
              <span className={styles.bulletDot} aria-hidden="true" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className={styles.featureArt} aria-hidden="true">
        {children}
      </div>
    </div>
  );
}

function Mock({ width, pad = 18, gap = 10, children }: { width: number; pad?: number; gap?: number; children: ReactNode }) {
  return (
    <div className={styles.mock} style={{ '--mock-w': `${width}px`, padding: pad, gap } as CSSProperties}>
      {children}
    </div>
  );
}

function PrizeRow({ name, rule, children }: { name: string; rule: string; children: ReactNode }) {
  return (
    <div className={styles.prizeRow}>
      <div className={styles.prizeText}>
        <span className={styles.prizeName}>{name}</span>
        <span className={styles.prizeRule}>{rule}</span>
      </div>
      {children}
    </div>
  );
}

function Features() {
  return (
    <section id="features" className={styles.features}>
      <div className={styles.sectionHead} style={{ maxWidth: 700 }}>
        <span className={styles.kicker}>WHAT MAKES IT DIFFERENT</span>
        <h2 className={styles.h2}>All the fun of paper tickets. None of the arguments.</h2>
      </div>

      <FeatureRow
        kicker="THE CALLER"
        title="A rhyme for every single number"
        body="Our playful caller announces all 90 numbers with their own callout — the classics and desi favourites — then reads the digits clearly so no one mishears."
        bullets={[
          '“Two fat ladies, 88!” · “Quit India movement, 42!”',
          'Speaks in an Indian English voice when your phone has one',
          'Tap Call next number, or switch on auto-call every 4, 6, 8 or 10 seconds',
          'Mute anytime',
        ]}
      >
        <Mock width={420}>
          <div className={styles.mockDots} />
          <div className={styles.mockCaller}>
            <Ball number={88} size={96} label="" />
            <div className={styles.mockCallerText}>
              <span className={styles.mockMonoGold}>NUMBER 31</span>
              <span className={styles.mockCall}>Two fat ladies</span>
              <span className={styles.mockSay}>“Eight and eight, eighty-eight!”</span>
            </div>
          </div>
          <div className={styles.mockControls}>
            <div className={styles.mockNext}>Next number</div>
            <div className={styles.mockAuto}>
              <span className={styles.mockAutoLabel}>AUTO</span>
              <span className={styles.mockAutoValue}>8s</span>
            </div>
          </div>
        </Mock>
      </FeatureRow>

      <FeatureRow
        kicker="SHARED LIVE BOARD"
        title="One board, on every phone, in real time"
        body="The moment the host calls a number it lights up on everyone’s 1–90 board — in the same room or across cities. Missed a call? Just look at the board."
        bullets={[
          'Latest number glows pink, called numbers turn gold',
          'Last 5 numbers always shown under the caller',
          'Same board for host and every player — nothing to ask twice',
          'Live players list and prizes & winners beside it',
        ]}
      >
        <Mock width={440} gap={12}>
          <div className={styles.mockHead}>
            <span className={styles.mockTitle}>Board</span>
            <span className={styles.mockMono}>31 / 90 CALLED · 6 PLAYING</span>
          </div>
          <Board called={BOARD_CALLED} latest={BOARD_LATEST} variant="outline" />
        </Mock>
      </FeatureRow>

      <FeatureRow
        reverse
        kicker="FAIR PLAY"
        title="Every claim checked in a second"
        body="No more counting over someone’s shoulder. Tap Claim and the app verifies it against the numbers actually called — then celebrates the winner on every phone."
        bullets={[
          'Instant “Checked and confirmed” for everyone to see',
          'Wrong claims get a gentle “Not yet — keep playing!”',
          'You can only dab numbers that have been called',
          'Prizes & winners list always visible',
        ]}
      >
        <Mock width={420}>
          <div className={styles.mockHead}>
            <span className={styles.mockTitle}>Prizes &amp; winners</span>
            <span className={styles.mockMono}>3 OF 6 WON</span>
          </div>
          <PrizeRow name="Early Five" rule="Any 5 numbers">
            <div className={styles.prizeWinner}>
              <span className={styles.prizeAvatar} style={{ background: 'var(--teal)' }}>
                M
              </span>
              <span className={styles.prizeWho}>Meera</span>
            </div>
          </PrizeRow>
          <PrizeRow name="Top Line" rule="All 5 of the top line">
            <div className={styles.prizeWinner}>
              <span className={styles.prizeAvatar} style={{ background: 'var(--marigold)' }}>
                S
              </span>
              <span className={styles.prizeWho}>You!</span>
            </div>
          </PrizeRow>
          <PrizeRow name="Pyramid" rule="1 top, 2 middle, 3 bottom">
            <span className={styles.prizeClaim}>Claim</span>
          </PrizeRow>
          <div className={styles.verified}>
            <div className={styles.verifiedText}>
              <span className={styles.verifiedKicker}>CLAIM VERIFIED</span>
              <span className={styles.verifiedTitle}>You won Top Line!</span>
            </div>
            <span className={styles.verifiedTick}>✓</span>
          </div>
        </Mock>
      </FeatureRow>

      <FeatureRow
        kicker="JOINING"
        title="One link. Type your name. You’re in."
        body="No accounts, no passwords, no OTPs. Players open the link on any phone, type their name and get a ticket — that’s it. Easy for Nani and the grandkids alike."
        bullets={[
          'No sign-up for the host or the players',
          'Works in any phone browser — nothing to install',
          'In the same room? Read out the 5-letter code',
          'Late? You can still join and grab a ticket',
        ]}
      >
        <Mock width={400} pad={20} gap={12}>
          <span className={styles.joinInvited}>Priya invited you to</span>
          <span className={styles.joinGame}>Diwali Night</span>
          <span className={styles.joinAsk}>What should we call you?</span>
          <div className={styles.joinInput}>Kamla Mausi</div>
          <div className={styles.joinButton}>Join game</div>
          <span className={styles.joinNote}>No sign-up. No password. No OTP.</span>
        </Mock>
      </FeatureRow>

      <FeatureRow
        reverse
        kicker="NEXT ROUND"
        title="Same group, next round in one tap"
        body="When the game ends everyone sees the winners. The host taps Play again and every player on the link gets a fresh ticket — no new link to share."
        bullets={['Winners list after every round', 'Fresh tickets for everyone, automatically', 'Money stays offline — the app only keeps score']}
      >
        <Mock width={420} pad={20}>
          <span className={styles.resultsTitle}>That’s the game!</span>
          {[
            ['Early Five', 'Meera'],
            ['Top Line', 'Sapna'],
            ['Four Corners', 'Kamla'],
            ['Full House', 'Rahul'],
          ].map(([prize, who]) => (
            <div key={prize} className={styles.resultRow}>
              <span className={styles.resultPrize}>{prize}</span>
              <span className={styles.resultWho}>{who}</span>
            </div>
          ))}
          <div className={styles.resultsButton}>Play again with same people</div>
        </Mock>
      </FeatureRow>
    </section>
  );
}

function Compare() {
  return (
    <section className={styles.compare}>
      <h2 className={styles.h2Small}>Paper tickets vs Letsplaytambola</h2>
      <div className={styles.table} role="table" aria-label="Paper tickets compared with Letsplaytambola">
        <div className={styles.tableHead} role="row">
          <span role="columnheader">WHAT YOU NEED</span>
          <span role="columnheader">PAPER + WHATSAPP</span>
          <span role="columnheader" className={styles.tableUs}>
            LETSPLAY
            <wbr />
            TAMBOLA
          </span>
        </div>
        {COMPARE.map(([label, paper, us]) => (
          <div key={label} className={styles.tableRow} role="row">
            <span role="rowheader" className={styles.cellLabel}>
              {label}
            </span>
            <span role="cell" className={styles.cellPaper}>
              {paper}
            </span>
            <span role="cell" className={styles.cellUs}>
              {us}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function WaysToWin() {
  return (
    <section className={styles.ways}>
      <div className={styles.waysCard}>
        <div className={styles.waysCopy}>
          <span className={styles.kickerTeal}>26 WAYS TO WIN</span>
          <h3 className={styles.waysTitle}>Your kitty, your rules.</h3>
          <p className={styles.waysBody}>
            From Early Five and Laddoo to Pyramid, Breakfast-Lunch-Dinner and Second House — pick with one tap. Every rule is explained on screen, and every claim is checked
            instantly.
          </p>
        </div>
        <ul className={styles.chips}>
          {RULES.map((r, i) => (
            <li key={r.id} className={styles.chip} style={{ borderColor: CHIP_TONES[i % 3] }}>
              {r.name}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function AppComingSoon() {
  return (
    <section id="app" className={styles.app}>
      <div className={styles.appInner}>
        <div className={styles.soonPill}>COMING SOON</div>
        <h2 className={styles.appTitle}>The app is on its way to your phone.</h2>
        <p className={styles.appBody}>Number alerts and a home-screen icon for your Tambola nights. Until then, everything works right here in your browser.</p>
        <div className={styles.badges}>
          <div className={styles.badge}>
            <div className={styles.badgeIconAndroid} aria-hidden="true">
              AND
            </div>
            <div className={styles.badgeText}>
              <span className={styles.badgeSmall}>Coming soon on</span>
              <span className={styles.badgeBig}>Google Play</span>
            </div>
          </div>
          <div className={styles.badge}>
            <div className={styles.badgeIconIos} aria-hidden="true">
              iOS
            </div>
            <div className={styles.badgeText}>
              <span className={styles.badgeSmall}>Coming soon on the</span>
              <span className={styles.badgeBig}>App Store</span>
            </div>
          </div>
        </div>
        <NotifyForm />
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section id="faq" className={styles.faq}>
      <h2 className={styles.h2Small}>Questions, answered</h2>
      <div className={styles.faqList}>
        {FAQS.map(([q, a], i) => (
          <details key={q} className={styles.faqItem} name="faq" open={i === 0}>
            <summary className={styles.faqQ}>
              {q}
              <span className={styles.faqSign} aria-hidden="true" />
            </summary>
            <div className={styles.faqA}>{a}</div>
          </details>
        ))}
      </div>
    </section>
  );
}

function ClosingBand() {
  return (
    <section className={styles.closing}>
      <div className={styles.band}>
        <div className={styles.bandCopy}>
          <h2 className={styles.bandTitle}>Tonight’s game is one link away.</h2>
          <p className={styles.bandBody}>Free to host. No sign-up to play. Works on any phone.</p>
        </div>
        <Button href="/host" variant="ink" size={60} fontSize={20}>
          Host a game free
        </Button>
      </div>
    </section>
  );
}
