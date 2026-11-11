import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

jest.mock('@react-native-async-storage/async-storage', () => {
  const m = new Map<string, string>();
  return { __esModule: true, default: {
    getItem: jest.fn(async (k: string) => m.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => { m.set(k, v); }),
    clear: jest.fn(async () => { m.clear(); }),
  } };
});
const mockReferrer = jest.fn<Promise<string>, []>();
jest.mock('expo-application', () => ({ getInstallReferrerAsync: () => mockReferrer() }));
jest.mock('@/state/session', () => {
  let s: { pendingCode: string | null } = { pendingCode: null };
  return { session: { get: () => s, set: (p: { pendingCode: string | null }) => { s = { ...s, ...p }; } } };
});

import { referrerCode, withInstallReferrer } from '../links';
import { _resetInstallReferrerForTests, checkInstallReferrer } from '../install';
import { session } from '@/state/session';

const setOS = (os: string) => Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });

describe('install referrer helpers', () => {
  it('builds a Play link that carries the game code', () => {
    const base = 'https://play.google.com/store/apps/details?id=com.letsplaytambola.app';
    expect(withInstallReferrer(base, 'AB12C')).toBe(`${base}&referrer=g%3DAB12C`);
    expect(withInstallReferrer('https://example.com/app', 'AB12C')).toBe('https://example.com/app?referrer=g%3DAB12C');
    expect(withInstallReferrer(`${base}&referrer=old`, 'AB12C')).toBe(`${base}&referrer=g%3DAB12C`);
  });
  it('round-trips through the Play Store (which URL-decodes the referrer)', () => {
    const url = new URL(withInstallReferrer('https://play.google.com/store/apps/details?id=x', 'ZX9Q1'));
    expect(url.searchParams.get('id')).toBe('x');
    expect(referrerCode(url.searchParams.get('referrer'))).toBe('ZX9Q1');
  });
  it('reads only a well-formed code', () => {
    expect(referrerCode('g=ab12c')).toBe('AB12C');
    expect(referrerCode('utm_source=whatsapp&g=AB12C&utm_medium=invite')).toBe('AB12C');
    expect(referrerCode('g%3DAB12C')).toBe('AB12C');
    expect(referrerCode('utm_source=google-play&utm_medium=organic')).toBeNull();
    expect(referrerCode('g=TOOLONG')).toBeNull();
    expect(referrerCode('msg=AB12C')).toBeNull();
    expect(referrerCode('g=AB<2C')).toBeNull();
    expect(referrerCode('')).toBeNull();
    expect(referrerCode(null)).toBeNull();
  });
});

describe('checkInstallReferrer', () => {
  beforeEach(async () => {
    await AsyncStorage.clear(); mockReferrer.mockReset(); _resetInstallReferrerForTests();
    session.set({ pendingCode: null }); setOS('android');
  });

  it('first launch from an invite: returns the code and sets pendingCode — once only', async () => {
    mockReferrer.mockResolvedValue('g=AB12C');
    expect(await checkInstallReferrer()).toBe('AB12C');
    expect(session.get().pendingCode).toBe('AB12C');
    expect(await checkInstallReferrer()).toBe('AB12C');          // same launch: memoised
    _resetInstallReferrerForTests(); session.set({ pendingCode: null });
    expect(await checkInstallReferrer()).toBeNull();             // next launch: flag is set
    expect(session.get().pendingCode).toBeNull();
    expect(mockReferrer).toHaveBeenCalledTimes(1);
  });
  it('organic install: null, and never asks again', async () => {
    mockReferrer.mockResolvedValue('utm_source=google-play&utm_medium=organic');
    expect(await checkInstallReferrer()).toBeNull();
    _resetInstallReferrerForTests();
    expect(await checkInstallReferrer()).toBeNull();
    expect(mockReferrer).toHaveBeenCalledTimes(1);
  });
  it('does not replace a game opened by link in this launch', async () => {
    session.set({ pendingCode: 'LINK1' });
    mockReferrer.mockResolvedValue('g=AB12C');
    await checkInstallReferrer();
    expect(session.get().pendingCode).toBe('LINK1');
  });
  it('Play Services failure: null, retried on the next launch', async () => {
    mockReferrer.mockRejectedValue(new Error('no play services'));
    expect(await checkInstallReferrer()).toBeNull();
    _resetInstallReferrerForTests();
    mockReferrer.mockResolvedValue('g=AB12C');
    expect(await checkInstallReferrer()).toBe('AB12C');
  });
  it('iOS and web: null without touching the API', async () => {
    for (const os of ['ios', 'web']) {
      setOS(os); _resetInstallReferrerForTests();
      expect(await checkInstallReferrer()).toBeNull();
    }
    expect(mockReferrer).not.toHaveBeenCalled();
  });
});
