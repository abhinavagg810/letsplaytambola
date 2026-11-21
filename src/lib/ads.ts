// Google AdSense settings. Ads are OFF until NEXT_PUBLIC_ADSENSE_CLIENT is set (see docs/ADS.md).
// The owner's rule: NO ads during the game. There is no slot on the live game screen, and none may be added.
// Ads appear only before the game starts (lobby) and after it ends (results).

/** AdSense publisher id, e.g. "ca-pub-1234567890123456". Empty = ads off everywhere. */
// Forgiving: accepts "ca-pub-123…", "pub-123…" or just the digits, with stray spaces or quotes.
const digits = (process.env.NEXT_PUBLIC_ADSENSE_CLIENT || '').replace(/["'\s]/g, '').replace(/^(ca-)?pub-/i, '');
export const ADSENSE_CLIENT = /^\d{10,20}$/.test(digits) ? `ca-pub-${digits}` : '';
export const ADS_ON = /^ca-pub-\d{10,20}$/.test(ADSENSE_CLIENT);

/** Ad unit ids created in AdSense (Ads → By ad unit → Display ads). A placement with no id shows nothing. */
export const AD_SLOTS = {
  /** Lobby, while everyone waits for the host to start: at the very bottom, under "Ways to win". */
  lobby: (process.env.NEXT_PUBLIC_ADSENSE_SLOT_LOBBY || '').trim(),
  /** Results screen, after the game is over, under the winners. */
  results: (process.env.NEXT_PUBLIC_ADSENSE_SLOT_RESULTS || '').trim(),
} as const;
export type AdPlacement = keyof typeof AD_SLOTS;
