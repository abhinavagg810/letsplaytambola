import type { Metadata } from 'next';
import { PageShell } from '@/components/PageShell';
import { JoinByCode } from '@/features/join/JoinByCode';

export const metadata: Metadata = {
  title: 'Join a game',
  description: 'Got a Tambola game code? Type the 5-letter code from your host, then your name — and you’re in. No sign-up, no download.',
  alternates: { canonical: '/join' },
};

export default function JoinPage() {
  return (
    <PageShell>
      <JoinByCode />
    </PageShell>
  );
}
