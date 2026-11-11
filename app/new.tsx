import React from 'react';
import { Redirect } from 'expo-router';
import { NewGame } from '@/features/create/NewGame';
import { needsUsername, useUser } from '@/state/session';

export default function NewRoute() {
  const user = useUser();
  if (!user) return <Redirect href="/sign-in" />;
  if (needsUsername(user)) return <Redirect href="/username" />;
  return <NewGame />;
}
