import React from 'react';
import { Redirect } from 'expo-router';
import { useUser } from '@/state/session';
import { Username } from '@/features/auth/Username';

export default function UsernameRoute() {
  const user = useUser();
  if (!user) return <Redirect href="/sign-in" />;
  return <Username user={user} />;
}
