import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, View } from 'react-native';
import { C, MOTION } from '@/theme/tokens';
import { T } from '@/ui';

const native = Platform.OS !== 'web';

/**
 * The caller's ball (README §7 Motion). While `rolling` it wobbles ±8° on a 0.22s loop showing random numbers;
 * when the real number lands it pops: 0.65s cubic-bezier(.2,1.4,.4,1), scale .3→1.1→1, rotate −120°→8°→0.
 */
export function Ball({ n, rolling }: { n: number | null; rolling: boolean }) {
  const wob = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (rolling) {
      pop.setValue(1);
      wob.setValue(0);
      const loop = Animated.loop(Animated.timing(wob, { toValue: 1, duration: MOTION.wobbleMs, easing: Easing.linear, useNativeDriver: native }));
      loop.start();
      return () => { loop.stop(); wob.setValue(0.25); };
    }
    wob.setValue(0.25);
    if (n) {
      pop.setValue(0);
      Animated.timing(pop, { toValue: 1, duration: MOTION.popMs, easing: Easing.bezier(0.2, 1.4, 0.4, 1), useNativeDriver: native }).start();
    }
  }, [rolling, n, wob, pop]);

  const transform = rolling
    ? [
        { rotate: wob.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: ['-8deg', '0deg', '8deg', '0deg', '-8deg'] }) },
        { scale: wob.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.96, 1.02, 0.96] }) },
      ]
    : [
        { scale: pop.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.3, 1.1, 1] }) },
        { rotate: pop.interpolate({ inputRange: [0, 0.7, 1], outputRange: ['-120deg', '8deg', '0deg'] }) },
      ];
  const opacity = rolling ? 1 : pop.interpolate({ inputRange: [0, 0.7], outputRange: [0, 1], extrapolate: 'clamp' });
  const has = !!n;
  return (
    <Animated.View
      accessibilityRole="text" accessibilityLabel={rolling ? 'Shaking the bag' : has ? `Number ${n}` : 'No number yet'}
      style={{
        width: 104, height: 104, borderRadius: 52, flexShrink: 0, alignItems: 'center', justifyContent: 'center',
        backgroundColor: has ? C.pink : C.surf2, opacity, transform,
        boxShadow: has ? `0 0 0 4px ${C.mari}, 0 0 40px rgba(250,74,152,0.6)` : `inset 0 0 0 2px ${C.line}`,
      }}>
      <View style={{ width: 68, height: 68, borderRadius: 34, backgroundColor: has ? C.cream : C.surf, alignItems: 'center', justifyContent: 'center' }}>
        <T w={800} size={38} color={has ? C.ink : C.muted} lh={1} style={{ paddingTop: 5 }}>{has ? String(n) : '?'}</T>
      </View>
    </Animated.View>
  );
}

/** Marquee bulb strip along the top of the caller card; blinks while the bag is shaking. */
export function Bulbs({ blink }: { blink: boolean }) {
  const o = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!blink) { o.setValue(1); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(o, { toValue: 0.4, duration: 150, useNativeDriver: native }),
      Animated.timing(o, { toValue: 1, duration: 150, useNativeDriver: native }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [blink, o]);
  return (
    <Animated.View pointerEvents="none" style={{ height: 10, flexDirection: 'row', overflow: 'hidden', opacity: o }}>
      {Array.from({ length: 72 }, (_, i) => (
        <View key={i} style={{ width: 16, height: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: C.mari }} />
        </View>
      ))}
    </Animated.View>
  );
}
