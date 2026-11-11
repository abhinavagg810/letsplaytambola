import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { User } from '@/backend/types';
import { AdSlot } from '@/lib/ads';
import { openWhatsApp } from '@/lib/links';
import { C, R } from '@/theme/tokens';
import { Btn, Screen, T, first } from '@/ui';
import { Back, Face } from './bits';
import { formatINR, roundResults, settleSummary, shareResultsText, unclaimedNote } from '@core/stats.ts';
import type { GameView } from '@core/types';

/**
 * Settle up (README §4.16): who gets what. Money is only recorded here — it changes hands outside the app,
 * so there are deliberately no payment or "mark paid" controls.
 */
export function Settle({ game, user, onDone }: { game: GameView; user: User; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const price = game.price || 0;
  const rows = roundResults(game).results.slice().sort((a, b) => b.w - a.w || b.won.length - a.won.length);
  const note = unclaimedNote(game, formatINR);
  return (
    <Screen px={18} gap={16} top={Math.max(52 - insets.top, 20)} style={{ paddingBottom: 20 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Back onPress={onDone} />
        <T mono size={12} ls={0} color={C.muted}>Settle up</T>
      </View>
      <View style={{ gap: 2 }}>
        <T w={800} size={34} lh={1} accessibilityRole="header">Who gets what</T>
        <T size={15} color={C.muted} lh={1.35}>{settleSummary(game, user.uid, formatINR)}</T>
      </View>
      <View style={{ gap: 8 }}>
        {rows.map((r) => {
          const labels = r.won.map((z) => z.label).join(', ') || 'No prizes';
          return (
            <View key={r.player.uid} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: R.card, backgroundColor: C.surf, opacity: r.w || !price ? 1 : 0.7 }}>
              <Face name={r.player.name} color={r.player.color} size={40} font={17} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <T w={600} size={17} lh={1.15} numberOfLines={1}>{first(r.player.name)}{r.player.uid === user.uid ? ' (you)' : ''}</T>
                <T size={13} lh={1.15} color={!price ? C.muted : r.net >= 0 ? C.teal : C.bogey}>
                  {price ? `${labels} · net ${r.net >= 0 ? '+' : '−'}${formatINR(Math.abs(r.net))}` : labels}
                </T>
              </View>
              <T w={800} size={19} lh={1.6}>{r.w ? formatINR(r.w) : price ? '—' : r.won.length}</T>
            </View>
          );
        })}
        {!rows.length && <T size={15} color={C.muted}>No one played this round.</T>}
      </View>
      {!!note && (
        <View style={{ paddingVertical: 12, paddingHorizontal: 14, borderRadius: R.btn, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.line }}>
          <T size={15} color={C.muted} lh={1.35}>{note}</T>
        </View>
      )}
      {price > 0 && <T size={15} color={C.muted} center lh={1.35}>Settled outside the app — cash or UPI between friends</T>}
      <AdSlot placement="results_footer" />
      <View style={{ marginTop: 'auto', flexDirection: 'row', gap: 8 }}>
        <Btn label="Share results" variant="teal" h={52} size={17} radius={R.card} lip={false} flex onPress={() => openWhatsApp(shareResultsText(game, formatINR))} />
        <Btn label="Done" variant="outline" borderColor={C.cream} h={52} size={17} w={600} radius={R.card} flex onPress={onDone} testID="settle-done" />
      </View>
    </Screen>
  );
}
