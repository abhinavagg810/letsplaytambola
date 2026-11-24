import type { Metadata } from 'next';
import { Contact } from '@/features/website/guide/Contact';
import { pageMetadata } from '@/features/website/guide/meta';

export const metadata: Metadata = pageMetadata({
  path: '/contact',
  title: 'Contact us',
  description: 'Write to the Letsplaytambola team in Delhi, India: help with a game, feedback and ideas, removing your data, or business enquiries. We try to reply within a few days.',
});

/** `/contact` — email, what to write about, and the message form (POST /api/contact). */
export default function ContactPage() {
  return <Contact />;
}
