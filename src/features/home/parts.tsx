import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import type { GameView } from '@core/types';
import { formatINR, gameNet } from '@core/stats.ts';
import { C } from '@/theme/tokens';
import { Btn, LiveDot, T, first } from '@/ui';
import { OFFLINE_MSG } from './useHomeData';

export const signed = (n: number) => (n >= 0 ? '+' : '−') + formatINR(Math.abs(n));
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** One line of the Games list / "Happening now" (prototype script: rows). */
export function gameRow(g: GameView, uid: string) {
  const host = g.hostUid === uid, dt = new Date(g.createdAt), live = g.status !== 'ended';
  const { net, wonLabels } = gameNet(g, uid);
  return {
    id: g.id, live, name: g.name, day: dt.getDate(),
    mon: ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][dt.getMonth()],
    sub: `${host ? 'Hosted' : first(g.hostName) + '’s game'} · ${plural(g.players.length, 'player', 'players')}${g.round > 1 ? ` · ${g.round} rounds` : ''}`,
    right: live ? (g.status === 'live' ? 'LIVE' : 'Lobby') : g.price ? signed(net) : (wonLabels[0] || '—'),
    rightColor: live ? C.mari : g.price ? (net >= 0 ? C.teal : C.bogey) : C.muted,
  };
}
export type GameRowData = ReturnType<typeof gameRow>;
export const openGame = (id: string) => router.push(`/g/${id}`);

export function LiveGameCard({ row }: { row: GameRowData }) {
  return (
    <Pressable onPress={() => openGame(row.id)} accessibilityRole="button" accessibilityLabel={`Open ${row.name}, ${row.right}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, backgroundColor: C.surf, minHeight: 44 }}>
      <LiveDot />
      <View style={{ flex: 1, minWidth: 0 }}>
        <T w={600} lh={1.15} numberOfLines={1}>{row.name}</T>
        <T size={13} lh={1.15} color={C.muted} numberOfLines={1}>{row.sub}</T>
      </View>
      <T w={800} size={14} lh={1.6} color={C.mari}>Open →</T>
    </Pressable>
  );
}

/** Friendly inline error — never a blank screen. */
export function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <View accessibilityRole="alert" style={{ padding: 16, borderRadius: 18, borderWidth: 1.5, borderColor: C.line, gap: 12, alignItems: 'center' }}>
      <T size={16} color={C.muted} center lh={1.4}>{OFFLINE_MSG}</T>
      <Btn label="Retry" variant="outline" h={46} px={28} onPress={onRetry} />
    </View>
  );
}

/** Pulsing placeholder rows while the first fetch is in flight. */
export function SkeletonRows({ n = 3, h = 74 }: { n?: number; h?: number }) {
  const o = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(o, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(o, { toValue: 0.45, duration: 700, useNativeDriver: true }),
    ]));
    loop.start(); return () => loop.stop();
  }, [o]);
  return (
    <Animated.View accessibilityLabel="Loading" style={{ gap: 12, opacity: o }}>
      {Array.from({ length: n }, (_, i) => <View key={i} style={{ height: h, borderRadius: 18, backgroundColor: C.surf }} />)}
    </Animated.View>
  );
}

export const pullRefresh = (refreshing: boolean, onRefresh: () => void) =>
  <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.mari} colors={[C.mari]} progressBackgroundColor={C.surf} />;

export const SectionTitle = ({ children }: { children: React.ReactNode }) => <T w={800} size={20} lh={1} accessibilityRole="header">{children}</T>;
