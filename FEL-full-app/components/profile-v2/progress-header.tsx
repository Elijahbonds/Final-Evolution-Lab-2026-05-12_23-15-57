// THE TOP OF THE PROFILE (owner 2026-10-24: "lead with progress"): the athlete, the PRQ grade, and this week's real
// numbers — jump, form, reaction, streak — each against last week. A number nobody measured is a dash and a way to get
// it, never a placeholder value (lib/profile-v2/tiles.ts).
import Link from 'next/link';
import type { ProfileV2Data } from '@/lib/profile-v2/assemble';
import { AthleteStage } from './athlete-stage';
import { DeviceFormTile } from './device-form-tile';
import { TileView } from './tile';

const ACCENT: Record<string, string> = { jump: '#00E5FF', form: '#00FF9D', reaction: '#FFD700', streak: '#FF7A2F' };

export function ProgressHeader({ data, viewer = false }: { data: ProfileV2Data; viewer?: boolean }) {
  const { identity, prq } = data;
  return (
    <section aria-label="Progress" className={`grid gap-3 lg:gap-5 ${viewer ? '' : 'lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]'}`}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 lg:grid-cols-1">
        {/* 3D shows the SIGNED-IN player's own body (resolveIdentity), so another person's profile gets the poster only */}
        <AthleteStage avatarKey={identity.avatarKey} cosmeticAssetId={identity.cosmeticAssetId} name={identity.name} accent={prq.color} allow3d={!viewer} />
        <div className="flex w-[128px] flex-col justify-between rounded-2xl border border-white/[0.07] bg-[#0c0c11] p-3.5 lg:w-auto lg:flex-row lg:items-end">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">PRQ grade</p>
            <p className="fel-heading mt-1 text-[40px] font-black leading-none tabular-nums" style={{ color: prq.color }}>{prq.score === null ? '—' : Math.round(prq.score)}</p>
            <p className="mt-1 font-mono text-[10.5px] font-bold uppercase tracking-[0.12em]" style={{ color: prq.color }}>{prq.status}</p>
          </div>
          <p className="mt-2 text-[11px] leading-snug text-white/45">
            {prq.measured === 0 ? 'Nothing measured yet' : `${prq.measured} of ${prq.total} skills measured`}
            {identity.level && <span className="block font-mono text-[10.5px] text-[#00FF9D]/80">Level {identity.level.level}</span>}
          </p>
        </div>
      </div>
      {!viewer && <div>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 id="week-h" className="fel-heading text-[16px] font-bold text-white">This week</h2>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/35">Last 7 days vs the 7 before</p>
        </div>
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 lg:grid-cols-2">
          {data.tiles.map((t) => (t.key === 'form' && t.source === 'device'
            ? <DeviceFormTile key={t.key} fallback={t} accent={ACCENT[t.key]} />
            : <TileView key={t.key} tile={t} accent={ACCENT[t.key]} />))}
        </div>
        {/* PROGRESS CARD (value round item 1): the week as a card, with a share image */}
        <Link href="/profile/week" data-testid="profile-week-card" className="mt-2.5 inline-flex min-h-11 items-center text-[12px] font-bold text-[#00E5FF] underline-offset-2 hover:underline">Your weekly card, and an image to share →</Link>
      </div>}
    </section>
  );
}
