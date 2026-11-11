import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { backend } from '@/backend';
import { C } from '@/theme/tokens';
import { Btn, Screen, T, toast } from '@/ui';
import { needsUsername, setPendingCode, useUser } from '@/state/session';
import { useGame } from '@/features/game/useGame';
import { InviteLanding } from '@/features/auth/InviteLanding';
import { Lobby } from '@/features/game/Lobby';
import { Play } from '@/features/game/Play';
import { Results } from '@/features/game/Results';

/**
 * One URL per game — the link people share on WhatsApp.
 * Signed out → invite landing. Signed in → auto-join (ticket dealt, no extra confirmation) → lobby / play / results by status.
 */
export default function GameRoute() {
  const code = String(useLocalSearchParams<{ code: string }>().code || '').toUpperCase();
  const user = useUser();
  const game = useGame(code, user?.uid ?? null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const joining = useRef(false);

  // Signed out (or still picking a username): remember the link so sign-in comes back here, even after a reload.
  // Once the person is in, the link has done its job.
  useEffect(() => { setPendingCode(user && !needsUsername(user) ? null : code); }, [code, user]);

  const member = !!game && !!user && (game.hostUid === user.uid || game.players.some((p) => p.uid === user.uid));
  useEffect(() => {
    if (!game || !user || member || needsUsername(user) || game.status === 'ended' || joining.current) return;
    joining.current = true;
    backend.act(code, { type: 'join' }).then((r) => {
      joining.current = false;
      if (r.ok) toast('You’re in — ticket dealt!'); else setJoinError(r.error);
    });
  }, [game, user, member, code]);

  if (!user) return <InviteLanding code={code} />;
  if (needsUsername(user)) return <Redirect href="/username" />;
  if (game === undefined) return <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={C.mari} size="large" /></View>;
  if (game === null || joinError) {
    return (
      <Screen style={{ justifyContent: 'center', alignItems: 'center' }}>
        <T w={800} size={34} center>{joinError ?? `Game ${code} isn’t here`}</T>
        <T color={C.muted} center lh={1.4}>{joinError ? 'Ask the host to add a seat, then tap the link again.' : 'Check the code with your host — it has 5 letters and numbers.'}</T>
        <Btn label="Go home" h={50} onPress={() => router.replace('/')} />
      </Screen>
    );
  }
  if (game.status === 'ended') return <Results game={game} user={user} />;
  if (!member) return <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={C.mari} size="large" /></View>;
  return game.status === 'lobby' ? <Lobby game={game} user={user} /> : <Play game={game} user={user} />;
}
