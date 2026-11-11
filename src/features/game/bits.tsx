import React from 'react';
import { Pressable, View } from 'react-native';
import { C, MIN_TAP } from '@/theme/tokens';
import { T, initial, type TProps } from '@/ui';

/** Colours the game screens take straight from the prototype (no shared token carries them). */
export const GAME = {
  boardDim: '#827B9C',   // uncalled number on the board
  miniOff: '#E1D6C2',    // mini ticket: cell outside the pattern
  miniWon: '#A09AB5',    // mini ticket: pattern cell once the prize is won
  autoOn: 'rgba(64,217,193,0.2)',
} as const;

/** Mono counter / eyebrow exactly as the prototype's game screens draw it: 11px, no extra tracking. */
export const Mono = (p: TProps) => <T mono size={11} ls={0} lh={1.05} color={C.muted} {...p} />;

/** Player face with the prototype's exact letter size for this spot (the shared Avatar derives it from the diameter). */
export function Face({ name, color, size, font, ring }: { name?: string | null; color: string; size: number; font: number; ring?: string }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: ring ? `0 0 0 4px ${ring}` : undefined }}>
      <T w={800} size={font} color={C.ink} lh={1} style={{ paddingTop: 2 }}>{initial(name)}</T>
    </View>
  );
}

/** Round back button; the glyph is drawn at the prototype's weight. Touch area is always at least 44px. */
export function Back({ onPress, size = 40, font = 20 }: { onPress?: () => void; size?: number; font?: number }) {
  return (
    <Pressable onPress={onPress} hitSlop={Math.max(0, (MIN_TAP - size) / 2)} accessibilityRole="button" accessibilityLabel="Back"
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.surf, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <T size={font} lh={1.1}>←</T>
    </Pressable>
  );
}
