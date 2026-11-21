import { describe, expect, it } from 'vitest';
import { NO_CLIENT_INFO, cleanIp, clientInfo, countryName, placeLabel, primaryLanguage, regionName } from '../client-info';

const h = (o: Record<string, string>): Headers => new Headers(o);

describe('cleanIp', () => {
  it('accepts IPv4 and IPv6, normalised', () => {
    expect(cleanIp('49.36.12.7')).toBe('49.36.12.7');
    expect(cleanIp(' 49.36.12.7 ')).toBe('49.36.12.7');
    expect(cleanIp('2405:201:C00B:8A00::1')).toBe('2405:201:c00b:8a00::1');
    expect(cleanIp('::1')).toBe('::1');
  });
  it('drops ports, brackets, zones and the IPv4-mapped prefix', () => {
    expect(cleanIp('49.36.12.7:51234')).toBe('49.36.12.7');
    expect(cleanIp('[2405:201::1]:443')).toBe('2405:201::1');
    expect(cleanIp('[2405:201::1]')).toBe('2405:201::1');
    expect(cleanIp('fe80::1%eth0')).toBe('fe80::1');
    expect(cleanIp('::ffff:49.36.12.7')).toBe('49.36.12.7');
  });
  it('refuses anything that is not an address', () => {
    for (const bad of ['', '   ', 'unknown', '999.1.1.1', '1.2.3', 'abc', '<script>', '1.2.3.4, 5.6.7.8', 'x'.repeat(200), null, undefined]) expect(cleanIp(bad)).toBeNull();
  });
});

describe('clientInfo', () => {
  it('reads the Vercel headers', () => {
    const info = clientInfo(h({
      'x-forwarded-for': '49.36.12.7', 'x-vercel-ip-country': 'IN', 'x-vercel-ip-country-region': 'MH', 'x-vercel-ip-city': 'Navi%20Mumbai',
      'x-vercel-ip-latitude': '19.0330', 'x-vercel-ip-longitude': '73.0297', 'x-vercel-ip-timezone': 'Asia/Kolkata', 'x-vercel-ip-postal-code': '400703',
    }));
    expect(info).toEqual({ ip: '49.36.12.7', country: 'IN', region: 'MH', city: 'Navi Mumbai', lat: 19.033, lon: 73.0297, timezone: 'Asia/Kolkata', postal: '400703' });
  });
  it('takes the first hop of several, and falls back to x-real-ip', () => {
    expect(clientInfo(h({ 'x-forwarded-for': '2405:201::9, 10.0.0.1, 76.76.21.21' })).ip).toBe('2405:201::9');
    expect(clientInfo(h({ 'x-forwarded-for': 'unknown, 10.0.0.1', 'x-real-ip': '49.36.12.7' })).ip).toBe('49.36.12.7');
    expect(clientInfo(h({ 'x-real-ip': '49.36.12.8' })).ip).toBe('49.36.12.8');
  });
  it('gives nulls when the headers are absent (local development)', () => {
    expect(clientInfo(h({}))).toEqual(NO_CLIENT_INFO);
    expect(placeLabel(clientInfo(h({})))).toBe('Unknown');
  });
  it('turns malformed values into nulls', () => {
    const info = clientInfo(h({
      'x-forwarded-for': 'not-an-ip', 'x-vercel-ip-country': 'India', 'x-vercel-ip-country-region': 'Maharashtra!', 'x-vercel-ip-city': '%E0%A4%A',
      'x-vercel-ip-latitude': '91.5', 'x-vercel-ip-longitude': 'east', 'x-vercel-ip-timezone': 'Asia/Kolkata; drop table', 'x-vercel-ip-postal-code': '<b>',
    }));
    expect(info).toEqual({ ...NO_CLIENT_INFO, city: '%E0%A4%A' });
    expect(clientInfo(h({ 'x-vercel-ip-country': 'XX' })).country).toBeNull();
    expect(clientInfo(h({ 'x-vercel-ip-latitude': '-91' })).lat).toBeNull();
    expect(clientInfo(h({ 'x-vercel-ip-longitude': '180.0001' })).lon).toBeNull();
    expect(clientInfo(h({ 'x-vercel-ip-latitude': '1e2' })).lat).toBeNull();
  });
  it('decodes, cleans and caps the city', () => {
    expect(clientInfo(h({ 'x-vercel-ip-city': 'S%C3%A3o%20Paulo' })).city).toBe('São Paulo');
    expect(clientInfo(h({ 'x-vercel-ip-city': '  Pune%0A<script>  ' })).city).toBe('Pune script');
    expect(clientInfo(h({ 'x-vercel-ip-city': 'x'.repeat(500) })).city).toHaveLength(64);
    expect(clientInfo(h({ 'x-vercel-ip-city': '%20%20' })).city).toBeNull();
    expect(clientInfo(h({ 'x-vercel-ip-country': 'in', 'x-vercel-ip-country-region': 'mh' }))).toMatchObject({ country: 'IN', region: 'MH' });
  });
  it('never looks at anything but headers', () => {
    // The function takes Headers only: there is no way to hand it a body.
    expect(clientInfo.length).toBe(1);
  });
});

describe('primaryLanguage', () => {
  it('takes the first language', () => {
    expect(primaryLanguage(h({ 'accept-language': 'en-IN,en;q=0.9,hi;q=0.8' }))).toBe('en-IN');
    expect(primaryLanguage(h({ 'accept-language': 'HI' }))).toBe('hi');
    expect(primaryLanguage(h({ 'accept-language': 'en-in' }))).toBe('en-IN');
    expect(primaryLanguage(h({ 'accept-language': 'zh-Hant-TW;q=1' }))).toBe('zh-Hant-TW');
  });
  it('is null when missing or malformed', () => {
    expect(primaryLanguage(h({}))).toBeNull();
    expect(primaryLanguage(h({ 'accept-language': '*' }))).toBeNull();
    expect(primaryLanguage(h({ 'accept-language': '<script>alert(1)</script>' }))).toBeNull();
    expect(primaryLanguage(h({ 'accept-language': 'x'.repeat(100) }))).toBeNull();
  });
});

describe('names', () => {
  it('labels places', () => {
    expect(countryName('IN')).toBe('India');
    expect(countryName('ZZ')).toBe('ZZ');
    expect(countryName(null)).toBe('Unknown');
    expect(regionName('IN', 'MH')).toBe('Maharashtra');
    expect(regionName('US', 'CA')).toBe('CA');
    expect(placeLabel({ city: 'Pune', region: 'MH', country: 'IN' })).toBe('Pune, Maharashtra, India');
    expect(placeLabel({ country: 'AE' })).toBe('United Arab Emirates');
  });
});
