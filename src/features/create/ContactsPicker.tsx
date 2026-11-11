import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Pressable, View } from 'react-native';
import { backend } from '@/backend';
import type { ContactMatch, DeviceContact } from '@/backend/types';
import { acceptContacts, contactsAccepted, formatPhone, loadContacts } from '@/lib/contacts';
import { AVATARS, C } from '@/theme/tokens';
import { Avatar, Btn, Input, Sheet, T } from '@/ui';

type Phase = 'checking' | 'explain' | 'loading' | 'list' | 'denied' | 'unavailable';

const SEL_BG = C.waSel;

/**
 * Pick people from the phone's address book (light sheet, big rows).
 * `onDone(picked, matches)` — `matches` are the picked contacts who already use the app. The sheet then closes itself.
 */
export function ContactsPicker(props: {
  open: boolean; onClose: () => void; mode: 'create' | 'lobby' | 'friends';
  initial?: string[]; disabledIds?: string[]; disabledLabel?: string;
  onDone: (picked: DeviceContact[], matches: ContactMatch[]) => void;
}) {
  const { open, onClose, mode, initial, disabledIds, disabledLabel, onDone } = props;
  const [phase, setPhase] = useState<Phase>('checking');
  const [contacts, setContacts] = useState<DeviceContact[]>([]);
  const [matches, setMatches] = useState<ContactMatch[]>([]);
  const [sel, setSel] = useState<string[]>([]);
  const [q, setQ] = useState('');

  const load = async () => {
    setPhase('loading');
    const r = await loadContacts();
    if (r.status !== 'ok') { setPhase(r.status); return; }
    setContacts(r.contacts);
    setPhase('list');
    // Label people already on the app (one hashed lookup for the whole list).
    backend.matchContacts(r.contacts).then(setMatches).catch(() => {});
  };

  useEffect(() => {
    if (!open) return;
    let live = true;
    setQ(''); setSel(initial ?? []);
    setPhase('checking');
    contactsAccepted().then((ok) => { if (!live) return; if (ok) load(); else setPhase('explain'); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const allow = async () => { await acceptContacts(); load(); };

  const disabled = useMemo(() => new Set(disabledIds ?? []), [disabledIds]);
  const byContact = useMemo(() => new Map(matches.map((m) => [m.contactId, m.user])), [matches]);
  const colorOf = useMemo(() => new Map(contacts.map((c, i) => [c.id, AVATARS[i % AVATARS.length]])), [contacts]);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? contacts.filter((c) => c.name.toLowerCase().includes(s)) : contacts;
  }, [contacts, q]);

  const picked = sel.filter((id) => !disabled.has(id));
  const n = picked.length;
  const doneLabel = !n ? 'Done' : mode === 'lobby' ? `Add ${n} to invite list` : mode === 'friends' ? `Add ${n} as friends` : `Done · ${n} selected`;
  const done = () => {
    const list = contacts.filter((c) => picked.includes(c.id));
    onDone(list, matches.filter((m) => picked.includes(m.contactId)));
    onClose();
  };
  const toggle = (id: string) => setSel((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  return (
    <Sheet open={open} onClose={onClose} height={0.9} light top={12} handle={phase === 'list'}>
      {phase === 'checking' || phase === 'loading' ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <ActivityIndicator color={C.wa} size="large" />
          {phase === 'loading' && <T size={17} color={C.lightSub}>Loading your contacts…</T>}
        </View>
      ) : phase === 'explain' ? (
        <Message
          title="Invite from your contacts"
          body="Pick people from your phone and we’ll open WhatsApp with the invite ready. We never message anyone without you."
          cta="Allow contacts" onCta={allow} onClose={onClose}
        />
      ) : phase === 'denied' ? (
        <Message
          title="Contacts are switched off"
          body="Tambola can’t see your contacts yet. Open Settings, allow Contacts for Tambola, then come back — or just share the game link on WhatsApp."
          cta="Open settings" onCta={() => { Linking.openSettings().catch(() => {}); }} onClose={onClose}
        />
      ) : phase === 'unavailable' ? (
        <Message
          title="Contacts work in the mobile app"
          body="Contacts work in the mobile app — share the link instead."
          cta="OK" onCta={onClose}
        />
      ) : (
        <View style={{ flex: 1 }}>
          <View style={{ paddingHorizontal: 18, paddingTop: 1, paddingBottom: 10, gap: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <T w={800} size={24} color={C.ink} lh={1}>Your contacts</T>
              {!!n && <T size={15} color={C.lightText} lh={1}>{n} selected</T>}
            </View>
            <Input value={q} onChangeText={setQ} placeholder="Search a name" accessibilityLabel="Search a name" autoCorrect={false}
              h={50} size={18} bg={C.white} border={C.lightBorder} radius={14} color={C.ink} />
          </View>
          <FlatList
            data={rows} keyExtractor={(c) => c.id} keyboardShouldPersistTaps="handled" style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 8 }} initialNumToRender={14}
            ListEmptyComponent={<T size={16} color={C.lightSub} center style={{ padding: 24 }}>{q.trim() ? `No contact called “${q.trim()}”.` : 'No contacts with a phone number found.'}</T>}
            renderItem={({ item: c }) => {
              const locked = disabled.has(c.id), on = locked || sel.includes(c.id), app = byContact.get(c.id);
              const sub = locked ? (disabledLabel ?? 'Already invited') : app ? `On Tambola${app.username ? ' · @' + app.username : ''}` : formatPhone(c.phone);
              return (
                <Pressable onPress={locked ? undefined : () => toggle(c.id)} disabled={locked}
                  accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: locked }} accessibilityLabel={`${c.name}, ${sub}`}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 14, backgroundColor: on && !locked ? SEL_BG : 'transparent' }}>
                  <Avatar name={c.name} color={colorOf.get(c.id) ?? AVATARS[0]} size={44} fontSize={18} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <T w={800} size={18} color={C.ink} lh={1.2} numberOfLines={1}>{c.name}</T>
                    <T size={14} color={app && !locked ? C.waText : C.lightText} lh={1.2} numberOfLines={1}>{sub}</T>
                  </View>
                  <View style={{ width: 30, height: 30, borderRadius: 15, borderWidth: 2.5, borderColor: on ? C.wa : C.lightCheck, backgroundColor: on ? C.wa : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                    {on && <T w={800} size={16} color={C.white} lh={1}>✓</T>}
                  </View>
                </Pressable>
              );
            }}
          />
          <View style={{ paddingHorizontal: 18, paddingTop: 10, paddingBottom: 4, borderTopWidth: 1, borderTopColor: C.lightHair }}>
            <Btn label={doneLabel} variant="whatsapp" h={56} size={18} radius={16} lip={false} onPress={done} />
          </View>
        </View>
      )}
    </Sheet>
  );
}

function Message({ title, body, cta, onCta, onClose }: { title: string; body: string; cta: string; onCta: () => void; onClose?: () => void }) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14, padding: 28 }}>
      <View style={{ width: 72, height: 72, borderRadius: 22, backgroundColor: C.wa, alignItems: 'center', justifyContent: 'center' }}>
        <T w={800} size={30} color={C.white} lh={1.6}>+</T>
      </View>
      <T w={800} size={26} color={C.ink} center lh={1.1}>{title}</T>
      <T size={17} color={C.lightText} center lh={1.4}>{body}</T>
      <Btn label={cta} variant="whatsapp" h={56} size={18} radius={16} lip={false} onPress={onCta} style={{ alignSelf: 'stretch', marginTop: 8 }} />
      {!!onClose && (
        <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Not now">
          <T size={16} color={C.lightText} lh={1.6}>Not now</T>
        </Pressable>
      )}
    </View>
  );
}
