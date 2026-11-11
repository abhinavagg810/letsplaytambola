import React, { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import { backend } from '@/backend';
import type { User } from '@/backend/types';
import { C, F } from '@/theme/tokens';
import { Btn, Sheet, T, copyText, first, toast } from '@/ui';
import { openWhatsApp } from '@/lib/links';

const Divider = ({ label }: { label: string }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
    <View style={{ flex: 1, height: 1, backgroundColor: C.line }} />
    <T size={15} color={C.dim}>{label}</T>
    <View style={{ flex: 1, height: 1, backgroundColor: C.line }} />
  </View>
);

/** Add friends: from contacts (primary), by @username, or by sharing your own handle. */
export function AddFriendSheet({ open, onClose, user, onContacts, onAdded }: {
  open: boolean; onClose: () => void; user: User; onContacts: () => void; onAdded: () => void;
}) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setQ(''); }, [open]);

  const add = async () => {
    const handle = q.trim().replace(/^@/, '').toLowerCase();
    if (!handle || busy) return;
    setBusy(true);
    try {
      const found = await backend.findUser(handle);
      if (!found) toast('No one with that username yet');
      else if (found.uid === user.uid) toast('That’s you!');
      else {
        await backend.addFriend(found.uid);
        toast('Added ' + first(found.name));
        onAdded(); onClose();
      }
    } catch { toast('Can’t reach Tambola right now — check your internet'); }
    setBusy(false);
  };

  return (
    <Sheet open={open} onClose={onClose}>
      <View style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 10, gap: 12 }}>
        <T w={800} size={24} accessibilityRole="header">Add friends</T>
        <Btn label="Choose from contacts" variant="whatsapp" h={56} size={18} radius={16} onPress={onContacts} testID="choose-contacts" />
        <Divider label="or by username" />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', height: 52, borderRadius: 16, backgroundColor: C.bg, paddingHorizontal: 14 }}>
            <T w={800} size={20} color={C.mari} lh={1.3}>@</T>
            <TextInput testID="friend-username" value={q} onChangeText={setQ} placeholder="their username" placeholderTextColor={C.dim} autoCapitalize="none" autoCorrect={false}
              returnKeyType="done" onSubmitEditing={add} accessibilityLabel="Their username"
              style={{ flex: 1, minWidth: 0, height: 50, fontSize: 18, fontFamily: F.medium, color: C.cream, paddingLeft: 4, outlineStyle: 'none' } as any} />
          </View>
          <Btn label="Add" h={52} size={17} px={20} disabled={busy} onPress={add} testID="friend-add" />
        </View>
        {!!user.username && (<>
          <Divider label="or let them add you" />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn flex label="Share on WhatsApp" variant="teal" h={48} size={16} px={8} radius={14} onPress={() => openWhatsApp(`Add me on Tambola — I’m @${user.username}`)} />
            <Btn flex label={`Copy @${user.username}`} variant="outline" h={48} size={16} px={8} radius={14} w={600} onPress={() => copyText('@' + user.username, 'Username copied')} />
          </View>
        </>)}
      </View>
    </Sheet>
  );
}
