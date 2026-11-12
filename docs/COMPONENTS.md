# Components — Letsplaytambola v2 design system

Everything lives in `src/components/` (one `.tsx` + one `.module.css` each). Import from the barrel:

```tsx
import { Button, Pill, Input, Field, Toggle, Card, Sheet, SheetOption, toast, Avatar, Logo, Ball, Ticket, Board, PageShell } from '@/components';
```

Server Components unless marked **client**. All accept `className`; most accept `style`.
Tokens (colours, radii, shadows, fonts) are CSS variables in `src/app/globals.css` — use `var(--marigold)`, `var(--surface)`, `var(--line)`, `var(--text-soft)`, `var(--font-mono)` … never hard-code a colour.

## Page frame

| Component | Props | Usage |
|---|---|---|
| `PageShell` | `children`, `gradient?: boolean = true` (page background glow), `footer?: boolean = true`, `className?` (for `<main>`) | `<PageShell><div style={{ maxWidth: 'var(--content-narrow)', margin: '0 auto', padding: '20px 20px 0' }}>…</div></PageShell>` |
| `SiteHeader` **client** | none. Sticky; desktop nav ≥ 860px, "Host" + "Menu" below | included by `PageShell` |
| `SiteFooter` | none | included by `PageShell` |

Layout variables: `--content` (1160px), `--content-narrow` (560px), `--gutter` (20px), `--header-h` (70px; use for `top:` of sticky/fixed things under the header).

## Actions

**`Button`** — the main action. Renders `<button>` or, with `href`, a `next/link`.

| Prop | Type | Default | Notes |
|---|---|---|---|
| `variant` | `'primary' \| 'cream' \| 'whatsapp' \| 'outline' \| 'ink'` | `'primary'` | primary = marigold + inset lip; ink = dark button on marigold cards |
| `size` | `44 \| 50 \| 54 \| 56 \| 58 \| 60 \| 62 \| 64` | `60` | height in px. ≥ 60 → radius 18 / 21px text; 50–58 → radius 16 / 18px; 44 → radius 14 / 16px |
| `block` | `boolean` | | full width |
| `disabledLook` | `boolean` | | muted colour but **still receives taps** — show a toast in `onClick` |
| `disabled` | `boolean` | | really disabled (rarely wanted) |
| `flat` | `boolean` | | primary without the inset lip |
| `href` | `string` | | render a link |
| `fontSize` | `number` | | px override |
| …rest | `<button>` attributes | | `type` defaults to `"button"` |

```tsx
<Button size={62} block disabledLook={!name.trim()} onClick={() => (name.trim() ? create() : toast('Type your name first'))}>Create game &amp; get link</Button>
<Button variant="whatsapp" block onClick={shareOnWhatsApp}>Share on WhatsApp</Button>
<Button href="/host" variant="ink" block>Host a game</Button>
```

Sticky bottom button (setup screens): wrap it in
`<div style={{ position: 'sticky', bottom: 0, margin: '0 -20px', padding: '14px 20px calc(22px + env(safe-area-inset-bottom))', background: 'linear-gradient(var(--bg-0), var(--bg) 30%)' }}>`.

**`Pill`** — chips, small actions, nav pills. Renders `<button>`, a link (`href`) or a `<span>` (`as="span"`).

| Prop | Type | Default | Notes |
|---|---|---|---|
| `variant` | `'outline' \| 'outline-light' \| 'filled' \| 'surface'` | `'outline'` | filled = marigold; surface = static info chip |
| `size` | `40 \| 44 \| 46 \| 50` | `44` | 40 name chips · 44 title-row pills · 46 presets / Claim! · 50 share row |
| `selected` | `boolean` | | sets `aria-pressed` |
| `selectedLook` | `'fill' \| 'border'` | `'fill'` | fill = marigold (presets); border = marigold border only (name chips) |
| `href`, `as`, `fontSize` | | | |

```tsx
<Pill size={46} selected={preset === 'Classic'} onClick={pickClassic}>Classic</Pill>
<Pill size={40} selected={gameName === idea} selectedLook="border" onClick={() => setGameName(idea)}>{idea}</Pill>
<Pill variant="filled" size={46} onClick={openClaim}>Claim!</Pill>
<Pill fontSize={15} onClick={copyLink}>Copy link</Pill>
```

**`Toggle`** **(interactive)** — 52×30 switch, green when on. Props: `checked`, `onChange?(next)`, `label?` (accessible name), `disabled?`, `presentational?` (draw only, when the whole row is the button).

```tsx
<Toggle checked={hostPlays} onChange={setHostPlays} label="Deal me a ticket" />
```

## Forms

**`Input`** — props: `variant?: 'text' | 'code'` (code = JetBrains Mono, uppercase, .16em), `size?: 56 | 60 | 62` (60), `tone?: 'surface' | 'bg'` (use `bg` inside a surface card), `fontSize?` (22 text / 24 code; never below 16), `weight?: 500 | 600 | 800`, `invalid?`, `ref?`, plus all `<input>` attributes.
**`Field`** — `label`, `hint?`, `children`: a `<label>` wrapping the control with an 18px/800 label and a 15px helper line.

```tsx
<Field label="Your name" hint={`Players will see “${name || 'You'} invited you”.`}><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Priya" maxLength={24} /></Field>
<Input variant="code" size={62} tone="bg" value={code} onChange={…} placeholder="e.g. K7RQ2" aria-label="Game code" />
```

(`normalizeCode()` in `src/features/website/code.ts` cleans typed/pasted codes and links.)

## Surfaces

**`Card`** — props: `tone?: 'surface' | 'marigold' | 'paper' | 'bg' | 'note'`, `radius?: 12…32` (20), `padding?: number`, `border?`, `clip?` (lists with dividers), `dottedTop?` (marigold dotted edge — caller card), `as?`. Row dividers inside lists: `border-top: 1px solid var(--surface-2)`.

```tsx
<Card radius={26} dottedTop>…caller…</Card>
<Card tone="note" radius={18} padding={16}>Stay on this page — …</Card>
```

**`Sheet`** **client** — bottom sheet (cream, radius 28 top, max-width 560, scrim, slide-up, Escape/scrim close, focus trap, safe-area padding, portal to `<body>`). Props: `open`, `onClose()`, `title`, `subtitle?`, `children`.
**`SheetOption`** — white option row inside a sheet: `label`, `detail?`, `onClick`.

```tsx
<Sheet open={claimOpen} onClose={() => setClaimOpen(false)} title="What are you claiming?" subtitle="We’ll check your ticket instantly.">
  {openPrizes.map((p) => <SheetOption key={p.id} label={p.label} detail={ruleDesc(p.rule)} onClick={() => claim(p.id)} />)}
</Sheet>
```

**`toast(message)`** **client** — cream pill, bottom centre, 2.4s, announced via `aria-live`. `<Toaster />` is already mounted in the root layout.

```tsx
toast(`${n} hasn’t been called yet`);
```

## Game pieces

**`Ticket`** — props: `ticket: number[][]` (3×9, 0 = blank), `marked?: Set<number> | number[]`, `onCell?(n)` (number cells become buttons; you decide dab / toast), `title?`, `headerRight?` (Claim pill slot), `hint?`, `bare?` (lobby preview: no header/shadow, radius 16), `tilt?`, `className?`, `style?`.
CSS variables for fine-tuning: `--ticket-radius`, `--ticket-pad`, `--ticket-head-pad`, `--cell-ratio`, `--cell-font`, `--dab-size`, `--dab-color`, `--dab-nudge`.

```tsx
<Ticket ticket={you.ticket} marked={new Set(you.marks)} onCell={dab} title={`${name}’s ticket`} headerRight={<Pill variant="filled" size={46} onClick={openClaim}>Claim!</Pill>} hint="Tap a number when it is called." />
<Ticket ticket={you.ticket} bare />
```

**`Board`** — props: `called: Set<number> | number[]`, `latest?: number | null`, `variant?: 'solid' | 'outline'` (outline is the website mock).

```tsx
<Card padding={16}><Board called={game.called} latest={game.called.at(-1)} /></Card>
```

**`Ball`** — the caller ball. Props: `number: number | string | null`, `size?: number` (116; scales ring/disc/number), `float?`, `label?` (accessible label; `''` hides it).

```tsx
<Ball number={current} />
```

**`Avatar`** — props: `name` (first letter shown), `color?: number | string` (join-order index 0-based, or a CSS colour such as the server's `color`), `size?: number` (40; 32 in player chips), `ring?`. Decorative (`aria-hidden`) — always show the name beside it. Also exported: `AVATAR_COLORS`, `avatarColor(i)`.

```tsx
<Avatar name={p.name} color={p.color} />
```

**`Logo`** — live text + CSS, crisp at any size. Props: `size?: number` (font-size px of "TAMBOLA", 64), `tone?: 'light' | 'dark'`, `markOnly?`.

```tsx
<Logo size={30} />
```

## Conventions

- Small caps labels: `className="label"` (JetBrains Mono 12px, .1em, uppercase) + a colour.
- Screen-reader-only text: `className="visually-hidden"`.
- Focus ring is global (`:focus-visible`, teal). Don't remove outlines.
- Motion respects `prefers-reduced-motion` globally.
- `cx(...)` joins class names.
- Weight 700 in CSS renders with the 800 font file (only 500/600/800 are loaded, as in the prototype).
