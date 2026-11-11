import React, { useMemo, useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { formatINR } from '@core/stats.ts';
import type { InvitedUser } from '@core/types';
import type { Group, Social } from '@/backend/types';
import { C, R, WIDE } from '@/theme/tokens';
import { Avatar, Btn, CardIn, Faces, HandleCopy, Input, Logo, Screen, T, first, toast } from '@/ui';
import { AdSlot } from '@/lib/ads';
import { parseCode } from '@/lib/links';
import { useUser } from '@/state/session';
import { invitesStore } from '@/state/invites';
import { startDraft } from '@/state/draft';
import { useHomeData } from './useHomeData';
import { LiveGameCard, LoadError, SectionTitle, SkeletonRows, gameRow, openGame, plural, pullRefresh } from './parts';

/** Group members we can resolve to people (friends), in the group's order. */
export function groupPeople(group: Group, social: Social): InvitedUser[] {
  return group.uids.map((id) => social.friends.find((f) => f.uid === id)).filter((f): f is NonNullable<typeof f> => !!f)
    .map((f) => ({ uid: f.uid, name: f.name, username: f.username, color: f.color }));
}
export const groupLine = (group: Group, people: InvitedUser[]) =>
  `${plural(group.uids.length, 'person', 'people')} · ${people.slice(0, 3).map((p) => first(p.name)).join(', ')}`;
export function playGroup(group: Group, social: Social) {
  startDraft({ name: group.name, invited: groupPeople(group, social) });
  router.push('/new');
}
export const toFriends = (mode?: 'group' | 'add') =>
  router.navigate({ pathname: '/(tabs)/friends', params: mode ? { mode, t: String(Date.now()) } : {} } as never);

export function Home() {
  const user = useUser();
  const { width } = useWindowDimensions();
  const { games, social, error, loading, refresh, refreshing } = useHomeData(5000);
  const invites = invitesStore.use((s) => s.list);
  const [code, setCode] = useState('');
  const live = useMemo(() => (user && games ? games.filter((g) => g.status !== 'ended').map((g) => gameRow(g, user.uid)) : []), [games, user]);
  if (!user) return null;

  const goCode = () => {
    const c = parseCode(code);
    if (c.length < 5) return toast('Enter the 5-character game code');
    setCode('');
    openGame(c);
  };

  return (
    <Screen refreshControl={pullRefresh(refreshing, refresh)}>
      {width < WIDE && <Logo size={30} />}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <T w={800} size={24} lh={1.2} numberOfLines={1} accessibilityRole="header">Namaste, {first(user.name)}</T>
          <HandleCopy handle={user.username} inline />
        </View>
        <Pressable onPress={() => router.navigate('/(tabs)/profile' as never)} accessibilityRole="button" accessibilityLabel="Your profile" testID="home-avatar">
          <Avatar name={user.name} color={user.color} size={46} />
        </Pressable>
      </View>

      {invites.map((iv) => (
        <CardIn key={iv.id} style={{ padding: 16, borderRadius: 22, backgroundColor: C.teal, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Avatar name={iv.hostName} color={iv.hostColor} size={40} ring={C.ink} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <T size={15} color={C.ink}>{first(iv.hostName)} invited you</T>
              <T w={800} size={22} color={C.ink} numberOfLines={2}>{iv.name}</T>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <T size={15} color={C.ink} style={{ flex: 1 }}>
              {iv.price ? `${formatINR(iv.price)} ticket · settled outside the app` : 'Just for fun'} · {plural(iv.seatsLeft, 'seat', 'seats')} left
            </T>
            <Btn label="Join" variant="ink" h={44} size={17} px={24} radius={R.pill} onPress={() => openGame(iv.id)} />
          </View>
        </CardIn>
      ))}

      <Pressable testID="host-a-game" onPress={() => { startDraft(); router.push('/new'); }} accessibilityRole="button" accessibilityLabel="Host a game. Invite friends, deal tickets, start calling."
        style={({ pressed }) => ({ borderRadius: R.hero, backgroundColor: C.mari, padding: 20, gap: 4, boxShadow: 'inset 0 -5px 0 rgba(0,0,0,0.15)', transform: [{ translateY: pressed ? 2 : 0 }] })}>
        <T w={800} size={28} color={C.ink}>Host a game</T>
        <T size={16} color={C.ink}>Invite friends, deal tickets, start calling.</T>
      </Pressable>

      {error && <LoadError onRetry={refresh} />}
      {loading && <SkeletonRows n={2} />}

      {live.length > 0 && (
        <View style={{ gap: 8 }}>
          <SectionTitle>Happening now</SectionTitle>
          {live.map((row) => <LiveGameCard key={row.id} row={row} />)}
        </View>
      )}

      {!!social && social.groups.length > 0 && (
        <View style={{ gap: 8 }}>
          <SectionTitle>Play again with</SectionTitle>
          {social.groups.map((gr) => {
            const people = groupPeople(gr, social);
            return (
              <Pressable key={gr.id} onPress={() => playGroup(gr, social)} accessibilityRole="button" accessibilityLabel={`Play again with ${gr.name}`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18, backgroundColor: C.surf, minHeight: 56 }}>
                <Faces people={people} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T w={800} numberOfLines={1}>{gr.name}</T>
                  <T size={15} color={C.muted} numberOfLines={1}>{groupLine(gr, people)}</T>
                </View>
                <T w={800} size={15} color={C.mari}>Play →</T>
              </Pressable>
            );
          })}
        </View>
      )}
      {!!social && social.groups.length === 0 && (
        <Pressable testID="home-make-group" onPress={() => toFriends(social.friends.length ? 'group' : 'add')} accessibilityRole="button" accessibilityLabel="Make a group"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.teal }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <T w={800}>Make a group</T>
            <T size={15} color={C.muted}>Save your regulars — invite them all in one tap next time</T>
          </View>
          <T w={800} size={22} color={C.teal}>+</T>
        </Pressable>
      )}

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Input testID="code-input" value={code} onChangeText={setCode} placeholder="Have a game code?" autoCapitalize="characters" autoCorrect={false} returnKeyType="go"
          onSubmitEditing={goCode} accessibilityLabel="Game code" h={48} size={16} box={{ flex: 1, minWidth: 0 }} />
        <Btn label="Join" variant="outline" h={48} borderColor={C.cream} w={600} onPress={goCode} testID="code-join" />
      </View>
      <AdSlot placement="home_feed" />
    </Screen>
  );
}
