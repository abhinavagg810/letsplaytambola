import React, { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { C } from '@/theme/tokens';
import { Empty, Screen, T } from '@/ui';
import { AdSlot } from '@/lib/ads';
import { useUser } from '@/state/session';
import { useHomeData } from './useHomeData';
import { LoadError, SkeletonRows, gameRow, openGame, pullRefresh } from './parts';

export function Games() {
  const user = useUser();
  const { games, error, loading, refresh, refreshing } = useHomeData(5000);
  const rows = useMemo(() => (user && games ? games.map((g) => gameRow(g, user.uid)) : null), [games, user]);
  if (!user) return null;
  return (
    <Screen gap={12} refreshControl={pullRefresh(refreshing, refresh)}>
      <T w={800} size={34} lh={1.1} accessibilityRole="header">Games</T>
      {error && <LoadError onRetry={refresh} />}
      {loading && <SkeletonRows n={4} />}
      {rows?.length === 0 && <Empty>No games yet. Host one or join a friend’s.</Empty>}
      {rows?.map((r) => (
        <Pressable key={r.id} onPress={() => openGame(r.id)} accessibilityRole="button" accessibilityLabel={`${r.name}, ${r.sub}, ${r.right}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18, backgroundColor: C.surf }}>
          <View style={{ width: 46, height: 50, borderRadius: 14, backgroundColor: C.surf2, alignItems: 'center', justifyContent: 'center' }}>
            <T w={800} size={19} lh={1.15}>{r.day}</T>
            <T mono size={12} color={C.muted} ls={0.4} lh={1.15}>{r.mon}</T>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <T w={600} numberOfLines={1}>{r.name}</T>
            <T size={15} color={C.muted} numberOfLines={1}>{r.sub}</T>
          </View>
          <T w={800} size={15} color={r.rightColor} numberOfLines={1} style={{ maxWidth: 120 }}>{r.right}</T>
        </Pressable>
      ))}
      <AdSlot placement="games_list" />
    </Screen>
  );
}
