import React, { useEffect } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { Baloo2_500Medium, Baloo2_600SemiBold, Baloo2_800ExtraBold } from '@expo-google-fonts/baloo-2';
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import { C } from '@/theme/tokens';
import { ToastHost } from '@/ui';
import { initSession, session } from '@/state/session';

export default function RootLayout() {
  const [fontsReady] = useFonts({ Baloo2_500Medium, Baloo2_600SemiBold, Baloo2_800ExtraBold, JetBrainsMono_500Medium });
  const ready = session.use((s) => s.ready);
  useEffect(() => { initSession(); }, []);
  if (!fontsReady || !ready) return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg }, animation: 'fade' }} />
        <ToastHost />
      </View>
    </SafeAreaProvider>
  );
}
