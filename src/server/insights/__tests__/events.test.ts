import { describe, expect, it } from 'vitest';
import { EVENTS, EVENT_NAMES, TRACK_MAX_AGE_MS, TRACK_MAX_EVENTS, cleanBatch, cleanEvent, cleanPath, normaliseSource } from '../events';

const NOW = 1_800_000_000_000;

describe('the event whitelist', () => {
  it('has every event the site records', () => {
    for (const name of ['session_start', 'session_end', 'page_view', 'cta_host', 'cta_join', 'cta_code', 'cta_notify', 'host_name_typed', 'host_preset',
      'host_amount_typed', 'host_price_set', 'host_create_tap', 'host_created', 'host_create_failed', 'share_whatsapp', 'share_copy', 'share_header_copy',
      'join_name_typed', 'join_tap', 'join_ok', 'join_failed', 'game_not_found', 'game_start', 'first_call', 'auto_on', 'auto_off', 'mute_on', 'mute_off',
      'claim_open', 'claim_valid', 'claim_invalid', 'new_round', 'results_seen', 'host_own_tap', 'toast', 'offline', 'online']) {
      expect(EVENT_NAMES, name).toContain(name);
    }
  });
  it('drops names that are not on it', () => {
    for (const n of ['evil', 'PAGE_VIEW', '', 'constructor', '__proto__', 'toString', 42, null]) expect(cleanEvent({ n }, NOW)).toBeNull();
    for (const raw of [null, 'page_view', [], 7]) expect(cleanEvent(raw, NOW)).toBeNull();
  });
  it('keeps only listed properties of the right type and value', () => {
    expect(cleanEvent({ n: 'page_view', d: { page: 'home', role: 'host', extra: 'x', name: 'Meera' } }, NOW)?.props).toEqual({ page: 'home', role: 'host' });
    expect(cleanEvent({ n: 'page_view', d: { page: 'secret', role: 'admin' } }, NOW)?.props).toEqual({});
    expect(cleanEvent({ n: 'page_view', d: { page: ['home'] } }, NOW)?.props).toEqual({});
    expect(cleanEvent({ n: 'claim_invalid', d: { prize: 'top', reason: 'not_yet' } }, NOW)?.props).toEqual({ prize: 'top', reason: 'not_yet' });
    expect(cleanEvent({ n: 'claim_invalid', d: { prize: 'Top Line!', reason: 'because' } }, NOW)?.props).toEqual({});
    expect(cleanEvent({ n: 'toast', d: { cls: 'not_yet', msg: 'Meera already won Top Line' } }, NOW)?.props).toEqual({ cls: 'not_yet' });
    expect(cleanEvent({ n: 'toast', d: { cls: 'Meera already won Top Line' } }, NOW)?.props).toEqual({});
    expect(cleanEvent({ n: 'cta_host', d: { anything: 1 } }, NOW)?.props).toEqual({});
    expect(cleanEvent({ n: 'cta_host', d: 'x' }, NOW)?.props).toEqual({});
  });
  it('validates numbers, booleans and string lengths', () => {
    const ok = cleanEvent({ n: 'session_start', d: { sw: 390, sh: 844, vw: 390, vh: 700, dpr: 300, touch: true, pwa: false, conn: '4g', tz: 'Asia/Kolkata', ref: 'l.facebook.com', utm_source: 'diwali', utm_medium: 'whatsapp', utm_campaign: 'kitty-2026', landing: '/g/[code]' } }, NOW);
    expect(Object.keys(ok!.props)).toHaveLength(14);
    const bad = cleanEvent({ n: 'session_start', d: { sw: '390', sh: 1.5, vw: -1, vh: 99999, dpr: Infinity, touch: 'yes', pwa: 1, conn: 'warp', tz: '<script>', ref: 'https://evil.example/path?x=1', utm_source: 'Has Spaces', utm_medium: 'x'.repeat(61), utm_campaign: '', landing: 'javascript:alert(1)' } }, NOW);
    expect(bad!.props).toEqual({});
    expect(cleanEvent({ n: 'session_end', d: { ms: 86_400_001 } }, NOW)?.props).toEqual({});
    expect(cleanEvent({ n: 'session_end', d: { ms: 1234 } }, NOW)?.props).toEqual({ ms: 1234 });
    expect(cleanEvent({ n: 'host_preset', d: { preset: 'Classic 5' } }, NOW)?.props).toEqual({ preset: 'Classic 5' });
    expect(cleanEvent({ n: 'host_preset', d: { preset: '<img src=x>' } }, NOW)?.props).toEqual({});
  });
  it('takes the time from the server clock minus a capped age', () => {
    expect(cleanEvent({ n: 'online' }, NOW)?.at).toBe(NOW);
    expect(cleanEvent({ n: 'online', o: 2500 }, NOW)?.at).toBe(NOW - 2500);
    expect(cleanEvent({ n: 'online', o: -5 }, NOW)?.at).toBe(NOW);
    expect(cleanEvent({ n: 'online', o: 9e15 }, NOW)?.at).toBe(NOW - TRACK_MAX_AGE_MS);
    expect(cleanEvent({ n: 'online', o: 'yesterday', at: 5 }, NOW)?.at).toBe(NOW);
  });
  it('accepts only real game codes and masks them in paths', () => {
    expect(cleanEvent({ n: 'join_ok', c: 'k7rq2', p: '/g/K7RQ2?utm=1#x' }, NOW)).toMatchObject({ code: 'K7RQ2', path: '/g/[code]' });
    expect(cleanEvent({ n: 'join_ok', c: 'not a code', p: 'https://evil.example/' }, NOW)).toMatchObject({ code: null, path: null });
    expect(cleanPath('/')).toBe('/');
    expect(cleanPath('/host/prizes/')).toBe('/host/prizes');
    expect(cleanPath('/g/ABCDE/')).toBe('/g/[code]');
    expect(cleanPath('/<script>')).toBeNull();
    expect(cleanPath(`/${'a'.repeat(200)}`)).toBeNull();
    expect(cleanPath(42)).toBeNull();
  });
  it('every property spec is one of the four kinds', () => {
    for (const specs of Object.values(EVENTS)) for (const s of Object.values(specs)) expect(['enum', 'str', 'int', 'bool']).toContain(s.t);
  });
});

describe('cleanBatch', () => {
  const sid = 'abcdef0123456789abcdef01';
  it('needs a session id and a list of events', () => {
    expect(cleanBatch({ sid, e: [] }, NOW)).toEqual({ session: sid, source: 'direct', events: [] });
    for (const body of [null, [], 'x', {}, { sid }, { sid: 'short', e: [] }, { sid: 'has spaces in it!!', e: [] }, { sid, e: 'no' }, { sid: 5, e: [] }]) expect(cleanBatch(body, NOW)).toBeNull();
  });
  it('drops unknown events and keeps the rest in order', () => {
    const b = cleanBatch({ sid, src: 'whatsapp', e: [{ n: 'cta_host' }, { n: 'evil' }, null, { n: 'page_view', d: { page: 'host' } }] }, NOW);
    expect(b?.events.map((e) => e.name)).toEqual(['cta_host', 'page_view']);
    expect(b?.source).toBe('whatsapp');
  });
  it('keeps at most 50 events', () => {
    const b = cleanBatch({ sid, e: Array.from({ length: 80 }, () => ({ n: 'online' })) }, NOW);
    expect(b?.events).toHaveLength(TRACK_MAX_EVENTS);
  });
  it('never takes an IP, a place or a device from the body', () => {
    const b = cleanBatch({ sid, ip: '1.2.3.4', country: 'US', city: 'Nowhere', ua: 'x', e: [{ n: 'cta_host', ip: '1.2.3.4', d: { ip: '1.2.3.4', city: 'Nowhere', country: 'US' } }] }, NOW);
    expect(JSON.stringify(b)).not.toMatch(/1\.2\.3\.4|Nowhere|"US"/);
  });
});

describe('normaliseSource', () => {
  it('labels the usual referrers', () => {
    expect(normaliseSource('l.facebook.com')).toBe('facebook');
    expect(normaliseSource('www.google.co.in')).toBe('google');
    expect(normaliseSource('web.whatsapp.com')).toBe('whatsapp');
    expect(normaliseSource('wa.me')).toBe('whatsapp');
    expect(normaliseSource('l.instagram.com')).toBe('instagram');
    expect(normaliseSource('t.co')).toBe('x');
    expect(normaliseSource('Diwali-Campaign')).toBe('diwali-campaign');
    expect(normaliseSource('blog.example.org')).toBe('blog.example.org');
  });
  it('falls back to direct, or to the in-app browser when there is no referrer', () => {
    expect(normaliseSource(undefined)).toBe('direct');
    expect(normaliseSource('<script>')).toBe('direct');
    expect(normaliseSource('x'.repeat(500))).toBe('x'.repeat(60));
    expect(normaliseSource('', 'WhatsApp')).toBe('whatsapp');
    expect(normaliseSource('direct', 'Google app')).toBe('google-app');
    expect(normaliseSource('google.com', 'Instagram')).toBe('google');
  });
});
