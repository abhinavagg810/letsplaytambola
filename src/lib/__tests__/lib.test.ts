import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDeviceToken, getSavedName, isMuted } from '../device';
import { displayUrl, gameUrl, inviteText, normaliseCode, whatsappUrl } from '../share';
import { speakNumber, speakWin, speechSupported, unlockSpeech } from '../speech';

afterEach(() => vi.unstubAllEnvs());

describe('share', () => {
  it('normalises typed and pasted codes', () => {
    expect(normaliseCode('k7rq2')).toBe('K7RQ2');
    expect(normaliseCode('  K7 RQ2 ')).toBe('K7RQ2');
    expect(normaliseCode('k7-rq2')).toBe('K7RQ2');
    expect(normaliseCode('https://letsplaytambola.com/g/k7rq2')).toBe('K7RQ2');
    expect(normaliseCode('letsplaytambola.com/g/K7RQ2/')).toBe('K7RQ2');
    expect(normaliseCode('http://192.168.1.5:3000/g/K7RQ2?utm=wa#top')).toBe('K7RQ2');
    expect(normaliseCode('https://example.com/play.html#g=k7rq2')).toBe('K7RQ2');
    expect(normaliseCode('Join my Tambola game “Diwali”! Tap the link:\nhttps://letsplaytambola.com/g/K7RQ2')).toBe('K7RQ2');
    expect(normaliseCode('ABCDEFGH')).toBe('ABCDEF');
    expect(normaliseCode('')).toBe('');
    expect(normaliseCode('!!!')).toBe('');
  });

  it('builds links', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://letsplaytambola.com/');
    expect(gameUrl('k7rq2')).toBe('https://letsplaytambola.com/g/K7RQ2');
    expect(displayUrl(gameUrl('K7RQ2'))).toBe('letsplaytambola.com/g/K7RQ2');
    expect(inviteText('Diwali Night', 'K7RQ2')).toBe('Join my Tambola game “Diwali Night”! Tap the link, type your name and you’re in:\nhttps://letsplaytambola.com/g/K7RQ2');
    expect(whatsappUrl('a b&c\nd')).toBe('https://wa.me/?text=a%20b%26c%0Ad');
  });
});

describe('on the server (no window)', () => {
  it('device helpers return defaults', () => {
    expect(getDeviceToken()).toBe('');
    expect(getSavedName()).toBe('');
    expect(isMuted()).toBe(false);
  });

  it('speech helpers do nothing', () => {
    expect(speechSupported()).toBe(false);
    expect(() => { unlockSpeech(); speakNumber(7); speakWin('Meera', 'Top Line'); }).not.toThrow();
  });
});
