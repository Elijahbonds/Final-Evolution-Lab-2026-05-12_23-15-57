'use client';
// QuickAdjust — EVERY-SCREEN P5 (the plan's phase-5 gate: "adjust one exercise in ≤ 4 taps"). On the athlete's Program tab,
// the next session's exercises: tap one, tap an effort band, and it is saved (the builder's own update, every other field
// as it was). The walk was 6 taps from the coach's first screen (the athlete, Program, Open the builder, Edit, the band,
// Save); it is 4 (the athlete, Program, the exercise, the band). The full editor stays one tap away ("Open the builder").
import { useState } from 'react';
import type { ProgramTree, TreeExercise, TreeSession } from '@/lib/coach/loop';
import { EFFORT_BANDS, effortBand } from '@/lib/coach/taxonomy';
import { bodyFromDraft, builderErrorText, draftFromExercise } from '@/lib/coach/builder';
import { doseLine } from '@/lib/coach/structure';
import { TYPE } from '@/lib/design/type';

/** The session the athlete does next: the first training session not done, in program order. */
export function nextSession(tree: ProgramTree, done: readonly string[]): TreeSession | null {
  const all = [...tree.blocks].sort((a, b) => a.order - b.order).flatMap((b) => [...b.sessions].sort((x, y) => x.order - y.order));
  return all.find((s) => (s.kind ?? 'training') === 'training' && !done.includes(s.id) && s.exercises.length > 0) ?? null;
}

/** The update the builder sends, with only the effort band changed. */
export function bandBody(e: TreeExercise, band: string): Record<string, unknown> {
  return { action: 'update', sessionExerciseId: e.id, ...bodyFromDraft({ ...draftFromExercise(e), effortBand: band }) };
}

const row = `flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 text-left ${TYPE.body}`;
const chip = `inline-flex min-h-11 items-center rounded-full border px-3 ${TYPE.small}`;

export function QuickAdjust({ tree, done, onTree }: { tree: ProgramTree; done: readonly string[]; onTree: (t: ProgramTree) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState<string | null>(null);
  const s = nextSession(tree, done);
  if (!s) return null;
  const pick = async (e: TreeExercise, band: string) => {
    if (busy || band === e.effortBand) return;
    setBusy(true); setLine(null);
    try {
      const r = await fetch(`/api/coach/programs/${tree.id}/exercises`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(bandBody(e, band)) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setLine(builderErrorText(j.error)); return; }
      onTree(j.tree);
      setLine(`Saved: ${e.name} · ${effortBand(band)?.label ?? band}.`);
      setOpen(null);
    } catch { setLine(builderErrorText(null)); } finally { setBusy(false); }
  };
  return (
    <section data-quick-adjust aria-labelledby="quick-adjust-title" className="space-y-2">
      <h3 id="quick-adjust-title" className={`${TYPE.label} text-fel-soft`}>Next session · {s.label}</h3>
      <ul className="space-y-1">
        {s.exercises.map((e) => (
          <li key={e.id} className="rounded-xl bg-white/[0.04]">
            <button type="button" className={row} aria-expanded={open === e.id} onClick={() => setOpen(open === e.id ? null : e.id)} data-quick-exercise={e.name}>
              <span className="min-w-0 text-white">{e.name}</span>
              <span className={`shrink-0 ${TYPE.small} text-fel-soft`}>{doseLine(e)}</span>
            </button>
            {open === e.id && (
              <div className="flex flex-wrap gap-1.5 px-3 pb-3" role="radiogroup" aria-label={`Effort for ${e.name}`}>
                {EFFORT_BANDS.map((b) => (
                  <button key={b.id} type="button" role="radio" aria-checked={e.effortBand === b.id} disabled={busy} title={b.meaning} data-quick-band={b.id}
                    onClick={() => { void pick(e, b.id); }}
                    className={`${chip} ${e.effortBand === b.id ? 'border-fel-cyan/60 bg-fel-cyan/10 text-fel-cyan' : 'border-white/15 text-white/80'}`}>
                    {b.label} · RPE {b.rpe[0] === b.rpe[1] ? b.rpe[0] : `${b.rpe[0]}–${b.rpe[1]}`}
                  </button>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
      {line ? <p role="status" className={`${TYPE.small} text-fel-soft`} data-quick-saved>{line}</p> : null}
    </section>
  );
}
