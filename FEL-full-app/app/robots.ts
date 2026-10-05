import type { MetadataRoute } from 'next';

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
  };
}
