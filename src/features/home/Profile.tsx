import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { profileStats } from '@core/stats.ts';
import { backend } from '@/backend';
import { C } from '@/theme/tokens';
import { Avatar, Btn, HandleCopy, Screen, T, Toggle, copyText, toast } from '@/ui';
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
      <T w={800} size={26} color={color} numberOfLines={1} adjustsFontSizeToFit>{value}</T>
      <T size={15} color={C.muted} numberOfLines={1}>{label}</T>
    </View>
  );
}
function SettingRow({ title, sub, right, onPress, top, label }: { title: string; sub?: string; right: React.ReactNode; onPress: () => void; top?: boolean; label?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label ?? title}
      style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, minHeight: 56, borderTopWidth: top ? 1 : 0, borderTopColor: C.surf2 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <T w={600}>{title}</T>
        {!!sub && <T size={15} color={C.muted}>{sub}</T>}
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
  const stats = useMemo(() => (user && games ? profileStats(games, user.uid) : null), [games, user]);
  if (!user) return null;

  const signOut = async () => {
    if (leaving) return;
    setLeaving(true);
    try { await backend.signOut(); router.replace('/sign-in'); } catch { toast('Couldn’t sign out — try again'); setLeaving(false); }
  };
  const net = !stats ? '·' : stats.money ? signed(stats.net) : '—';
  const netColor = !stats || !stats.money ? C.cream : stats.net >= 0 ? C.teal : C.bogey;

  return (
    <Screen refreshControl={pullRefresh(refreshing, refresh)}>
      <View style={{ alignItems: 'center', gap: 8, paddingTop: 12 }}>
        <Avatar name={user.name} color={user.color} size={96} ring={C.mari} />
        <View style={{ alignItems: 'center', marginTop: 4 }}>
          <T w={800} size={28} center accessibilityRole="header">{user.name}</T>
          <T size={15} color={C.muted} center>{user.isGuest ? 'Guest account' : user.email || prettyPhone(user.phone) || ''}</T>
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
          <SettingRow top title="Share my username" onPress={() => copyText('@' + user.username, 'Username copied')} right={<T size={15} color={C.muted}>Copy</T>} />
        )}
      </View>

      <Btn label={leaving ? 'Signing out…' : 'Sign out'} variant="outline" h={50} size={17} w={600} color={C.bogey} disabled={leaving} onPress={signOut} testID="sign-out" />
      <PhoneSheet open={phoneOpen} onClose={() => setPhoneOpen(false)} onDone={() => setPhoneOpen(false)} title="Save your account" sub="Add your mobile number to keep your games. We’ll text you a code." />
    </Screen>
  );
}
