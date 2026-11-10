'use client';

// The coach's shot charts (BBS-04, 2026-11-03), built dark on the bar-speed coach view's pattern (components/vbt/
// coach-velocity.tsx): the server applies every gate (lib/hoops-cam/server.ts), so nothing withheld is ever a prop.
//
//   TeamShots    in the team panel (components/groups/group-screen.tsx, under the week's roll-up, for the team's owner
//                and coaches): one chip per athlete who shares measured numbers, the picked athlete's chart, and how many
//                do not share. Before the table is applied, or for anyone who does not run the team, it renders NOTHING.
//   CoachShots   /coach/shots: the roster athletes (a chart for each who shares, a name for the rest) and the teams.
//   AthleteChart one athlete's window: made / taken, the chart and zones (the player's own ShotChart), the make-% trend.
// Every number is from the camera beta; the line says so (no accuracy claim, owner).
import { useCallback, useEffect, useState } from 'react';
import type { AthleteShots } from '@/lib/hoops-cam/coach';
import { COACH_DARK_LINE, COACH_LINE, NOT_SHARED_LINE, pctText } from '@/lib/hoops-cam/copy';
import { MakeTrend, ShotChart } from './shot-chart';
import { HOOPS_LOOK as K } from './look';

export const COACH_SHOTS_API = '/api/coach/shots';

interface TeamAnswer { available: boolean; days?: number; team?: { id: string; name: string }; hidden?: number; members?: { id: string; name: string; shots: AthleteShots }[] }
interface CoachAnswer {
  available: boolean;
  days?: number;
  athletes?: { id: string; name: string; adult: boolean; shares: boolean; shots: AthleteShots | null }[];
  teams?: { id: string; name: string }[];
}

const card = 'rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5';
const h2 = 'fel-heading text-[13px] font-bold uppercase tracking-wide text-white';

export function AthleteChart({ shots, days }: { shots: AthleteShots; days: number }) {
  if (!shots.total.taken) {
    return <p className="text-[13px] text-white/60" data-coach-shots-empty>{shots.dribble ? `No shots in the last ${days} days.` : `Nothing tracked in the last ${days} days.`}{dribbleLine(shots)}</p>;
  }
  return (
    <div className="space-y-3" data-coach-shots-athlete>
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-2xl font-black tabular-nums text-white" data-coach-shots-total>{shots.total.made}/{shots.total.taken} · {pctText(shots.total.made, shots.total.taken)}</div>
        <div className="text-[12px] text-white/60">{shots.sessions} session{shots.sessions === 1 ? '' : 's'}{shots.lastDay ? ` · last ${shots.lastDay.slice(5)}` : ''}</div>
      </div>
      <ShotChart shots={shots.dots} zones={shots.zones} total={shots.total} noSpot={shots.noSpot} />
      {shots.trend.length > 1 && <MakeTrend days={shots.trend} />}
      {shots.dribble && <p className="text-[12px] text-white/60" data-coach-shots-dribble>{dribbleLine(shots).trim()}</p>}
    </div>
  );
}

const dribbleLine = (s: AthleteShots) => (s.dribble ? ` Dribbles: ${s.dribble.count} in ${s.dribble.sessions} session${s.dribble.sessions === 1 ? '' : 's'}, ${s.dribble.crossovers} crossovers.` : '');

function Picker({ items, value, onPick, label }: { items: { id: string; name: string; n?: number }[]; value: string | null; onPick: (id: string) => void; label: string }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {items.map((m) => (
        <button key={m.id} type="button" aria-pressed={value === m.id} onClick={() => onPick(m.id)} data-coach-shots-pick={m.id}
          className={`${K.chip} ${value === m.id ? K.chipOn : ''}`}>{m.name}{m.n != null ? <span className="ml-1 tabular-nums text-white/60">{m.n}</span> : null}</button>
      ))}
    </div>
  );
}

/** The team panel's shot charts. Dark (renders nothing) until the table is applied, and for anyone who does not run the team. */
export function TeamShots({ teamId, api = COACH_SHOTS_API, framed = true }: { teamId: string; api?: string; framed?: boolean }) {
  const [t, setT] = useState<TeamAnswer | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`${api}?team=${encodeURIComponent(teamId)}`).then((r) => (r.ok ? r.json() : null)).then((j: TeamAnswer | null) => {
      if (!live) return;
      setT(j?.available && j.team ? j : null);
      setPick(j?.members?.[0]?.id ?? null);
    }).catch(() => live && setT(null));
    return () => { live = false; };
  }, [api, teamId]);
  if (!t?.members) return null;
  const m = t.members.find((x) => x.id === pick) ?? null;
  return (
    <section className={framed ? card : 'space-y-3'} data-team-shots={teamId}>
      {framed && <h2 className={h2}>Shot charts · {t.days} days</h2>}
      <div className={framed ? 'mt-3 space-y-3' : 'space-y-3'}>
        {t.members.length ? <Picker items={t.members.map((x) => ({ id: x.id, name: x.name, n: x.shots.total.taken }))} value={pick} onPick={setPick} label="Athlete" />
          : <p className="text-[13px] text-white/60">No athlete shares measured numbers yet.</p>}
        {m && <AthleteChart shots={m.shots} days={t.days ?? 14} />}
        {!!t.hidden && <p className="text-[12px] text-white/50" data-team-shots-hidden>{t.hidden} not sharing measured numbers.</p>}
        {!!t.members.length && <p className="text-[12px] text-white/50">{COACH_LINE}</p>}
      </div>
    </section>
  );
}

/** /coach/shots: the roster and the teams. */
export function CoachShots({ api = COACH_SHOTS_API }: { api?: string }) {
  const [b, setB] = useState<CoachAnswer | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [team, setTeam] = useState<string | null>(null);
  const load = useCallback(() => fetch(api).then((r) => r.json()).then((j: CoachAnswer) => {
    setB(j);
    setPick(j.athletes?.find((a) => a.shares)?.id ?? null);
  }).catch(() => setB({ available: false })), [api]);
  useEffect(() => { void load(); }, [load]);

  if (!b) return <p className="text-sm text-white/50">Loading…</p>;
  if (!b.available) return <p className={`${card} text-[14px] text-white/70`} data-coach-shots-dark>{COACH_DARK_LINE}</p>;
  const shared = (b.athletes ?? []).filter((a) => a.shares);
  const others = (b.athletes ?? []).filter((a) => !a.shares);
  const a = shared.find((x) => x.id === pick) ?? null;
  return (
    <div className="space-y-4" data-coach-shots>
      <section className={card} data-coach-shots-clients>
        <h2 className={h2}>Clients · {b.days} days</h2>
        <div className="mt-3 space-y-3">
          {!b.athletes?.length && <p className="text-[13px] text-white/60">No clients yet.</p>}
          {!!shared.length && <Picker items={shared.map((x) => ({ id: x.id, name: x.name.split(' ')[0], n: x.shots?.total.taken ?? 0 }))} value={pick} onPick={setPick} label="Client" />}
          {a?.shots && <AthleteChart shots={a.shots} days={b.days ?? 28} />}
          {!!others.length && <p className="text-[12px] text-white/50" data-coach-shots-others>{others.map((x) => x.name.split(' ')[0]).join(', ')}: {NOT_SHARED_LINE.toLowerCase()}</p>}
        </div>
      </section>
      {!!b.teams?.length && (
        <section className={card} data-coach-shots-teams>
          <h2 className={h2}>Teams</h2>
          <div className="mt-3 space-y-3">
            <Picker items={b.teams} value={team} onPick={setTeam} label="Team" />
            {team && <TeamShots key={team} teamId={team} api={api} framed={false} />}
          </div>
        </section>
      )}
      <p className="text-[12px] text-white/50">{COACH_LINE}</p>
    </div>
  );
}
