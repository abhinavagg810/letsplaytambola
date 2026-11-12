// The voice caller (Web Speech API). Prefers an Indian English voice; rate 0.95, pitch 1.15.
// Every function is safe to call anywhere: without speech support (or on the server) they do nothing.
import { speechFor, winText } from '@/core';
import { isMuted } from './device';

const RATE = 0.95;
const PITCH = 1.15;
/** The win line waits a moment so it does not talk over the number that was just called. */
const WIN_DELAY_MS = 1200;

let winTimer: ReturnType<typeof setTimeout> | null = null;

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';
}

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  const lang = (v: SpeechSynthesisVoice) => v.lang.replace('_', '-').toLowerCase();
  return voices.find((v) => lang(v) === 'en-in') ?? voices.find((v) => lang(v).startsWith('en')) ?? null;
}

/**
 * Say something, unless this device is muted.
 * `interrupt` cuts off whatever is being said (used for numbers, so the caller never falls behind).
 */
export function speak(text: string, opts: { interrupt?: boolean } = {}): void {
  if (!speechSupported() || isMuted() || !text) return;
  try {
    const synth = window.speechSynthesis;
    const u = new SpeechSynthesisUtterance(text);
    const voice = pickVoice();
    if (voice) u.voice = voice;
    u.lang = voice?.lang ?? 'en-IN';
    u.rate = RATE;
    u.pitch = PITCH;
    if (opts.interrupt) synth.cancel();
    synth.speak(u);
  } catch {
    // speech is a nicety: never let it break the game
  }
}

/** "Two fat ladies! ... 8 and 8, 88" — single digits are read as "Single number, 7". */
export function speakNumber(n: number): void {
  speak(speechFor(n), { interrupt: true });
}

/** "Meera wins Top Line!" — said a moment later so it follows the number. */
export function speakWin(name: string, prize: string): void {
  if (!speechSupported()) return;
  if (winTimer) clearTimeout(winTimer);
  winTimer = setTimeout(() => {
    winTimer = null;
    speak(winText(name, prize));
  }, WIN_DELAY_MS);
}

/**
 * iOS (and some Android browsers) only allow speech after the person has tapped something.
 * Call this inside a tap handler — Join, Start the game, Sound on — before the first number is called.
 * Says nothing audible; safe to call many times.
 */
export function unlockSpeech(): void {
  if (!speechSupported()) return;
  try {
    const synth = window.speechSynthesis;
    synth.getVoices(); // starts loading the voice list
    synth.resume();
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    u.rate = RATE;
    synth.speak(u);
  } catch {
    // ignore
  }
}

/** Stop talking now (used when the person taps "Sound off"). */
export function stopSpeech(): void {
  if (winTimer) {
    clearTimeout(winTimer);
    winTimer = null;
  }
  if (!speechSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // ignore
  }
}
