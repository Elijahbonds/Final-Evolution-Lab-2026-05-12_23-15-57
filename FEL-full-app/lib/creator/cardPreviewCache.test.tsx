// CARD-SAFE-1: a public card's link preview is never cached. next/og (Next 14.2) defaults every ImageResponse to
// `public, immutable, no-transform, max-age=31536000` outside development, so without an explicit lower-case
// `cache-control` a CDN could keep an unpublished card's preview for a year. Found by lane/progress-card.
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ prisma: {} }));
vi.mock('@/lib/creator/card-service', () => ({
  getPublicCard: vi.fn(async () => ({ name: 'Test', rarity: 'rare', accent: '#22d3ee', prq: 60, topScore: 1200, wins: 3 })),
}));

import Image from '@/app/card/[slug]/opengraph-image';

describe('creator card preview: no CDN cache in production', () => {
  it('a public card answers no-store, never the next/og year-long default', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    try {
      const res = (await Image({ params: { slug: 'test' } })) as Response;
      expect(res.headers.get('cache-control')).toBe('no-store');
      await res.body?.cancel();
    } finally { vi.unstubAllEnvs(); }
  });
});
