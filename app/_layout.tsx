import React, { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { Stack, router, usePathname, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { Baloo2_500Medium, Baloo2_600SemiBold, Baloo2_800ExtraBold } from '@expo-google-fonts/baloo-2';
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import { C } from '@/theme/tokens';
import { Btn, T, ToastHost, toast } from '@/ui';
import { initSession, session } from '@/state/session';
import { checkInstallReferrer } from '@/lib/install';

/** On web each screen's code is fetched the first time it is opened — with no connection that fetch is what fails. */
const codeDidNotLoad = (error: unknown) =>
  /AsyncRequire|Loading (module|chunk)|Failed to fetch|NetworkError/i.test(`${(error as Error)?.name ?? ''} ${(error as Error)?.message ?? ''}`);
const browserOffline = () => Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.onLine === false;
const looksOffline = (error: unknown) => codeDidNotLoad(error) || browserOffline();

/** Friendly fallback for a render crash — never a blank screen. "Try again" renders the route afresh. */
function Crashed({ error, onRetry }: { error?: unknown; onRetry: () => void }) {
  const offline = looksOffline(error);
  return (
    <View accessibilityRole="alert" style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 }}>
      <T w={800} size={30} center accessibilityRole="header">{offline ? 'You’re offline' : 'Something went wrong'}</T>
      <T size={17} color={C.muted} center lh={1.4} style={{ maxWidth: 360 }}>
        {offline ? 'Can’t reach Tambola right now — check your internet, then try again.' : 'Sorry about that. Your game is safe — tap below to pick up where you were.'}
      </T>
      <Btn label="Try again" h={54} px={32} onPress={onRetry} testID="error-retry" />
    </View>
  );
}

/**
 * Catches render errors anywhere below the root layout. "Try again" remounts the navigator (a fresh start for
 * whatever state broke) and then goes back to the route the person was on.
 */
class CrashGuard extends React.Component<{ path: string; children: React.ReactNode }, { failed: boolean; error: unknown; attempt: number }> {
  state = { failed: false, error: null as unknown, attempt: 0 };
  static getDerivedStateFromError(error: unknown) { return { failed: true, error }; }
  componentDidCatch(error: unknown) { console.warn('Screen crashed:', error); }
  /** Where the person was when things were last fine (the path resets once the broken navigator is taken down). */
  lastPath = this.props.path;
  retry = () => {
    const path = this.lastPath;
    if (Platform.OS === 'web' && codeDidNotLoad(this.state.error)) {
      // A failed download of a screen's code is remembered by the bundler, so only a real page load can retry it.
      if (browserOffline()) toast('Still offline — check your internet');
      else window.location.assign(path);
      return;
    }
    this.setState((s) => ({ failed: false, error: null, attempt: s.attempt + 1 }), () => {
      // The remounted navigator starts at the entry route; put the person back where they were.
      setTimeout(() => { try { router.replace(path as never); } catch { /* the entry route is a fine fallback */ } }, 0);
    });
  };
  render() {
    if (this.state.failed) return <Crashed error={this.state.error} onRetry={this.retry} />;
    this.lastPath = this.props.path;
    return <React.Fragment key={this.state.attempt}>{this.props.children}</React.Fragment>;
  }
}

/** Expo Router uses this if the root layout itself throws. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <Crashed error={error} onRetry={() => { void retry(); }} />;
}

export default function RootLayout() {
  const [fontsReady] = useFonts({ Baloo2_500Medium, Baloo2_600SemiBold, Baloo2_800ExtraBold, JetBrainsMono_500Medium });
  const ready = session.use((s) => s.ready);
  const path = usePathname();
  useEffect(() => { initSession(); }, []);
  // Installed from an invite link (Android): open straight into that game.
  useEffect(() => { if (fontsReady && ready) checkInstallReferrer().then((c) => { if (c) router.replace(`/g/${c}`); }); }, [fontsReady, ready]);
  if (!fontsReady || !ready) return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <CrashGuard path={path}>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg }, animation: 'fade' }} />
        </CrashGuard>
        <ToastHost />
      </View>
    </SafeAreaProvider>
  );
}
