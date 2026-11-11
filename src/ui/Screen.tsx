import React from 'react';
import { ScrollView, View, ViewStyle, StyleProp } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, CONTENT_MAX } from '@/theme/tokens';

/**
 * Standard scrolling screen: plum canvas, centred column (max 560; play uses 1100), 20px side padding.
 * `footer` is pinned to the bottom (sticky CTA).
 */
export function Screen({ children, footer, max = CONTENT_MAX, px = 20, gap = 18, top = 20, scroll = true, style, glow }: {
  children: React.ReactNode; footer?: React.ReactNode; max?: number; px?: number; gap?: number; top?: number; scroll?: boolean; style?: StyleProp<ViewStyle>; glow?: string;
}) {
  const insets = useSafeAreaInsets();
  const inner: StyleProp<ViewStyle> = [{ width: '100%', maxWidth: max, alignSelf: 'center', paddingHorizontal: px, paddingTop: insets.top + top, paddingBottom: 24, gap, flexGrow: 1 }, style];
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {!!glow && <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 420, experimental_backgroundImage: glow } as any} />}
      {scroll
        ? <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={inner}>{children}</ScrollView>
        : <View style={[inner, { flex: 1 }]}>{children}</View>}
      {!!footer && (
        <View style={{ width: '100%', maxWidth: max, alignSelf: 'center', paddingHorizontal: px, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 16) + 4, backgroundColor: C.bg }}>{footer}</View>
      )}
    </View>
  );
}
