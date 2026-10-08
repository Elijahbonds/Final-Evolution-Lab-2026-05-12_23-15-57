// CREATE HUB phase 4: the "Signature moves" block on a creator's public card (/card/[slug]). A server component: the
// creator's approved, public sport cards (lane/soundtrack's publicCardWhere, so a minor's never show), each with the run
// it came from. Renders nothing when there are none. The sibling "Tracks" block is lane/soundtrack's CreatorTracks.

import { prisma } from '@/lib/db';
import { publicCardWhere } from '@/lib/creator/creative-card-review';
import { MOVES_MAX, runIdsOf, signatureMovesBlock, type RunRow, type SportRow } from '@/lib/create/cardBlocks';

export async function SignatureMoves({ ownerId, accent = '#00E5FF' }: { ownerId: string; accent?: string }) {
  let rows: SportRow[] = [];
  let runs: RunRow[] = [];
  try {
    rows = await prisma.creativeCard.findMany({
      where: { ownerId, primary: 'sport', ...publicCardWhere() },
      orderBy: { createdAt: 'desc' }, take: MOVES_MAX,
      select: { id: true, title: true, art: true, createdAt: true },
    }) as unknown as SportRow[];
    const ids = runIdsOf(rows);
    if (ids.length) {
      const [sessions, sigs] = await Promise.all([
        prisma.gameSession.findMany({ where: { id: { in: ids }, userId: ownerId }, select: { id: true, mode: true, score: true, won: true } }),
        prisma.signatureAttempt.findMany({ where: { id: { in: ids }, userId: ownerId }, select: { id: true, mode: true, score: true } }),
      ]);
      runs = [...sessions, ...sigs];
    }
  } catch { return null; }
  const items = signatureMovesBlock(rows, runs);
  if (!items.length) return null;
  return (
    <section className="mt-8 w-full max-w-[520px]" aria-labelledby="signature-moves">
      <h2 id="signature-moves" className="fel-heading text-lg font-bold text-white">Signature moves</h2>
      <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {items.map((m) => (
          <li key={m.id} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
            <p className="truncate text-sm font-semibold text-white"><span aria-hidden style={{ color: accent }}>◆ </span>{m.name}</p>
            {m.detail && <p className="truncate font-mono text-[11px] text-white/50">{m.detail}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
