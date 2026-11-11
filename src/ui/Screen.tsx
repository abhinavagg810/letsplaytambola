import React, { useRef } from 'react';
import { Platform, ScrollView, View, ViewStyle, StyleProp } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, CONTENT_MAX } from '@/theme/tokens';
import { useKeyboardOverlap } from './useKeyboard';

const FADE_H = 24;
const FADE = `linear-gradient(rgba(27,15,52,0), ${C.bg})`;

/**
 * Standard scrolling screen: plum canvas, centred column (max 560; play uses 1100), 20px side padding.
 * `footer` is pinned to the bottom (sticky CTA).
 */
export function Screen({ children, footer, max = CONTENT_MAX, px = 20, gap = 18, top = 20, fixedTop, bottom = 24, footerBottom = 20, footerTop = 10, footerFade, scroll = true, style, glow, glowHeight = 420, refreshControl }: {
  children: React.ReactNode; footer?: React.ReactNode; max?: number; px?: number; gap?: number; top?: number; scroll?: boolean;
  /** Prototype top padding (48 on tabs, 64 on sign-in): used as-is unless the status bar needs more. Overrides `top`. */
  fixedTop?: number; bottom?: number; footerBottom?: number; footerTop?: number; footerFade?: boolean; style?: StyleProp<ViewStyle>; glow?: string; glowHeight?: number | `${number}%`; refreshControl?: React.ReactElement<any>;
}) {
  const insets = useSafeAreaInsets();
  const root = useRef<React.ComponentRef<typeof View>>(null);
  const kb = useKeyboardOverlap(root); // shrink above the keyboard so the focused input and the footer button stay visible
  const inner: StyleProp<ViewStyle> = [{ width: '100%', maxWidth: max, alignSelf: 'center', paddingHorizontal: px, paddingTop: fixedTop != null ? Math.max(fixedTop, insets.top + 16) : insets.top + top, paddingBottom: bottom, gap, flexGrow: 1 }, style];
  return (
    <View ref={root} style={{ flex: 1, backgroundColor: C.bg, paddingBottom: kb }}>
      {!!glow && <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: glowHeight, experimental_backgroundImage: glow, ...(Platform.OS === 'web' ? { backgroundImage: glow } : null) } as any} />}
      {scroll
        ? <ScrollView automaticallyAdjustKeyboardInsets={false} keyboardDismissMode="interactive" refreshControl={refreshControl as any} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={inner}>{children}</ScrollView>
        : <View style={[inner, { flex: 1 }]}>{children}</View>}
      {!!footer && (
        <View style={{ width: '100%', maxWidth: max, alignSelf: 'center', paddingHorizontal: px, paddingTop: footerTop, paddingBottom: kb ? 12 : Math.max(insets.bottom + 4, footerBottom), backgroundColor: C.bg }}>
          {footerFade && <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: -FADE_H, height: FADE_H, experimental_backgroundImage: FADE, ...(Platform.OS === 'web' ? { backgroundImage: FADE } : null) } as any} />}
          {footer}
        </View>
      )}
    </View>
  );
}
