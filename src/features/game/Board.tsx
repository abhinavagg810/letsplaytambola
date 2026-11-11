import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { C, R } from '@/theme/tokens';
import { Eyebrow, T } from '@/ui';

const ROWS = Array.from({ length: 9 }, (_, r) => Array.from({ length: 10 }, (_, c) => r * 10 + c + 1));

/** Board 1–90, 10 columns. Called = marigold, latest = pink with a cream ring. Collapsible (open by default for the host). */
export function Board({ called, last, defaultOpen }: { called: number[]; last: number | null; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const set = new Set(called);
  return (
    <View style={{ backgroundColor: C.surf, borderRadius: R.cardLg, padding: 12, gap: 8 }}>
      <Pressable onPress={() => setOpen((o) => !o)} hitSlop={12} accessibilityRole="button" accessibilityState={{ expanded: open }}
        accessibilityLabel={`Board, ${called.length} of 90 called. ${open ? 'Hide' : 'Show'}`}
        style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 24 }}>
        <T w={800} size={17}>Board</T>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Eyebrow>{called.length} / 90 called</Eyebrow>
          <Eyebrow color={C.mari}>{open ? 'Hide ▴' : 'Show ▾'}</Eyebrow>
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
                    <T w={800} size={15} lh={1.1} color={l ? C.white : c ? C.ink : C.dim} style={{ paddingTop: 1 }}>{n}</T>
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
