import { Linking, Platform, Share } from 'react-native';

const base = () =>
  process.env.EXPO_PUBLIC_WEB_URL?.replace(/\/$/, '') ||
  (Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : 'https://letsplaytambola.app');

/** Invite link. Opens the web app (or the installed app via universal links) straight on the game. */
export const gameLink = (code: string) => `${base()}/g/${code}`;
export const appLink = () => base();

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
