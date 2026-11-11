import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { backend } from '@/backend';
import type { ContactMatch, DeviceContact, Friend, Group, PendingFriend } from '@/backend/types';
import { AVATARS, C, R } from '@/theme/tokens';
import { Avatar, Btn, Empty, Eyebrow, Faces, HandleCopy, IconBtn, Input, LinkBtn, Screen, Sheet, T, first, toast } from '@/ui';
import { appLink, openWhatsApp } from '@/lib/links';
import { useUser } from '@/state/session';
import { ContactsPicker } from '@/features/create/ContactsPicker';
import { useHomeData } from '@/features/home/useHomeData';
import { LoadError, SkeletonRows, plural, pullRefresh } from '@/features/home/parts';
import { groupLine, groupPeople, playGroup } from '@/features/home/Home';
import { AddFriendSheet } from './AddFriendSheet';

const OFFLINE = 'Can’t reach Tambola right now — check your internet';
/** "Rahul", "Rahul & Kamla", "Rahul, Kamla & Vikram", "Rahul, Kamla, Vikram +2" */
export function autoGroupName(names: string[]) {
  if (!names.length) return '';
  if (names.length === 1) return names[0];
  if (names.length <= 3) return names.slice(0, -1).join(', ') + ' & ' + names[names.length - 1];
  return names.slice(0, 3).join(', ') + ' +' + (names.length - 3);
}
const BigBtn = ({ label, bg, onPress, testID }: { label: string; bg: string; onPress: () => void; testID?: string }) => (
  <Pressable testID={testID} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
    style={({ pressed }) => ({ flex: 1, height: 64, borderRadius: 18, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', transform: [{ translateY: pressed ? 2 : 0 }] })}>
    <T w={800} size={22} color={C.ink} lh={1}>+</T>
    <T w={800} size={17} color={C.ink} lh={1.2}>{label}</T>
  </Pressable>
);

export function Friends() {
  const user = useUser();
  const params = useLocalSearchParams<{ mode?: string; t?: string }>();
  const { social, error, loading, refresh, refreshing } = useHomeData();
  const [sheet, setSheet] = useState<null | 'add' | 'contacts'>(null);
  const [sel, setSel] = useState<string[] | null>(null);          // non-null = "make a group" mode
  const [draftName, setDraftName] = useState('');
  const [confirm, setConfirm] = useState<Group | null>(null);
  const [busy, setBusy] = useState(false);

  // Home's "Make a group" card lands here with ?mode=group (or ?mode=add when there are no friends yet).
  useEffect(() => {
    if (params.mode === 'group') { setSel([]); setDraftName(''); }
    else if (params.mode === 'add') setSheet('add');
  }, [params.mode, params.t]);

  if (!user) return null;
  const friends = social?.friends ?? [], groups = social?.groups ?? [], pending = social?.pending ?? [];
  const selMode = sel !== null;
  const picked = selMode ? sel.map((id) => friends.find((f) => f.uid === id)).filter((f): f is Friend => !!f) : [];
  const autoName = autoGroupName(picked.map((f) => first(f.name)));

  const guard = async (fn: () => Promise<unknown>) => { try { await fn(); } catch { toast(OFFLINE); } await refresh(); };
  const startSel = () => {
    if (!friends.length) { setSheet('add'); return toast('Add a friend first'); }
    setSel([]); setDraftName('');
  };
  const toggle = (uid: string) => setSel((s) => (s ? (s.includes(uid) ? s.filter((x) => x !== uid) : [...s, uid]) : s));
  const createGroup = async () => {
    if (!picked.length) return toast('Tap friends to add them');
    if (busy) return;
    const name = draftName.trim() || autoName;
    setBusy(true);
    try {
      await backend.saveGroup(name, picked.map((f) => f.uid));
      setSel(null); setDraftName('');
      toast(`Group “${name}” saved`);
    } catch { toast(OFFLINE); }
    setBusy(false);
    refresh();
  };
  const sendInvite = (p: PendingFriend) => {
    openWhatsApp(`Hi ${first(p.name)}! I play Tambola on this app — join me, I’m @${user.username ?? first(user.name)}. ${appLink()}`, p.phone);
    guard(() => backend.markPendingSent(p.id));
  };
  const onContactsDone = async (pickedContacts: DeviceContact[], matches: ContactMatch[]) => {
    setSheet(null);
    const byId = new Map(matches.map((m) => [m.contactId, m.user]));
    const users = pickedContacts.map((c) => byId.get(c.id)).filter((u): u is NonNullable<typeof u> => !!u && u.uid !== user.uid);
    const rest = pickedContacts.filter((c) => !byId.has(c.id));
    if (!users.length && !rest.length) return;
    await guard(async () => {
      await Promise.all(users.map((u) => backend.addFriend(u.uid)));
      if (rest.length) await backend.addPendingFriends(rest);
      toast([users.length ? `${users.length} added` : '', rest.length ? `${rest.length} to invite on WhatsApp` : ''].filter(Boolean).join(' · '));
    });
  };

  return (
    <Screen gap={16} refreshControl={pullRefresh(refreshing, refresh)}
      footer={selMode ? <Btn label={picked.length ? `Create group · ${plural(picked.length, 'person', 'people')}` : 'Pick at least one friend'} variant="teal" disabled={busy} onPress={createGroup} testID="create-group" /> : undefined}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
          <T w={800} size={34} lh={1.1} accessibilityRole="header">Friends</T>
          {!!social && <Eyebrow accessibilityLabel={plural(friends.length, 'friend', 'friends')}>{friends.length}</Eyebrow>}
        </View>
        <HandleCopy handle={user.username} />
      </View>

      {!selMode && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <BigBtn label="Add friend" bg={C.mari} onPress={() => setSheet('add')} testID="add-friend" />
          <BigBtn label="Make a group" bg={C.teal} onPress={startSel} testID="make-group" />
        </View>
      )}

      {error && <LoadError onRetry={refresh} />}
      {loading && <SkeletonRows n={3} h={60} />}

      {!selMode && groups.length > 0 && !!social && (
        <View style={{ gap: 8 }}>
          <T w={800} size={15} color={C.muted} ls={0.9} upper>Your groups</T>
          {groups.map((gr) => {
            const people = groupPeople(gr, social);
            return (
              <View key={gr.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18, backgroundColor: C.surf }}>
                <Faces people={people} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T w={800} numberOfLines={1}>{gr.name}</T>
                  <T size={15} color={C.muted} numberOfLines={1}>{groupLine(gr, people)}</T>
                </View>
                <IconBtn label="×" a11y={`Delete group ${gr.name}`} size={30} bg={C.surf2} color={C.muted} fontSize={18} onPress={() => setConfirm(gr)} />
                <Btn label="Play" h={38} size={15} px={16} radius={R.pill} onPress={() => playGroup(gr, social)} />
              </View>
            );
          })}
        </View>
      )}

      {selMode && (
        <View style={{ gap: 10, padding: 14, borderRadius: 18, backgroundColor: C.surf, borderWidth: 1.5, borderColor: C.teal }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <T w={800} size={18}>New group</T>
            <LinkBtn label="Cancel" color={C.muted} onPress={() => setSel(null)} />
          </View>
          <Input testID="group-name" value={draftName} onChangeText={setDraftName} placeholder={autoName || 'Group name, e.g. Sharma Parivaar'} maxLength={40}
            accessibilityLabel="Group name" h={46} bg={C.bg} border="none" radius={12} />
          <T size={15} color={C.teal}>Tap friends below to add them</T>
        </View>
      )}

      {pending.length > 0 && (
        <View style={{ borderRadius: 18, backgroundColor: C.surf, overflow: 'hidden' }}>
          <View style={{ paddingTop: 12, paddingHorizontal: 14, paddingBottom: 8 }}>
            <T w={800} size={16}>Invited to Tambola</T>
            <T size={15} color={C.muted}>Become friends when they join</T>
          </View>
          {pending.map((p, i) => (
            <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: C.surf2 }}>
              <Avatar name={p.name} color={AVATARS[(i + 3) % 6]} size={38} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <T w={800} size={16} numberOfLines={1}>{p.name}</T>
                <T size={15} color={C.muted} numberOfLines={1}>{p.sent ? 'Invite sent · waiting to join' : 'Not on Tambola yet'}</T>
              </View>
              {p.sent
                ? <Btn label="Send again" variant="outline" h={36} size={15} px={12} radius={R.pill} color={C.muted} onPress={() => sendInvite(p)} />
                : <Btn label="Invite on WhatsApp" variant="whatsapp" h={36} size={15} px={12} radius={R.pill} onPress={() => sendInvite(p)} />}
              <IconBtn label="×" a11y={`Remove ${p.name}`} size={28} bg={C.surf2} color={C.muted} fontSize={17} onPress={() => guard(() => backend.removePending(p.id))} />
            </View>
          ))}
        </View>
      )}

      {!!social && friends.length === 0 && (
        <Empty>No friends yet. Tap <T w={800} size={16} color={C.mari}>Add friend</T> — or just play a game, everyone you play with shows up here.</Empty>
      )}

      <View style={{ gap: 4 }}>
        {friends.map((f) => {
          const on = selMode && sel.includes(f.uid);
          const body = (<>
            <Avatar name={f.name} color={f.color} size={44} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <T w={600} numberOfLines={1}>{f.name}</T>
              <T size={15} color={C.muted} numberOfLines={1}>
                <T size={15} color={C.mari}>{f.username ? '@' + f.username : 'guest'}</T> · {f.together ? plural(f.together, 'game', 'games') + ' together' : 'added'}
              </T>
            </View>
            {selMode && (
              <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: on ? C.teal : C.line, backgroundColor: on ? C.teal : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                <T w={800} size={15} color={C.ink} lh={1.1}>{on ? '✓' : ''}</T>
              </View>
            )}
          </>);
          const st = { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 16, backgroundColor: on ? C.tealSoft : 'transparent' } as const;
          return selMode
            ? <Pressable key={f.uid} testID={`pick-${f.username ?? f.uid}`} onPress={() => toggle(f.uid)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={f.name} style={st}>{body}</Pressable>
            : <View key={f.uid} style={st}>{body}</View>;
        })}
      </View>

      <AddFriendSheet open={sheet === 'add'} onClose={() => setSheet(null)} user={user} onContacts={() => setSheet('contacts')} onAdded={refresh} />
      <ContactsPicker open={sheet === 'contacts'} onClose={() => setSheet(null)} mode="friends" onDone={onContactsDone} />
      <Sheet open={!!confirm} onClose={() => setConfirm(null)}>
        <View style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 10, gap: 10 }}>
          <View style={{ gap: 2, marginBottom: 4 }}>
            <T w={800} size={24}>Delete “{confirm?.name}”?</T>
            <T size={15} color={C.muted}>Your friends stay — only the group goes.</T>
          </View>
          <Btn label="Delete group" variant="outline" h={52} size={17} color={C.bogey} testID="confirm-delete"
            onPress={() => { const g = confirm; setConfirm(null); if (g) guard(() => backend.deleteGroup(g.id)); }} />
          <Btn label="Cancel" variant="ghost" h={44} w={600} onPress={() => setConfirm(null)} />
        </View>
      </Sheet>
    </Screen>
  );
}
