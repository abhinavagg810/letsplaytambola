import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, View, useWindowDimensions } from 'react-native';
import { AVATARS, MOTION } from '@/theme/tokens';

interface Piece { l: number; d: number; t: number; c: string; w: number; r: boolean }
const native = Platform.OS !== 'web';

function Falling({ p, h }: { p: Piece; h: number }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.timing(a, { toValue: 1, duration: p.t * 1000, delay: p.d * 1000, easing: Easing.bezier(0.3, 0.1, 0.7, 1), useNativeDriver: native });
    anim.start();
    return () => anim.stop();
  }, [a, p]);
  return (
    <Animated.View style={{
      position: 'absolute', top: -20, left: `${p.l}%`, width: p.w, height: p.r ? p.w : p.w * 1.8, borderRadius: p.r ? p.w / 2 : 2, backgroundColor: p.c,
      transform: [
        { translateY: a.interpolate({ inputRange: [0, 1], outputRange: [-20, h + 60] }) },
        { rotate: a.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '720deg'] }) },
      ],
    }} />
  );
}

/**
 * Full-screen confetti (README Motion: 60–70 pieces, 2–3.5s fall, 720° spin, avatar colours).
 * Runs once each time `at` changes to a new non-zero value; never blocks touches.
 */
export function Confetti({ at }: { at: number }) {
  const { height } = useWindowDimensions();
  const [live, setLive] = useState(0);
  useEffect(() => {
    if (!at) return;
    setLive(at);
    const t = setTimeout(() => setLive((v) => (v === at ? 0 : v)), 4400);
    return () => clearTimeout(t);
  }, [at]);
  const pieces = useMemo<Piece[]>(() => (live
    ? Array.from({ length: MOTION.confettiPieces }, (_, i) => ({ l: Math.random() * 100, d: Math.random() * 0.7, t: 2 + Math.random() * 1.5, c: AVATARS[i % AVATARS.length], w: 6 + Math.random() * 6, r: Math.random() > 0.5 }))
    : []), [live]);
  if (!live) return null;
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', zIndex: 40 }}>
      {pieces.map((p, i) => <Falling key={`${live}-${i}`} p={p} h={height} />)}
    </View>
  );
}
