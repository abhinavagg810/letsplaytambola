// Facts about the site and the people who run it, shared by the public pages, the contact form and the server.
// Pure: safe in Server Components, Client Components and API routes.

export const SITE_NAME = 'Letsplaytambola';
/** Public address of the site. Set NEXT_PUBLIC_SITE_URL on Vercel; the default is the planned domain. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://letsplaytambola.com').replace(/\/+$/, '');
/** Who runs the site, as shown on /about and /contact. */
export const TEAM_NAME = 'the Letsplaytambola team';
export const TEAM_CITY = 'Delhi';
export const TEAM_COUNTRY = 'India';

/**
 * ⚠ PLACEHOLDER — NOT A CONFIRMED ADDRESS.
 * Used only when NEXT_PUBLIC_CONTACT_EMAIL is not set. The owner must make sure the mailbox in use really receives
 * mail (it is shown on /contact, /about, /privacy and /terms, and is where removal requests and complaints go).
 */
export const CONTACT_EMAIL_PLACEHOLDER = 'hello@letsplaytambola.com';

const EMAIL = /^[^\s@<>"'()[\]\\,;:]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;

/** The one contact email of the site: NEXT_PUBLIC_CONTACT_EMAIL (baked in at build time), else the placeholder. */
export function contactEmail(raw: string | undefined = process.env.NEXT_PUBLIC_CONTACT_EMAIL): string {
  const v = raw?.trim() ?? '';
  return v.length <= 120 && EMAIL.test(v) ? v : CONTACT_EMAIL_PLACEHOLDER;
}

/** ⚠ The owner must make sure this mailbox works — see CONTACT_EMAIL_PLACEHOLDER. */
export const CONTACT_EMAIL = contactEmail();
