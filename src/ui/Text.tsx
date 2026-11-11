import React from 'react';
import { Text as RNText, TextProps, TextStyle } from 'react-native';
import { C, F } from '@/theme/tokens';

type W = 500 | 600 | 800;
export interface TProps extends TextProps {
  size?: number; w?: W; color?: string; mono?: boolean; lh?: number; center?: boolean; ls?: number; upper?: boolean;
}
const fam = (w: W) => (w === 800 ? F.bold : w === 600 ? F.semi : F.medium);

/** App text. Baloo 2 by default; `mono` = JetBrains Mono eyebrow style. */
export function T({ size = 17, w = 500, color = C.cream, mono, lh, center, ls, upper, style, ...rest }: TProps) {
  const s: TextStyle = {
    fontFamily: mono ? F.mono : fam(w), fontSize: size, color,
    lineHeight: Math.round(size * (lh ?? (size >= 22 ? 1.12 : 1.3))),
    letterSpacing: ls ?? (mono ? size * 0.08 : 0),
    textAlign: center ? 'center' : undefined,
    textTransform: upper || mono ? 'uppercase' : undefined,
  };
  return <RNText {...rest} style={[s, style]} />;
}
export const Eyebrow = (p: TProps) => <T mono size={12} color={C.muted} {...p} />;
