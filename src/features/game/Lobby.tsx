import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatINR } from '@core/stats.ts';
import type { ContactInvite, GameAction, GameView, InvitedUser } from '@core/types.ts';
import { backend } from '@/backend';
import type { Social, User } from '@/backend/types';
import { gameLink, openWhatsApp } from '@/lib/links';
import { AVATARS, C, R } from '@/theme/tokens';
import { Avatar, BackBtn, Btn, Eyebrow, LiveDot, Screen, T, TicketView, copyText, first, tick, toast } from '@/ui';
import { ContactsPicker } from '@/features/create/ContactsPicker';
import { PeoplePicker } from '@/features/create/PeoplePicker';

/** The three small invite pills share the row by content width, so “From contacts” never truncates on a 390px phone. */
const PILL = { flex: 1, minWidth: 0 } as const;
/** Exact (fractional) line-height from the prototype, where rounding would drift row heights. */
const LH = (px: number) => ({ lineHeight: px });
const EMPTY: Social = { friends: [], groups: [], pending: [] };

/** "0421" — a stable, friendly ticket number for this player (decorative only). */
function ticketNo(uid: string): string {
  let h = 0;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) % 10000;
  return String(h).padStart(4, '0');
}

/** Waiting room before the first number. Host invites and starts; players see their ticket and who's in. README §4.12. */
export function Lobby({ game, user }: { game: GameView; user: User }) {
  const isHost = game.hostUid === user.uid;
  const code = game.id;
  const link = gameLink(code);
  const price = game.price || 0;
  const insets = useSafeAreaInsets();
  const [social, setSocial] = useState<Social>(EMPTY);
  const [people, setPeople] = useState(false);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [starting, setStarting] = useState(false);

  const loadSocial = useCallback(() => { backend.getSocial().then(setSocial).catch(() => {}); }, []);
  useEffect(() => { if (isHost) loadSocial(); }, [isHost, loadSocial]);

  const act = async (action: GameAction) => {
    const r = await backend.act(code, action).catch(() => ({ ok: false as const, error: 'Something went wrong — try again' }));
    if (!r.ok) toast(r.error);
    return r.ok;
  };

  const info = `${price ? formatINR(price) + ' ticket · ' : 'Just for fun · '}${game.prizes.length} prize${game.prizes.length === 1 ? '' : 's'}${price ? ' · ' + formatINR(price * game.maxSeats) + ' pot' : ''}`;
  const contacts = isHost ? game.contacts : [];
  const hasJoined = (c: ContactInvite) => game.players.some((p) => p.name === c.name);
  const sendTo = async (c: ContactInvite) => {
    await openWhatsApp(`Hi ${first(c.name)}! Join my Tambola game “${game.name}”. Tap to get your ticket: ${link}`, c.phone);
    if (!c.sent) act({ type: 'markContactSent', contactId: c.id });
  };

  const pending = game.invited.filter((u) => !game.players.some((p) => p.uid === u.uid));
  const taken = [...game.invited.map((u) => u.uid), ...game.players.map((p) => p.uid)];
  const invite = (next: InvitedUser[]) => {
    const fresh = next.filter((u) => !taken.includes(u.uid));
    if (fresh.length) act({ type: 'invite', users: fresh });
  };

  const start = async () => {
    if (starting) return;
    setStarting(true);
    await act({ type: 'start' });
    setStarting(false);
  };

  const footer = isHost
    ? <Btn label="Start calling" size={20} disabled={starting} onPress={start} testID="start-calling" style={{ marginTop: 'auto' }} />
    : (
      <View accessibilityRole="text" style={{ marginTop: 'auto', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 56, paddingHorizontal: 16, paddingVertical: 8, borderRadius: R.card, backgroundColor: C.surf }}>
        <LiveDot />
        <T w={600} size={17} style={{ flexShrink: 1 }}>You’re in! Waiting for {first(game.hostName)} to start</T>
      </View>
    );

  return (
    <Screen gap={14} top={Math.max(8, 48 - insets.top)} style={{ paddingBottom: Math.max(insets.bottom, 16) + 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <BackBtn onPress={() => router.replace('/')} />
        <Eyebrow ls={0} lh={1.25} accessibilityLabel={`Code ${code}, round ${game.round}`}>{code} · Round {game.round}</Eyebrow>
      </View>
      <View style={{ gap: 2 }}>
        <T w={800} size={34} lh={1}>{game.name}</T>
        <T size={15} color={C.muted} lh={1.6}>{info}</T>
      </View>

      {isHost && (
        <View style={{ gap: 10, padding: 14, borderRadius: R.cardLg, backgroundColor: C.surf }}>
          <T w={800} size={18} lh={1}>Invite people</T>
          <Btn label="Share to a WhatsApp group" variant="whatsapp" h={56} size={18} radius={R.btn} testID="share-whatsapp"
            onPress={() => openWhatsApp(`Tambola time! Join ${game.name}: ${link}`)} />

          {contacts.length > 0 && (
            <View style={{ borderRadius: R.input, backgroundColor: C.bg, overflow: 'hidden' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, paddingTop: 10, paddingHorizontal: 12, paddingBottom: 6 }}>
                <T w={800} size={15} lh={1.6}>Send to your contacts</T>
                <Eyebrow size={11} ls={0} lh={1.1}>{contacts.filter((c) => c.sent).length} of {contacts.length} sent</Eyebrow>
              </View>
              {contacts.map((c, i) => {
                const joined = hasJoined(c);
                const label = joined ? 'Joined ✓' : c.sent ? 'Send again' : 'Send on WhatsApp';
                return (
                  <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: C.hair }}>
                    <Avatar name={c.name} color={AVATARS[(i + 2) % AVATARS.length]} size={36} fontSize={16} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <T w={800} size={16} style={LH(18.4)} numberOfLines={2}>{c.name}</T>
                      <T size={12} color={C.muted} style={LH(13.8)} numberOfLines={1}>{joined ? 'Joined the game' : c.sent ? 'Invite sent' : 'Not sent yet'}</T>
                    </View>
                    <Pressable onPress={joined ? undefined : () => sendTo(c)} disabled={joined} hitSlop={4}
                      accessibilityRole="button" accessibilityLabel={joined ? `${c.name} joined` : `${label} to ${c.name}`}
                      style={{ height: 38, paddingHorizontal: 14, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: joined || c.sent ? 'transparent' : C.wa, borderWidth: joined || c.sent ? 1.5 : 0, borderColor: joined ? C.teal : C.line }}>
                      <T w={800} size={14} color={joined ? C.teal : c.sent ? C.muted : C.white} numberOfLines={1}>{tick(label)}</T>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}

          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Btn label="From contacts" variant="outline" h={44} size={14} radius={999} px={0} style={PILL} onPress={() => setContactsOpen(true)} />
            <Btn label="App friends" variant="outline" h={44} size={14} radius={999} px={0} style={PILL} onPress={() => setPeople(true)} />
            <Btn label="Copy link" variant="outline" h={44} size={14} radius={999} px={0} style={PILL} onPress={() => copyText(link, 'Invite link copied')} />
          </View>
        </View>
      )}

      {game.me ? (
        <TicketView ticket={game.me.ticket} header="Your ticket" right={`Ticket Nº ${ticketNo(user.uid)}`} />
      ) : isHost ? (
        <View style={{ padding: 14, borderRadius: R.card, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.line, gap: 2 }}>
          <T w={800} size={17}>You’re calling this one</T>
          <T size={15} color={C.muted} lh={1.35}>No ticket for you this round — you draw the numbers and everyone else plays.</T>
        </View>
      ) : null}

      <T w={800} size={20} lh={1.6}>{game.players.length} of {game.maxSeats} joined</T>
      <View style={{ gap: 8 }}>
        {game.players.map((p) => (
          <PlayerRow key={p.uid} name={first(p.name) + (p.uid === user.uid ? ' (you)' : '')} full={p.name} color={p.color}
            tag={[p.uid === game.hostUid ? 'Host' : '', p.username ? '@' + p.username : 'guest'].filter(Boolean).join(' · ')} pill="Joined" joined />
        ))}
        {pending.map((u) => (
          <PlayerRow key={u.uid} name={first(u.name)} full={u.name} color={u.color} tag={`${u.username ? '@' + u.username + ' · ' : ''}invited`} pill="Invited" />
        ))}
        {!game.players.length && !pending.length && <T size={15} color={C.muted}>No one yet — share the link to fill the seats.</T>}
      </View>

      {isHost && (
        <>
          <ContactsPicker open={contactsOpen} onClose={() => setContactsOpen(false)} mode="lobby"
            disabledIds={game.contacts.map((c) => c.id)} disabledLabel="Already invited"
            onDone={async (picked, matches) => {
              if (!picked.length) return;
              const ok = await act({ type: 'addContacts', contacts: picked.map((c) => ({ id: c.id, name: c.name, phone: c.phone, sent: false })) });
              if (ok) invite(matches.map((m) => m.user));
            }} />
          <PeoplePicker open={people} onClose={() => setPeople(false)} friends={social.friends} groups={social.groups}
            selected={game.invited} lockedUids={taken} onChange={invite} onFriendAdded={loadSocial} />
        </>
      )}
      {footer}
    </Screen>
  );
}

function PlayerRow({ name, full, color, tag, pill, joined }: { name: string; full: string; color: string; tag: string; pill: string; joined?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, opacity: joined ? 1 : 0.5 }}>
      <Avatar name={full} color={color} size={38} fontSize={17} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <T w={600} size={17} style={LH(18.7)} numberOfLines={1}>{name}</T>
        <T size={13} color={C.muted} style={LH(14.3)} numberOfLines={1}>{tag}</T>
      </View>
      <View style={{ paddingVertical: 3, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5, borderColor: joined ? C.teal : C.line }}>
        <T w={800} size={13} color={joined ? C.teal : C.muted} lh={1.6}>{pill}</T>
      </View>
    </View>
  );
}
