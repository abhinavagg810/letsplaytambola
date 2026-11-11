import React from 'react';
import { Redirect } from 'expo-router';
import { Prizes } from '@/features/create/Prizes';
import { needsUsername, useUser } from '@/state/session';

export default function PrizesRoute() {
  const user = useUser();
  if (!user) return <Redirect href="/sign-in" />;
  if (needsUsername(user)) return <Redirect href="/username" />;
  return <Prizes />;
}
