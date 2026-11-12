// Shared details for the legal pages (/privacy and /terms).

/**
 * ⚠ PLACEHOLDER — NOT A CONFIRMED ADDRESS.
 * The owner must replace this with a real, monitored mailbox before launch
 * (it is shown on /privacy and /terms and is where removal requests and complaints go).
 */
export const CONTACT_EMAIL_PLACEHOLDER = 'hello@letsplaytambola.com';

/** Shown as "LAST UPDATED · …" on both pages. Change it whenever the text changes. */
export const LEGAL_LAST_UPDATED = '12 November 2026';

export interface LegalSection {
  /** Anchor id (used by the "On this page" list and by links such as /privacy#contact). */
  id: string;
  title: string;
  paras?: string[];
  bullets?: string[];
}
