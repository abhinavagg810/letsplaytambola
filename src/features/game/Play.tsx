import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { User } from '@/backend/types';
import { hush } from '@/lib/speech';
import { setSetting, settings } from '@/state/settings';
import { C, MIN_TAP, PLAY_MAX, R, WIDE } from '@/theme/tokens';
import { Btn, CardIn, MiniTicket, Screen, T, TicketView, first, toast } from '@/ui';
import { calloutFor, miniCells, ruleDesc } from '@core/data.ts';
import { formatINR } from '@core/stats.ts';
import type { GameView, Prize } from '@core/types';
import { Ball, Bulbs } from './Ball';
import { Back, Face, GAME, Mono } from './bits';
import { Board } from './Board';
import { Confetti } from './Confetti';
import { ReactionBar, ReactionBubbles } from './Reactions';
import { ResetSheet } from './ResetSheet';
import { useAutoCall } from './useAutoCall';
import { useDabs } from './useDabs';
import { resyncGame } from './useGame';
import { useGameEvents } from './useGameEvents';
import { act, useOnline, useReconnectProbe } from './useOnline';

const AUTO_STEPS = [0, 5, 8, 12] as const;
const TWO_COL = 720; // two 340px columns + 12px gap + 2 × 14px side padding, as the prototype wraps

/**
 * Main game screen (README §4.13). The route owns the live view (`useGame` also refetches when the person comes back
 * to the app or the connection returns); this screen adds the offline banner and the queue of dabs made while offline.
 */
export function Play({ game, user }: { game: GameView; user: User }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const twoCol = width >= TWO_COL;
  const wide = width >= WIDE;
  const code = game.id;
  const isHost = game.hostUid === user.uid;
  const me = game.me;
  const price = game.price || 0;
  const hostFirst = first(game.hostName);
  const muted = settings.use((s) => s.muted);
  const autoDab = settings.use((s) => s.autoDab);
  const online = useOnline();
  useReconnectProbe(code, online);

  const { rolling, rollNum, called, banner, confettiAt, bubbles } = useGameEvents(game, user);
  const last = called.length ? called[called.length - 1] : null;
  const shownBall = rolling ? rollNum : last;
  const { dabs, toggle, flush } = useDabs(game, online);
  const [resetOpen, setResetOpen] = useState(false);

  // ---- host: draw / auto / reset
  const drawing = useRef(false);
  const draw = useCallback(async () => {
    if (rolling || drawing.current || game.status !== 'live') return;
    if (game.called.length >= 90) { toast('All 90 numbers called'); return; }
    drawing.current = true;
    try { await act(code, { type: 'draw' }); } finally { drawing.current = false; }
  }, [rolling, game.status, game.called.length, code]);
  useAutoCall(game, isHost, draw);
  const cycleAuto = async () => {
    const nx = AUTO_STEPS[(AUTO_STEPS.indexOf(game.auto) + 1) % AUTO_STEPS.length];
    const r = await act(code, { type: 'setAuto', auto: nx });
    if (r.ok) toast(nx ? `Auto-calling every ${nx}s` : 'Auto-call off');
    else if (r.offline) toast('You’re offline');
  };

  // ---- my ticket
  const calledSet = new Set(called);
  const mine = me ? me.ticket.flat().filter(Boolean) : [];
  const dabbed = new Set(dabs.filter((n) => calledSet.has(n)));
  const hint = new Set(mine.filter((n) => calledSet.has(n) && !dabbed.has(n)));
  const myLeft = mine.filter((n) => !calledSet.has(n)).length;
  const onCell = (n: number) => {
    if (game.status !== 'live') return;
    if (!calledSet.has(n)) { toast(`Not yet! ${n} hasn’t been called`); return; }
    toggle(n);
  };
  const insight = me && called.length && myLeft > 0 && myLeft <= 3
    ? (myLeft === 1 ? 'You need just 1 more for Full House!' : `You’re ${myLeft} away from Full House`) : '';

  // Auto-dab (optional setting): once the roll has finished, dab each newly called number that is on my ticket.
  const autoFrom = useRef(called.length);
  useEffect(() => {
    if (called.length < autoFrom.current) { autoFrom.current = called.length; return; }
    const fresh = called.slice(autoFrom.current);
    autoFrom.current = called.length;
    if (!autoDab || !me) return;
    fresh.forEach((n) => { if (mine.includes(n) && !dabs.includes(n)) toggle(n); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [called.length, autoDab]);

  // Back online: re-send queued dabs in order, then have the route fetch a view that includes them.
  const wasOnline = useRef(online);
  useEffect(() => {
    if (online === wasOnline.current) return;
    wasOnline.current = online;
    if (!online) return;
    void flush().then(() => resyncGame(code));
  }, [online, flush, code]);

  const toggleMute = () => { if (!muted) hush(); setSetting({ muted: !muted }); };
  const claim = (z: Prize) => { void act(code, { type: 'claim', prizeId: z.id }); };
  const react = (text: string) => { void act(code, { type: 'react', text }); };

  const claims = game.claims || {};
  const wonCount = game.prizes.filter((z) => claims[z.id]).length;
  const hostPlays = game.players.some((p) => p.uid === game.hostUid);
  const drawLabel = game.called.length >= 90 ? 'All out' : game.called.length ? 'Next number' : 'Call a number';
  const eyebrow = rolling ? 'Shaking the bag…' : last ? `Number ${called.length}` : `${hostFirst} is calling`;
  const callout = rolling ? 'Aur agla number…' : last ? calloutFor(last) : isHost ? 'Tap “Call a number”' : 'First number coming up…';
  const recent = called.slice(-6, -1).reverse();
  const col = twoCol ? { flex: 1, flexBasis: 340, minWidth: 0, gap: 12 } as const : { gap: 12 } as const;

  const callerEl = (
    <View style={{ borderRadius: R.hero, backgroundColor: C.surf, overflow: 'hidden' }}>
      <Bulbs blink={rolling} />
      <View style={{ padding: 14, gap: 12 }}>
        <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
          <Ball n={shownBall} rolling={rolling} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Mono color={C.mari}>{eyebrow}</Mono>
            <T w={800} size={24} lh={1.05} accessibilityLiveRegion="polite">{callout}</T>
            <View accessibilityLabel={recent.length ? `Earlier numbers: ${recent.join(', ')}` : undefined} style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
              {recent.map((n) => (
                <View key={n} style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: C.surf2, alignItems: 'center', justifyContent: 'center' }}>
                  <T w={600} size={12} color={C.muted} lh={1}>{n}</T>
                </View>
              ))}
            </View>
          </View>
        </View>
        {isHost && (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Btn label={drawLabel} onPress={draw} h={54} size={20} radius={R.btn} flex testID="draw" />
            <Pressable onPress={cycleAuto} accessibilityRole="button" testID="auto"
              accessibilityLabel={`Auto-call: ${game.auto ? `every ${game.auto} seconds` : 'off'}. Tap to change`}
              style={{ width: 68, height: 54, borderRadius: R.btn, borderWidth: 1.5, borderColor: game.auto ? C.teal : C.line, backgroundColor: game.auto ? GAME.autoOn : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
              <Mono size={9} lh={1.1}>Auto</Mono>
              <T w={600} size={15} lh={1.1}>{game.auto ? `${game.auto}s` : 'Off'}</T>
            </Pressable>
            <Pressable onPress={() => setResetOpen(true)} accessibilityRole="button" accessibilityLabel="Reset the board" testID="reset"
              style={{ width: 64, height: 54, borderRadius: R.btn, borderWidth: 1.5, borderColor: C.line, alignItems: 'center', justifyContent: 'center' }}>
              <T w={600} size={14}>Reset</T>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );

  const bannerEl = !!banner && (
    <CardIn key={`${banner.name}-${banner.label}`}>
      <View accessibilityRole="alert" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 14, borderRadius: R.card, backgroundColor: banner.mine ? C.mari : C.teal }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T mono size={10} ls={0.8} lh={1.1} color={C.ink}>{banner.mine ? 'Claim verified' : 'Winner'}</T>
          <T w={800} size={20} lh={1.1} color={C.ink}>{banner.mine ? `You won ${banner.label}!` : `${first(banner.name)} won ${banner.label}`}</T>
        </View>
        {price > 0 && <T w={800} size={22} lh={1.6} color={C.ink}>{formatINR(banner.amount)}</T>}
      </View>
    </CardIn>
  );

  const ticketEl = !!me && (
    <TicketView ticket={me.ticket} header={first(user.name)} right={`${dabbed.size}/15 · NEEDS ${myLeft}`} dabbed={dabbed} hint={hint} onCell={onCell} />
  );

  const cardHead = { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10 } as const;
  const prizesEl = game.prizes.length > 0 && (
    <View style={{ borderRadius: R.cardLg, backgroundColor: C.surf, overflow: 'hidden' }}>
      <View style={cardHead}>
        <T w={800} size={17} lh={1}>Prizes &amp; winners</T>
        <Mono lh={1.3}>{wonCount} of {game.prizes.length} won</Mono>
      </View>
      {game.prizes.map((z) => {
        const c = claims[z.id], isMine = !!c && c.uid === user.uid, can = !c && !!me;
        const wp = c ? game.players.find((p) => p.uid === c.uid) : undefined;
        return (
          <View key={z.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: C.surf2, backgroundColor: isMine ? C.mariSoft : 'transparent' }}>
            <MiniTicket cells={miniCells(z.rule)} width={44} on={c ? GAME.miniWon : C.pink} off={GAME.miniOff} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <T w={800} size={16} lh={1.15} color={isMine ? C.mari : C.cream}>{z.label}</T>
              <T size={12} color={C.muted} lh={1.15}>{price ? `${formatINR(z.amt)} · ` : ''}{ruleDesc(z.rule)}</T>
            </View>
            {c ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0, maxWidth: 130 }}>
                <Face name={c.name} color={wp?.color ?? C.line} size={28} font={13} />
                <T w={800} size={15} color={isMine ? C.mari : C.cream} numberOfLines={1} style={{ flexShrink: 1 }}>{isMine ? 'You!' : first(c.name)}</T>
              </View>
            ) : can ? (
              <Pressable onPress={() => claim(z)} hitSlop={4} accessibilityRole="button" accessibilityLabel={`Claim ${z.label}`} testID={`claim-${z.id}`}
                style={({ pressed }) => ({ flexShrink: 0, paddingVertical: 6, paddingHorizontal: 16, borderRadius: R.pill, backgroundColor: C.mari, transform: [{ scale: pressed ? 0.94 : 1 }] })}>
                <T w={800} size={15} lh={1.6} color={C.ink}>Claim</T>
              </Pressable>
            ) : (
              <T size={13} color={C.muted}>Open</T>
            )}
          </View>
        );
      })}
    </View>
  );

  const playersEl = (
    <View style={{ borderRadius: R.cardLg, backgroundColor: C.surf, overflow: 'hidden' }}>
      <View style={cardHead}>
        <T w={800} size={17} lh={1}>Players</T>
        <Mono lh={1.3}>{game.players.length} playing</Mono>
      </View>
      {!hostPlays && (
        <PlayerRow name={hostFirst + (isHost ? ' (you)' : '')} full={game.hostName} color={game.hostColor || C.pink}
          tag={'Host · calling' + (game.hostUsername ? ` · @${game.hostUsername}` : '')} wins={0} />
      )}
      {game.players.map((p) => (
        <PlayerRow key={p.uid} name={first(p.name) + (p.uid === user.uid ? ' (you)' : '')} full={p.name} color={p.color}
          tag={[p.uid === game.hostUid ? 'Host' : '', p.username ? `@${p.username}` : 'guest'].filter(Boolean).join(' · ')}
          wins={Object.values(claims).filter((c) => c.uid === p.uid).length} />
      ))}
    </View>
  );

  const boardEl = <Board called={called} last={rolling ? null : last} defaultOpen={isHost || wide} />;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {!online && (
        <View accessibilityRole="alert" style={{ paddingTop: insets.top + 8, paddingBottom: 8, paddingHorizontal: 14, backgroundColor: C.pink }}>
          <T w={800} size={15} color={C.white} center lh={1.3}>You’re offline — we’ll catch you up when you’re back</T>
        </View>
      )}
      {/* Prototype: 44px above the header (status bar included), 20px below the last card. */}
      <Screen max={PLAY_MAX} px={14} gap={12} top={online ? Math.max(44 - insets.top, 12) : 12 - insets.top} style={{ paddingBottom: 20 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Back onPress={() => router.replace('/')} size={38} font={18} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <T w={800} size={18} lh={1.05} numberOfLines={1}>{game.name}</T>
            <Mono>{called.length} / 90 · {code}</Mono>
          </View>
          <Pressable onPress={toggleMute} hitSlop={(MIN_TAP - 34) / 2} accessibilityRole="switch" accessibilityState={{ checked: !muted }}
            accessibilityLabel={muted ? 'Caller voice is muted. Turn on' : 'Caller voice is on. Mute'}
            style={{ height: 34, paddingHorizontal: 12, borderRadius: R.pill, borderWidth: 1.5, borderColor: C.line, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: muted ? C.muted : C.wa }} />
            <T w={600} size={13}>{muted ? 'Muted' : 'Voice'}</T>
          </Pressable>
        </View>

        {/*
          Phone: one stack, in the prototype's order. From 720px: the prototype's two columns.
          From 900px (owner's request): Prizes & winners moves under the ticket so both columns are about as long.
        */}
        <View style={twoCol ? { flexDirection: 'row', alignItems: 'flex-start', gap: 12 } : { gap: 12 }}>
          <View style={col}>
            {callerEl}
            {bannerEl}
            {!!insight && <Nudge text={insight} />}
            {ticketEl}
            {!!me && <ReactionBar onReact={react} />}
            {wide && prizesEl}
          </View>
          <View style={col}>
            {boardEl}
            {!wide && prizesEl}
            {playersEl}
          </View>
        </View>
      </Screen>

      <ReactionBubbles bubbles={bubbles} />
      <Confetti at={confettiAt} />
      {isHost && <ResetSheet open={resetOpen} onClose={() => setResetOpen(false)} code={code} />}
    </View>
  );
}

/** One row of the Players card. Shows wins only — never anyone's ticket progress. */
function PlayerRow({ name, full, color, tag, wins }: { name: string; full: string; color: string; tag: string; wins: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: C.surf2 }}>
      <Face name={full} color={color} size={34} font={15} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <T w={600} size={16} lh={1.15} numberOfLines={1}>{name}</T>
        <T size={12} color={C.muted} lh={1.15} numberOfLines={1}>{tag}</T>
      </View>
      {wins > 0 && (
        <View style={{ paddingVertical: 2, paddingHorizontal: 10, borderRadius: R.pill, backgroundColor: C.mari }}>
          <T w={800} size={13} lh={1.6} color={C.ink}>{wins} won</T>
        </View>
      )}
    </View>
  );
}

/** Private nudge, shown only to the ticket's owner. */
function Nudge({ text }: { text: string }) {
  const o = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(o, { toValue: 0.4, duration: 800, useNativeDriver: false }),
      Animated.timing(o, { toValue: 1, duration: 800, useNativeDriver: false }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [o]);
  return (
    <Animated.View style={{ alignSelf: 'flex-start', paddingVertical: 4, paddingHorizontal: 14, borderRadius: R.pill, backgroundColor: 'rgba(250,74,152,0.2)', opacity: o }}>
      <T w={600} size={15} lh={1.6} color={C.bogey}>{text}</T>
    </Animated.View>
  );
}
