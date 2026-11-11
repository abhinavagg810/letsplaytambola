import React from 'react';
import { Platform, Pressable, View } from 'react-native';
import { C, R, TICKET_SHADOW } from '@/theme/tokens';
import { T } from './Text';

const STRIPES = 'repeating-linear-gradient(45deg,#F3DAB2 0 3px,#F8EDD8 3px 6px)';
const CELL = 1 / 1.15; // prototype: aspect-ratio 1/1.15

/** Tiny 3×9 pattern preview. `cells` = 27 booleans (true = part of the pattern). */
export function MiniTicket({ cells, width = 72, on = C.pink, off = C.miniOff }: { cells: boolean[]; width?: number; on?: string; off?: string }) {
  // Prototype sizes: 72px → pad 4 / gap 1.5 / radius 6; 58px and 44px → pad 3 / gap 1 / radius 5.
  const big = width > 60, pad = big ? 4 : 3, gap = big ? 1.5 : 1, cell = (width - pad * 2 - gap * 8) / 9;
  return (
    <View style={{ width, padding: pad, borderRadius: big ? 6 : 5, backgroundColor: C.paper, gap }}>
      {[0, 1, 2].map((r) => (
        <View key={r} style={{ flexDirection: 'row', gap }}>
          {Array.from({ length: 9 }, (_, c) => <View key={c} style={{ width: cell, height: cell, borderRadius: big ? 1.5 : 1, backgroundColor: cells[r * 9 + c] ? on : off }} />)}
        </View>
      ))}
    </View>
  );
}

export interface TicketProps {
  ticket: number[][]; header: string; right?: string;
  dabbed?: Set<number>;            // numbers the owner has dabbed (and that were called)
  hint?: Set<number>;              // called but not yet dabbed → pink ring
  onCell?: (n: number) => void;
}
/** The player's ticket: cream paper, pink header, striped blanks, tilted pink dabs. Only ever rendered for its owner. */
export function TicketView({ ticket, header, right, dabbed, hint, onCell }: TicketProps) {
  return (
    <View style={{ borderRadius: R.btn, backgroundColor: C.paper, overflow: 'hidden', boxShadow: TICKET_SHADOW }}>
      <View style={{ backgroundColor: C.pink, paddingVertical: 6, paddingHorizontal: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <T w={800} size={17} color="#fff" lh={1.6}>{header}</T>
        {!!right && <T mono size={11} color="#fff" ls={0} lh={1.32}>{right}</T>}
      </View>
      <View style={{ padding: 8 }}>
       <View style={{ gap: 2, borderRadius: R.grid, overflow: 'hidden', backgroundColor: C.gridLine }}>
        {ticket.map((row, r) => (
          <View key={r} style={{ flexDirection: 'row', gap: 2 }}>
            {row.map((n, c) => {
              if (!n) return <View key={c} style={{ flex: 1, aspectRatio: CELL, backgroundColor: '#F3DAB2', ...(Platform.OS === 'web' ? { backgroundImage: STRIPES } : { experimental_backgroundImage: STRIPES }) } as any} />;
              const m = dabbed?.has(n), h = !m && hint?.has(n);
              return (
                <Pressable key={c} onPress={onCell ? () => onCell(n) : undefined} disabled={!onCell}
                  accessibilityRole="button" accessibilityLabel={`${n}${m ? ', dabbed' : h ? ', called' : ''}`}
                  style={{ flex: 1, aspectRatio: CELL, backgroundColor: C.paper, alignItems: 'center', justifyContent: 'center' }}>
                  {/* Dab = tilted pink stamp with a white number; called-but-undabbed = inset pink ring (prototype). */}
                  <View style={{ width: '86%', aspectRatio: 1, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: m ? 'rgba(250,74,152,0.92)' : 'transparent', boxShadow: h ? `inset 0 0 0 2.5px ${C.pink}` : undefined, transform: [{ rotate: `${m ? ((n * 37) % 24) - 12 : 0}deg` }] }}>
                    <T w={800} size={17} color={m ? '#fff' : C.ink} lh={1} style={{ paddingTop: 2 }}>{n}</T>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
       </View>
      </View>
    </View>
  );
}
