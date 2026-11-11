import React from 'react';
import { View } from 'react-native';
import { C, MIN_TEXT } from '@/theme/tokens';
import { T } from './Text';

export const initial = (n?: string | null) => (n || '?').trim().slice(0, 1).toUpperCase() || '?';
export const first = (n?: string | null) => (n || '').trim().split(' ')[0] || '';

export function Avatar({ name, color, size = 44, ring }: { name?: string | null; color: string; size?: number; ring?: string }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center', boxShadow: ring ? `0 0 0 ${size >= 90 ? 4 : 2}px ${ring}` : undefined }}>
      <T w={800} size={Math.max(size >= 26 ? MIN_TEXT : 0, Math.round(size * 0.43))} color={C.ink} lh={1.15} style={{ paddingTop: size * 0.04 }}>{initial(name)}</T>
    </View>
  );
}

/** Overlapping stack of faces (groups, invitees). */
export function Faces({ people, size = 32, max = 4, ring = C.surf }: { people: { name: string; color: string }[]; size?: number; max?: number; ring?: string }) {
  return (
    <View style={{ flexDirection: 'row', paddingLeft: 8 }}>
      {people.slice(0, max).map((p, i) => (
        <View key={i} style={{ marginLeft: -8 }}><Avatar name={p.name} color={p.color} size={size} ring={ring} /></View>
      ))}
    </View>
  );
}
