import React, { useEffect } from 'react';
import { View } from 'react-native';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { Baloo2_500Medium, Baloo2_600SemiBold, Baloo2_800ExtraBold } from '@expo-google-fonts/baloo-2';
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import { C } from '@/theme/tokens';
import { Btn, T, ToastHost } from '@/ui';
import { initSession, session } from '@/state/session';

/** Friendly fallback for a render crash — never a blank screen. "Try again" renders the route afresh. */
function Crashed({ onRetry }: { onRetry: () => void }) {
  return (
    <View accessibilityRole="alert" style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 }}>
      <T w={800} size={30} center accessibilityRole="header">Something went wrong</T>
      <T size={17} color={C.muted} center lh={1.4} style={{ maxWidth: 360 }}>Sorry about that. Your game is safe — tap below to pick up where you were.</T>
      <Btn label="Try again" h={54} px={32} onPress={onRetry} testID="error-retry" />
    </View>
  );
}

/** Catches render errors anywhere below the root layout. */
class CrashGuard extends React.Component<{ children: React.ReactNode }, { failed: boolean; attempt: number }> {
  state = { failed: false, attempt: 0 };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.warn('Screen crashed:', error); }
  retry = () => this.setState((s) => ({ failed: false, attempt: s.attempt + 1 }));
  render() {
    if (this.state.failed) return <Crashed onRetry={this.retry} />;
    // A new key remounts the navigator, so the current route loads from scratch.
    return <React.Fragment key={this.state.attempt}>{this.props.children}</React.Fragment>;
  }
}

/** Expo Router uses this if the root layout itself throws. */
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return <Crashed onRetry={() => { void retry(); }} />;
}

export default function RootLayout() {
  const [fontsReady] = useFonts({ Baloo2_500Medium, Baloo2_600SemiBold, Baloo2_800ExtraBold, JetBrainsMono_500Medium });
  const ready = session.use((s) => s.ready);
  useEffect(() => { initSession(); }, []);
  if (!fontsReady || !ready) return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <CrashGuard>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg }, animation: 'fade' }} />
        </CrashGuard>
        <ToastHost />
      </View>
    </SafeAreaProvider>
  );
}
