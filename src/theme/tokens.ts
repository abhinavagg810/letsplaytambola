// Design tokens — README §7. Hex values are the approved approximations of the OKLCH sources.
export const C = {
  bg: '#1B0F34', sidebar: '#140A29', surf: '#2A1C49', surf2: '#392B5A', line: '#453A64',
  cream: '#FBF4E6', muted: '#B9B3CF', ink: '#25193F', mari: '#FFB831', pink: '#FA4A98',
  teal: '#40D9C1', paper: '#FBF1DC', wa: '#3BB360', bogey: '#FFACCD', dim: '#8D82AD',
  white: '#FFFFFF', black: '#000000',
  pinkShadow: '#A0145E', mariShadow: '#B37A12',
  tealSoft: 'rgba(64,217,193,0.15)', mariSoft: 'rgba(255,184,49,0.12)', waSoft: 'rgba(59,179,96,0.14)',
  lightSub: '#6B6480', lightLine: '#D8D0C0', waText: '#2A8748',
} as const;

export const AVATARS = ['#FA4A98', '#FFB831', '#40D9C1', '#78AEFF', '#87D576', '#FE8674'] as const;

export const F = {
  medium: 'Baloo2_500Medium', semi: 'Baloo2_600SemiBold', bold: 'Baloo2_800ExtraBold', mono: 'JetBrainsMono_500Medium',
} as const;

export const R = { pill: 999, sheet: 28, hero: 24, card: 18, cardLg: 20, btn: 16, input: 14, small: 12, grid: 8 } as const;
export const S = { xs: 4, sm: 6, md: 8, lg: 10, xl: 12, x2: 14, x3: 16, x4: 18, x5: 20, x6: 24 } as const;

/** Minimums for our audience (README): body text 15px, tap targets 44px. */
export const MIN_TEXT = 15;
export const MIN_TAP = 44;

export const LIP = 'inset 0 -4px 0 rgba(0,0,0,0.18)';
export const TICKET_SHADOW = '0 20px 40px -18px rgba(0,0,0,0.7)';

export const MOTION = {
  shakeFrames: 12, shakeFrameMs: 75, wobbleMs: 220, popMs: 650,
  sheetMs: 300, cardInMs: 380, confettiPieces: 64, reactionMs: 4000, liveDotMs: 1200, bannerMs: 5000, toastMs: 2400,
} as const;

export const CONTENT_MAX = 560;
export const PLAY_MAX = 1100;
export const SIDEBAR_W = 240;
export const WIDE = 900; // px: web switches from tab bar to sidebar
