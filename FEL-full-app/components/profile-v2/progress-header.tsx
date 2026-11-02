// THE TOP OF THE PROFILE (owner 2026-10-24: "lead with progress"): the athlete, the PRQ grade, and this week's real
// numbers — jump, form, reaction, streak — each against last week. A number nobody measured is a dash and a way to get
// it, never a placeholder value (lib/profile-v2/tiles.ts).
import type { ProfileV2Data } from '@/lib/profile-v2/assemble';
import { AthleteStage } from './athlete-stage';
import type { PosterKey } from '@/lib/profile-v2/athletePoster';
import { DeviceFormTile } from './device-form-tile';
import { TileView } from './tile';
import { StatRing } from '@/components/ui/fel/stat-ring';
import { TYPE } from '@/lib/design/type';

const ACCENT: Record<string, string> = { jump: '#00E5FF', form: '#00FF9D', reaction: '#FFD700', streak: '#FF7A2F' };

export function ProgressHeader({ data, viewer = false, poster = null }: { data: ProfileV2Data; viewer?: boolean; poster?: PosterKey | null }) {
  const { identity, prq } = data;
  return (
    <section aria-label="Progress" className={`grid gap-3 lg:gap-5 ${viewer ? '' : 'lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]'}`}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 lg:grid-cols-1">
        {/* PROFILE-CHARACTER: your own athlete, by itself (the kept picture, then the live 3D). The 3D draws the SIGNED-IN
            player's own body (resolveIdentity), so another person's profile gets the athlete's silhouette */}
        <AthleteStage name={identity.name} accent={prq.color} viewer={viewer} poster={viewer ? null : poster} />
        {/* PRQ as a ring (premium-ui P4, the Whoop read): how full at a glance, the grade's band colour, the status under the
            number; nothing measured is an empty track and a dash, never a number. */}
        <div className="fel-surface flex w-[150px] flex-col items-center justify-center gap-2 p-4 text-center lg:w-auto lg:flex-row lg:justify-start lg:gap-5 lg:p-5 lg:text-left">
          <StatRing value={prq.score} label="PRQ grade" sub={prq.status} color={prq.color} size={112} />
          <div className="flex flex-col gap-1">
            <p className={`${TYPE.label} hidden text-fel-dim lg:block`}>PRQ grade</p>
            <p className={`${TYPE.small} text-fel-dim`}>{prq.measured === 0 ? 'Nothing measured yet' : `${prq.measured} of ${prq.total} skills measured`}</p>
            {identity.level && <p className={`${TYPE.label} text-fel-emerald`}>Level {identity.level.level}</p>}
          </div>
        </div>
      </div>
      {!viewer && <div>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 id="week-h" className={`${TYPE.heading} text-white`}>This week</h2>
          <p className="font-sans text-[12px] uppercase tracking-[0.14em] text-fel-quiet">Last 7 days vs the 7 before</p>
        </div>
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 lg:grid-cols-2">
          {data.tiles.map((t) => (t.key === 'form' && t.source === 'device'
            ? <DeviceFormTile key={t.key} fallback={t} accent={ACCENT[t.key]} />
            : <TileView key={t.key} tile={t} accent={ACCENT[t.key]} />))}
        </div>
        {/* PROGRESS CARD (value round item 1): the week as a card — now the Profile tab's ONE primary, docked (app/profile/page.tsx) */}
      </div>}
    </section>
  );
}
