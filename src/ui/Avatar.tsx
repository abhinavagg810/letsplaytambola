import React from 'react';
import { View } from 'react-native';
import { DELETED_NAME } from '@core/data.ts';
import { C } from '@/theme/tokens';
import { T } from './Text';

export const initial = (n?: string | null) => (n || '?').trim().slice(0, 1).toUpperCase() || '?';
/** First name. A deleted account's placeholder name is kept whole (“Deleted player”, not “Deleted”). */
export const first = (n?: string | null) => (n === DELETED_NAME ? n : (n || '').trim().split(' ')[0] || '');

/** Initial sizes the prototype uses for each avatar diameter (others ≈ 44%). */
const LETTER: Record<number, number> = { 96: 42, 72: 32, 50: 22, 46: 20, 44: 18, 40: 17, 38: 16, 36: 16, 32: 14 };

export function Avatar({ name, color, size = 44, ring, fontSize }: { name?: string | null; color: string; size?: number; ring?: string; fontSize?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center', paddingTop: size >= 90 ? 5 : size >= 60 ? 4 : 2, boxShadow: ring ? `0 0 0 ${size >= 90 ? 4 : 2}px ${ring}` : undefined }}>
      <T w={800} size={fontSize ?? LETTER[size] ?? Math.round(size * 0.44)} color={C.ink} lh={1}>{initial(name)}</T>
    </View>
  );
}

/** Overlapping stack of faces (groups, invitees). */
export function Faces({ people, size = 32, max = 4, ring = C.surf, fontSize, overlap = 8 }: { people: { name: string; color: string }[]; size?: number; max?: number; ring?: string; fontSize?: number; overlap?: number }) {
  return (
    <View style={{ flexDirection: 'row', paddingLeft: overlap }}>
      {people.slice(0, max).map((p, i) => (
        <View key={i} style={{ marginLeft: -overlap }}><Avatar name={p.name} color={p.color} size={size} ring={ring} fontSize={fontSize} /></View>
      ))}
    </View>
  );
}
