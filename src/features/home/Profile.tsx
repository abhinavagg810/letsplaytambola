import React, { useMemo, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { profileStats } from '@core/stats.ts';
import { backend } from '@/backend';
import { C } from '@/theme/tokens';
import { Avatar, Btn, HandleCopy, Screen, Sheet, T, Toggle, copyText, toast } from '@/ui';
import { shareSheet } from '@/lib/links';
import { settings, setSetting } from '@/state/settings';
import { useUser } from '@/state/session';
import { PhoneSheet } from '@/features/auth/SignIn';
import { useHomeData } from './useHomeData';
import { LoadError, pullRefresh, signed } from './parts';
import { toFriends } from './Home';

const prettyPhone = (p: string | null) => (p ? p.replace(/^\+91(\d{5})(\d{5})$/, '+91 $1 $2') : '');

function Stat({ value, label, color = C.cream }: { value: string; label: string; color?: string }) {
  return (
    <View accessible accessibilityLabel={`${label}: ${value}`} style={{ flex: 1, minWidth: 0, paddingVertical: 12, paddingHorizontal: 6, borderRadius: 18, backgroundColor: C.surf, alignItems: 'center' }}>
      <T w={800} size={26} lh={1.1} color={color} numberOfLines={1} adjustsFontSizeToFit>{value}</T>
      <T size={13} lh={1.1} color={C.muted} numberOfLines={1}>{label}</T>
    </View>
  );
}
function SettingRow({ title, sub, right, onPress, top, label }: { title: string; sub?: string; right: React.ReactNode; onPress: () => void; top?: boolean; label?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label ?? title}
      style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderTopWidth: top ? 1 : 0, borderTopColor: C.surf2 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <T w={600} lh={sub ? 1.15 : 1.6}>{title}</T>
        {!!sub && <T size={13} lh={1.15} color={C.muted}>{sub}</T>}
      </View>
      {right}
    </Pressable>
  );
}

export function Profile() {
  const user = useUser();
  const { games, social, error, refresh, refreshing } = useHomeData();
  const { muted, autoDab } = settings.use();
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const stats = useMemo(() => (user && games ? profileStats(games, user.uid) : null), [games, user]);
  if (!user) return null;

  const signOut = async () => {
    if (leaving) return;
    setConfirmOut(false);
    setLeaving(true);
    try { await backend.signOut(); router.replace('/sign-in'); } catch { toast('Couldn’t sign out — try again'); setLeaving(false); }
  };
  // A guest has no way back in, so they get a warning (and the way to keep the account) first.
  const askSignOut = () => (user.isGuest ? setConfirmOut(true) : void signOut());
  // iOS can't present one sheet while another is still closing.
  const addPhone = () => { setConfirmOut(false); setTimeout(() => setPhoneOpen(true), Platform.OS === 'ios' ? 350 : 0); };
  // iOS/Android: the system share sheet. Web: there is nothing to share to, so copy.
  const native = Platform.OS === 'ios' || Platform.OS === 'android';
  const shareHandle = () => (native ? void shareSheet(`Add me on Tambola — I’m @${user.username}`) : void copyText('@' + user.username, 'Username copied'));
  const needsPhone = !user.isGuest && !user.phone;   // signed in with Google/Apple and skipped the number
  const net = !stats ? '·' : stats.money ? signed(stats.net) : '—';
  const netColor = !stats || !stats.money ? C.cream : stats.net >= 0 ? C.teal : C.bogey;

  return (
    <Screen fixedTop={48} refreshControl={pullRefresh(refreshing, refresh)}>
      <View style={{ alignItems: 'center', gap: 8, paddingTop: 8 }}>
        <Avatar name={user.name} color={user.color} size={96} ring={C.mari} />
        <View style={{ alignItems: 'center' }}>
          <T w={800} size={28} lh={1.2} center accessibilityRole="header">{user.name}</T>
          <T size={14} lh={1.2} color={C.muted} center>{user.isGuest ? 'Guest account' : user.email || prettyPhone(user.phone) || ''}</T>
        </View>
        <View><HandleCopy handle={user.username} /></View>
      </View>

      {user.isGuest && (
        <View style={{ padding: 16, borderRadius: 18, backgroundColor: C.mariSoft, borderWidth: 1.5, borderColor: C.mari, gap: 10 }}>
          <View>
            <T w={800}>Save your account</T>
            <T size={15} color={C.muted}>Add your phone number to keep your games</T>
          </View>
          <Btn label="Add phone number" h={48} onPress={() => setPhoneOpen(true)} testID="guest-save" />
        </View>
      )}

      {needsPhone && (
        <View style={{ padding: 16, borderRadius: 18, backgroundColor: C.surf, borderWidth: 1.5, borderColor: C.line, gap: 10 }}>
          <View>
            <T w={800}>Add your mobile number</T>
            <T size={15} color={C.muted}>So friends can find you from their contacts</T>
          </View>
          <Btn label="Add mobile number" variant="outline" borderColor={C.cream} h={48} w={600} onPress={() => setPhoneOpen(true)} testID="add-phone" />
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Stat value={stats ? String(stats.games) : '·'} label="Games" />
        <Stat value={stats ? String(stats.wins) : '·'} label="Prizes won" />
        <Stat value={net} label="Net" color={netColor} />
      </View>
      {error && <LoadError onRetry={refresh} />}

      <View style={{ borderRadius: 18, backgroundColor: C.surf, overflow: 'hidden' }}>
        <SettingRow title="Caller voice" sub="Rhymes for every number" label={`Caller voice, ${muted ? 'off' : 'on'}`} onPress={() => setSetting({ muted: !muted })}
          right={<Toggle on={!muted} onChange={(v) => setSetting({ muted: !v })} label="Caller voice" />} />
        <SettingRow top title="Auto-dab" sub="Dab called numbers for me" label={`Auto-dab, ${autoDab ? 'on' : 'off'}`} onPress={() => setSetting({ autoDab: !autoDab })}
          right={<Toggle on={autoDab} onChange={(v) => setSetting({ autoDab: v })} label="Auto-dab" />} />
        <SettingRow top title="Friends & groups" onPress={() => toFriends()}
          right={<T size={15} color={C.muted}>{social ? `${social.friends.length} →` : '→'}</T>} />
        {!!user.username && (
          <SettingRow top title="Share my username" label={native ? 'Share my username' : 'Share my username, copy'} onPress={shareHandle} right={<T size={15} color={C.muted}>{native ? 'Share' : 'Copy'}</T>} />
        )}
      </View>

      <Btn label={leaving ? 'Signing out…' : 'Sign out'} variant="outline" h={50} size={17} w={600} color={C.bogey} disabled={leaving} onPress={askSignOut} testID="sign-out" />
      <PhoneSheet open={phoneOpen} onClose={() => setPhoneOpen(false)} onDone={() => setPhoneOpen(false)}
        title={needsPhone ? 'Add your mobile number' : 'Save your account'}
        sub={needsPhone ? 'So friends can find you from their contacts. We’ll text you a code.' : 'Add your mobile number to keep your games. We’ll text you a code.'} />
      <Sheet open={confirmOut} onClose={() => setConfirmOut(false)} light>
        <View style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8, gap: 12 }}>
          <View style={{ gap: 4 }}>
            <T w={800} size={24} color={C.ink} accessibilityRole="header">Sign out?</T>
            <T size={16} color={C.lightSub} lh={1.4}>You joined as a guest, so you won’t be able to get back to this account. Add your phone number to keep your games.</T>
          </View>
          <Btn label="Add phone number" onPress={addPhone} testID="confirm-add-phone" />
          <Btn label="Sign out anyway" variant="outline" borderColor={C.lightLine} color={C.ink} h={50} size={17} w={600} onPress={signOut} testID="confirm-sign-out" />
        </View>
      </Sheet>
    </Screen>
  );
}
