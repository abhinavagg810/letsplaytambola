import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageShell } from '@/components/PageShell';
import { GamePage, GameSkeleton } from '@/features/game/GamePage';

const TITLE = 'Join the Tambola game';
const DESCRIPTION = 'You’re invited to a game of Tambola (Housie). Tap the link, type your name and you’re in — free, no sign-up, no download.';

/** The site's share picture (src/app/opengraph-image.png). */
const PREVIEW_IMAGE = { url: '/opengraph-image.png', width: 1200, height: 630, alt: 'Letsplaytambola — Housie night, sorted. Free, no sign-up, no download.' };

// Generic on purpose: the link preview never shows who is playing. Nothing about the game is read on the server here.
export async function generateMetadata({ params }: PageProps<'/g/[code]'>): Promise<Metadata> {
  const { code } = await params;
  const path = `/g/${encodeURIComponent(code.toUpperCase())}`;
  return {
    title: TITLE,
    description: DESCRIPTION,
    robots: { index: false, follow: false },
    // A page's openGraph/twitter REPLACE the site-wide ones (they are not merged), so the picture, site name and card
    // type are repeated here — without them the WhatsApp preview of an invite link has no image.
    openGraph: { type: 'website', siteName: 'Letsplaytambola', locale: 'en_IN', title: `${TITLE} — Letsplaytambola`, description: DESCRIPTION, url: path, images: [PREVIEW_IMAGE] },
    twitter: { card: 'summary_large_image', title: `${TITLE} — Letsplaytambola`, description: DESCRIPTION, images: [PREVIEW_IMAGE.url] },
  };
}

export default function GameRoute({ params }: PageProps<'/g/[code]'>) {
  return (
    <PageShell>
      <Suspense fallback={<GameSkeleton />}>{params.then(({ code }) => <GamePage code={code} />)}</Suspense>
    </PageShell>
  );
}
