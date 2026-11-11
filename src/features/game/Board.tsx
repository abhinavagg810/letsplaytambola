import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { C, R } from '@/theme/tokens';
import { T } from '@/ui';
import { GAME, Mono } from './bits';

const ROWS = Array.from({ length: 9 }, (_, r) => Array.from({ length: 10 }, (_, c) => r * 10 + c + 1));

/** Board 1–90, 10 columns. Called = marigold, latest = pink with a cream ring. Collapsible (open by default for the host). */
export function Board({ called, last, defaultOpen }: { called: number[]; last: number | null; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const set = new Set(called);
  return (
    <View style={{ backgroundColor: C.surf, borderRadius: R.cardLg, padding: 12, gap: 8 }}>
      <Pressable onPress={() => setOpen((o) => !o)} hitSlop={14} accessibilityRole="button" accessibilityState={{ expanded: open }}
        accessibilityLabel={`Board, ${called.length} of 90 called. ${open ? 'Hide' : 'Show'}`}
        style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <T w={800} size={17} lh={1}>Board</T>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Mono lh={1.3}>{called.length} / 90 called</Mono>
          {/* "HIDE ▴" / "SHOW ▾": the mono font has no arrow glyphs, so the arrow is drawn. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Mono lh={1.3} color={C.mari}>{open ? 'Hide' : 'Show'}</Mono>
            <View style={{ width: 0, height: 0, borderLeftWidth: 3.5, borderRightWidth: 3.5, borderLeftColor: 'transparent', borderRightColor: 'transparent', ...(open ? { borderBottomWidth: 5, borderBottomColor: C.mari } : { borderTopWidth: 5, borderTopColor: C.mari }) }} />
          </View>
        </View>
      </Pressable>
      {open && (
        <View style={{ gap: 4 }}>
          {ROWS.map((row) => (
            <View key={row[0]} style={{ flexDirection: 'row', gap: 4 }}>
              {row.map((n) => {
                const l = n === last, c = set.has(n);
                return (
                  <View key={n} accessibilityLabel={`${n}${c ? ', called' : ''}`}
                    style={{
                      flex: 1, aspectRatio: 1, borderRadius: 999, alignItems: 'center', justifyContent: 'center',
                      backgroundColor: l ? C.pink : c ? C.mari : 'transparent',
                      boxShadow: l ? `0 0 0 2px ${C.cream}` : c ? undefined : `inset 0 0 0 1px ${C.line}`,
                    }}>
                    <T w={800} size={13} lh={1} color={l ? C.white : c ? C.ink : GAME.boardDim} style={{ paddingTop: 1 }}>{n}</T>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
