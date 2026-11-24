import type { Metadata } from 'next';
import { SITE_NAME } from '@/lib/site';

const ALT = 'Letsplaytambola — Housie night, sorted. Free, no sign-up, no download.';
/** The root's share images (src/app/opengraph-image.png, twitter-image.png). Named here because a page that sets its own
 *  `openGraph` / `twitter` no longer inherits the file-based ones. */
const OG_IMAGE = { url: '/opengraph-image.png', width: 1200, height: 630, alt: ALT, type: 'image/png' };
const TWITTER_IMAGE = { url: '/twitter-image.png', width: 1200, height: 630, alt: ALT, type: 'image/png' };

/**
 * Metadata of a content page: title (the root layout adds "— Letsplaytambola"), description, canonical, Open Graph and
 * the Twitter card — set in full because a page's `openGraph` replaces the layout's.
 */
export function pageMetadata({ path, title, description }: { path: string; title: string; description: string }): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type: 'website', siteName: SITE_NAME, locale: 'en_IN', url: path, title: `${title} — ${SITE_NAME}`, description, images: [OG_IMAGE] },
    twitter: { card: 'summary_large_image', title: `${title} — ${SITE_NAME}`, description, images: [TWITTER_IMAGE] },
  };
}
