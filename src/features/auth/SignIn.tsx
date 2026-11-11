import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { backend } from '@/backend';
import type { PeekGame } from '@/backend/types';
import { C } from '@/theme/tokens';
import { Btn, Input, LinkBtn, Logo, Screen, Sheet, T, first, toast } from '@/ui';
import { refreshUser, session } from '@/state/session';

export const GLOW = 'radial-gradient(ellipse at 20% 0%, rgba(122,24,98,0.6), transparent 60%)';
const RESEND_S = 30;

/** The little blue ring the design uses in place of the Google mark. */
export const GoogleDot = () => <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 3, borderColor: '#4C8DF6' }} />;

type Step = 'phone' | 'code' | 'name';

/**
 * Phone + OTP in a bottom sheet (README §3: the mobile number is the identity).
 * Steps: number → 6-digit code → (only if we don't know it yet) your name. Calls `onDone` once the user is fully in.
 * `skippable` adds "Not now" (used once after Google/Apple sign-in).
 */
export function PhoneSheet({ open, onClose, onDone, skippable, title = 'Your mobile number', sub = 'We’ll text you a 6-digit code.' }: {
  open: boolean; onClose: () => void; onDone: () => void; skippable?: boolean; title?: string; sub?: string;
}) {
  const [step, setStep] = useState<Step>('phone');
  const [num, setNum] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if (open) { setStep('phone'); setCode(''); setBusy(false); } }, [open]);
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const e164 = '+91' + num;
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } catch { toast('Can’t reach Tambola right now — check your internet'); }
    if (alive.current) setBusy(false);
  };
  const send = () => {
    if (num.length !== 10) return toast('Enter your 10-digit mobile number');
    run(async () => {
      const r = await backend.sendOtp(e164);
      if (!r.ok) return toast(r.error);
      if (!alive.current) return;
      setCode(''); setStep('code'); setWait(RESEND_S);
    });
  };
  const verify = (c: string) => {
    if (c.length !== 6) return toast('Enter the 6-digit code');
    run(async () => {
      const r = await backend.verifyOtp(e164, c);
      if (!r.ok) { toast(r.error); if (alive.current) setCode(''); return; }
      await refreshUser();
      if (!alive.current) return;
      if (session.get().user?.name) onDone(); else setStep('name');
    });
  };
  const saveName = () => {
    if (!name.trim()) return toast('Tell us your name first');
    run(async () => {
      const r = await backend.updateProfile({ name: name.trim() });
      if (!r.ok) return toast(r.error);
      await refreshUser();
      onDone();
    });
  };
  const onCode = (v: string) => { const c = v.replace(/\D/g, '').slice(0, 6); setCode(c); if (c.length === 6 && code.length < 6) verify(c); };
  const box = { backgroundColor: C.white, borderColor: C.lightLine } as const;

  return (
    <Sheet open={open} onClose={step === 'name' ? () => {} : onClose} light>
      <View style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8, gap: 12 }}>
        {step === 'phone' && (<>
          <View style={{ gap: 2 }}>
            <T w={800} size={24} color={C.ink}>{title}</T>
            <T size={16} color={C.lightSub}>{sub}</T>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ height: 58, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', ...box }}>
              <T w={800} size={22} color={C.ink} lh={1.3}>+91</T>
            </View>
            <Input testID="phone-input" value={num} onChangeText={(v) => setNum(v.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '').slice(0, 10))}
              placeholder="98100 11001" keyboardType="number-pad" inputMode="numeric" autoComplete="tel-national" textContentType="telephoneNumber"
              autoFocus maxLength={14} returnKeyType="done" onSubmitEditing={send} accessibilityLabel="Mobile number"
              h={58} size={22} bold color={C.ink} bg={C.white} border={C.lightLine} box={{ flex: 1, minWidth: 0 }} />
          </View>
          <Btn label={busy ? 'Sending…' : 'Send code'} disabled={busy} onPress={send} testID="send-code" />
          {backend.mode === 'local' && <T size={15} color={C.lightSub} center>Demo mode — use code 123456</T>}
          {skippable && <View style={{ alignItems: 'center', paddingVertical: 6 }}><LinkBtn label="Not now" color={C.lightSub} size={16} onPress={onDone} /></View>}
        </>)}
        {step === 'code' && (<>
          <View style={{ gap: 2 }}>
            <T w={800} size={24} color={C.ink}>Enter the code</T>
            <T size={16} color={C.lightSub}>Sent to +91 {num.slice(0, 5)} {num.slice(5)}</T>
          </View>
          <Input testID="otp-input" value={code} onChangeText={onCode} placeholder="••••••" keyboardType="number-pad" inputMode="numeric"
            autoComplete="one-time-code" textContentType="oneTimeCode" autoFocus maxLength={6} returnKeyType="done" onSubmitEditing={() => verify(code)}
            accessibilityLabel="6-digit code" h={64} size={28} bold color={C.ink} bg={C.white} border={C.lightLine}
            style={{ textAlign: 'center', letterSpacing: 8 }} />
          <Btn label={busy ? 'Checking…' : 'Continue'} disabled={busy} onPress={() => verify(code)} testID="verify-code" />
          {backend.mode === 'local' && <T size={15} color={C.lightSub} center>Demo mode — use code 123456</T>}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 }}>
            <LinkBtn label="Change number" color={C.ink} size={16} underline onPress={() => setStep('phone')} />
            {wait > 0
              ? <T size={16} color={C.lightSub}>Resend in {wait}s</T>
              : <LinkBtn label="Resend code" color={C.ink} size={16} underline onPress={send} />}
          </View>
        </>)}
        {step === 'name' && (<>
          <View style={{ gap: 2 }}>
            <T w={800} size={24} color={C.ink}>Your name</T>
            <T size={16} color={C.lightSub}>So friends know it’s you at the table.</T>
          </View>
          <Input testID="name-input" value={name} onChangeText={setName} placeholder="Your name" autoFocus autoCapitalize="words" autoComplete="name"
            maxLength={30} returnKeyType="done" onSubmitEditing={saveName} accessibilityLabel="Your name"
            h={58} size={22} bold color={C.ink} bg={C.white} border={C.lightLine} />
          <Btn label={busy ? 'Saving…' : 'Continue'} disabled={busy} onPress={saveName} testID="save-name" />
        </>)}
      </View>
    </Sheet>
  );
}

export function SignIn() {
  const pendingCode = session.use((s) => s.pendingCode);
  const [peek, setPeek] = useState<PeekGame | null>(null);
  const [sheet, setSheet] = useState<null | 'phone' | 'link'>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    setPeek(null);
    if (pendingCode) backend.peekGame(pendingCode).then((p) => { if (live) setPeek(p); }).catch(() => {});
    return () => { live = false; };
  }, [pendingCode]);

  const done = () => { setSheet(null); router.replace('/'); };
  const social = async (which: 'google' | 'apple') => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await (which === 'google' ? backend.signInWithGoogle() : backend.signInWithApple());
      if (!r.ok) { toast(r.error); return; }
      await refreshUser();
      const u = session.get().user;
      if (!u) return;
      if (!u.phone) setSheet('link'); else done();   // README §3: after Google/Apple, ask for the mobile number once
    } catch { toast('Can’t reach Tambola right now — check your internet'); } finally { setBusy(false); }
  };

  return (
    <Screen glow={GLOW} px={24} top={44} max={520}>
      {!!peek && (
        <Pressable onPress={() => router.push(`/g/${peek.id}`)} accessibilityRole="button" accessibilityLabel={`${first(peek.hostName)} shared a link. Join ${peek.name}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 18, backgroundColor: C.cream, boxShadow: '0 12px 30px -12px rgba(0,0,0,0.6)' }}>
          <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: C.wa, alignItems: 'center', justifyContent: 'center' }}>
            <T mono size={12} color={C.white} ls={0}>LINK</T>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <T size={15} color={C.lightSub} numberOfLines={1}>{first(peek.hostName)} shared a link</T>
            <T w={800} size={16} color={C.ink} numberOfLines={1}>Join {peek.name}</T>
          </View>
        </Pressable>
      )}
      <View style={{ flex: 1, justifyContent: 'center', gap: 18, paddingVertical: 12 }}>
        <Logo size={72} />
        <T w={800} size={44} lh={1} ls={-0.9} accessibilityRole="header">Housie night, <T w={800} size={44} lh={1} ls={-0.9} color={C.mari}>sorted.</T></T>
        <T size={18} lh={1.35} color={C.muted}>Host or join a game with family and friends in seconds.</T>
      </View>
      <View style={{ gap: 10 }}>
        <Btn label="Continue with phone number" h={56} onPress={() => setSheet('phone')} testID="continue-phone" />
        <Btn label="Continue with Google" variant="cream" h={54} size={18} radius={16} lip={false} disabled={busy} left={<GoogleDot />} onPress={() => social('google')} />
        {(Platform.OS === 'ios' || Platform.OS === 'web') && (
          <Btn label="Continue with Apple" variant="black" h={54} size={18} radius={16} lip={false} disabled={busy} onPress={() => social('apple')} />
        )}
        <T size={15} color={C.muted} center style={{ paddingTop: 2 }}>We only use your name and number to find your friends</T>
      </View>
      <PhoneSheet open={sheet === 'phone'} onClose={() => setSheet(null)} onDone={done} />
      <PhoneSheet open={sheet === 'link'} onClose={done} onDone={done} skippable title="Add your mobile number" sub="So friends can find you from their contacts. We’ll text you a code." />
    </Screen>
  );
}
