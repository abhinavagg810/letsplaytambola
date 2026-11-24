// Admin → Messages: the URL filters, and the rows of the CSV export. Shared by the page and the export route.
import { isContactTopic, topicLabel } from '@/lib/contact';
import type { ContactTopic } from '@/lib/contact';
import { placeLabel } from '../client-info';
import { uaSummary } from '../insights/ua';
import type { AdminContactMessage, ContactListQuery } from '../store';
import { formatIst } from './time';

export const MESSAGES_PAGE_SIZE = 25;
export const MESSAGE_STATUSES = ['unread', 'read'] as const;

export interface MessagesFilter {
  topic: '' | ContactTopic;
  q: string;
  status: '' | (typeof MESSAGE_STATUSES)[number];
  page: number;
}

type Params = Record<string, string | string[] | undefined> | URLSearchParams;
const one = (params: Params, k: string): string => {
  if (params instanceof URLSearchParams) return params.get(k) ?? '';
  const v = params[k];
  return Array.isArray(v) ? v[0] ?? '' : v ?? '';
};

export function parseMessagesFilter(params: Params): MessagesFilter {
  const topic = one(params, 'topic');
  const status = one(params, 'status');
  return {
    topic: isContactTopic(topic) ? topic : '',
    q: one(params, 'q').trim().slice(0, 60),
    status: (MESSAGE_STATUSES as readonly string[]).includes(status) ? (status as MessagesFilter['status']) : '',
    page: Math.max(1, Number.parseInt(one(params, 'page'), 10) || 1),
  };
}

export function messagesQuery(f: MessagesFilter, pageSize = MESSAGES_PAGE_SIZE): ContactListQuery {
  return { topic: f.topic || undefined, search: f.q || undefined, status: f.status || undefined, limit: pageSize, offset: (f.page - 1) * pageSize };
}

/** "?topic=help&q=froze" — only what is set. */
export function messagesQueryString(f: MessagesFilter, over: Partial<MessagesFilter> = {}): string {
  const m = { ...f, ...over };
  const p = new URLSearchParams();
  if (m.topic) p.set('topic', m.topic);
  if (m.q) p.set('q', m.q);
  if (m.status) p.set('status', m.status);
  if (m.page > 1) p.set('page', String(m.page));
  const s = p.toString();
  return s ? `?${s}` : '';
}

export const MESSAGE_CSV_HEAD = ['Received (IST)', 'Topic', 'Read', 'Name', 'Reply to', 'Message', 'Came from page', 'Place', 'IP address', 'Device', 'Device id'] as const;

/** One CSV row. Every typed field goes through csv(), which defuses cells a spreadsheet would read as a formula. */
export function messageCsvRow(m: AdminContactMessage): (string | number | null)[] {
  return [
    formatIst(m.createdAt), topicLabel(m.topic), m.readAt === null ? 'No' : 'Yes', m.name, m.replyTo, m.message, m.page,
    placeLabel(m), m.ip, uaSummary({ device: m.deviceType, os: m.os, osVersion: m.osVersion, browser: m.browser, browserVersion: m.browserVersion, inApp: m.inApp }), m.device,
  ];
}
