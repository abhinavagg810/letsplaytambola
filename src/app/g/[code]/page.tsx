import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageShell } from '@/components/PageShell';
import { GamePage, GameSkeleton } from '@/features/game/GamePage';

const TITLE = 'Join the Tambola game';
const DESCRIPTION = 'You’re invited to a game of Tambola (Housie). Tap the link, type your name and you’re in — free, no sign-up, no download.';

// Generic on purpose: the link preview never shows who is playing. Nothing about the game is read on the server here.
export async function generateMetadata({ params }: PageProps<'/g/[code]'>): Promise<Metadata> {
  const { code } = await params;
  const path = `/g/${encodeURIComponent(code.toUpperCase())}`;
  return {
    title: TITLE,
    description: DESCRIPTION,
    robots: { index: false, follow: false },
    openGraph: { title: `${TITLE} — Letsplaytambola`, description: DESCRIPTION, url: path },
    twitter: { title: `${TITLE} — Letsplaytambola`, description: DESCRIPTION },
  };
}

export default function GameRoute({ params }: PageProps<'/g/[code]'>) {
  return (
    <PageShell>
      <Suspense fallback={<GameSkeleton />}>{params.then(({ code }) => <GamePage code={code} />)}</Suspense>
    </PageShell>
  );
}
