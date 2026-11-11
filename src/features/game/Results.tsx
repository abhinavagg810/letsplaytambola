import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { backend } from '@/backend';
import type { User } from '@/backend/types';
import { AdSlot } from '@/lib/ads';
import { say } from '@/lib/speech';
import { setPendingCode } from '@/state/session';
import { C, R } from '@/theme/tokens';
import { Btn, Screen, T, first, toast } from '@/ui';
import { formatINR, roundResults } from '@core/stats.ts';
import type { GameView } from '@core/types';
import { Back, Face } from './bits';
import { Confetti } from './Confetti';
import { liveSeen } from './useGameEvents';
import { act } from './useOnline';

const GLOW = 'radial-gradient(ellipse at 50% 0%, rgba(113,54,0,0.5), transparent 55%)';

/** Round results (README §4.15). Shown to everyone with the link once the round has ended. */
export function Results({ game, user }: { game: GameView; user: User }) {
  const insets = useSafeAreaInsets();
  const code = game.id;
  const isHost = game.hostUid === user.uid;
  const price = game.price || 0;
  const claims = game.claims || {};
  const { ranked } = roundResults(game);
  const [saved, setSaved] = useState(false);
  const [confettiAt, setConfettiAt] = useState(0);
  const [busy, setBusy] = useState(false);

  // Arriving straight from the live game: confetti once, and announce the win that ended the round.
  useEffect(() => {
    const from = liveSeen.get(code);
    if (from === undefined) return;
    liveSeen.delete(code);
    setConfettiAt(Date.now());
    (game.feed || []).filter((f) => f.seq > from && f.kind === 'win').forEach((f) => say(`${f.label} for ${f.name}!`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  useEffect(() => {
    let alive = true;
    if (!user.isGuest) backend.getSocial().then((s) => { if (alive && s.groups.some((g) => g.name === game.name)) setSaved(true); }).catch(() => {});
    return () => { alive = false; };
  }, [game.name, user.isGuest, user.uid]);

  const saveGroup = async () => {
    if (saved) return;
    const ids = game.players.map((p) => p.uid).filter((id) => id !== user.uid);
    if (!ids.length) { toast('No one else played'); return; }
    try {
      await backend.saveGroup(game.name, ids);
      setSaved(true);
      toast(`Saved “${game.name}” — replay from Home`);
    } catch { toast('Couldn’t save the group — try again'); }
  };
  const nextRound = async () => {
    if (busy) return;
    setBusy(true);
    const r = await act(code, { type: 'nextRound' });
    setBusy(false);
    if (r.offline) toast('You’re offline — try again in a moment');
  };

  const podium = [ranked[1], ranked[0], ranked[2]].filter(Boolean);
  const title = ranked.length && ranked[0].player.uid === user.uid ? 'You top the table!' : 'That’s a wrap!';
  const settleLabel = isHost ? 'Settle up' : price ? 'See payouts' : 'See everyone’s prizes';

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Prototype: 52px above the header (status bar included), 20px below the last button; the glow covers the screen. */}
      <Screen glow={GLOW} glowHeight="100%" px={18} gap={16} top={Math.max(52 - insets.top, 20)} style={{ paddingBottom: 20 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Back onPress={() => router.replace('/')} />
          <T mono size={12} ls={0} color={C.mari}>Round {game.round} · {game.called.length} numbers</T>
        </View>
        <T w={800} size={38} center lh={1} accessibilityRole="header">{title}</T>

        {podium.length > 0 && (
          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', gap: 10 }}>
            {podium.map((r) => {
              const rank = ranked.indexOf(r) + 1, top = rank === 1;
              return (
                <View key={r.player.uid} accessibilityLabel={`Number ${rank}: ${r.player.name}, ${price ? formatINR(r.w) : `${r.won.length} prizes`}`}
                  style={{ width: top ? 104 : 90, alignItems: 'center', gap: 6 }}>
                  <Face name={r.player.name} color={r.player.color} size={top ? 60 : 48} font={22} ring={top ? C.pink : undefined} />
                  <T w={800} size={15} lh={1.6} numberOfLines={1} style={{ maxWidth: '100%' }}>{first(r.player.name)}</T>
                  <View style={{ width: '100%', height: rank === 1 ? 110 : rank === 2 ? 80 : 58, borderTopLeftRadius: 14, borderTopRightRadius: 14, backgroundColor: top ? C.mari : C.surf2, alignItems: 'center', justifyContent: 'center' }}>
                    <T w={800} size={20} lh={1} color={top ? C.ink : C.cream} numberOfLines={1}>{price ? formatINR(r.w) : r.won.length}</T>
                    <T mono size={11} ls={0} lh={1} color={top ? C.ink : C.cream} style={{ marginTop: 4 }}>#{rank}</T>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <T w={800} size={20} lh={1}>Winners</T>
        {game.prizes.length > 0 ? (
          <View style={{ borderRadius: R.card, backgroundColor: C.surf, overflow: 'hidden' }}>
            {game.prizes.map((z) => {
              const c = claims[z.id], full = z.rule === 'full';
              return (
                <View key={z.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: C.surf2, backgroundColor: full && c ? C.mariSoft : 'transparent' }}>
                  <T size={15} lh={1.6} color={C.muted} style={{ flexShrink: 1 }}>{z.label}</T>
                  <T w={800} size={15} lh={1.6} color={c ? (full ? C.mari : C.cream) : C.muted} style={{ textAlign: 'right', flexShrink: 1 }}>
                    {c ? `${first(c.name)}${price ? ' · ' + formatINR(z.amt) : ''}` : 'Unclaimed'}
                  </T>
                </View>
              );
            })}
          </View>
        ) : (
          <T size={15} color={C.muted}>No prizes this round — just for fun.</T>
        )}

        {user.isGuest && (
          <Pressable onPress={() => { setPendingCode(code); router.push('/sign-in'); }} accessibilityRole="button" accessibilityLabel="Save your account to keep your wins"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: R.card, backgroundColor: C.surf, borderWidth: 1.5, borderColor: C.line }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <T w={800} size={17}>Save your account to keep your wins</T>
              <T size={15} color={C.muted} lh={1.35}>Add your mobile number — it takes a minute.</T>
            </View>
            <T w={800} size={15} color={C.mari}>Save →</T>
          </Pressable>
        )}

        <View style={{ marginTop: 'auto', gap: 8 }}>
          {!user.isGuest && game.players.some((p) => p.uid !== user.uid) && (
            <Btn label={saved ? 'Saved as a group ✓' : 'Save these players as a group'} variant="dashed" h={46} size={16} onPress={saveGroup} />
          )}
          <Btn label={settleLabel} h={54} size={19} radius={R.card} onPress={() => router.push(`/g/${code}/settle`)} testID="settle" />
          {isHost && <Btn label="Next round — fresh tickets" variant="outline" borderColor={C.cream} h={50} size={17} w={600} disabled={busy} onPress={nextRound} testID="next-round" />}
        </View>
        <AdSlot placement="results_footer" />
      </Screen>
      <Confetti at={confettiAt} />
    </View>
  );
}
