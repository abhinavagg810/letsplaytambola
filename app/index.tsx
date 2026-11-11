import React from 'react';
import { Redirect } from 'expo-router';
import { needsUsername, session } from '@/state/session';

/** Entry: route by sign-in state. An invite link opened while signed out wins once the user is in. */
export default function Index() {
  const { user, pendingCode } = session.use();
  if (!user) return <Redirect href="/sign-in" />;
  if (needsUsername(user)) return <Redirect href="/username" />;
  if (pendingCode) return <Redirect href={`/g/${pendingCode}`} />;
  return <Redirect href="/(tabs)" />;
}
