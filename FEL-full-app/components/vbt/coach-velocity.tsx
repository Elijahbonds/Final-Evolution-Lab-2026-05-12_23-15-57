'use client';

// CoachVelocity — the coach's side of the bar-speed tool (VBT, 2026-10-25).
//   · CLIENTS: each roster athlete who shares (live roster + coach_view + verified adult + save opt-in, server-side):
//     their recent sets — reps as zone-coloured bars, best speed, speed loss against the stop line. Anyone else is a name
//     with "not shared" and nothing else.
//   · TEAM: one team the coach runs, the members who share measured numbers (the groups lane's rule).
//   · ZONES: a target velocity zone and a stop line on each barbell/DB/body slot of the coach's programs; the athlete's
//     /train/velocity reads it ("Your coach's target …") and the live cue uses the stop line.
// Every number is an estimate from a phone camera; the line says so.
import { useCallback, useEffect, useState } from 'react';
import { ZONES, ZONE_IDS, zoneOf, type ZoneId } from '@/lib/vbt/lifts';
import { LOSS_STOP_PCT } from '@/lib/vbt/thresholds';
import { ESTIMATE_LINE } from '@/lib/vbt/copy';

export const COACH_VBT_API = '/api/coach/vbt';

interface SetRow { day: string; liftName: string; loadKg: number | null; reps: number; partials: number; bestMcv: number | null; lossPct: number | null; stopPct: number; repMcvs: number[]; warmup: boolean; band: string | null; source: string; fps: number }
interface Board {
  available: boolean;
  athletes?: { id: string; name: string; adult: boolean; shares: boolean; sets: SetRow[] }[];
  teams?: { id: string; name: string }[];
  slots?: { sessionExerciseId: string; client: string; session: string; name: string; dose: string; target: { zone: ZoneId; lossStopPct: number } | null }[];
}
interface Team { team: { id: string; name: string }; hidden: number; members: { id: string; name: string; latest: SetRow[]; lowDays: number }[] }

function Bars({ s }: { s: SetRow }) {
  const max = Math.max(1, ...s.repMcvs);
  return (
    <div className="flex h-8 items-end gap-0.5" aria-hidden>
      {s.repMcvs.map((v, i) => <span key={i} className="w-2 rounded-sm" style={{ height: `${Math.max(8, (v / max) * 100)}%`, background: zoneOf(v).color }} />)}
    </div>
  );
}

function SetLine({ s }: { s: SetRow }) {
  const over = s.lossPct != null && s.lossPct >= s.stopPct;
  return (
    <li className="flex items-center justify-between gap-3 py-1.5" data-vbt-coach-set>
      <div className="min-w-0">
        <div className="truncate text-[13px] text-white/85">{s.liftName}{s.loadKg ? ` · ${s.loadKg} kg` : ''}{s.warmup && s.band ? ` · warm-up ${s.band}` : ''}</div>
        <div className="text-[11px] text-white/45">{s.day} · {s.reps} reps{s.partials ? ` +${s.partials} partial` : ''} · best {s.bestMcv?.toFixed(2) ?? '—'} m/s · <span className={over ? 'text-[#FF4D8D]' : ''} data-vbt-coach-loss>−{s.lossPct ?? 0}% (stop {s.stopPct}%)</span></div>
      </div>
      <Bars s={s} />
    </li>
  );
}

export function CoachVelocity({ api = COACH_VBT_API }: { api?: string }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const load = useCallback(() => fetch(api).then((r) => r.json()).then(setBoard).catch(() => setBoard({ available: false })), [api]);
  useEffect(() => { void load(); }, [load]);

  const openTeam = (id: string) => fetch(`${api}?team=${encodeURIComponent(id)}`).then((r) => r.json()).then((j) => setTeam(j.team ? j : null)).catch(() => setTeam(null));
  const putZone = async (sessionExerciseId: string, body: Record<string, unknown>) => {
    setSaving(sessionExerciseId);
    await fetch(api, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionExerciseId, ...body }) }).catch(() => null);
    setSaving(null);
    void load();
  };

  if (!board) return <p className="text-sm text-white/50">Loading…</p>;
  if (!board.available) return <div className="fel-card rounded-xl p-4 text-sm text-white/70" data-vbt-coach-unavailable>Bar speed for coaches opens when its tables are applied. Your athletes can already track sets on their phones.</div>;

  return (
    <div className="space-y-4" data-vbt-coach>
      <div>
        <h1 className="text-xl font-black text-white">Bar speed</h1>
        <p className="text-xs text-white/45">{ESTIMATE_LINE}</p>
      </div>

      <section className="fel-card space-y-2 rounded-xl p-4" data-vbt-coach-clients>
        <div className="text-[11px] uppercase tracking-wider text-white/40">Clients</div>
        {!board.athletes?.length && <p className="text-sm text-white/50">No clients yet.</p>}
        {board.athletes?.map((a) => (
          <div key={a.id} className="border-t border-white/5 pt-2 first:border-0 first:pt-0" data-vbt-coach-athlete={a.id}>
            <div className="text-sm font-semibold text-white">{a.name}</div>
            {!a.shares ? <p className="text-xs text-white/40">Not shared with you{!a.adult ? ' (under 18: bar speed stays with them)' : ''}.</p>
              : a.sets.length ? <ul className="divide-y divide-white/5">{a.sets.slice(0, 5).map((s, i) => <SetLine key={i} s={s} />)}</ul>
              : <p className="text-xs text-white/40">No tracked sets in the last 4 weeks.</p>}
          </div>
        ))}
      </section>

      {!!board.teams?.length && (
        <section className="fel-card space-y-2 rounded-xl p-4" data-vbt-coach-teams>
          <div className="text-[11px] uppercase tracking-wider text-white/40">Teams</div>
          <div className="flex flex-wrap gap-1.5">
            {board.teams.map((t) => <button key={t.id} type="button" onClick={() => void openTeam(t.id)} data-vbt-team={t.id} className={`min-h-9 rounded-full border px-3 text-[13px] ${team?.team.id === t.id ? 'border-white bg-white text-black' : 'border-white/15 text-white/75'}`}>{t.name}</button>)}
          </div>
          {team && (
            <div data-vbt-team-view>
              {team.members.map((m) => (
                <div key={m.id} className="border-t border-white/5 pt-2">
                  <div className="text-sm font-semibold text-white">{m.name}{m.lowDays ? <span className="ml-2 text-xs text-[#FF4D8D]">{m.lowDays} low warm-up{m.lowDays > 1 ? 's' : ''}</span> : null}</div>
                  <ul className="divide-y divide-white/5">{m.latest.map((s, i) => <SetLine key={i} s={s} />)}</ul>
                </div>
              ))}
              {team.hidden > 0 && <p className="pt-1 text-xs text-white/40">{team.hidden} member{team.hidden > 1 ? 's' : ''} not sharing measured numbers.</p>}
            </div>
          )}
        </section>
      )}

      <section className="fel-card space-y-2 rounded-xl p-4" data-vbt-coach-zones>
        <div className="text-[11px] uppercase tracking-wider text-white/40">Target zones on your programs</div>
        {!board.slots?.length && <p className="text-sm text-white/50">No barbell, dumbbell or body-weight slots in your programs yet.</p>}
        {board.slots?.map((s) => (
          <div key={s.sessionExerciseId} className="space-y-1.5 border-t border-white/5 pt-2 first:border-0 first:pt-0" data-vbt-slot={s.sessionExerciseId}>
            <div className="text-[13px] text-white/85">{s.client} · {s.session} · <b>{s.name}</b> <span className="text-white/45">{s.dose}</span></div>
            <div className="flex flex-wrap items-center gap-1.5">
              {ZONE_IDS.map((z) => (
                <button key={z} type="button" disabled={saving === s.sessionExerciseId} data-vbt-zone={z} aria-pressed={s.target?.zone === z}
                  onClick={() => void putZone(s.sessionExerciseId, { zone: z, lossStopPct: s.target?.lossStopPct ?? LOSS_STOP_PCT.default })}
                  className="min-h-8 rounded-md border px-2 text-[11px] font-bold" style={s.target?.zone === z ? { borderColor: ZONES[z].color, color: '#000', background: ZONES[z].color } : { borderColor: 'rgba(255,255,255,.15)', color: ZONES[z].color }}>
                  {ZONES[z].name} {ZONES[z].lo.toFixed(2)}{ZONES[z].hi < 3 ? `–${ZONES[z].hi.toFixed(2)}` : '+'}
                </button>
              ))}
            </div>
            {s.target && (
              <div className="flex items-center gap-2 text-xs text-white/60">
                Stop at
                {[10, 15, 20, 25, 30].map((p) => (
                  <button key={p} type="button" data-vbt-stop-pct={p} aria-pressed={s.target!.lossStopPct === p} onClick={() => void putZone(s.sessionExerciseId, { zone: s.target!.zone, lossStopPct: p })}
                    className={`min-h-8 rounded-md border px-2 ${s.target!.lossStopPct === p ? 'border-white text-white' : 'border-white/15'}`}>{p}%</button>
                ))}
                <button type="button" onClick={() => void putZone(s.sessionExerciseId, { clear: true })} className="ml-auto underline">Clear</button>
              </div>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
