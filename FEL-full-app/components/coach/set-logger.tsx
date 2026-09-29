'use client';
// One exercise's sets, as the client logs them (MIRROR-COACH P2, 2026-09-25). A row per set: reps (or seconds on a
// timed item), the weight in the client's unit, reps in reserve 0–5 as chips with the plain anchor under them, and
// effort 1–10 with FEL's band name. Rows open BLANK with the prescription as placeholders, so a set the client did
// not touch saves as nothing (the old card pre-filled the load box with the prescription's "RPE7"). The form state
// and every conversion are lib/coach/setLog.ts; this file only lays it out.
//
// `simple` (a breath or mobility item): reps or seconds only. A weight box, reps-in-reserve and an effort rating on
// crocodile breathing are questions with no answer, and a client who meets them on every prep item learns to skip
// the boxes on the lifts too.
import { Copy, Minus, Plus } from 'lucide-react';
import {
  EFFORT_ANCHOR, RIR_ANCHORS, effortOptions, SET_LIMITS, copyPrevious, emptySetDraft, isWeightUnit, rirAnchor, type SetDraft, type WeightUnit,
} from '@/lib/coach/setLog';

/** The client's kg/lb choice: a per-device convenience (localStorage), in try/catch because storage can be blocked. */
export const WEIGHT_UNIT_KEY = 'fel.weightUnit';
export const readWeightUnit = (): WeightUnit => { try { const u = localStorage.getItem(WEIGHT_UNIT_KEY); return isWeightUnit(u) ? u : 'kg'; } catch { return 'kg'; } };
export const writeWeightUnit = (u: WeightUnit) => { try { localStorage.setItem(WEIGHT_UNIT_KEY, u); } catch { /* storage blocked: the switch works for this visit */ } };

/** The kg | lb switch. */
export function UnitSwitch({ unit, onChange }: { unit: WeightUnit; onChange: (u: WeightUnit) => void }) {
  return (
    <div className="flex shrink-0 rounded-lg border border-white/10 p-0.5 text-xs" role="group" aria-label="Weight unit">
      {(['kg', 'lb'] as const).map((u) => (
        <button key={u} type="button" aria-pressed={unit === u} onClick={() => onChange(u)} className={`rounded-md px-2 py-1 ${unit === u ? 'bg-[#00E5FF]/15 text-[#00E5FF]' : 'text-white/50'}`}>{u}</button>
      ))}
    </div>
  );
}

const input = 'w-full min-w-0 rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-white text-sm placeholder:text-white/25';
const RIR_HINT = 'Reps left: how many more clean reps you could have done.';

export function SetLogger({ name, rows, unit, timed, simple = false, youth = false, repsHint, workHint, onChange }: {
  name: string;
  rows: SetDraft[];
  unit: WeightUnit;
  /** A timed item logs seconds instead of reps. */
  timed: boolean;
  /** A breath or mobility item: reps or seconds only — no weight, reps left or effort. */
  simple?: boolean;
  /** The client is under youth rules: the effort picker names no adults-only band (MIRROR-COACH P2 review). */
  youth?: boolean;
  /** The prescription, shown as placeholders: "8-10", "30". */
  repsHint: string;
  workHint: string;
  onChange: (rows: SetDraft[]) => void;
}) {
  const set = (i: number, patch: Partial<SetDraft>) => onChange(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-2" data-set-logger={name}>
      {rows.map((r, i) => {
        const n = i + 1;
        const anchor = rirAnchor(r.rir);
        // the anchor for the chip picked; the plain question once, on the first row, until one is picked
        const hint = anchor ? anchor.text : i === 0 ? RIR_HINT : null;
        return (
          <div key={i} className="rounded-lg border border-white/6 bg-white/[0.02] p-2 space-y-1.5" data-set-row={i}>
            <div className="flex items-center gap-2">
              <div className="w-10 shrink-0 text-[11px] uppercase tracking-wider text-white/40">Set {n}</div>
              {timed ? (
                <label className="flex flex-1 min-w-0 items-center gap-1 text-[11px] text-white/40">
                  <input aria-label={`Set ${n} seconds`} value={r.workSeconds} onChange={(e) => set(i, { workSeconds: e.target.value })} inputMode="numeric" placeholder={workHint} className={input} />s
                </label>
              ) : (
                <label className="flex flex-1 min-w-0 items-center gap-1 text-[11px] text-white/40">
                  <input aria-label={`Set ${n} reps`} value={r.reps} onChange={(e) => set(i, { reps: e.target.value })} inputMode="numeric" placeholder={repsHint} className={input} />reps
                </label>
              )}
              {!simple && (
                <label className="flex flex-1 min-w-0 items-center gap-1 text-[11px] text-white/40">
                  <input aria-label={`Set ${n} weight in ${unit}`} value={r.weight} onChange={(e) => set(i, { weight: e.target.value })} inputMode="decimal" placeholder="—" className={input} />{unit}
                </label>
              )}
              <button type="button" disabled={i === 0} onClick={() => onChange(copyPrevious(rows, i))} aria-label={`Set ${n}: same as set ${i}`} title="Same as the set above" className="shrink-0 rounded-md border border-white/10 p-1.5 text-white/50 disabled:opacity-20"><Copy className="h-3.5 w-3.5" /></button>
            </div>
            {!simple && (
              <>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <div className="flex items-center gap-1" role="group" aria-label={`Set ${n} reps left`}>
                    <span className="text-[11px] text-white/40 mr-0.5">Reps left</span>
                    {RIR_ANCHORS.map((a) => (
                      <button key={a.rir} type="button" aria-pressed={r.rir === a.rir} aria-label={`Set ${n} reps left ${a.short}`} title={a.text}
                        onClick={() => set(i, { rir: r.rir === a.rir ? null : a.rir })}
                        className={`min-w-[28px] rounded-md border px-1.5 py-1 text-xs ${r.rir === a.rir ? 'border-[#00E5FF]/60 bg-[#00E5FF]/15 text-[#00E5FF]' : 'border-white/10 text-white/60'}`}>
                        {a.short}
                      </button>
                    ))}
                  </div>
                  <label className="flex items-center gap-1 text-[11px] text-white/40">Effort
                    <select aria-label={`Set ${n} effort`} value={r.effort ?? ''} onChange={(e) => set(i, { effort: e.target.value ? Number(e.target.value) : null })} className="rounded-lg bg-white/5 border border-white/10 px-1.5 py-1 text-white text-xs">
                      <option value="">—</option>
                      {effortOptions(youth).map((o) => <option key={o.effort} value={o.effort}>{o.label}</option>)}
                    </select>
                  </label>
                </div>
                {hint && <div className="text-[11px] text-white/40" data-rir-hint>{hint}</div>}
              </>
            )}
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button type="button" disabled={rows.length >= SET_LIMITS.maxSets} onClick={() => onChange([...rows, emptySetDraft()])} className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-white/70 disabled:opacity-30"><Plus className="h-3 w-3" /> Add a set</button>
        <button type="button" disabled={rows.length <= 1} onClick={() => onChange(rows.slice(0, -1))} className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-white/50 disabled:opacity-30"><Minus className="h-3 w-3" /> Remove the last</button>
        {!simple && <span className="ml-auto text-[11px] text-white/30 hidden sm:inline">Effort: {EFFORT_ANCHOR}</span>}
      </div>
    </div>
  );
}
