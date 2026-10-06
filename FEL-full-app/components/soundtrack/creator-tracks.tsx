// CREATOR SOUNDTRACK piece L: the "Tracks" block on a creator's public card (/card/[slug]).
//
// A server component: the creator's approved, public music cards (the same public read every list uses, so a minor's
// tracks never show), with their play counts. Plays are engagement, labelled "plays", never a score or a rank (the
// walk-out's own rule, lib/babylon/music/WalkOut.ts). Renders nothing when there are none.

import { prisma } from '@/lib/db';
import { publicCardWhere, readPlays, readRotation } from '@/lib/creator/creative-card-review';
import { readMusicV2 } from '@/lib/soundtrack/musicPayload';
import { tracksBlock, type TrackRowLike } from '@/lib/soundtrack/tracksBlock';

export async function CreatorTracks({ ownerId, accent = '#00E5FF' }: { ownerId: string; accent?: string }) {
  let rows: TrackRowLike[] = [];
  try {
    rows = await prisma.creativeCard.findMany({
      where: { ownerId, primary: 'music', ...publicCardWhere() },
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: { id: true, title: true, art: true, stats: true },
    }) as unknown as TrackRowLike[];
  } catch { return null; }
  const items = tracksBlock(rows, { readMusic: readMusicV2, readPlays, readRotation });
  if (!items.length) return null;
  return (
    <section className="mt-8 w-full max-w-[520px]" aria-labelledby="creator-tracks">
      <h2 id="creator-tracks" className="fel-heading text-lg font-bold text-white">Tracks</h2>
      <ul className="mt-3 flex flex-col gap-2">
        {items.map((t) => (
          <li key={t.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
            <span aria-hidden className="text-lg" style={{ color: accent }}>♪</span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{t.title}</span>
            {t.inRotation && <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] uppercase text-white/70">in the FEL soundtrack</span>}
            {t.durationLabel && <span className="font-mono text-[11px] text-white/40">{t.durationLabel}</span>}
            <span className="font-mono text-[11px] text-white/60">{t.plays.toLocaleString()} {t.plays === 1 ? 'play' : 'plays'}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
