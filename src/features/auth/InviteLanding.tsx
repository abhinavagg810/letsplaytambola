import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { formatINR } from '@core/stats.ts';
import { backend } from '@/backend';
import type { PeekGame } from '@/backend/types';
import { C } from '@/theme/tokens';
import { Avatar, Btn, Input, Screen, T, first, toast } from '@/ui';
import { refreshUser } from '@/state/session';
import { openUrl, storeLinks } from '@/lib/links';
import { GoogleDot, PhoneSheet } from './SignIn';

const OFFLINE = 'Can’t reach Tambola right now — check your internet';

/**
 * What a signed-out visitor of /g/CODE sees. Signing in (phone, Google or just a name) is all it takes:
 * the route re-renders with a user and joins the game by itself.
 */
export function InviteLanding({ code }: { code: string }) {
  const [peek, setPeek] = useState<PeekGame | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [name, setName] = useState('');
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    let live = true;
    setFailed(false); setPeek(undefined);
    backend.peekGame(code).then((p) => { if (live) setPeek(p); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [code]);
  useEffect(load, [load]);

  const guest = () => (name.trim() ? run(() => backend.signInGuest(name.trim())) : toast('Tell us your name first'));
  const run = async (fn: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
    if (busy) return;
    setBusy(true);
    try { const r = await fn(); if (r.ok) await refreshUser(); else toast(r.error); } catch { toast(OFFLINE); }
    setBusy(false);
  };

  if (failed) {
    return (
      <Screen style={{ justifyContent: 'center', alignItems: 'center' }}>
        <T w={800} size={28} center>{OFFLINE}</T>
        <Btn label="Retry" h={50} onPress={load} />
      </Screen>
    );
  }
  if (peek === undefined) return <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={C.mari} size="large" /></View>;
  if (peek === null) {
    return (
      <Screen style={{ justifyContent: 'center', alignItems: 'center' }}>
        <T w={800} size={34} center>Game {code} isn’t here</T>
        <T color={C.muted} center lh={1.4}>Check the code with your host — it has 5 letters and numbers.</T>
        <Btn label="Go home" h={50} onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  const ended = peek.status === 'ended';
  const chips = ended
    ? ['Game over', ...(peek.price ? [`${formatINR(peek.price)} ticket`] : ['Just for fun'])]
    : [
      peek.price ? `${formatINR(peek.price)} ticket` : 'Just for fun',
      peek.seatsLeft > 0 ? `${peek.seatsLeft} ${peek.seatsLeft === 1 ? 'seat' : 'seats'} left` : 'Game is full',
      ...(peek.fullHouseAmt ? [`Full House ${formatINR(peek.fullHouseAmt)}`] : []),
    ];
  const verb = ended ? 'See results' : 'Join';

  return (
    <Screen px={22} fixedTop={56} max={520} gap={16}>
      <View style={{ flex: 1, justifyContent: 'center', gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Avatar name={peek.hostName} color={peek.hostColor} size={50} />
          <T size={17} color={C.muted} style={{ flex: 1 }}>{ended ? `${first(peek.hostName)}’s game has ended` : `${first(peek.hostName)} invited you`}</T>
        </View>
        <T w={800} size={50} lh={0.95} accessibilityRole="header">{peek.name}</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {chips.map((c) => (
            <View key={c} style={{ paddingVertical: 4, paddingHorizontal: 12, borderRadius: 999, backgroundColor: C.surf }}><T size={15} lh={1.6}>{c}</T></View>
          ))}
        </View>
        {peek.price > 0 && <T size={15} color={C.muted}>Settled outside the app</T>}
      </View>
      <View style={{ gap: 10 }}>
        <Btn label={`${verb} with phone number`} h={56} disabled={busy} onPress={() => setSheet(true)} testID="join-phone" />
        <Btn label={`${verb} with Google`} variant="cream" h={54} size={18} radius={16} lip={false} disabled={busy} left={<GoogleDot />} onPress={() => run(() => backend.signInWithGoogle())} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Input testID="guest-name" value={name} onChangeText={setName} placeholder="Or just your name" autoCapitalize="words" autoComplete="name" maxLength={30}
            returnKeyType="go" onSubmitEditing={guest} accessibilityLabel="Or just your name" box={{ flex: 1, minWidth: 0 }} />
          <Btn label={ended ? 'See' : 'Join'} h={50} size={17} disabled={busy} onPress={guest} testID="guest-join" />
        </View>
        <GetTheApp code={code} />
      </View>
      <PhoneSheet open={sheet} onClose={() => setSheet(false)} onDone={() => setSheet(false)} />
    </Screen>
  );
}

/**
 * Web only, and only once the store pages exist (EXPO_PUBLIC_PLAY_URL / EXPO_PUBLIC_APPSTORE_URL): a quiet
 * pointer to the native apps under the join buttons. Joining in the browser stays the main action.
 * Android: the Play link carries the game code, so the freshly installed app opens this game (src/lib/install.ts).
 * iPhone has no such hand-over, so the code is shown to type on Home.
 */
function GetTheApp({ code }: { code: string }) {
  if (Platform.OS !== 'web') return null;
  const { play, appStore } = storeLinks(code);
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const android = /android/i.test(ua);
  const apple = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1);
  // On a phone show only its own store; on a computer show both.
  const links = [
    play && !apple ? { label: 'Google Play', url: play } : null,
    appStore && !android ? { label: 'App Store', url: appStore } : null,
  ].filter((l): l is { label: string; url: string } => !!l);
  if (!links.length) return null;
  return (
    <View style={{ alignItems: 'center', gap: 2, paddingTop: 6 }} testID="get-the-app">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', columnGap: 8 }}>
        <T size={15} color={C.dim}>Get the app:</T>
        {links.map((l) => (
          <Pressable key={l.label} onPress={() => openUrl(l.url)} accessibilityRole="link" accessibilityLabel={`Get the app on ${l.label}`}
            style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 }}>
            <T size={15} w={600} color={C.muted} style={{ textDecorationLine: 'underline' }}>{l.label}</T>
          </Pressable>
        ))}
      </View>
      <T size={15} color={C.dim} center>Have the app? Enter this code on Home</T>
      <T mono size={26} color={C.cream} selectable accessibilityLabel={`Game code ${code.split('').join(' ')}`} style={{ letterSpacing: 6 }}>{code}</T>
    </View>
  );
}
