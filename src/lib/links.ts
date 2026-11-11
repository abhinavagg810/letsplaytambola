import { Linking, Platform, Share } from 'react-native';

const base = () =>
  process.env.EXPO_PUBLIC_WEB_URL?.replace(/\/$/, '') ||
  (Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : 'https://letsplaytambola.app');

/** Invite link. Opens the web app (or the installed app via universal links) straight on the game. */
export const gameLink = (code: string) => `${base()}/g/${code}`;
export const appLink = () => base();

/**
 * Store pages for the native apps. Both are optional: until they are set the web invite page shows no
 * "Get the app" links at all. (Literal `process.env.EXPO_PUBLIC_*` reads so Expo can inline them.)
 */
const PLAY_URL = (process.env.EXPO_PUBLIC_PLAY_URL || '').trim();
const APPSTORE_URL = (process.env.EXPO_PUBLIC_APPSTORE_URL || '').trim();

/** Play Store link that remembers the game: Google hands `g=CODE` to the app on first launch (see src/lib/install.ts). */
export const withInstallReferrer = (playUrl: string, code: string) =>
  `${playUrl.replace(/([?&])referrer=[^&]*(&|$)/, (_m, a: string, b: string) => (b ? a : '')).replace(/[?&]$/, '')}${playUrl.includes('?') ? '&' : '?'}referrer=${encodeURIComponent(`g=${code}`)}`;

/** The `g=CODE` part of a Play install referrer, e.g. "g=AB12C" or "utm_source=x&g=AB12C" → "AB12C". Anything else → null. */
export function referrerCode(referrer: string | null | undefined): string | null {
  if (!referrer) return null;
  let r = referrer;
  try { if (/%3d/i.test(r)) r = decodeURIComponent(r); } catch { /* keep as is */ }
  const m = /(?:^|&)g=([A-Za-z0-9]{5})(?:&|$)/.exec(r);
  return m ? m[1].toUpperCase() : null;
}

/** "Get the app" targets for the web invite page; `null` = not published yet. */
export const storeLinks = (code: string) => ({
  play: PLAY_URL ? withInstallReferrer(PLAY_URL, code) : null,
  appStore: APPSTORE_URL || null,
});

/** Open a link in a new tab on web, in the system handler on native. */
export function openUrl(url: string) {
  if (Platform.OS === 'web') window.open(url, '_blank', 'noopener');
  else Linking.openURL(url).catch(() => {});
}

/** Accepts a pasted link or a bare code and returns the 5-char code. */
export const parseCode = (s: string) => s.trim().replace(/.*\/g\//i, '').replace(/.*j=/i, '').replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 5);

/** Open WhatsApp with a pre-filled message — to one contact (digits with country code) or the chat picker. */
export async function openWhatsApp(text: string, phone?: string) {
  const url = `https://wa.me/${phone ? phone.replace(/\D/g, '') : ''}?text=${encodeURIComponent(text)}`;
  try {
    if (Platform.OS === 'web') window.open(url, '_blank', 'noopener');
    else await Linking.openURL(url);
  } catch { await Share.share({ message: text }).catch(() => {}); }
}
export const shareSheet = (text: string) => Share.share({ message: text }).catch(() => {});
