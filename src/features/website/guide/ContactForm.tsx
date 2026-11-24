'use client';
// The message form on /contact → POST /api/contact. Checks the fields the same way the server does (src/lib/contact.ts),
// shows the success state only when the server says the message was stored, and otherwise offers the email address.
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { CONTACT_LIMITS, CONTACT_TOPICS, HONEYPOT_FIELD, cleanPage, isContactTopic, validateContact } from '@/lib/contact';
import type { ContactField, ContactTopic } from '@/lib/contact';
import { getDeviceToken } from '@/lib/device';
import { track } from '@/lib/track';
import styles from './contact.module.css';

type Errors = Partial<Record<ContactField, string>>;
const FIELDS: ContactField[] = ['name', 'replyTo', 'topic', 'message'];
const REASONS = ['invalid', 'bad_request', 'rate_limited', 'unavailable', 'server', 'network', 'forbidden'];

export function ContactForm({ email }: { email: string }) {
  const [name, setName] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [topic, setTopic] = useState<ContactTopic>('help');
  const [message, setMessage] = useState('');
  const [trap, setTrap] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const [problem, setProblem] = useState('');
  const from = useRef<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const done = useRef<HTMLDivElement>(null);
  const failed = useRef<HTMLDivElement>(null);

  // A link such as /contact?topic=remove picks the topic; a visit from another page of the site remembers that page.
  useEffect(() => {
    try {
      const t = new URLSearchParams(window.location.search).get('topic');
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once after hydration: the page itself is static
      if (isContactTopic(t)) setTopic(t);
      const ref = document.referrer ? new URL(document.referrer) : null;
      from.current = ref && ref.origin === window.location.origin ? cleanPage(ref.pathname) : null;
    } catch {
      // keep the defaults
    }
  }, []);

  useEffect(() => {
    if (state === 'sent') done.current?.focus();
    if (state === 'failed') failed.current?.focus();
  }, [state]);

  const length = [...message].length;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state === 'sending') return;
    const check = validateContact({ name, replyTo, topic, message });
    if (!check.ok) {
      setErrors(check.errors);
      const first = FIELDS.find((f) => check.errors[f]);
      if (first) form.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    setErrors({});
    setProblem('');
    setState('sending');
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-device-token': getDeviceToken() },
        body: JSON.stringify({ name, replyTo, topic, message, page: from.current ?? '/contact', [HONEYPOT_FIELD]: trap }),
        cache: 'no-store',
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; code?: string; error?: string; fields?: Errors } | null;
      if (res.ok && data?.ok) {
        track('contact_sent', { topic });
        setState('sent');
        return;
      }
      track('contact_failed', { reason: data?.code && REASONS.includes(data.code) ? data.code : 'other' });
      if (data?.code === 'invalid' && data.fields) {
        setErrors(data.fields);
        setState('idle');
        return;
      }
      setProblem(data?.error || '');
      setState('failed');
    } catch {
      track('contact_failed', { reason: 'network' });
      setProblem('');
      setState('failed');
    }
  }

  function reset() {
    setName('');
    setReplyTo('');
    setMessage('');
    setTopic('help');
    setState('idle');
  }

  if (state === 'sent') {
    return (
      <div ref={done} className={styles.sent} role="status" tabIndex={-1}>
        <span className={styles.tick} aria-hidden="true">✓</span>
        <p className={styles.sentTitle}>Thank you — your message has reached us.</p>
        <p className={styles.text}>{replyTo.trim() ? 'We try to reply within a few days.' : 'You did not leave an email or phone number, so we cannot reply — but we will read it.'}</p>
        <Button variant="outline" size={50} onClick={reset}>Send another message</Button>
      </div>
    );
  }

  const describe = (f: ContactField, hint?: string) => [hint, errors[f] ? `${f}-error` : null].filter(Boolean).join(' ') || undefined;

  return (
    <form ref={form} className={styles.form} onSubmit={submit} noValidate>
      <label className={styles.field}>
        <span className={styles.label}>Your name <span className={styles.optional}>OPTIONAL</span></span>
        <Input name="name" tone="bg" size={56} fontSize={18} weight={500} value={name} onChange={(e) => setName(e.target.value)} maxLength={CONTACT_LIMITS.name + 10} autoComplete="name" invalid={!!errors.name} aria-describedby={describe('name')} placeholder="e.g. Kamla" />
        {errors.name ? <span id="name-error" className={styles.error}>{errors.name}</span> : null}
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Email or phone, so we can reply <span className={styles.optional}>OPTIONAL</span></span>
        <Input name="replyTo" tone="bg" size={56} fontSize={18} weight={500} value={replyTo} onChange={(e) => setReplyTo(e.target.value)} maxLength={CONTACT_LIMITS.replyTo + 10} autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} invalid={!!errors.replyTo} aria-describedby={describe('replyTo')} placeholder="Email or mobile number" />
        {errors.replyTo ? <span id="replyTo-error" className={styles.error}>{errors.replyTo}</span> : null}
      </label>

      <label className={styles.field}>
        <span className={styles.label}>What is it about?</span>
        <select name="topic" className={styles.select} value={topic} onChange={(e) => setTopic(e.target.value as ContactTopic)} aria-invalid={errors.topic ? true : undefined} aria-describedby={describe('topic')}>
          {CONTACT_TOPICS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        {errors.topic ? <span id="topic-error" className={styles.error}>{errors.topic}</span> : null}
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Your message</span>
        <textarea name="message" className={styles.textarea} value={message} onChange={(e) => setMessage(e.target.value)} rows={6} maxLength={CONTACT_LIMITS.messageMax + 200} required aria-invalid={errors.message ? true : undefined} aria-describedby={describe('message', 'message-count')} placeholder="Tell us what happened, or what you would like" />
        <span id="message-count" className={styles.count} data-over={length > CONTACT_LIMITS.messageMax ? 'true' : undefined}>
          {length.toLocaleString('en-IN')} / {CONTACT_LIMITS.messageMax.toLocaleString('en-IN')} characters · at least {CONTACT_LIMITS.messageMin}
        </span>
        {errors.message ? <span id="message-error" className={styles.error}>{errors.message}</span> : null}
      </label>

      {/* For bots only: people never see this field, and a message that fills it is not stored. */}
      <div className={styles.trap} aria-hidden="true">
        <label>
          Leave this empty
          <input type="text" name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} />
        </label>
      </div>

      {state === 'failed' ? (
        <div ref={failed} className={styles.failed} role="alert" tabIndex={-1}>
          <b>Your message was not sent.</b>{' '}
          {problem && !problem.includes(email) ? `${problem} ` : null}
          {!problem ? 'We could not reach our server — please check your internet and try again. ' : null}
          {problem.includes(email) ? 'Please email us instead at ' : 'You can always email us at '}
          <a href={`mailto:${email}`}>{email}</a>. What you typed is still here, so you can copy it.
        </div>
      ) : null}

      <Button type="submit" size={60} block disabledLook={state === 'sending'}>
        {state === 'sending' ? 'Sending…' : 'Send message'}
      </Button>
      <p className={styles.small}>
        We keep your message for up to 90 days to answer it, as explained in our <a href="/privacy#collect">Privacy Policy</a>. Please do not include bank or card details.
      </p>
    </form>
  );
}
