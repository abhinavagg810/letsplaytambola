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
    <Screen gap={12} fixedTop={48} refreshControl={pullRefresh(refreshing, refresh)}>
      <T w={800} size={34} lh={1} accessibilityRole="header">Games</T>
      {error && <LoadError onRetry={refresh} />}
      {loading && <SkeletonRows n={4} />}
      {rows?.length === 0 && <Empty>No games yet. Host one or join a friend’s.</Empty>}
      {rows?.map((r) => (
        <Pressable key={r.id} onPress={() => openGame(r.id)} accessibilityRole="button" accessibilityLabel={`${r.name}, ${r.sub}, ${r.right}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18, backgroundColor: C.surf }}>
          <View style={{ width: 46, height: 50, borderRadius: 14, backgroundColor: C.surf2, alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            <T w={800} size={19} lh={1.1}>{r.day}</T>
            <T size={11} color={C.muted} lh={1.1}>{r.mon}</T>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <T w={600} lh={1.15} numberOfLines={1}>{r.name}</T>
            <T size={13} lh={1.15} color={C.muted} numberOfLines={1}>{r.sub}</T>
          </View>
          <T w={800} size={15} lh={1.6} color={r.rightColor} numberOfLines={1} style={{ maxWidth: 140 }}>{r.right}</T>
        </Pressable>
      ))}
      <AdSlot placement="games_list" />
    </Screen>
  );
}
