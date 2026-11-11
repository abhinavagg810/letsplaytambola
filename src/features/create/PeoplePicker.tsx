import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { backend } from '@/backend';
import type { Friend, Group, InvitedUser } from '@/backend/types';
import { useUser } from '@/state/session';
import { C } from '@/theme/tokens';
import { Avatar, Btn, Faces, Input, Sheet, T, first, toast } from '@/ui';

const SHEET_BG = C.sheet;
const asInvited = (f: Friend): InvitedUser => ({ uid: f.uid, name: f.name, username: f.username, color: f.color });

/**
 * "Add people" — app friends and saved groups, built for 50+ friends / 10+ groups.
 * Controlled: `selected` in, `onChange(next)` out. `lockedUids` (optional) are shown ticked and can’t be removed
 * (the lobby uses it for people already invited or joined). `onFriendAdded` fires after inviting someone by @username.
 */
export function PeoplePicker({ open, onClose, friends, groups, selected, onChange, lockedUids, onFriendAdded }: {
  open: boolean; onClose: () => void; friends: Friend[]; groups: Group[];
  selected: InvitedUser[]; onChange: (next: InvitedUser[]) => void;
  lockedUids?: string[]; onFriendAdded?: () => void;
}) {
  const me = useUser();
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'friends' | 'groups'>('friends');
  const [ext, setExt] = useState<InvitedUser | null>(null);

  useEffect(() => {
    if (open) { setQ(''); setExt(null); setTab(groups.length && !selected.length ? 'groups' : 'friends'); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const query = q.trim().toLowerCase().replace(/^@/, '');
  const selIds = useMemo(() => new Set(selected.map((u) => u.uid)), [selected]);
  const locked = useMemo(() => new Set(lockedUids ?? []), [lockedUids]);
  const byId = useMemo(() => new Map(friends.map((f) => [f.uid, f])), [friends]);
  const sorted = useMemo(() => friends.slice().sort((a, b) => b.together - a.together), [friends]);

  // Exact @username of someone who isn't a friend yet (3+ characters, debounced).
  useEffect(() => {
    setExt(null);
    if (!open || query.length < 3) return;
    let live = true;
    const t = setTimeout(() => {
      backend.findUser(query).then((u) => {
        if (live && u && u.uid !== me?.uid && !byId.has(u.uid) && !selIds.has(u.uid) && !locked.has(u.uid)) setExt(u);
      }).catch(() => {});
    }, 300);
    return () => { live = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open]);

  const add = (users: InvitedUser[]) => onChange([...selected, ...users.filter((u) => !selIds.has(u.uid) && !locked.has(u.uid))]);
  const remove = (uids: string[]) => onChange(selected.filter((u) => !uids.includes(u.uid) || locked.has(u.uid)));
  const inviteExt = () => {
    if (!ext) return;
    const u = ext;
    backend.addFriend(u.uid).then(() => onFriendAdded?.()).catch(() => {});
    add([u]); setQ(''); setExt(null);
    toast('Invited ' + first(u.name));
  };

  const friendRows = sorted.filter((f) => !query || f.name.toLowerCase().includes(query) || (f.username ?? '').toLowerCase().includes(query));
  const groupRows = groups.filter((g) => !query || g.name.toLowerCase().includes(query));
  const empty = (tab === 'groups' ? !groupRows.length : !friendRows.length) && !ext;
  const emptyText = query ? `No match for “${q.trim()}”. Try their exact @username.`
    : tab === 'groups' ? 'No groups yet — make one from the Friends tab.' : 'No friends yet — search an @username above.';
  const count = selected.length;

  return (
    <Sheet open={open} onClose={onClose} height={0.88} bg={SHEET_BG} top={12}>
      <View style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: 18, paddingTop: 1, paddingBottom: 10, gap: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <T w={800} size={24} lh={1}>Add people</T>
            <T size={14} color={C.muted} lh={1}>{count ? `${count} invited` : 'Optional'}</T>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', height: 46, borderRadius: 14, backgroundColor: C.bg, paddingLeft: 14 }}>
            <T size={15} color={C.dim2}>Search</T>
            <Input value={q} onChangeText={setQ} placeholder="name or @username" accessibilityLabel="Search by name or username"
              autoCapitalize="none" autoCorrect={false} h={46} size={17} border="none" box={{ flex: 1, minWidth: 0, paddingLeft: 6, paddingRight: 14 }} />
          </View>
          <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 4, padding: 4, borderRadius: 999, backgroundColor: C.bg }}>
            {([['friends', `Friends · ${friends.length}`], ['groups', `Groups · ${groups.length}`]] as const).map(([k, label]) => (
              <Pressable key={k} onPress={() => setTab(k)} accessibilityRole="tab" accessibilityState={{ selected: tab === k }} accessibilityLabel={label}
                hitSlop={{ top: 4, bottom: 4 }}
                style={{ flex: 1, height: 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: tab === k ? C.cream : 'transparent' }}>
                <T w={800} size={15} color={tab === k ? C.ink : C.muted}>{label}</T>
              </Pressable>
            ))}
          </View>
        </View>

        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 12, gap: 2 }}>
          {!!ext && (
            <Pressable onPress={inviteExt} accessibilityRole="button" accessibilityLabel={`Invite ${ext.name}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.mari, marginBottom: 6 }}>
              <Avatar name={ext.name} color={ext.color} size={40} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <T w={600} size={16} lh={1.15} numberOfLines={1}>{ext.name}</T>
                <T size={13} color={C.mari} lh={1.15} numberOfLines={1}>@{ext.username} · not a friend yet</T>
              </View>
              <T w={800} size={14} color={C.mari} lh={1.6}>Invite</T>
            </Pressable>
          )}
          {empty && <T size={15} color={C.muted} center lh={1.6} style={{ paddingVertical: 24, paddingHorizontal: 8 }}>{emptyText}</T>}

          {tab === 'friends' && friendRows.map((f) => {
            const lock = locked.has(f.uid), on = lock || selIds.has(f.uid);
            const sub = [f.username ? '@' + f.username : '', f.together ? `${f.together} game${f.together > 1 ? 's' : ''} together` : ''].filter(Boolean).join(' · ');
            return (
              <Pressable key={f.uid} disabled={lock} onPress={() => (on ? remove([f.uid]) : add([asInvited(f)]))}
                accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: lock }} accessibilityLabel={f.name}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 14, backgroundColor: on ? C.tealSel : 'transparent', opacity: lock ? 0.6 : 1 }}>
                <Avatar name={f.name} color={f.color} size={40} fontSize={15} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T w={800} size={16} lh={1.15} numberOfLines={1}>{f.name}</T>
                  {!!sub && <T size={13} color={C.muted} lh={1.15} numberOfLines={1}>{sub}</T>}
                </View>
                <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: on ? C.teal : C.line, backgroundColor: on ? C.teal : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                  {on && <T w={800} size={13} color={C.ink} lh={1}>✓</T>}
                </View>
              </Pressable>
            );
          })}

          {tab === 'groups' && groupRows.map((g) => {
            const members = g.uids.map((id) => byId.get(id)).filter((x): x is Friend => !!x);
            const all = members.length > 0 && members.every((m) => selIds.has(m.uid) || locked.has(m.uid));
            const sub = `${g.uids.length} ${g.uids.length === 1 ? 'person' : 'people'} · ${members.slice(0, 3).map((m) => first(m.name)).join(', ')}`;
            return (
              <Pressable key={g.id} onPress={() => (all ? remove(g.uids) : add(members.map(asInvited)))}
                accessibilityRole="button" accessibilityLabel={`${g.name}, ${all ? 'added' : 'add all'}`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 14, backgroundColor: all ? C.tealSel : 'transparent' }}>
                <View style={{ minWidth: 40 }}><Faces people={members} size={32} max={3} ring={SHEET_BG} fontSize={15} overlap={10} /></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T w={800} size={16} lh={1.15} numberOfLines={1}>{g.name}</T>
                  <T size={13} color={C.muted} lh={1.15} numberOfLines={1}>{sub}</T>
                </View>
                <View style={{ height: 26, paddingHorizontal: 10, borderRadius: 999, borderWidth: 2, borderColor: all ? C.teal : C.line, backgroundColor: all ? C.teal : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                  <T w={800} size={13} color={all ? C.ink : C.cream} lh={1}>{all ? 'Added ✓' : 'Add all'}</T>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={{ paddingHorizontal: 18, paddingTop: 10, paddingBottom: 4, borderTopWidth: 1, borderTopColor: C.hair }}>
          <Btn label={count ? `Done · ${count} invited` : 'Done'} h={52} size={18} radius={16} onPress={onClose} />
        </View>
      </View>
    </Sheet>
  );
}
