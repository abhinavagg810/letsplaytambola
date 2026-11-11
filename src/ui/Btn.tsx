import React from 'react';
import { Pressable, StyleProp, View, ViewStyle } from 'react-native';
import { C, LIP, MIN_TAP, R } from '@/theme/tokens';

const LIP_WA = 'inset 0 -4px 0 rgba(0,0,0,0.15)'; // the prototype's green buttons use a slightly lighter lip
import { T } from './Text';

type Variant = 'primary' | 'teal' | 'cream' | 'whatsapp' | 'black' | 'outline' | 'ghost' | 'ink' | 'dashed';
const BG: Record<Variant, string> = { primary: C.mari, teal: C.teal, cream: C.cream, whatsapp: C.wa, black: C.black, outline: 'transparent', ghost: 'transparent', ink: C.ink, dashed: 'transparent' };
const FG: Record<Variant, string> = { primary: C.ink, teal: C.ink, cream: C.ink, whatsapp: C.white, black: C.white, outline: C.cream, ghost: C.muted, ink: C.cream, dashed: C.teal };

export interface BtnProps {
  label: string; onPress?: () => void; variant?: Variant; h?: number; size?: number; lip?: boolean; disabled?: boolean;
  radius?: number; px?: number; style?: StyleProp<ViewStyle>; left?: React.ReactNode; color?: string; borderColor?: string; w?: 500 | 600 | 800;
  testID?: string; flex?: boolean;
}
/** Primary button: 56px tall with a bottom "lip"; presses down 2px. Never below the 44px tap minimum. */
export function Btn({ label, onPress, variant = 'primary', h = 56, size, lip, disabled, radius, px = 18, style, left, color, borderColor, w = 800, testID, flex }: BtnProps) {
  const bordered = variant === 'outline' || variant === 'dashed';
  const showLip = lip ?? (h >= 54 && !bordered && variant !== 'ghost');
  return (
    <Pressable
      testID={testID} accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress}
      hitSlop={h < MIN_TAP ? (MIN_TAP - h) / 2 : 0}
      style={({ pressed }) => [{
        height: h, minWidth: MIN_TAP, borderRadius: radius ?? (h >= 54 ? R.card : R.btn), paddingHorizontal: px,
        backgroundColor: BG[variant], alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10,
        borderWidth: bordered ? 1.5 : 0, borderColor: borderColor ?? (variant === 'dashed' ? C.teal : C.line), borderStyle: variant === 'dashed' ? 'dashed' : 'solid',
        opacity: disabled ? 0.5 : 1, transform: [{ translateY: pressed ? 2 : 0 }],
        boxShadow: showLip ? (variant === 'whatsapp' ? LIP_WA : LIP) : undefined, flex: flex ? 1 : undefined,
      } as ViewStyle, style]}
    >
      {left}
      <T w={w} size={size ?? (h >= 54 ? 19 : 16)} color={color ?? FG[variant]} numberOfLines={1}>{label}</T>
    </Pressable>
  );
}

/** Small text-only link button with a guaranteed 44px hit area. */
export function LinkBtn({ label, onPress, color = C.mari, size = 15, underline }: { label: string; onPress?: () => void; color?: string; size?: number; underline?: boolean }) {
  return (
    <Pressable onPress={onPress} hitSlop={14} accessibilityRole="button" accessibilityLabel={label}>
      <T w={800} size={size} color={color} style={underline ? { textDecorationLine: 'underline' } : undefined}>{label}</T>
    </Pressable>
  );
}

export function IconBtn({ label, onPress, size = 40, bg = C.surf, color = C.cream, fontSize = 20, a11y, w = 500, radius }: { label: string; onPress?: () => void; size?: number; bg?: string; color?: string; fontSize?: number; a11y?: string; w?: 500 | 600 | 800; radius?: number }) {
  return (
    <Pressable onPress={onPress} hitSlop={Math.max(0, (MIN_TAP - size) / 2)} accessibilityRole="button" accessibilityLabel={a11y ?? label}
      style={{ width: size, height: size, borderRadius: radius ?? size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <T w={w} size={fontSize} color={color} lh={1.1}>{label}</T>
    </Pressable>
  );
}
export const BackBtn = ({ onPress }: { onPress?: () => void }) => <IconBtn label="←" a11y="Back" onPress={onPress} />;
export const Spacer = ({ h = 12 }: { h?: number }) => <View style={{ height: h }} />;
