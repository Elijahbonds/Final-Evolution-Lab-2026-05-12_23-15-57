// One "this week" number (PROFILE V2). Server-safe (no hooks), so the server header and the phone-only client island
// draw the same tile.
import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import type { ProgressTile } from '@/lib/profile-v2/assemble';
import { COLOR } from '@/lib/design/tokens';

const TONE = { better: '#00FF9D', worse: '#FF7A2F', same: '#8b97a5' } as const;
const SOURCE: Record<string, string> = { account: 'Saved to your account', device: 'On this phone only', profile: '' };

export function TileView({ tile, accent }: { tile: ProgressTile; accent: string }) {
  const trend = tile.compare?.trend ?? null;
  const Arrow = tile.compare?.direction === 'up' ? ArrowUpRight : tile.compare?.direction === 'down' ? ArrowDownRight : Minus;
  return (
    <div data-tile={tile.key} className="flex min-h-[124px] flex-col lg:min-h-[172px] rounded-2xl border border-white/[0.07] bg-[#0c0c11] p-3.5">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: accent }}>{tile.label}</p>
      {tile.value !== null ? (
        <>
          <p className="mt-1.5 flex items-baseline gap-1.5">
            <span className="fel-heading text-[30px] font-black leading-none text-white tabular-nums">{tile.value}</span>
            <span className="text-[11px] font-semibold text-fel-dim">{tile.unit}</span>
          </p>
          {tile.vsLine && (
            <p className="mt-auto flex items-start gap-1 pt-2 text-[11.5px] leading-snug" style={{ color: trend ? TONE[trend] : COLOR.textDim }}>
              {trend && <Arrow aria-hidden className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={2.4} />}
              <span>{tile.vsLine}</span>
            </p>
          )}
          {tile.source && SOURCE[tile.source] && <p className="pt-1 text-[10px] text-fel-quiet">{SOURCE[tile.source]}</p>}
        </>
      ) : (
        <>
          <p className="mt-1.5 fel-heading text-[22px] font-black leading-none text-fel-quiet" aria-label="not measured">—</p>
          <p className="mt-2 text-[11.5px] leading-snug text-white/50">{tile.empty?.text}</p>
          {tile.empty?.href && tile.empty.cta && (
            <Link href={tile.empty.href} className="mt-auto pt-2 text-[11.5px] font-bold underline-offset-2 hover:underline" style={{ color: accent }}>
              {tile.empty.cta} →
            </Link>
          )}
        </>
      )}
    </div>
  );
}
