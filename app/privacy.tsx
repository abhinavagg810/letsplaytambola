import React from 'react';
import { LegalPage } from '@/features/legal/LegalPage';
import { PRIVACY } from '@/features/legal/privacy';

/** Public: readable signed-out. This is the privacy-policy URL given to the app stores. */
export default function PrivacyRoute() {
  return <LegalPage doc={PRIVACY} />;
}
