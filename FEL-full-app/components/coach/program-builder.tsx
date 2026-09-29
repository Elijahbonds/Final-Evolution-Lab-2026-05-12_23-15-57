'use client';
// The program builder — the coach writes a session with a shape (MIRROR-COACH P2, 2026-09-25).
//
// WHAT IT REPLACES. The Clients tab's builder was one row per session: pick an exercise, type sets / reps / load, add
// or remove. Tempo, rest and the coach note could be set by the API but not by any control, nothing could be edited
// after it was added, and a session was a flat list — no warm-up, no main lift, no cool-down, no pairing, no timer.
//
// WHAT IT DOES. Each session reads in running order, section by section (Prep → Prime → Key → Assist → Finish →
// Cool-down, lib/coach/taxonomy.ts SESSION_SECTIONS), with superset labels (A1/A2), the key set marked, and the
// builder's warnings (lib/coach/structure.ts sessionWarnings). Every exercise opens into an edit panel: section,
// key-set switch, superset letter, the dose (sets, reps, load, tempo, rest), a timer for timed work and holds, FEL's
// five effort bands with a one-line meaning each, the set-up cue pick-list (the exercise's pattern first), and the
// note. Up/down moves an exercise inside its section. Every save goes through POST /api/coach/programs/:id/exercises
// and the tree it answers with replaces the one on screen, so what you see is what was stored.
//
// The form state is lib/coach/builder.ts (pure; its test runs the round trip). This file is the layout.
//
// PULL OVER PUSH (MIRROR-COACH P2, compliance-and-roster lane, 2026-09-25). Each week (block) now carries FEL's
// weekly balance check under its label: when the working pressing sets outnumber the pulling sets — or, with a note on
// file that mentions the shoulder, when pulling is short of three for every two — a one-line suggestion says the
// counts and what would balance them (lib/coach/coverage.ts pullPushCheck). It is a suggestion, never a block on
// saving, and it counts tagged exercises only, saying so when untagged sets could change the answer.
import { useState } from 'react';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, KeyRound, Plus, Scale, Timer, Trash2, TriangleAlert } from 'lucide-react';
import type { MovementPattern, SessionSection } from '@/public/_prisma/client';
import type { ProgramTree, TreeExercise } from '@/lib/coach/loop';
import { mentionsShoulder, pullPushCheck } from '@/lib/coach/coverage';
import { doseLine, groupBySection, sessionWarnings, supersetLabels, warningText } from '@/lib/coach/structure';
import {
  EFFORT_BANDS, MAX_SETUP_CUES, SESSION_SECTIONS, effortBand, setupCue, setupCuesFor,
} from '@/lib/coach/taxonomy';
import {
  SUPERSET_LETTERS, bandMismatchLine, bodyFromDraft, builderErrorText, draftFromExercise, emptyDraft, suggestedBand, timedSuffixOf, toggleCue, withSection,
  withTimedSuffix,
  type ExerciseDraft,
} from '@/lib/coach/builder';

export interface BuilderCatalogueItem { id: string; name: string; category?: string | null; pattern?: MovementPattern | null }

export interface ProgramBuilderProps {
  tree: ProgramTree;
  completedSessionIds: readonly string[];
  catalogue: readonly BuilderCatalogueItem[];
  /** Called with the tree the route answered with after every successful save. */
  onTree: (tree: ProgramTree) => void;
  /** Where saves go. Default: the real builder route. The dev harness points it at its in-memory twin. */
  endpoint?: string;
  /**
   * Notes on file for this client beyond the tree's own coach notes — the client's notes on logged exercises in this
   * program (the Clients tab passes them from the inbox). Read for one thing only: whether any mentions the shoulder,
   * which tilts the pull-over-push suggestion. Never shown, never quoted.
   */
  notes?: readonly (string | null | undefined)[];
}

const input = 'rounded-lg bg-white/5 border border-white/10 px-2 py-1 text-white text-xs';

export function ProgramBuilder({ tree, completedSessionIds, catalogue, onTree, endpoint, notes }: ProgramBuilderProps) {
  const [open, setOpen] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, ExerciseDraft>>({});
  const [adding, setAdding] = useState<Record<string, { exerciseId: string; section: SessionSection }>>({});
  const [busy, setBusy] = useState(false);

  const call = async (body: Record<string, unknown>): Promise<boolean> => {
    setBusy(true);
    try {
      const r = await fetch(endpoint ?? `/api/coach/programs/${tree.id}/exercises`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(builderErrorText(j.error)); return false; }
      onTree(j.tree);
      return true;
    } catch {
      toast.error(builderErrorText(null));
      return false;
    } finally { setBusy(false); }
  };

  const edit = (e: TreeExercise) => {
    if (open === e.id) { setOpen(null); return; }
    setDrafts((d) => ({ ...d, [e.id]: draftFromExercise(e) }));
    setOpen(e.id);
  };
  const save = async (e: TreeExercise) => {
    const d = drafts[e.id]; if (!d) return;
    if (await call({ action: 'update', sessionExerciseId: e.id, ...bodyFromDraft(d) })) { setOpen(null); toast.success('Saved'); }
  };
  const patternOf = (exerciseId: string) => catalogue.find((c) => c.id === exerciseId)?.pattern ?? null;
  // a shoulder note anywhere on this program — the coach's own notes on its exercises, or the client's log notes
  const shoulderNote = mentionsShoulder([...(notes ?? []), ...tree.blocks.flatMap((b) => b.sessions.flatMap((s) => s.exercises.map((e) => e.coachNote)))]);

  if (tree.blocks.length === 0) return <div className="text-sm text-white/50">This program has no weeks yet.</div>;

  return (
    <div className="space-y-3" data-testid="program-builder">
      {tree.blocks.map((b) => {
        const balance = pullPushCheck(
          b.sessions.flatMap((s) => s.exercises.map((e) => ({ pattern: patternOf(e.exerciseId), section: e.section, sets: e.sets }))),
          { shoulderNote, label: b.label },
        );
        return (
        <div key={b.id} className="space-y-2">
          <div className="text-sm text-white/70 font-medium">{b.label}</div>
          {balance && (
            <div className="flex items-start gap-1.5 rounded-md border border-[#00E5FF]/15 bg-[#00E5FF]/[0.04] px-2 py-1.5 text-[11px] text-white/70" data-testid="pull-push" data-sure={balance.sure ? '1' : '0'}>
              <Scale className="mt-0.5 h-3 w-3 shrink-0 text-[#00E5FF]/70" aria-hidden="true" /> <span>{balance.text}</span>
            </div>
          )}
          {b.sessions.map((s) => {
            const done = completedSessionIds.includes(s.id);
            const labels = supersetLabels(s.exercises);
            const warnings = sessionWarnings(s.exercises);
            const add = adding[s.id] ?? { exerciseId: catalogue[0]?.id ?? '', section: 'key' as SessionSection };
            return (
              <div key={s.id} className="rounded-lg bg-white/[0.03] border border-white/6 p-3 space-y-2" data-session={s.id}>
                <div className="text-xs text-white">{s.label} {done && <span className="text-[#7BD389]">· done</span>}</div>
                {warnings.map((w) => (
                  <div key={`${w.kind}-${'group' in w ? w.group : ''}`} className="flex items-center gap-1.5 text-[11px] text-[#FFD700]/85">
                    <TriangleAlert className="h-3 w-3 shrink-0" aria-hidden="true" /> {warningText(w)}
                  </div>
                ))}
                {s.exercises.length === 0 && <div className="text-xs text-white/40">Nothing prescribed yet.</div>}
                {groupBySection(s.exercises).map((g) => (
                  <div key={g.section} className="space-y-1" data-section={g.section}>
                    <div className="text-[10px] uppercase tracking-wider text-white/40">{g.label}</div>
                    {g.items.map((e, i) => (
                      <div key={e.id} className="rounded-md border border-white/6 bg-black/20">
                        <div className="flex items-center justify-between gap-2 px-2 py-1.5 text-xs text-white/80">
                          <button onClick={() => edit(e)} className="min-w-0 text-left flex-1" aria-expanded={open === e.id}>
                            {labels[e.id] && <span className="mr-1.5 rounded bg-[#00E5FF]/15 px-1 text-[10px] font-semibold text-[#00E5FF]">{labels[e.id]}</span>}
                            {e.isKeySet && <span className="mr-1.5 inline-flex items-center gap-0.5 rounded bg-[#FFD700]/15 px-1 text-[10px] font-semibold text-[#FFD700]"><KeyRound className="h-2.5 w-2.5" aria-hidden="true" />KEY</span>}
                            <span className="text-white">{e.name}</span>
                            <span className="text-white/50"> — {doseLine(e)}</span>
                            {e.setupCues.length > 0 && <span className="text-white/35"> · {e.setupCues.length} cue{e.setupCues.length > 1 ? 's' : ''}</span>}
                          </button>
                          <span className="flex shrink-0 items-center gap-1">
                            <button disabled={busy || i === 0} onClick={() => void call({ action: 'move', sessionExerciseId: e.id, direction: 'up' })} className="text-white/35 hover:text-white disabled:opacity-20" aria-label={`Move ${e.name} up`}><ArrowUp className="h-3.5 w-3.5" /></button>
                            <button disabled={busy || i === g.items.length - 1} onClick={() => void call({ action: 'move', sessionExerciseId: e.id, direction: 'down' })} className="text-white/35 hover:text-white disabled:opacity-20" aria-label={`Move ${e.name} down`}><ArrowDown className="h-3.5 w-3.5" /></button>
                            <button onClick={() => edit(e)} className="text-white/35 hover:text-white" aria-label={`Edit ${e.name}`}>{open === e.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}</button>
                            <button disabled={busy} onClick={() => void call({ action: 'remove', sessionExerciseId: e.id })} className="text-white/30 hover:text-[#FF3366]" aria-label={`Remove ${e.name}`}><Trash2 className="h-3.5 w-3.5" /></button>
                          </span>
                        </div>
                        {open === e.id && drafts[e.id] && (
                          <ExerciseEditor
                            draft={drafts[e.id]}
                            pattern={patternOf(e.exerciseId)}
                            busy={busy}
                            onChange={(d) => setDrafts((x) => ({ ...x, [e.id]: d }))}
                            onSave={() => void save(e)}
                            onCancel={() => setOpen(null)}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                ))}
                <div className="flex gap-1.5 items-center text-xs pt-1">
                  <select aria-label="Exercise to add" value={add.exerciseId} onChange={(ev) => setAdding((x) => ({ ...x, [s.id]: { ...add, exerciseId: ev.target.value } }))} className={`flex-1 ${input}`}>
                    {catalogue.length === 0 && <option value="">Your catalogue is empty</option>}
                    {catalogue.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <select aria-label="Section to add into" value={add.section} onChange={(ev) => setAdding((x) => ({ ...x, [s.id]: { ...add, section: ev.target.value as SessionSection } }))} className={input}>
                    {SESSION_SECTIONS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                  </select>
                  <button
                    disabled={busy || !add.exerciseId}
                    onClick={() => void call({ action: 'add', sessionId: s.id, ...bodyFromDraft(emptyDraft(add.exerciseId, add.section, patternOf(add.exerciseId))) })}
                    className="rounded-lg border border-[#00E5FF]/40 text-[#00E5FF] px-2 py-1 disabled:opacity-30"
                    aria-label="Add exercise"
                  ><Plus className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            );
          })}
        </div>
        );
      })}
    </div>
  );
}

interface EditorProps {
  draft: ExerciseDraft;
  pattern: MovementPattern | null;
  busy: boolean;
  onChange: (d: ExerciseDraft) => void;
  onSave: () => void;
  onCancel: () => void;
}

/** The edit panel for one prescribed exercise. */
export function ExerciseEditor({ draft: d, pattern, busy, onChange, onSave, onCancel }: EditorProps) {
  const set = (patch: Partial<ExerciseDraft>) => onChange({ ...d, ...patch });
  const section = SESSION_SECTIONS.find((s) => s.id === d.section);
  const band = effortBand(d.effortBand);
  const suggestion = suggestedBand(d);
  // MIRROR-COACH P2 review (2026-09-26): a load RPE that reads as another band than the one picked (Today shows the band)
  const mismatch = bandMismatchLine(d);
  const label = 'text-[10px] uppercase tracking-wider text-white/40';
  return (
    <div className="space-y-3 border-t border-white/6 px-2 py-2.5 text-xs" data-testid="exercise-editor">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label className="space-y-1">
          <span className={label}>Section</span>
          <select value={d.section} onChange={(e) => onChange(withSection(d, e.target.value as SessionSection))} className={`w-full ${input}`}>
            {SESSION_SECTIONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          {section && <span className="block text-[11px] text-white/40">{section.meaning}</span>}
        </label>
        <label className="space-y-1">
          <span className={label}>Superset</span>
          <select value={d.supersetGroup} onChange={(e) => set({ supersetGroup: e.target.value })} className={`w-full ${input}`}>
            <option value="">On its own</option>
            {SUPERSET_LETTERS.map((l) => <option key={l} value={l}>Superset {l}</option>)}
          </select>
          <span className="block text-[11px] text-white/40">Same letter = done back to back, set for set.</span>
        </label>
        <label className={`flex items-start gap-2 pt-4 ${d.section === 'key' ? '' : 'opacity-40'}`}>
          <input type="checkbox" checked={d.isKeySet} disabled={d.section !== 'key'} onChange={(e) => set({ isKeySet: e.target.checked })} className="mt-0.5" />
          <span><span className="text-white">Key set</span><span className="block text-[11px] text-white/40">The one set this session is built around. {d.section === 'key' ? '' : 'Only in the Key section.'}</span></span>
        </label>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1"><span className={label}>Sets</span><input value={d.sets} onChange={(e) => set({ sets: e.target.value })} inputMode="numeric" className={`w-12 ${input}`} /></label>
        {!d.timed && <label className="space-y-1"><span className={label}>Reps</span><input value={d.reps} onChange={(e) => set({ reps: e.target.value })} className={`w-20 ${input}`} /></label>}
        <label className="space-y-1"><span className={label}>Load</span><input value={d.load} onChange={(e) => set({ load: e.target.value })} className={`w-20 ${input}`} /></label>
        <label className="space-y-1"><span className={label}>Tempo</span><input value={d.tempo} onChange={(e) => set({ tempo: e.target.value })} className={`w-20 ${input}`} /></label>
        <label className="space-y-1"><span className={label}>Rest s</span><input value={d.restSeconds} onChange={(e) => set({ restSeconds: e.target.value })} inputMode="numeric" className={`w-14 ${input}`} /></label>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex items-center gap-1.5 pb-1">
          <input type="checkbox" checked={d.timed} onChange={(e) => set({ timed: e.target.checked })} />
          <Timer className="h-3.5 w-3.5 text-white/50" aria-hidden="true" /><span className="text-white/80">Timed</span>
        </label>
        {d.timed && <label className="space-y-1"><span className={label}>Work s / set</span><input value={d.workSeconds} onChange={(e) => set({ workSeconds: e.target.value })} inputMode="numeric" className={`w-16 ${input}`} /></label>}
        {/* P2 review: the reps box is hidden for a timed item, so the text after the seconds ("each side") had nowhere to
            be seen or restored — and changing the timer erased it. It is edited here, and survives a new timer. */}
        {d.timed && <label className="space-y-1"><span className={label}>Each set</span><input value={timedSuffixOf(d)} onChange={(e) => onChange(withTimedSuffix(d, e.target.value))} placeholder="e.g. each side" maxLength={16} className={`w-28 ${input}`} /></label>}
        <label className="space-y-1"><span className={label}>Hold s</span><input value={d.holdSeconds} onChange={(e) => set({ holdSeconds: e.target.value })} inputMode="numeric" placeholder="none" className={`w-16 ${input}`} /></label>
        <span className="pb-1 text-[11px] text-white/40">A hold is the pause at the end of each rep or set.</span>
      </div>

      <fieldset className="space-y-1">
        <legend className={label}>Effort band</legend>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Effort band">
          <button type="button" role="radio" aria-checked={!d.effortBand} onClick={() => set({ effortBand: '' })} className={`rounded-lg border px-2 py-1 ${!d.effortBand ? 'border-white/40 text-white' : 'border-white/10 text-white/50'}`}>Not set</button>
          {EFFORT_BANDS.map((b) => (
            <button key={b.id} type="button" role="radio" aria-checked={d.effortBand === b.id} onClick={() => set({ effortBand: b.id })} title={b.meaning}
              className={`rounded-lg border px-2 py-1 ${d.effortBand === b.id ? 'border-[#00E5FF]/60 bg-[#00E5FF]/10 text-[#00E5FF]' : suggestion === b.id ? 'border-[#00E5FF]/30 text-white/80' : 'border-white/10 text-white/60'}`}>
              {b.label} <span className="text-white/35">RPE {b.rpe[0] === b.rpe[1] ? b.rpe[0] : `${b.rpe[0]}–${b.rpe[1]}`}</span>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-white/50">
          {band ? <>{band.label}: {band.meaning} {!band.youthAllowed && <span className="text-[#FFD700]/80">Adults only.</span>}</>
            : suggestion ? <>Your load says {d.load.trim()}, which reads as {effortBand(suggestion)?.label}. Tap it to use it.</>
            : 'How hard the set should feel, and how much brace to build.'}
        </p>
        {mismatch && <p className="text-[11px] text-[#FFD700]/80" role="status">{mismatch}</p>}
      </fieldset>

      <fieldset className="space-y-1">
        <legend className={label}>Set-up cues <span className="normal-case tracking-normal text-white/30">({d.setupCues.length}/{MAX_SETUP_CUES})</span></legend>
        <div className="flex flex-wrap gap-1.5">
          {setupCuesFor(pattern).map((c) => {
            const on = d.setupCues.includes(c.id);
            const full = !on && d.setupCues.length >= MAX_SETUP_CUES;
            return (
              <button key={c.id} type="button" aria-pressed={on} disabled={full} onClick={() => onChange(toggleCue(d, c.id))}
                className={`rounded-lg border px-2 py-1 text-left ${on ? 'border-[#7BD389]/60 bg-[#7BD389]/10 text-[#7BD389]' : 'border-white/10 text-white/60'} disabled:opacity-30`}>
                {c.text}
              </button>
            );
          })}
        </div>
        {d.setupCues.length > 0 && <p className="text-[11px] text-white/40">Read before the first rep: {d.setupCues.map((id) => setupCue(id)?.text).filter(Boolean).join(' ')}</p>}
      </fieldset>

      <label className="block space-y-1">
        <span className={label}>Note to your athlete</span>
        <input value={d.coachNote} onChange={(e) => set({ coachNote: e.target.value })} maxLength={300} placeholder="Optional" className={`w-full ${input}`} />
      </label>

      <div className="flex gap-2">
        <button disabled={busy} onClick={onSave} className="rounded-lg border border-[#00E5FF]/50 bg-[#00E5FF]/10 px-3 py-1 text-[#00E5FF] disabled:opacity-40">Save</button>
        <button onClick={onCancel} className="rounded-lg border border-white/10 px-3 py-1 text-white/60">Cancel</button>
      </div>
    </div>
  );
}
