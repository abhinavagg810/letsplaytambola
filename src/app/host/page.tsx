import type { Metadata } from 'next';
import { AdSlot } from '@/components/AdSlot';
import { PageShell } from '@/components/PageShell';
import { HostSetup } from '@/features/host/HostSetup';

export const metadata: Metadata = {
  title: 'Host a game',
  description: 'Host a Tambola (Housie) game in a minute: type your name, pick the ways to win and share one link on WhatsApp. Free, no sign-up for you or your players.',
  alternates: { canonical: '/host' },
};

export default function HostPage() {
  return (
    <PageShell>
      <HostSetup />
      {/* Below the form, with a clear gap from the Create button so nobody taps the ad by accident. */}
      <AdSlot placement="host" narrow gapTop />
    </PageShell>
  );
}
