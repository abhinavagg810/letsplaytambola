import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Letsplaytambola',
    short_name: 'Tambola',
    description: 'Play Tambola (Housie) with family and friends. Free, no sign-up.',
    start_url: '/',
    display: 'standalone',
    background_color: '#1b0f34',
    theme_color: '#1b0f34',
    lang: 'en-IN',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
