// The contact form (/contact → POST /api/contact): topics, limits and validation.
// Pure, so the browser shows the same messages the server enforces. The server is the one that counts:
// it runs validateContact() again on whatever arrives.

export const CONTACT_TOPICS = [
  { id: 'help', label: 'Help with a game' },
  { id: 'feedback', label: 'Feedback or idea' },
  { id: 'remove', label: 'Remove my data' },
  { id: 'business', label: 'Business or advertising' },
  { id: 'other', label: 'Something else' },
] as const;
export type ContactTopic = (typeof CONTACT_TOPICS)[number]['id'];
export const CONTACT_TOPIC_IDS: readonly ContactTopic[] = CONTACT_TOPICS.map((t) => t.id);

export const isContactTopic = (v: unknown): v is ContactTopic => typeof v === 'string' && (CONTACT_TOPIC_IDS as readonly string[]).includes(v);
export const topicLabel = (id: string): string => CONTACT_TOPICS.find((t) => t.id === id)?.label ?? 'Something else';

export const CONTACT_LIMITS = { name: 60, replyTo: 80, messageMin: 10, messageMax: 2000, page: 80 } as const;
/** POST /api/contact refuses bodies bigger than this (bytes). */
export const CONTACT_MAX_BYTES = 8 * 1024;
/** The hidden field people never see. A bot that fills it in is told "thank you" and nothing is stored. */
export const HONEYPOT_FIELD = 'website';

export type ContactField = 'name' | 'replyTo' | 'topic' | 'message';

/** What is stored: every field already trimmed and cleaned. */
export interface ContactInput {
  topic: ContactTopic;
  name: string | null;
  replyTo: string | null;
  message: string;
  /** The site page the person came from ("/how-to-play"), or null. */
  page: string | null;
}

export type ContactCheck = { ok: true; value: ContactInput } | { ok: false; errors: Partial<Record<ContactField, string>> };

export const CONTACT_COPY = {
  name: `Please keep your name to ${CONTACT_LIMITS.name} letters or fewer`,
  replyTo: 'Please type an email address or a phone number we can reply to — or leave it empty',
  replyToLong: `Please keep this to ${CONTACT_LIMITS.replyTo} characters or fewer`,
  topic: 'Please choose what your message is about',
  messageShort: `Please write a little more — at least ${CONTACT_LIMITS.messageMin} characters`,
  messageLong: `Please keep your message to ${CONTACT_LIMITS.messageMax.toLocaleString('en-IN')} characters or fewer`,
} as const;

// Control characters (except new line and tab), C1 controls, zero-width and text-direction characters, the byte-order
// mark and the "object replacement" marks: invisible, and in a name they can make text look like something else.
const INVISIBLE = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff\ufff9-\ufffc]/g;
// Half an emoji (a lone surrogate) cannot be stored as text.
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;

const length = (s: string): number => [...s].length;

/** One line of text: invisible characters removed, any white space (new lines too) collapsed to one space, trimmed. */
export function cleanLine(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(LONE_SURROGATE, '').replace(INVISIBLE, '').replace(/\s+/g, ' ').trim();
}

/** A message: new lines kept (at most two in a row), tabs become spaces, invisible characters removed, trimmed. */
export function cleanMessage(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, ' ')
    .replace(LONE_SURROGATE, '')
    .replace(INVISIBLE, '')
    .replace(/[^\S\n]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
const PHONE = /^\+?[0-9\s().-]+$/;

/** An email address or a phone number, loosely: something a person could reply to. */
export function isReplyTo(s: string): boolean {
  if (EMAIL.test(s)) return true;
  if (!PHONE.test(s)) return false;
  const digits = s.replace(/\D/g, '').length;
  return digits >= 7 && digits <= 15;
}

const PATH = /^\/[A-Za-z0-9/_\-.]*$/;
/** A path on this site ("/how-to-play"), or null. Query and hash are dropped; a game code is masked. */
export function cleanPage(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//')) return null;
  let p = raw.split(/[?#]/)[0];
  if (/^\/g\/[^/]+\/?$/i.test(p)) p = '/g/code';
  if (p.length > 1) p = p.replace(/\/+$/, '');
  return p.length <= CONTACT_LIMITS.page && PATH.test(p) ? p : null;
}

/** Check and clean a submitted form (the browser's copy or the API body). Never returns the raw input. */
export function validateContact(body: Record<string, unknown>): ContactCheck {
  const errors: Partial<Record<ContactField, string>> = {};
  const name = cleanLine(body.name);
  const replyTo = cleanLine(body.replyTo);
  const message = cleanMessage(body.message);
  const topic = body.topic;

  if (length(name) > CONTACT_LIMITS.name) errors.name = CONTACT_COPY.name;
  if (length(replyTo) > CONTACT_LIMITS.replyTo) errors.replyTo = CONTACT_COPY.replyToLong;
  else if (replyTo && !isReplyTo(replyTo)) errors.replyTo = CONTACT_COPY.replyTo;
  if (!isContactTopic(topic)) errors.topic = CONTACT_COPY.topic;
  if (length(message) < CONTACT_LIMITS.messageMin) errors.message = CONTACT_COPY.messageShort;
  else if (length(message) > CONTACT_LIMITS.messageMax) errors.message = CONTACT_COPY.messageLong;
  if (Object.keys(errors).length) return { ok: false, errors };

  return { ok: true, value: { topic: topic as ContactTopic, name: name || null, replyTo: replyTo || null, message, page: cleanPage(body.page) } };
}

/** True when the hidden field was filled in (only bots see it). */
export function honeypotFilled(body: Record<string, unknown>): boolean {
  const trap = body[HONEYPOT_FIELD];
  return typeof trap === 'string' ? trap.trim() !== '' : trap !== undefined && trap !== null && trap !== false;
}
