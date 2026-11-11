import React from 'react';
import { Platform, Pressable, View } from 'react-native';
import { C, R, TICKET_SHADOW } from '@/theme/tokens';
import { T } from './Text';

const STRIPES = 'repeating-linear-gradient(45deg,#F0DCAE 0 3px,#F7EBD0 3px 6px)';

/** Tiny 3×9 pattern preview. `cells` = 27 booleans (true = part of the pattern). */
export function MiniTicket({ cells, width = 72, on = C.pink, off = '#E6DCC8' }: { cells: boolean[]; width?: number; on?: string; off?: string }) {
  const pad = 4, gap = 1.5, cell = (width - pad * 2 - gap * 8) / 9;
  return (
    <View style={{ width, padding: pad, borderRadius: 6, backgroundColor: C.paper, gap }}>
      {[0, 1, 2].map((r) => (
        <View key={r} style={{ flexDirection: 'row', gap }}>
          {Array.from({ length: 9 }, (_, c) => <View key={c} style={{ width: cell, height: cell, borderRadius: 1.5, backgroundColor: cells[r * 9 + c] ? on : off }} />)}
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
    <View style={{ borderRadius: R.card, backgroundColor: C.paper, overflow: 'hidden', boxShadow: TICKET_SHADOW }}>
      <View style={{ backgroundColor: C.pink, paddingVertical: 7, paddingHorizontal: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <T w={800} size={16} color="#fff">{header}</T>
        {!!right && <T mono size={12} color="#fff">{right}</T>}
      </View>
      <View style={{ padding: 8, gap: 4 }}>
        {ticket.map((row, r) => (
          <View key={r} style={{ flexDirection: 'row', gap: 4 }}>
            {row.map((n, c) => {
              if (!n) return <View key={c} style={{ flex: 1, aspectRatio: 0.82, borderRadius: R.grid, backgroundColor: '#EFE0BF', opacity: 0.75, ...(Platform.OS === 'web' ? { backgroundImage: STRIPES } : { experimental_backgroundImage: STRIPES }) } as any} />;
              const m = dabbed?.has(n), h = !m && hint?.has(n);
              return (
                <Pressable key={c} onPress={onCell ? () => onCell(n) : undefined} disabled={!onCell}
                  accessibilityRole="button" accessibilityLabel={`${n}${m ? ', dabbed' : h ? ', called' : ''}`}
                  style={{ flex: 1, aspectRatio: 0.82, minHeight: 44, borderRadius: R.grid, backgroundColor: '#FFF9EA', alignItems: 'center', justifyContent: 'center', borderWidth: h ? 2.5 : 1, borderColor: h ? C.pink : '#E9DCC0' }}>
                  {m && <View style={{ position: 'absolute', width: '88%', aspectRatio: 1, borderRadius: 999, backgroundColor: 'rgba(250,74,152,0.92)', transform: [{ rotate: `${((n * 37) % 24) - 12}deg` }, { scaleX: 1.04 }] }} />}
                  <T w={800} size={20} color={m ? '#fff' : C.ink} lh={1.15} style={{ paddingTop: 2, transform: [{ rotate: m ? `${((n * 37) % 24) - 12}deg` : '0deg' }] }}>{n}</T>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}
