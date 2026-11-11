import React from 'react';
import { View } from 'react-native';
import { C } from '@/theme/tokens';
import { T } from './Text';

/**
 * Brand logo, drawn from shapes + Baloo 2 (README §8, prototype/Logo.dc.html) so it stays sharp at any size.
 * `size` is the wordmark font size. tone: light = cream letters (on dark), dark = ink letters.
 */
export function Logo({ size = 64, tone = 'light', markOnly }: { size?: number; tone?: 'light' | 'dark'; markOnly?: boolean }) {
  const em = size;
  if (markOnly) {
    return (
      <View style={{ width: em, height: em, borderRadius: em / 2, backgroundColor: C.pink, alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 0 ${em * 0.08}px ${C.mari}`, transform: [{ rotate: '-10deg' }] }}>
        <View style={{ width: em * 0.61, height: em * 0.61, borderRadius: em, backgroundColor: C.cream, alignItems: 'center', justifyContent: 'center' }}>
          <T w={800} size={em * 0.38} color={C.ink} lh={1.1} style={{ paddingTop: em * 0.04 }}>90</T>
        </View>
      </View>
    );
  }
  const ink = tone === 'dark' ? C.ink : C.cream;
  const shadow = tone === 'dark' ? 'rgba(255,184,49,0.6)' : 'rgba(250,74,152,0.55)';
  const pill = em * 0.36;
  const word = { textShadowColor: shadow, textShadowOffset: { width: 0, height: em * 0.05 }, textShadowRadius: 0, letterSpacing: -em * 0.01 } as const;
  return (
    <View accessibilityRole="image" accessibilityLabel="Let’s play Tambola" style={{ alignItems: 'flex-start' }}>
      <View style={{ zIndex: 2, marginLeft: pill * 0.08, marginBottom: -pill * 0.14, paddingHorizontal: pill * 0.42, paddingTop: pill * 0.1, paddingBottom: pill * 0.02, borderRadius: 999, backgroundColor: C.pink, transform: [{ rotate: '-5deg' }], boxShadow: `0 ${pill * 0.09}px 0 ${C.pinkShadow}` }}>
        <T w={800} size={pill} color="#fff" lh={1} ls={pill * 0.01} style={{ lineHeight: pill }}>Let’s play</T>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <T w={800} size={em} color={ink} lh={1} style={word}>TAMB</T>
        <View style={{ width: em * 0.74, height: em * 0.74, marginHorizontal: em * 0.02, borderRadius: em, backgroundColor: C.mari, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-12deg' }, { translateY: -em * 0.02 }], boxShadow: `0 ${em * 0.05}px 0 ${C.mariShadow}, inset 0 ${-em * 0.05}px 0 rgba(0,0,0,0.12)` }}>
          <View style={{ width: em * 0.48, height: em * 0.48, borderRadius: em, backgroundColor: C.cream, alignItems: 'center', justifyContent: 'center', paddingTop: em * 0.036 }}>
            <T w={800} size={em * 0.3} color={C.ink} lh={1} style={{ lineHeight: em * 0.3 }}>90</T>
          </View>
        </View>
        <T w={800} size={em} color={ink} lh={1} style={word}>LA</T>
      </View>
    </View>
  );
}
