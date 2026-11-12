// STATS AND PERSONAL BESTS (PROFILE V2): per-mode bests with an eight-week line, the measured jump and form lines, and
// the measured skills behind the PRQ, each with where it came from.
import Link from 'next/link';
import type { ProfileV2Data } from '@/lib/profile-v2/assemble';
import { JUMP_CHECK_HREF } from '@/lib/profile-v2/tiles';
import { JUMP_CHECK } from '@/lib/vertical/copy';   // VERTICAL-EASY: one name for the hands-on-hips jump check
import { Section, Card } from './section';
import { Sparkline } from './sparkline';
import { DeviceBests } from './device-bests';

const SOURCE_LABEL: Record<string, string> = { drillResult: 'From games', device: 'Device', manual: 'You logged it', camera: 'Camera estimate' };

export function StatsSection({ data, viewer = false }: { data: ProfileV2Data; viewer?: boolean }) {
  const { stats } = data;
  const lines = [
    stats.jumpWeeks && { key: 'jump', label: 'Jump, best each week', unit: 'in', values: stats.jumpWeeks, color: '#00E5FF', best: stats.jumpBestIn !== null ? `${stats.jumpBestIn} in best` : null },
    stats.formWeeks && { key: 'form', label: 'Form, clean reps each week', unit: '%', values: stats.formWeeks, color: '#00FF9D', best: null },
  ].filter(Boolean) as { key: string; label: string; unit: string; values: (number | null)[]; color: string; best: string | null }[];
  return (
    <Section id="stats" title="Stats & personal bests" purpose="Your best in every mode you play, and what you’ve measured, over the last 8 weeks." accent="#FFD700">
      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <p className="font-sans text-[12px] font-semibold uppercase tracking-[0.14em] text-fel-gold">Personal bests</p>
          <div className="mt-2">
            {stats.bestsScope === 'device' ? (viewer ? <p className="text-[14px] text-fel-dim">Bests for this account stay on its owner’s phone.</p> : <DeviceBests />)
              : stats.modes.length === 0 ? (
                <p className="text-[14px] text-white/50">No scored runs yet. <Link href="/play" className="font-bold text-fel-cyan underline-offset-2 hover:underline">Play a mode →</Link></p>
              ) : (
                <ul className="divide-y divide-white/[0.06]">
                  {stats.modes.map((m) => (
                    <li key={m.mode} className="grid grid-cols-[minmax(0,1fr)_72px_auto] items-center gap-3 py-2.5">
                      <span className="min-w-0">
                        <span className="block truncate text-[14px] font-semibold text-white/85">{m.name}</span>
                        <span className="font-sans text-[12px] text-fel-quiet">{m.runs} run{m.runs === 1 ? '' : 's'}</span>
                      </span>
                      <Sparkline values={m.weeks} color="#FFD700" height={26} width={72} label={`${m.name}: best score each week for 8 weeks`} />
                      <span className="fel-heading text-right text-[16px] font-black text-fel-gold tabular-nums">{m.best.toLocaleString('en-US')}</span>
                    </li>
                  ))}
                </ul>
              )}
          </div>
        </Card>
        <Card>
          <p className="font-sans text-[12px] font-semibold uppercase tracking-[0.14em] text-fel-cyan">Measured skills</p>
          {lines.map((l) => (
            <div key={l.key} className="mt-3">
              <p className="flex items-baseline justify-between text-[12px] text-white/60"><span>{l.label}</span>{l.best && <span className="font-sans text-[12px] text-fel-dim">{l.best}</span>}</p>
              <div className="mt-1"><Sparkline values={l.values} color={l.color} label={`${l.label}, 8 weeks`} /></div>
            </div>
          ))}
          {stats.skills.length ? (
            <ul className="mt-3 grid grid-cols-2 gap-2">
              {stats.skills.map((s) => (
                <li key={s.key} className="rounded-xl bg-white/[0.03] px-3 py-2">
                  <p className="text-[12px] text-white/50">{s.label}</p>
                  <p className="fel-heading text-[20px] font-black text-white tabular-nums">{s.value}<span className="ml-1 text-[12px] font-semibold text-fel-quiet">{s.unit === 'score' ? '' : s.unit}</span></p>
                  <p className="text-[12px] text-fel-quiet">{SOURCE_LABEL[s.source] ?? s.source}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[14px] text-white/50">
              Nothing measured yet.{!viewer && <> <Link href={JUMP_CHECK_HREF} className="font-bold text-fel-cyan underline-offset-2 hover:underline">{JUMP_CHECK} →</Link></>}
            </p>
          )}
          {!viewer && <Link href="/profile/edit#measure" className="mt-3 inline-block text-[12px] font-bold text-white/55 underline-offset-2 hover:text-white hover:underline">Log a measurement</Link>}
        </Card>
      </div>
    </Section>
  );
}
