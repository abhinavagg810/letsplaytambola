import * as Speech from 'expo-speech';
import { settings } from '@/state/settings';

/** Caller voice: en-IN, pitch 1.2, rate 0.95 (README §5). `cut` interrupts whatever is being said. */
export function say(text: string, cut?: boolean) {
  if (settings.get().muted) return;
  try {
    if (cut) Speech.stop();
    Speech.speak(text, { language: 'en-IN', pitch: 1.2, rate: 0.95 });
  } catch { /* speech unavailable on this device */ }
}
export const hush = () => { try { Speech.stop(); } catch { /* noop */ } };
