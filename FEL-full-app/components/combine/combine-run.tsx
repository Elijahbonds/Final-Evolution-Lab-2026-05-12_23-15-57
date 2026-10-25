'use client';

// CombineRun — the station-by-station run the coach drives on one device (COMBINE-DAY, 2026-10-25). One station at a
// time; the line of athletes who may be tested there; the current athlete and attempt in big type; Record, No mark,
// Redo attempt and Next athlete. Built for a coach with fifteen in line: one tap to time, one to record, one for the next.
//
//   hand-timed (sprint, agility)  HandTimer: the coach's stopwatch or a typed time. Says "hand-timed".
//   jump (camera)                 JumpCamera: the jump check's take; the picture only through SelfView.
//   approach (video)              ApproachVideo: a side-on video read on this phone, never uploaded.
//   skill (camera)                the Playbook drill on the drills page's own screen (DrillLive), scored by the drill.
// Nothing here sends anything: the app saves the combine's NUMBERS (combine-app.tsx), never a frame or a video.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronRight, RotateCcw, UserPlus } from 'lucide-react';
import { STATIONS, formatValue, stationName, type StationConfig } from '@/lib/combine/catalogue';
import { KEPT_ON_DEVICE_LINE, NO_ACCURACY_LINE, say } from '@/lib/combine/copy';
import { lineFor, nextAthlete, nextSlot, recordAttempts, redoAttempt, setReach, stationProgress } from '@/lib/combine/draft';
import type { CombineAthlete, CombineEvent } from '@/lib/combine/types';
import { drillById } from '@/lib/drills/drills';
import type { DrillResult } from '@/lib/drills/DrillRunner';
import { DrillLive } from '@/app/play/drills/_components/drill-live';
import { HandTimer } from './hand-timer';
import { JumpCamera } from './jump-camera';
import { ApproachVideo } from './approach-video';

/** The drill's own score as the station's number: the share of its targets hit on the beat (%), or a no-mark. */
export function drillScore(r: Pick<DrillResult, 'accuracy'>): number | null {
  return typeof r.accuracy === 'number' && Number.isFinite(r.accuracy) ? Math.round(r.accuracy * 1000) / 10 : null;
}

export const SKILL_KEPT_LINE = 'The drill’s score goes on the combine sheet.';

function Slots({ ev, athleteId, st }: { ev: CombineEvent; athleteId: string; st: StationConfig }) {
  const slots = ev.results[athleteId]?.[st.id] ?? [];
  return (
    <ol className="flex flex-wrap gap-2" data-combine-slots>
      {Array.from({ length: st.attempts }, (_, i) => {
        const s = slots[i] ?? null;
        return (
          <li key={i} className={`min-w-[84px] rounded-lg border px-2 py-1.5 text-center ${s ? 'border-white/20 bg-white/[0.06]' : 'border-dashed border-white/15'}`} data-slot={i + 1}>
            <span className="block text-[10px] uppercase tracking-wider text-white/40">Try {i + 1}</span>
            <span className="block font-mono text-sm font-bold tabular-nums text-white">{s ? (s.value === null ? 'No mark' : formatValue(st.kind, s.value)) : '—'}</span>
            {s?.touchCm != null && <span className="block text-[10px] text-white/50">touch {formatValue('approach', s.touchCm)}</span>}
          </li>
        );
      })}
    </ol>
  );
}

export function CombineRun({ ev, onChange, onReport, onHome, roster, saving, status }: {
  ev: CombineEvent;
  onChange: (ev: CombineEvent) => void;
  onReport: () => void;
  onHome: () => void;
  /** The coach's roster, for a latecomer. */
  roster: readonly CombineAthlete[];
  /** Is the account saving on (the pending SQL applied)? */
  saving: boolean;
  /** One line on what is saved where. */
  status: string | null;
}) {
  const [stationIdx, setStationIdx] = useState(0);
  const st = ev.stations[Math.min(stationIdx, ev.stations.length - 1)];
  const line = useMemo(() => (st ? lineFor(ev, st.id) : []), [ev, st]);
  const [current, setCurrent] = useState<Record<string, string | null>>({});
  const [drillOpen, setDrillOpen] = useState(false);
  const [late, setLate] = useState('');
  const athleteId = st ? current[st.id] ?? nextAthlete(ev, st.id, null) ?? line[0]?.id ?? null : null;
  const athlete = line.find((a) => a.id === athleteId) ?? null;
  const slot = athlete && st ? nextSlot(ev, athlete.id, st.id) : null;
  const left = athlete && st ? st.attempts - (ev.results[athlete.id]?.[st.id] ?? []).filter((s) => s !== null).length : 0;
  const progress = st ? stationProgress(ev, st.id) : { done: 0, total: 0 };
  useEffect(() => { setDrillOpen(false); }, [athleteId, stationIdx]);

  const record = useCallback((values: { value: number | null; touchCm?: number | null }[]) => {
    if (!athlete || !st) return;
    onChange(recordAttempts(ev, athlete.id, st.id, values));
  }, [athlete, ev, onChange, st]);
  const select = (id: string | null) => st && setCurrent((c) => ({ ...c, [st.id]: id }));
  const next = () => st && select(nextAthlete(ev, st.id, athlete?.id ?? null) ?? athlete?.id ?? null);
  const onDrill = useCallback((r: DrillResult) => { record([{ value: drillScore(r) }]); setDrillOpen(false); }, [record]);

  if (!st) return null;
  const def = STATIONS[st.kind];
  const drill = st.kind === 'skill' ? drillById(st.variant) : null;
  const latecomers = roster.filter((a) => a.access.testable && !ev.athletes.some((x) => x.id === a.id));
  const stationDone = progress.total > 0 && progress.done >= progress.total;

  return (
    <div className="space-y-4" data-combine-run={st.id}>
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={onHome} className="text-xs font-bold text-white/55 underline">All combines</button>
        <span className="truncate text-sm font-bold text-white/80">{ev.name}</span>
        <button type="button" onClick={onReport} data-combine-to-report className="min-h-10 rounded-lg border border-white/20 px-3 text-xs font-bold text-white/85">Report</button>
      </div>

      <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" aria-label="Stations">
        {ev.stations.map((s, i) => {
          const p = stationProgress(ev, s.id);
          return (
            <button key={s.id} type="button" onClick={() => setStationIdx(i)} aria-current={i === stationIdx} data-combine-tab={s.id}
              className={`shrink-0 rounded-xl border px-3 py-2 text-left ${i === stationIdx ? 'border-[#00E5FF] bg-[#00E5FF]/10' : 'border-white/10'}`}>
              <span className="block max-w-[150px] truncate text-xs font-bold text-white">{stationName(s)}</span>
              <span className="block text-[10px] text-white/45">{p.done}/{p.total}{p.total > 0 && p.done >= p.total ? ' · done' : ''}</span>
            </button>
          );
        })}
      </nav>

      <section className="fel-card space-y-1 rounded-xl p-3">
        <h2 className="text-base font-black text-white">{stationName(st)}</h2>
        <p className="text-xs text-white/50">{def.how}</p>
        {status && <p className="text-[11px] text-white/40" data-combine-status>{status}</p>}
      </section>

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" data-combine-line>
        {line.map((a) => {
          const done = nextSlot(ev, a.id, st.id) === null;
          return (
            <button key={a.id} type="button" onClick={() => select(a.id)} aria-current={a.id === athlete?.id}
              className={`flex min-h-10 shrink-0 items-center gap-1 rounded-full border px-3 text-xs font-bold ${a.id === athlete?.id ? 'border-white bg-white text-black' : done ? 'border-white/10 text-white/35' : 'border-white/20 text-white/80'}`}>
              {done && <Check className="h-3 w-3" />}{a.name}
            </button>
          );
        })}
      </div>

      {athlete ? (
        <section className="space-y-4 rounded-2xl border border-white/12 bg-white/[0.03] p-4" data-combine-current={athlete.id}>
          <div>
            <div className="text-3xl font-black leading-tight text-white" data-combine-current-name>{athlete.name}</div>
            <div className="text-sm font-bold text-[#00E5FF]" data-combine-attempt>{slot === null ? `All ${st.attempts} attempts taken` : `Attempt ${slot + 1} of ${st.attempts}`}</div>
          </div>
          <Slots ev={ev} athleteId={athlete.id} st={st} />
          {saving && def.method !== 'hand' && !athlete.access.saveCamera && <p className="text-xs text-white/50" data-combine-device-only>{say(KEPT_ON_DEVICE_LINE)}</p>}

          {slot !== null && (
            <div data-combine-capture={def.method}>
              {(st.kind === 'sprint' || st.kind === 'agility') && <HandTimer key={`${athlete.id}-${slot}`} kind={st.kind} onTime={(s) => record([{ value: s }])} />}
              {st.kind === 'cmj' && <JumpCamera key={athlete.id} jumps={left} athlete={athlete.name} onAttempts={record} />}
              {st.kind === 'approach' && (
                <ApproachVideo key={athlete.id} left={left} reach={ev.reach[athlete.id] ?? null} onAttempts={record}
                  onReach={(r) => onChange(setReach(ev, athlete.id, r))} />
              )}
              {st.kind === 'skill' && drill && (drillOpen
                ? <DrillLive drill={drill} onLeave={() => setDrillOpen(false)} onResult={onDrill} keptLine={SKILL_KEPT_LINE} />
                : <button type="button" onClick={() => setDrillOpen(true)} data-combine-run-drill className="min-h-12 w-full rounded-xl bg-[#00E5FF] font-black text-black">Run {drill.name}</button>)}
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <button type="button" onClick={() => record([{ value: null }])} disabled={slot === null} data-combine-no-mark className="min-h-12 rounded-xl border border-white/20 text-sm font-bold text-white/80 disabled:opacity-30">No mark</button>
            <button type="button" onClick={() => onChange(redoAttempt(ev, athlete.id, st.id))} disabled={slot === 0} data-combine-redo className="flex min-h-12 items-center justify-center gap-1 rounded-xl border border-white/20 text-sm font-bold text-white/80 disabled:opacity-30"><RotateCcw className="h-4 w-4" /> Redo</button>
            <button type="button" onClick={next} data-combine-next className={`flex min-h-12 items-center justify-center gap-1 rounded-xl text-sm font-black ${slot === null ? 'bg-white text-black' : 'border border-white/20 text-white/80'}`}>Next <ChevronRight className="h-4 w-4" /></button>
          </div>
        </section>
      ) : (
        <p className="text-sm text-white/60">Nobody on this combine can be tested at this station.</p>
      )}

      {stationDone && (
        <div className="flex gap-2" data-combine-station-done>
          {stationIdx < ev.stations.length - 1
            ? <button type="button" onClick={() => setStationIdx(stationIdx + 1)} className="min-h-12 flex-1 rounded-xl bg-[#00FF9D] font-black text-black">Station done: next station</button>
            : <button type="button" onClick={onReport} className="min-h-12 flex-1 rounded-xl bg-[#00FF9D] font-black text-black">All done: see the report</button>}
        </div>
      )}

      {latecomers.length > 0 && (
        <div className="flex gap-2">
          <select value={late} onChange={(e) => setLate(e.target.value)} aria-label="Add a latecomer" className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/15 bg-black/60 px-2 text-sm text-white">
            <option value="">Add a latecomer…</option>
            {latecomers.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <button type="button" disabled={!late} onClick={() => { const a = latecomers.find((x) => x.id === late); if (a) onChange({ ...ev, athletes: [...ev.athletes, a], updatedAt: Date.now() }); setLate(''); }}
            className="flex min-h-11 items-center gap-1 rounded-xl border border-white/20 px-3 text-sm font-bold text-white/80 disabled:opacity-40"><UserPlus className="h-4 w-4" /> Add</button>
        </div>
      )}
      {def.method !== 'hand' && <p className="text-[11px] text-white/40">{NO_ACCURACY_LINE}</p>}
    </div>
  );
}
