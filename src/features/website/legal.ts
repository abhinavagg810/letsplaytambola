// Shared details for the legal pages (/privacy and /terms).

/**
 * The contact email is ONE constant for the whole site: CONTACT_EMAIL in src/lib/site.ts, read from
 * NEXT_PUBLIC_CONTACT_EMAIL with the placeholder below as the fallback.
 * ⚠ The owner must make sure that mailbox really receives mail before launch (it is shown on /contact, /about,
 * /privacy and /terms, and is where removal requests and complaints go).
 */
export { CONTACT_EMAIL, CONTACT_EMAIL_PLACEHOLDER } from '@/lib/site';

/** Shown as "LAST UPDATED · …" on both pages. Change it whenever the text changes. */
export const LEGAL_LAST_UPDATED = '24 November 2026';

export interface LegalSection {
  /** Anchor id (used by the "On this page" list and by links such as /privacy#contact). */
  id: string;
  title: string;
  paras?: string[];
  bullets?: string[];
}
