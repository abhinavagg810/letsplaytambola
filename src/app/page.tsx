import type { Metadata } from 'next';
import { Website } from '@/features/website/Website';

// Title, description and social cards come from the root layout.
export const metadata: Metadata = { alternates: { canonical: '/' } };

/** `/` — the marketing home page. */
export default function HomePage() {
  return <Website />;
}
