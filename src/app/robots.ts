import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://letsplaytambola.com';

export default function robots(): MetadataRoute.Robots {
  return {
    // Game pages are private to the people who have the link; the API is not for crawlers.
    rules: [{ userAgent: '*', allow: '/', disallow: ['/g/', '/api/'] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
