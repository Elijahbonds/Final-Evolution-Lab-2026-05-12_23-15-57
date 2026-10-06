// CREATE HUB phase 4 (owner 2026-10-06: writing appears in BOTH a Knowledge Feed Community topic and a Story shelf; teens
// may read approved community writing): the "Community reads" shelf on /story. A server component: approved, public
// writing cards by adult creators (lane/soundtrack's publicCardWhere), credited, with a link to the creator's card when
// it is published. Renders nothing when there are none. The feed side is routed to lane/knowledge-feed.

import { prisma } from '@/lib/db';
import { publicCardWhere } from '@/lib/creator/creative-card-review';
import { cardSharePath } from '@/lib/creator/share-link';
import { READS_MAX, communityReads, type WritingRow } from '@/lib/create/cardBlocks';
import Link from 'next/link';

export async function CommunityReads() {
  let rows: WritingRow[] = [];
  try {
    rows = await prisma.creativeCard.findMany({
      where: { primary: 'writing', ...publicCardWhere() },
      orderBy: { createdAt: 'desc' }, take: READS_MAX,
      select: { id: true, title: true, art: true, createdAt: true, owner: { select: { name: true, creatorCards: { select: { slug: true, published: true }, take: 3 } } } },
    }) as unknown as WritingRow[];
  } catch { return null; }
  const items = communityReads(rows, (slug) => cardSharePath(slug));
  if (!items.length) return null;
  return (
    <section className="mx-auto w-full max-w-[900px] px-4 pb-24 pt-8" aria-labelledby="community-reads">
      <div className="flex items-baseline justify-between">
        <h2 id="community-reads" className="fel-heading text-xl font-bold text-white">Community reads</h2>
        <Link href="/create/writing" className="text-xs font-bold text-lime-300 hover:underline">Write one →</Link>
      </div>
      <p className="mt-1 text-xs text-white/40">Stories, captions and verses by FEL creators, reviewed by FEL.</p>
      <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {items.map((r) => (
          <li key={r.id} className="rounded-2xl border border-lime-400/15 bg-white/[0.03] p-4">
            <h3 className="text-base font-bold text-white">{r.title}</h3>
            <p className="mt-1 text-xs text-white/50">by {r.href ? <Link href={r.href} className="underline decoration-white/30 hover:text-white">{r.by}</Link> : r.by}</p>
            {r.more ? (
              <details className="mt-2 text-sm text-white/80">
                <summary className="cursor-pointer list-none whitespace-pre-line">{r.excerpt} <span className="text-lime-300">Read</span></summary>
                <p className="mt-2 whitespace-pre-line">{r.text}</p>
              </details>
            ) : <p className="mt-2 whitespace-pre-line text-sm text-white/80">{r.excerpt}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
