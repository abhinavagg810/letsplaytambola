import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { formatINR } from '@core/stats.ts';
import { backend } from '@/backend';
import type { Social } from '@/backend/types';
import { addInvited, draft, draftPot, effectivePrizes, prizeSummary, setContacts, setDraft, setInvited, startDraft } from '@/state/draft';
import { C, F, R } from '@/theme/tokens';
import { BackBtn, Btn, Card, Chip, Eyebrow, Faces, Input, LinkBtn, Screen, Stepper, T, Toggle, first, toast } from '@/ui';
import { ContactsPicker } from './ContactsPicker';
import { PeoplePicker } from './PeoplePicker';

const EMPTY: Social = { friends: [], groups: [], pending: [] };

/** New game — who's playing, seats, ticket price, prizes. README §4.8. */
export function NewGame() {
  const d = draft.use();
  const [social, setSocial] = useState<Social>(EMPTY);
  const [people, setPeople] = useState(false);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadSocial = useCallback(() => { backend.getSocial().then(setSocial).catch(() => {}); }, []);
  useEffect(loadSocial, [loadSocial]);

  const { friends, groups } = social;
  const inv = d.invited;
  const invIds = new Set(inv.map((u) => u.uid));
  const friendById = new Map(friends.map((f) => [f.uid, f]));
  const price = Math.max(0, d.price || 0);
  const onPrizes = effectivePrizes(d).filter((p) => p.on);

  // QUICK ADD: top 2 groups not fully invited (teal), then most-played friends — 3 chips at most.
  const quick = [
    ...groups.filter((g) => !g.uids.every((id) => invIds.has(id))).slice(0, 2).map((g) => ({
      key: 'g' + g.id, label: g.name, teal: true,
      onPress: () => addInvited(g.uids.map((id) => friendById.get(id)).filter((f) => !!f).map((f) => ({ uid: f.uid, name: f.name, username: f.username, color: f.color }))),
    })),
    ...friends.slice().sort((a, b) => b.together - a.together).filter((f) => !invIds.has(f.uid)).map((f) => ({
      key: 'f' + f.uid, label: first(f.name), teal: false,
      onPress: () => addInvited([{ uid: f.uid, name: f.name, username: f.username, color: f.color }]),
    })),
  ].slice(0, 3);

  const invNames = inv.slice(0, 3).map((u) => first(u.name)).join(', ') + (inv.length > 3 ? ` +${inv.length - 3} more` : '');
  const cs = d.contacts;
  const csNames = cs.slice(0, 3).map((c) => first(c.name)).join(', ') + (cs.length > 3 ? ` +${cs.length - 3}` : '');
  const pickLabel = friends.length || groups.length ? `App friends & groups · ${friends.length + groups.length}` : 'Find on Tambola by username';

  const saveGroup = async () => {
    const name = d.name.trim();
    if (!name) return toast('Name the game first');
    try {
      await backend.saveGroup(name, inv.map((u) => u.uid));
      toast(`Saved “${name}” as a group`);
      loadSocial();
    } catch { toast('Couldn’t save the group — try again'); }
  };

  const create = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // People picked from contacts who already use the app also get the in-app invite.
      const matches = cs.length ? await backend.matchContacts(cs).catch(() => []) : [];
      const invited = [...inv];
      for (const m of matches) if (!invited.some((u) => u.uid === m.user.uid)) invited.push(m.user);
      const r = await backend.createGame({
        name: d.name.trim() || 'Tambola night', maxSeats: d.seats, price, hostPlays: d.hostPlays,
        prizes: onPrizes.map(({ id, label, rule, amt }) => ({ id, label, rule, amt: price ? Number(amt) || 0 : 0 })),
        invited, contacts: cs.map((c) => ({ id: c.id, name: c.name, phone: c.phone, sent: false })),
      });
      if (!r.ok) { toast(r.error); return; }
      router.replace(`/g/${r.code}`);
      startDraft();
    } catch {
      toast('Couldn’t create the game — try again');
    } finally { setBusy(false); }
  };

  const createLabel = onPrizes.length ? `Create game · ${onPrizes.length} prize${onPrizes.length > 1 ? 's' : ''}` : 'Create game';

  return (
    <Screen gap={14} footer={<Btn label={busy ? 'Creating…' : createLabel} size={20} disabled={busy} onPress={create} testID="create-game" />}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <BackBtn onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Eyebrow>New game</Eyebrow>
      </View>

      <Input value={d.name} onChangeText={(name) => setDraft({ name })} accessibilityLabel="Game name" placeholder="Name your game" maxLength={40}
        h={56} size={26} bold bg={C.surf} border="none" radius={R.btn} />

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <T w={800} size={18}>Who’s playing?</T>
          <T size={15} color={C.muted}>{inv.length ? `${inv.length} invited` : 'Optional'}</T>
        </View>

        {inv.length > 0 && (
          <Pressable onPress={() => setPeople(true)} accessibilityRole="button" accessibilityLabel={`${invNames}. Edit invited people`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}>
            <Faces people={inv} size={34} max={5} />
            <T size={15} lh={1.25} style={{ flex: 1, minWidth: 0 }}>{invNames}</T>
            <T w={800} size={15} color={C.mari}>Edit</T>
          </Pressable>
        )}

        {quick.length > 0 && (
          <View style={{ gap: 6 }}>
            <Eyebrow>Quick add</Eyebrow>
            <View style={{ flexDirection: 'row', gap: 6, overflow: 'hidden' }}>
              {quick.map((c) => (
                <Chip key={c.key} label={`+ ${c.label}`} onPress={c.onPress} maxWidth={150} fg={c.teal ? C.teal : C.cream} border={c.teal ? C.teal : C.line} />
              ))}
            </View>
          </View>
        )}

        {cs.length > 0 && (
          <Pressable onPress={() => setContactsOpen(true)} accessibilityRole="button" accessibilityLabel={`${cs.length} contacts selected. Edit`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: R.input, backgroundColor: C.waSoft }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <T size={15} lh={1.3}><T w={800} size={15}>{cs.length} {cs.length === 1 ? 'contact' : 'contacts'}</T> · {csNames}</T>
              <T size={15} color={C.muted} lh={1.3}>You’ll send the WhatsApp invite after creating</T>
            </View>
            <T w={800} size={15} color={C.mari}>Edit</T>
          </Pressable>
        )}

        <Btn label="Choose from contacts" variant="whatsapp" h={56} size={18} radius={R.btn} onPress={() => setContactsOpen(true)} />
        <Btn label={pickLabel} variant="outline" h={46} size={16} w={600} radius={R.input} onPress={() => setPeople(true)} />

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <T size={15} color={C.muted} lh={1.3} style={{ flex: 1 }}>Or skip — share to a WhatsApp group next.</T>
          {inv.length > 0 && <LinkBtn label="Save as group" color={C.teal} onPress={saveGroup} />}
        </View>
      </Card>

      <View style={{ borderRadius: R.cardLg, backgroundColor: C.surf, overflow: 'hidden' }}>
        <SettingRow title="Seats" sub="One ticket each" first>
          <Stepper value={d.seats} label="seats" onDec={() => setDraft({ seats: d.seats - 1 })} onInc={() => setDraft({ seats: d.seats + 1 })} />
        </SettingRow>

        <SettingRow title="Ticket price" sub={price ? `Pot ${formatINR(draftPot(d))} if all join` : 'Set 0 to play just for fun'} note="Settled outside the app">
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.bg, borderRadius: R.small, paddingHorizontal: 12, width: 110, height: 44 }}>
            <T w={800} size={18} color={C.mari}>₹</T>
            <TextInput
              value={d.price ? String(d.price) : ''} placeholder="0" placeholderTextColor={C.dim} keyboardType="number-pad" inputMode="numeric" maxLength={5}
              onChangeText={(v) => setDraft({ price: Number(v.replace(/\D/g, '')) || 0 })} accessibilityLabel="Ticket price in rupees" selectTextOnFocus
              style={{ flex: 1, minWidth: 0, height: 44, fontSize: 20, fontFamily: F.bold, color: C.cream, textAlign: 'right', paddingLeft: 4, paddingVertical: 0, outlineStyle: 'none' } as any}
            />
          </View>
        </SettingRow>

        <SettingRow title="Deal me a ticket" sub="Play while you call" onPress={() => setDraft({ hostPlays: !d.hostPlays })}>
          <Toggle on={d.hostPlays} onChange={(hostPlays) => setDraft({ hostPlays })} label="Deal me a ticket" />
        </SettingRow>

        <Pressable onPress={() => router.push('/prizes')} accessibilityRole="button" accessibilityLabel="Edit prizes" testID="edit-prizes"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: C.surf2 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
              <T w={600} size={17}>Prizes</T>
              <Eyebrow>Optional</Eyebrow>
            </View>
            <T size={15} color={C.muted} lh={1.25}>{prizeSummary(d)}</T>
          </View>
          <T w={800} size={15} color={C.mari}>Edit →</T>
        </Pressable>
      </View>

      <PeoplePicker open={people} onClose={() => setPeople(false)} friends={friends} groups={groups}
        selected={inv} onChange={setInvited} onFriendAdded={loadSocial} />
      <ContactsPicker open={contactsOpen} onClose={() => setContactsOpen(false)} mode="create"
        initial={cs.map((c) => c.id)} onDone={(picked) => setContacts(picked)} />
    </Screen>
  );
}

function SettingRow({ title, sub, note, children, first: isFirst, onPress }: { title: string; sub: string; note?: string; children: React.ReactNode; first?: boolean; onPress?: () => void }) {
  const body = (
    <>
      <View style={{ flex: 1, minWidth: 0 }}>
        <T w={600} size={17} lh={1.2}>{title}</T>
        <T size={15} color={C.muted} lh={1.2}>{sub}</T>
        {!!note && <T size={15} color={C.dim} lh={1.2}>{note}</T>}
      </View>
      {children}
    </>
  );
  const style = { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 10, paddingLeft: 16, paddingRight: 12, minHeight: 60, borderTopWidth: isFirst ? 0 : 1, borderTopColor: C.surf2 } as const;
  return onPress
    ? <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} style={style}>{body}</Pressable>
    : <View style={style}>{body}</View>;
}
