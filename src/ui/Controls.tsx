import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, TextInput, TextInputProps, View, ViewStyle, StyleProp } from 'react-native';
import { C, F, MIN_TAP, R } from '@/theme/tokens';
import { T } from './Text';
import { IconBtn } from './Btn';

export function Toggle({ on, onChange, label, small }: { on: boolean; onChange?: (v: boolean) => void; label?: string; small?: boolean }) {
  const w = small ? 48 : 52, h = small ? 28 : 30, k = small ? 22 : 24;
  const x = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => { Animated.timing(x, { toValue: on ? 1 : 0, duration: 200, useNativeDriver: true }).start(); }, [on, x]);
  return (
    <Pressable onPress={() => onChange?.(!on)} hitSlop={(MIN_TAP - h) / 2} accessibilityRole="switch" accessibilityState={{ checked: on }} accessibilityLabel={label}
      style={{ width: w, height: h, borderRadius: 999, backgroundColor: on ? C.pink : C.line }}>
      <Animated.View style={{ position: 'absolute', top: 3, left: 3, width: k, height: k, borderRadius: k / 2, backgroundColor: '#fff', transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [0, w - k - 6] }) }] }} />
    </Pressable>
  );
}

export function Stepper({ value, onDec, onInc, label }: { value: number | string; onDec: () => void; onInc: () => void; label?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <IconBtn label="−" a11y={`Fewer ${label ?? ''}`} onPress={onDec} size={38} bg={C.surf2} />
      <T w={800} size={22} style={{ minWidth: 28, textAlign: 'center' }}>{value}</T>
      <IconBtn label="+" a11y={`More ${label ?? ''}`} onPress={onInc} size={38} bg={C.surf2} />
    </View>
  );
}

export interface InputProps extends TextInputProps { h?: number; size?: number; bold?: boolean; bg?: string; border?: string; radius?: number; color?: string; box?: StyleProp<ViewStyle> }
export function Input({ h = 50, size = 17, bold, bg = 'transparent', border = C.line, radius = R.btn, color = C.cream, box, style, ...rest }: InputProps) {
  return (
    <TextInput placeholderTextColor={C.dim} {...rest}
      style={[{ height: h, borderRadius: radius, borderWidth: border === 'none' ? 0 : 1.5, borderColor: border === 'none' ? 'transparent' : border, backgroundColor: bg, paddingHorizontal: 16, fontSize: size, color, fontFamily: bold ? F.bold : F.medium, outlineStyle: 'none' } as any, box, style]} />
  );
}

export function Chip({ label, onPress, bg = 'transparent', fg = C.cream, border = C.line, size = 15, maxWidth }: { label: string; onPress?: () => void; bg?: string; fg?: string; border?: string; size?: number; maxWidth?: number }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} hitSlop={6} accessibilityRole={onPress ? 'button' : 'text'} accessibilityLabel={label}
      style={{ minHeight: 36, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: border, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', maxWidth }}>
      <T w={800} size={size} color={fg} numberOfLines={1}>{label}</T>
    </Pressable>
  );
}

export function Card({ children, style, pad = 14, radius = R.cardLg, bg = C.surf }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; pad?: number; radius?: number; bg?: string }) {
  return <View style={[{ backgroundColor: bg, borderRadius: radius, padding: pad, gap: 12 }, style]}>{children}</View>;
}

/** A tappable row inside a Card list. */
export function Row({ children, onPress, top, style }: { children: React.ReactNode; onPress?: () => void; top?: boolean; style?: StyleProp<ViewStyle> }) {
  const s: StyleProp<ViewStyle> = [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16, minHeight: MIN_TAP, borderTopWidth: top ? 1 : 0, borderTopColor: C.surf2 }, style];
  return onPress ? <Pressable onPress={onPress} accessibilityRole="button" style={s}>{children}</Pressable> : <View style={s}>{children}</View>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ padding: 22, borderRadius: 20, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.line }}>
      <T size={16} color={C.muted} center lh={1.4}>{children}</T>
    </View>
  );
}

export function LiveDot({ color = C.mari, size = 10 }: { color?: string; size?: number }) {
  const o = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(o, { toValue: 0.4, duration: 600, useNativeDriver: true }),
      Animated.timing(o, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]));
    loop.start(); return () => loop.stop();
  }, [o]);
  return <Animated.View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity: o }} />;
}

/** Fade + scale in (README motion: "Card in"). */
export function CardIn({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(a, { toValue: 1, duration: 380, useNativeDriver: true }).start(); }, [a]);
  return <Animated.View style={[{ opacity: a, transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] }, style]}>{children}</Animated.View>;
}
