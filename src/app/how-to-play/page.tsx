import type { Metadata } from 'next';
import { HowToPlay } from '@/features/website/guide/HowToPlay';
import { pageMetadata } from '@/features/website/guide/meta';

export const metadata: Metadata = pageMetadata({
  path: '/how-to-play',
  title: 'How to play Tambola (Housie)',
  description: 'A simple guide to Tambola (Housie): the 15-number ticket, how numbers are called, dabbing, claiming prizes, house rules, and how to host a free game for family or kitty party over WhatsApp.',
});

/** `/how-to-play` — the beginner's and host's guide. */
export default function HowToPlayPage() {
  return <HowToPlay />;
}
