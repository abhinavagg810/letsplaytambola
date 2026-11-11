import React, { useRef } from 'react';
import { Redirect } from 'expo-router';
import { useUser } from '@/state/session';
import { SignIn } from '@/features/auth/SignIn';

/**
 * Already signed in when the screen opens → go on. (Not re-checked later: the sheet may still be asking for a name.)
 * Guests are let through: this is where "Save your account" on the results screen sends them.
 */
export default function SignInRoute() {
  const user = useUser();
  const wasIn = useRef(!!user && !user.isGuest);
  if (wasIn.current) return <Redirect href="/" />;
  return <SignIn />;
}
