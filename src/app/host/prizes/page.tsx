import type { Metadata } from 'next';
import { PageShell } from '@/components/PageShell';
import { WaysToWin } from '@/features/host/WaysToWin';

export const metadata: Metadata = {
  title: 'Ways to win',
  description: 'Choose how people can win your Tambola game: lines, corners, Full House and 20 more patterns.',
  robots: { index: false },
};

export default function HostPrizesPage() {
  return (
    <PageShell>
      <WaysToWin />
    </PageShell>
  );
}
