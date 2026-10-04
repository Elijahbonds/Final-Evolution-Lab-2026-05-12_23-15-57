import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/db';
import { isCoachStoreEnabled } from '@/lib/flags';
import { isMissingTable } from '@/lib/coach-store/gate';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!isCoachStoreEnabled()) return [];
  const base = 'https://go.finalevolutiongroup.com';
  try {
    const rows = await prisma.instructor.findMany({ where: { published: true }, select: { slug: true } });
    const out: MetadataRoute.Sitemap = [];
    for (const row of rows) {
      out.push({ url: `${base}/coach/${row.slug}` });
      for (const lane of ['dunking', 'correctives', 'posture']) {
        out.push({ url: `${base}/coach/${row.slug}/programs/${lane}` });
      }
    }
    return out;
  } catch (err) {
    if (isMissingTable(err)) return [];
    return [];
  }
}
