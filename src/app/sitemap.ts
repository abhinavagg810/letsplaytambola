import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/host`, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE_URL}/join`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/how-to-play`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/ways-to-win`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE_URL}/tambola-number-calls`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE_URL}/about`, changeFrequency: 'yearly', priority: 0.5 },
    { url: `${SITE_URL}/contact`, changeFrequency: 'yearly', priority: 0.5 },
    { url: `${SITE_URL}/privacy`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE_URL}/terms`, changeFrequency: 'yearly', priority: 0.2 },
  ];
}
