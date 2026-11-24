import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    // Game pages are private to the people who have the link; the API and the operator's admin area are not for crawlers.
    rules: [{ userAgent: '*', allow: '/', disallow: ['/g/', '/api/', '/admin'] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
