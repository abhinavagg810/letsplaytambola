import React from 'react';
import { LegalPage } from '@/features/legal/LegalPage';
import { TERMS } from '@/features/legal/terms';

/** Public: readable signed-out. */
export default function TermsRoute() {
  return <LegalPage doc={TERMS} />;
}
