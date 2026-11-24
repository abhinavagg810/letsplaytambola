import type { Metadata } from 'next';
import { WaysToWinGuide } from '@/features/website/guide/WaysToWinGuide';
import { pageMetadata } from '@/features/website/guide/meta';

export const metadata: Metadata = pageMetadata({
  path: '/ways-to-win',
  title: 'All 26 ways to win in Tambola',
  description: 'Every Tambola (Housie) prize pattern with a picture: Early Five, Laddoo, Top Line, Four Corners, Star, Pyramid, Breakfast-Lunch-Dinner, Devrani-Jethani, Full House and more.',
});

/** `/ways-to-win` — the 26 patterns, from src/core/data.ts, each with a mini ticket. */
export default function WaysToWinPage() {
  return <WaysToWinGuide />;
}
