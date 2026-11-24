import type { Metadata } from 'next';
import { About } from '@/features/website/guide/About';
import { pageMetadata } from '@/features/website/guide/meta';

export const metadata: Metadata = pageMetadata({
  path: '/about',
  title: 'About us',
  description: 'Letsplaytambola is a free website for playing Tambola (Housie) with family and friends — no sign-up, one WhatsApp link, a caller voice and fair claim checks. Made by the Letsplaytambola team in Delhi, India.',
});

/** `/about` — who runs the site and why. */
export default function AboutPage() {
  return <About />;
}
