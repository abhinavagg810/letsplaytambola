import React, { useEffect, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { backend } from '@/backend';
import type { User } from '@/backend/types';
import { C, F } from '@/theme/tokens';
import { Avatar, Btn, Eyebrow, Input, Screen, T, first, toast } from '@/ui';
import { refreshUser } from '@/state/session';

const clean = (s: string) => s.toLowerCase().replace(/^@/, '').replace(/[^a-z0-9_]/g, '').slice(0, 15);
const valid = (h: string) => /^[a-z0-9_]{3,15}$/.test(h);
type Status = 'short' | 'checking' | 'free' | 'taken' | 'offline';

export function Username({ user }: { user: User }) {
  const [name, setName] = useState(user.name);
  const askName = useRef(!user.name.trim()).current;   // signed in from an invite link before giving a name
  const [handle, setHandle] = useState('');
  const [status, setStatus] = useState<Status>('short');
  const [busy, setBusy] = useState(false);
  const touched = useRef(false);

  // Auto-suggest from the first name (priya → priya, priya2, priya3 … until one is free).
  useEffect(() => {
    if (touched.current) return;
    const base = clean(first(name));
    if (base.length < 2) { if (!touched.current) setHandle(''); return; }
    let live = true;
    const t = setTimeout(async () => {
      const stem = base.length < 3 ? base + '_' : base;
      for (let i = 1; i <= 6 && live && !touched.current; i++) {
        const tryIt = i === 1 ? stem : stem.slice(0, 14) + i;
        const ok = await backend.usernameAvailable(tryIt).catch(() => false);
        if (!live || touched.current) return;
        if (ok || i === 6) { setHandle(tryIt); return; }
      }
    }, askName ? 400 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [name, askName]);

  // Live availability, debounced.
  useEffect(() => {
    if (!valid(handle)) { setStatus('short'); return; }
    setStatus('checking');
    let live = true;
    const t = setTimeout(() => {
      backend.usernameAvailable(handle).then((ok) => { if (live) setStatus(ok ? 'free' : 'taken'); }).catch(() => { if (live) setStatus('offline'); });
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [handle]);

  const save = async () => {
    if (busy) return;
    if (askName && !name.trim()) return toast('Tell us your name first');
    if (!valid(handle)) return toast('3–15 letters, numbers or _');
    if (status === 'taken') return toast(`@${handle} is taken — try another`);
    setBusy(true);
    try {
      const r = await backend.updateProfile(askName ? { name: name.trim(), username: handle } : { username: handle });
      if (!r.ok) { toast(r.error); if (/taken/i.test(r.error)) setStatus('taken'); return; }
      await refreshUser();
      router.replace('/');
    } catch { toast('Can’t reach Tambola right now — check your internet'); } finally { setBusy(false); }
  };

  const [text, color] =
    status === 'free' ? [`@${handle} is available ✓`, C.teal]
    : status === 'taken' ? [`@${handle} is taken — try another`, C.bogey]
    : status === 'checking' ? ['Checking…', C.muted]
    : status === 'offline' ? ['Can’t reach Tambola right now — check your internet', C.bogey]
    : ['3–15 letters, numbers or _', C.muted];
  const border = status === 'free' ? C.teal : 'transparent';   // prototype: only the "available" state is outlined
  const hi = first(name).toUpperCase();

  return (
    <Screen px={24} fixedTop={64} footerBottom={28} max={520} gap={16}
      footer={<Btn label={busy ? 'Saving…' : 'Continue'} size={20} disabled={busy} onPress={save} testID="username-continue" />}>
      <Avatar name={name} color={user.color} size={72} />
      <View style={{ gap: 6 }}>
        <Eyebrow color={C.mari} ls={1.2} lh={1.33}>{hi ? `Hi ${hi} · one last thing` : 'One last thing'}</Eyebrow>
        <T w={800} size={34} lh={1} accessibilityRole="header">Pick a username</T>
        <T size={17} lh={1.4} color={C.muted}>Friends find and invite you with it — no more “which Rahul?”</T>
      </View>
      {askName && (
        <Input testID="name-input" value={name} onChangeText={setName} placeholder="Your name" autoCapitalize="words" autoComplete="name" maxLength={30}
          accessibilityLabel="Your name" h={58} size={22} bold bg={C.surf} radius={16} />
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', height: 58, borderRadius: 16, backgroundColor: C.surf, paddingHorizontal: 16, borderWidth: 1.5, borderColor: border }}>
        <T w={800} size={22} color={C.mari} lh={1.3}>@</T>
        <TextInput testID="username-input" value={handle} onChangeText={(v) => { touched.current = true; setHandle(clean(v)); }} placeholder="yourname" placeholderTextColor={C.dim}
          autoCapitalize="none" autoCorrect={false} autoComplete="off" spellCheck={false} maxLength={16} returnKeyType="done" onSubmitEditing={save} accessibilityLabel="Username"
          style={{ flex: 1, minWidth: 0, height: 54, fontSize: 22, fontFamily: F.bold, color: C.cream, paddingLeft: 4, outlineStyle: 'none' } as any} />
      </View>
      <T size={15} lh={1.6} color={color} accessibilityLiveRegion="polite">{text}</T>
    </Screen>
  );
}
