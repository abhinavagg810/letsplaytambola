// Google AdSense settings. Ads are OFF until NEXT_PUBLIC_ADSENSE_CLIENT is set (see docs/ADS.md).
// Ads never appear while a game is being played: there are no slots in the lobby or the live game.

/** AdSense publisher id, e.g. "ca-pub-1234567890123456". Empty = ads off everywhere. */
export const ADSENSE_CLIENT = (process.env.NEXT_PUBLIC_ADSENSE_CLIENT || '').trim();
export const ADS_ON = /^ca-pub-\d{10,20}$/.test(ADSENSE_CLIENT);

/** Ad unit ids created in AdSense (Ads → By ad unit → Display ads). A placement with no id shows nothing. */
export const AD_SLOTS = {
  /** Home page, between "How it works" and "Features". */
  home: (process.env.NEXT_PUBLIC_ADSENSE_SLOT_HOME || '').trim(),
  /** Host setup page, below the form and the Create button. */
  host: (process.env.NEXT_PUBLIC_ADSENSE_SLOT_HOST || '').trim(),
  /** "Join with a code" page, under the two cards. */
  join: (process.env.NEXT_PUBLIC_ADSENSE_SLOT_JOIN || '').trim(),
  /** Results screen, after the game is over, under the winners. */
  results: (process.env.NEXT_PUBLIC_ADSENSE_SLOT_RESULTS || '').trim(),
} as const;
export type AdPlacement = keyof typeof AD_SLOTS;
