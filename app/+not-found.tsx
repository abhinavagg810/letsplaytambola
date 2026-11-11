import React from 'react';
import { router } from 'expo-router';
import { Btn, Screen, T } from '@/ui';
import { C } from '@/theme/tokens';

export default function NotFound() {
  return (
    <Screen style={{ justifyContent: 'center', alignItems: 'center' }}>
      <T w={800} size={34} center>We couldn’t find that page</T>
      <T color={C.muted} center>The link may be old or mistyped.</T>
      <Btn label="Go home" h={50} onPress={() => router.replace('/')} />
    </Screen>
  );
}
