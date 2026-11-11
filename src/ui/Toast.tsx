import React, { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, MOTION } from '@/theme/tokens';
import { createStore } from '@/lib/store';
import { T } from './Text';

const store = createStore({ msg: '', at: 0 });
let timer: ReturnType<typeof setTimeout> | undefined;
/** Show a short message at the bottom of the screen (2.4s). */
export function toast(msg: string) {
  clearTimeout(timer);
  store.set({ msg, at: Date.now() });
  timer = setTimeout(() => store.set({ msg: '' }), MOTION.toastMs);
}

export function ToastHost() {
  const { msg, at } = store.use();
  const insets = useSafeAreaInsets();
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => { if (msg) { a.setValue(0); Animated.timing(a, { toValue: 1, duration: 220, useNativeDriver: true }).start(); } }, [msg, at, a]);
  if (!msg) return null;
  // Short messages keep the one-line pill; a longer one (an instruction the person must read to the end) wraps instead of being cut off.
  const long = msg.length > 40;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 28, alignItems: 'center', zIndex: 100 }}>
      <Animated.View accessibilityLiveRegion="polite" style={{ opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }], maxWidth: '90%', backgroundColor: C.cream, borderRadius: long ? 24 : 999, paddingVertical: 10, paddingHorizontal: 18, boxShadow: '0 12px 30px -10px rgba(0,0,0,0.6)' }}>
        <T w={800} size={16} lh={1.6} color={C.ink} center numberOfLines={long ? 3 : 1}>{msg}</T>
      </Animated.View>
    </View>
  );
}
