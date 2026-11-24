import type { Metadata } from 'next';
import { NumberCalls } from '@/features/website/guide/NumberCalls';
import { pageMetadata } from '@/features/website/guide/meta';

export const metadata: Metadata = pageMetadata({
  path: '/tambola-number-calls',
  title: 'All 90 Tambola number calls',
  description: 'The full list of Tambola (Housie) number calls from 1 to 90 — Kelly’s eye, Two fat ladies, Quit India movement, Gandhi’s breakfast and more — with how each number is read out. Printable.',
});

/** `/tambola-number-calls` — CALLOUTS from src/core/data.ts, grouped by tens, printable. */
export default function NumberCallsPage() {
  return <NumberCalls />;
}
