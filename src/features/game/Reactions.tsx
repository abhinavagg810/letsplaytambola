import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, View } from 'react-native';
import { AVATARS, C, MOTION } from '@/theme/tokens';
import { Chip, T } from '@/ui';
import { REACTS } from '@core/data.ts';
import type { Bubble } from './useGameEvents';

const native = Platform.OS !== 'web';

/** The row of quick reactions under the ticket. */
export function ReactionBar({ onReact }: { onReact: (text: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {REACTS.map((r) => <Chip key={r} label={r} onPress={() => onReact(r)} />)}
    </View>
  );
}

function Floater({ b }: { b: Bubble }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.timing(a, { toValue: 1, duration: MOTION.reactionMs, easing: Easing.out(Easing.quad), useNativeDriver: native });
    anim.start();
    return () => anim.stop();
  }, [a]);
  return (
    <Animated.View style={{
      backgroundColor: AVATARS[b.seq % AVATARS.length], paddingVertical: 4, paddingHorizontal: 14, borderRadius: 999,
      boxShadow: '0 10px 24px -8px rgba(0,0,0,0.6)',
      opacity: a.interpolate({ inputRange: [0, 0.12, 0.8, 1], outputRange: [0, 1, 1, 0] }),
      transform: [
        { translateY: a.interpolate({ inputRange: [0, 0.12, 0.8, 1], outputRange: [20, 0, 0, -60] }) },
        { scale: a.interpolate({ inputRange: [0, 0.12, 0.2, 1], outputRange: [0.6, 1.08, 1, 1] }) },
      ],
    }}>
      <T w={800} size={17} color={C.ink}>{b.who}: {b.text}</T>
    </Animated.View>
  );
}

/** Floating reaction bubbles, bottom-right, on everyone's screen: rise + fade over 4s. */
export function ReactionBubbles({ bubbles }: { bubbles: Bubble[] }) {
  if (!bubbles.length) return null;
  return (
    <View pointerEvents="none" accessibilityLiveRegion="polite" style={{ position: 'absolute', right: 16, bottom: 80, alignItems: 'flex-end', gap: 6, zIndex: 20 }}>
      {bubbles.map((b) => <Floater key={b.seq} b={b} />)}
    </View>
  );
}
