import type { MetadataRoute } from 'next';
import { SITE_ORIGIN } from '@/lib/seo/publicPages';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/session',
        '/program',
        '/account',
        '/coach/admin',
        '/coach/join',
        '/coach/dashboard',
        '/coach/receipt',
        '/coach/thanks',
        '/coach/review',
      ],
    },
    // Owner, 2026-10-16: the sitemap is filled (app/sitemap.ts); tell the crawlers where it is.
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  };
}
