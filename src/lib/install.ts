// Deferred deep link (README §3): someone taps an invite, installs the app from the store, and should
// land in that game on first launch.
//
// Android: the web invite page links to the Play Store with `&referrer=g%3DCODE` (see `storeLinks` in
// links.ts). Google Play keeps that string for the install and hands it back through the Install
// Referrer API, which we read exactly once.
// iOS has no equivalent, so the invite page shows the game code to type on Home instead.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import { Platform } from 'react-native';
import { session } from '@/state/session';
import { referrerCode } from './links';

const FLAG = 'tambola:install-referrer-checked';
const TIMEOUT_MS = 4000;

let once: Promise<string | null> | null = null;

/**
 * First launch after an install from an invite: returns the game code (and stores it in
 * `session.pendingCode`, so signing in leads into the game). Every other time — later launches,
 * iOS, web, organic installs, Play Services missing — resolves to `null`. Never throws.
 */
export function checkInstallReferrer(): Promise<string | null> {
  if (!once) once = read().catch(() => null);
  return once;
}

async function read(): Promise<string | null> {
  if (Platform.OS !== 'android') return null;
  if (await AsyncStorage.getItem(FLAG)) return null;
  // Play Services can be slow or absent; never hold the app up for it.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const referrer = await Promise.race([
    Application.getInstallReferrerAsync(),
    new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), TIMEOUT_MS); }),
  ]).finally(() => clearTimeout(timer));
  if (referrer === null) return null;            // timed out: try again on the next launch
  await AsyncStorage.setItem(FLAG, '1');
  const code = referrerCode(referrer);
  // A game the user already opened through a link in this launch wins.
  if (code && !session.get().pendingCode) session.set({ pendingCode: code });
  return code;
}

/** Test hook. */
export function _resetInstallReferrerForTests() { once = null; }
