// ShotChart / MakeTrend — the shot tracker's two pictures of numbers (BBS, 2026-10-26).
//
//   ShotChart  a half court (FIBA / NCAA lines, metres; the ring at the top) with a mark per shot that had a spot: a
//              filled circle for a make, a ring for a miss — shape AND colour, so a make never reads by colour alone —
//              each with its own hover title; a legend; the zones' made / taken as a table under it (the table view).
//   MakeTrend  make % a day, one bar a day, the newest on the right, the day's made / taken in each bar's title.
// Server-safe (no hooks): the summary, the coach's view and the rig render them the same.
import { ZONES, ZONE_IDS, CORNER_THREE_M, THREE_M } from '@/lib/hoops-cam/spot';
import type { Tally, TrendDay } from '@/lib/hoops-cam/log';

const MAKE = '#00FF9D';
const MISS = '#FF6B8A';
const LINE = 'rgba(255,255,255,0.28)';
const X0 = -7.6, X1 = 7.6, Z0 = -1.7, Z1 = 8.4;

export interface ChartShot { made: boolean; x: number | null; z: number | null; label?: string }

function Court() {
  const arcZ = Math.sqrt(THREE_M * THREE_M - CORNER_THREE_M * CORNER_THREE_M);
  return (
    <g fill="none" stroke={LINE} strokeWidth={0.05}>
      <line x1={X0} y1={-1.575} x2={X1} y2={-1.575} />
      <rect x={-2.45} y={-1.575} width={4.9} height={5.8} />
      <path d={`M ${-1.8} 4.225 A 1.8 1.8 0 0 0 1.8 4.225`} />
      <path d={`M ${-CORNER_THREE_M} -1.575 L ${-CORNER_THREE_M} ${arcZ} A ${THREE_M} ${THREE_M} 0 0 0 ${CORNER_THREE_M} ${arcZ} L ${CORNER_THREE_M} -1.575`} />
      <path d="M -1.25 0 A 1.25 1.25 0 0 0 1.25 0" />
      <line x1={-0.9} y1={-0.375} x2={0.9} y2={-0.375} strokeWidth={0.08} stroke="rgba(255,255,255,0.6)" />
      <circle cx={0} cy={0} r={0.23} stroke="#FF8A3D" strokeWidth={0.06} />
    </g>
  );
}

export function ShotChart({ shots, zones, title = 'Shot chart' }: { shots: readonly ChartShot[]; zones: Record<keyof typeof ZONES, Tally>; title?: string }) {
  const placed = shots.filter((s) => s.x !== null && s.z !== null);
  const made = shots.filter((s) => s.made).length;
  return (
    <figure className="space-y-2" data-hoops-chart>
      <svg viewBox={`${X0} ${Z0} ${X1 - X0} ${Z1 - Z0}`} role="img" aria-label={`${title}: ${made} made of ${shots.length}, ${placed.length} with a spot`}
        className="w-full rounded-lg bg-white/[0.03]">
        <Court />
        {placed.map((s, i) => (
          <g key={i} data-hoops-dot={s.made ? 'make' : 'miss'}>
            <title>{s.label ?? `${s.made ? 'Make' : 'Miss'} · ${Math.hypot(s.x!, s.z!).toFixed(1)} m`}</title>
            {/* a hit target bigger than the mark */}
            <circle cx={s.x!} cy={s.z!} r={0.4} fill="transparent" />
            {s.made
              ? <circle cx={s.x!} cy={s.z!} r={0.2} fill={MAKE} stroke="#050505" strokeWidth={0.05} />
              : <circle cx={s.x!} cy={s.z!} r={0.17} fill="none" stroke={MISS} strokeWidth={0.07} />}
          </g>
        ))}
      </svg>
      <figcaption className="flex flex-wrap items-center gap-3 text-[11px] text-white/60">
        <span className="flex items-center gap-1"><svg width="10" height="10" aria-hidden><circle cx="5" cy="5" r="4" fill={MAKE} /></svg>Make</span>
        <span className="flex items-center gap-1"><svg width="10" height="10" aria-hidden><circle cx="5" cy="5" r="3.3" fill="none" stroke={MISS} strokeWidth="1.5" /></svg>Miss</span>
        {placed.length < shots.length && <span>{shots.length - placed.length} with no spot (counted in the totals)</span>}
      </figcaption>
      <table className="w-full text-left text-[12px] tabular-nums text-white/75" data-hoops-zones>
        <thead><tr className="text-white/45"><th className="font-normal">Zone</th><th className="font-normal">Made</th><th className="font-normal">%</th></tr></thead>
        <tbody>
          {ZONE_IDS.filter((z) => zones[z].taken > 0).map((z) => (
            <tr key={z} data-hoops-zone={z}><td>{ZONES[z]}</td><td>{zones[z].made}/{zones[z].taken}</td><td>{Math.round((zones[z].made / zones[z].taken) * 100)}%</td></tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export function MakeTrend({ days }: { days: readonly TrendDay[] }) {
  if (!days.length) return null;
  const W = 100, H = 40, gap = 1.2, bw = Math.min(10, (W - gap * (days.length - 1)) / days.length);
  return (
    <figure className="space-y-1" data-hoops-trend>
      <svg viewBox={`0 0 ${W} ${H + 6}`} role="img" aria-label={`Make % by day, last ${days.length} days with shots`} className="w-full">
        <line x1={0} y1={H} x2={W} y2={H} stroke={LINE} strokeWidth={0.3} />
        <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="rgba(255,255,255,0.08)" strokeWidth={0.3} />
        {days.map((d, i) => {
          const h = Math.max(0.8, (d.pct / 100) * H);
          const x = W - (days.length - i) * (bw + gap) + gap;
          return (
            <g key={d.day} data-hoops-trend-day={d.day}>
              <title>{`${d.day}: ${d.made}/${d.taken} (${Math.round(d.pct)}%)`}</title>
              <rect x={x} y={0} width={bw} height={H} fill="transparent" />
              <path d={`M ${x} ${H} V ${H - h + 1} Q ${x} ${H - h} ${x + 1} ${H - h} H ${x + bw - 1} Q ${x + bw} ${H - h} ${x + bw} ${H - h + 1} V ${H} Z`} fill={MAKE} fillOpacity={0.85} />
            </g>
          );
        })}
        <text x={0} y={H + 5} fontSize={3.2} fill="rgba(255,255,255,0.5)">{days[0].day.slice(5)}</text>
        <text x={W} y={H + 5} fontSize={3.2} fill="rgba(255,255,255,0.5)" textAnchor="end">{days[days.length - 1].day.slice(5)}</text>
      </svg>
      <figcaption className="text-[11px] text-white/50">Make % a day (the half line is 50%). Latest: {Math.round(days[days.length - 1].pct)}%.</figcaption>
    </figure>
  );
}
