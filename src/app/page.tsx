import type { Metadata } from 'next';
import { JsonLd } from '@/features/website/guide/JsonLd';
import { Website } from '@/features/website/Website';
import { SITE_NAME, SITE_URL } from '@/lib/site';

// Title, description and social cards come from the root layout.
export const metadata: Metadata = { alternates: { canonical: '/' } };

/** `/` — the marketing home page. */
export default function HomePage() {
  return (
    <>
      <Website />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: SITE_NAME,
          url: `${SITE_URL}/`,
          description: 'Play Tambola (Housie) online with family and friends. Host a game, share one link on WhatsApp, and everyone plays by typing their name.',
          inLanguage: 'en-IN',
        }}
      />
    </>
  );
}
