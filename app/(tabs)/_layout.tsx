import React from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { Redirect, Tabs, router, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, SIDEBAR_W, WIDE } from '@/theme/tokens';
import { Avatar, Btn, HandleCopy, Logo, T } from '@/ui';
import { needsUsername, useUser } from '@/state/session';
import { invitesStore, useInvitePolling } from '@/state/invites';

const TABS = [['index', 'Home', '/'], ['games', 'Games', '/games'], ['friends', 'Friends', '/friends'], ['profile', 'Profile', '/profile']] as const;

function useActive() {
  const p = usePathname();
  return p.startsWith('/games') ? 'games' : p.startsWith('/friends') ? 'friends' : p.startsWith('/profile') ? 'profile' : 'index';
}
const go = (name: string) => router.navigate(name === 'index' ? '/(tabs)' : (`/(tabs)/${name}` as never));

/** Mobile: bottom bar of text pills (no icons, per the design). */
function TabBar() {
  const insets = useSafeAreaInsets();
  const active = useActive();
  const badge = invitesStore.use((s) => s.list.length);
  return (
    <View style={{ flexDirection: 'row', gap: 4, paddingTop: 8, paddingHorizontal: 10, paddingBottom: Math.max(insets.bottom, 16), backgroundColor: C.sidebar, borderTopWidth: 1, borderTopColor: C.barLine }}>
      {TABS.map(([name, label]) => {
        const on = active === name;
        return (
          <Pressable key={name} onPress={() => go(name)} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={label} hitSlop={{ top: 6, bottom: 6 }} style={{ flex: 1, alignItems: 'center', paddingVertical: 4 }}>
            <View style={{ width: '100%', maxWidth: 84, paddingVertical: 7, borderRadius: 999, backgroundColor: on ? C.mari : 'transparent', alignItems: 'center' }}>
              <T w={800} size={15} lh={1.1} color={on ? C.ink : C.muted} style={{ lineHeight: 16.5 }}>{label}</T>
            </View>
            {name === 'index' && badge > 0 && (
              <View style={{ position: 'absolute', top: 0, right: '12%', height: 16, borderRadius: 8, paddingHorizontal: 6, backgroundColor: C.pink, alignItems: 'center', justifyContent: 'center' }}>
                <T mono size={10} ls={0} color="#fff" lh={1.6}>{badge}</T>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Web ≥ 900px: left sidebar replaces the tab bar. */
function Sidebar() {
  const user = useUser()!;
  const active = useActive();
  const badge = invitesStore.use((s) => s.list.length);
  return (
    <View style={{ width: SIDEBAR_W, backgroundColor: C.sidebar, borderRightWidth: 1, borderRightColor: C.barLine, paddingVertical: 24, paddingHorizontal: 16, gap: 6 }}>
      <View style={{ paddingHorizontal: 8, paddingBottom: 22 }}><Logo size={38} /></View>
      {TABS.map(([name, label]) => {
        const on = active === name;
        return (
          <Pressable key={name} onPress={() => go(name)} accessibilityRole="link" accessibilityLabel={label}
            style={{ height: 46, borderRadius: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', backgroundColor: on ? C.mari : 'transparent' }}>
            <T w={800} size={17} color={on ? C.ink : C.muted} style={{ flex: 1 }}>{label}</T>
            {name === 'index' && badge > 0 && (
              <View style={{ paddingVertical: 1, paddingHorizontal: 7, borderRadius: 999, backgroundColor: C.pink, alignItems: 'center', justifyContent: 'center' }}><T mono size={11} ls={0} color="#fff" lh={1.3}>{badge}</T></View>
            )}
          </Pressable>
        );
      })}
      <Btn label="Host a game" h={50} size={17} lip={false} radius={16} style={{ marginTop: 16 }} onPress={() => router.push('/new')} />
      <View style={{ marginTop: 'auto', flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 8 }}>
        <Avatar name={user.name} color={user.color} size={36} />
        <View style={{ gap: 4, flexShrink: 1, minWidth: 0 }}>
          <T w={600} size={15} lh={1.15} numberOfLines={1}>{user.name}</T>
          <HandleCopy handle={user.username} h={26} size={13} />
        </View>
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const user = useUser();
  const { width } = useWindowDimensions();
  useInvitePolling(user?.uid);
  if (!user) return <Redirect href="/sign-in" />;
  if (needsUsername(user)) return <Redirect href="/username" />;
  const wide = width >= WIDE;
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: C.bg }}>
      {wide && <Sidebar />}
      <View style={{ flex: 1 }}>
        <Tabs screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: C.bg } }} tabBar={() => (wide ? null : <TabBar />)}>
          {TABS.map(([name, label]) => <Tabs.Screen key={name} name={name} options={{ title: label }} />)}
        </Tabs>
      </View>
    </View>
  );
}
