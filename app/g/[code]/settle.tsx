import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { C } from '@/theme/tokens';
import { needsUsername, useUser } from '@/state/session';
import { useGame } from '@/features/game/useGame';
import { Settle } from '@/features/game/Settle';

/** Settle up for the round that just ended. Anything else (signed out, round restarted, bad code) goes back to the game link. */
export default function SettleRoute() {
  const code = String(useLocalSearchParams<{ code: string }>().code || '').toUpperCase();
  const user = useUser();
  const game = useGame(code, user?.uid ?? null);
  if (!user || needsUsername(user)) return <Redirect href={`/g/${code}`} />;
  if (game === undefined) return <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={C.mari} size="large" /></View>;
  if (game === null || game.status !== 'ended') return <Redirect href={`/g/${code}`} />;
  const done = () => (router.canGoBack() ? router.back() : router.replace(`/g/${code}`));
  return <Settle game={game} user={user} onDone={done} />;
}
