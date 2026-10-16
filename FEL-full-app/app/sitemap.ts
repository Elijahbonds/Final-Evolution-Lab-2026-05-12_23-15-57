import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/db';
import { isCoachStoreEnabled } from '@/lib/flags';
import { isMissingTable } from '@/lib/coach-store/gate';
import { SITE_ORIGIN, publicPaths } from '@/lib/seo/publicPages';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // The public pages are listed whatever the coach-store flag says (owner, 2026-10-16). Before this the whole sitemap was
  // empty while the flag was off, which is how it ships.
  const out: MetadataRoute.Sitemap = publicPaths().map((path) => ({ url: `${SITE_ORIGIN}${path}` }));
  // The coach-store pages stay behind the flag, as before.
  if (!isCoachStoreEnabled()) return out;
  const base = SITE_ORIGIN;
  try {
    const rows = await prisma.instructor.findMany({ where: { published: true }, select: { slug: true } });
    for (const row of rows) {
      out.push({ url: `${base}/coach/${row.slug}` });
      for (const lane of ['dunking', 'correctives', 'posture']) {
        out.push({ url: `${base}/coach/${row.slug}/programs/${lane}` });
      }
    }
    return out;
  } catch (err) {
    // No coach table yet (or no database): the public pages still list.
    if (isMissingTable(err)) return out;
    return out;
  }
}
