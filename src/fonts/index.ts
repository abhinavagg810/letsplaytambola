// Self-hosted fonts (files from @fontsource, SIL OFL — see LICENSE-*.txt). Local files so the build
// works offline and on Vercel with no request to Google Fonts.
//   Baloo 2  500 / 600 / 800  → var(--font-baloo)   (set in globals.css from the two families below)
//   JetBrains Mono 500        → var(--font-mono)
// CSS that asks for weight 700 gets the 800 file, exactly like the design prototype (which only loads 500/600/800).
import localFont from 'next/font/local';

/** Baloo 2, Latin. Preloaded; the fallback font is size-adjusted so text does not shift when it loads. */
export const baloo = localFont({
  src: [
    { path: './baloo-2-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './baloo-2-latin-600-normal.woff2', weight: '600', style: 'normal' },
    { path: './baloo-2-latin-800-normal.woff2', weight: '800', style: 'normal' },
  ],
  variable: '--font-baloo-latin',
  display: 'swap',
  fallback: ['system-ui', 'sans-serif'],
});

/** Baloo 2, Latin Extended — only for the rupee sign (₹) and accented names. Downloaded only when such a character is on the page. */
export const balooExt = localFont({
  src: [
    { path: './baloo-2-latin-ext-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './baloo-2-latin-ext-600-normal.woff2', weight: '600', style: 'normal' },
    { path: './baloo-2-latin-ext-800-normal.woff2', weight: '800', style: 'normal' },
  ],
  variable: '--font-baloo-ext',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  declarations: [
    {
      prop: 'unicode-range',
      value:
        'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF',
    },
  ],
});

/** JetBrains Mono 500 — codes, counters and small caps labels. */
export const mono = localFont({
  src: [{ path: './jetbrains-mono-latin-500-normal.woff2', weight: '500', style: 'normal' }],
  variable: '--font-mono-face',
  display: 'swap',
  fallback: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
});
