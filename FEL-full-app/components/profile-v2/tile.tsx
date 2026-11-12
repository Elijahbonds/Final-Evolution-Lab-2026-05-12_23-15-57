// One "this week" number (PROFILE V2). Server-safe (no hooks), so the server header and the phone-only client island
// draw the same tile.
import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import type { ProgressTile } from '@/lib/profile-v2/assemble';
import { COLOR } from '@/lib/design/tokens';
import { NUM, TYPE } from '@/lib/design/type';

const TONE = { better: '#00FF9D', worse: '#FF7A2F', same: '#8b97a5' } as const;
const SOURCE: Record<string, string> = { account: 'Saved to your account', device: 'On this phone only', profile: '' };

export function TileView({ tile, accent }: { tile: ProgressTile; accent: string }) {
  const trend = tile.compare?.trend ?? null;
  const Arrow = tile.compare?.direction === 'up' ? ArrowUpRight : tile.compare?.direction === 'down' ? ArrowDownRight : Minus;
  return (
    <div data-tile={tile.key} className="fel-surface flex min-h-[124px] flex-col p-4 lg:min-h-[172px]">
      <p className={`${TYPE.label} text-fel-dim`}><span aria-hidden className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: accent }} />{tile.label}</p>
      {tile.value !== null ? (
        <>
          <p className="mt-1.5 flex items-baseline gap-1.5">
            <span className={`${NUM} text-[30px] leading-none text-white`}>{tile.value}</span>
            <span className={`${TYPE.small} text-fel-dim`}>{tile.unit}</span>
          </p>
          {tile.vsLine && (
            <p className={`${TYPE.small} mt-auto flex items-start gap-1 pt-2`} style={{ color: trend ? TONE[trend] : COLOR.textDim }}>
              {trend && <Arrow aria-hidden className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={2.4} />}
              <span>{tile.vsLine}</span>
            </p>
          )}
          {tile.source && SOURCE[tile.source] && <p className={`${TYPE.label} pt-1 normal-case tracking-normal text-fel-quiet`}>{SOURCE[tile.source]}</p>}
        </>
      ) : (
        <>
          <p className={`${NUM} mt-1.5 text-[30px] leading-none text-fel-quiet`} aria-label="not measured">—</p>
          <p className={`${TYPE.small} mt-2 text-fel-dim`}>{tile.empty?.text}</p>
          {tile.empty?.href && tile.empty.cta && (
            <Link href={tile.empty.href} className={`${TYPE.small} mt-auto inline-flex min-h-11 items-end pt-2 font-semibold text-fel-cyan underline-offset-2 hover:underline`}>
              {tile.empty.cta} →
            </Link>
          )}
        </>
      )}
    </div>
  );
}
