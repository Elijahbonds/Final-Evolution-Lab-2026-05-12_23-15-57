'use client';
// FROM THEIR SCREEN — the corrective work a movement screen asks for, as a draft.
//
// lib/coach/mirrorToProgram.ts calls this "the tie the whole platform was missing": the looking is already
// automated and the programming already exists, and nothing joined them. A coach could read a screen result on
// one page and type the corrective work into another, from memory — the manual step the competition charges for.
//
// TWO RULES THE MODULE STATES AND THIS UI KEEPS:
//   1. Only the coach's OWN catalogue. A finding with no match shows the finding and what to search for, never an
//      invented exercise name.
//   2. A DRAFT, NOT A COMMIT. Nothing is added until the coach picks a session and presses add, and what goes in
//      carries the finding it came from as the coach note — so the athlete reads why, and the coach can throw it out.

import { useEffect, useState } from 'react';
import { ClipboardList, Plus, Search } from 'lucide-react';

export interface Prescription {
  findingId: string;
  because: string;
  exercise: { id: string; name: string } | null;
  sets: number;
  reps: string;
  /** Seconds per set for a timed dose (lib/coach/mirrorToProgram.ts); optional so an older payload still renders. */
  workSeconds?: number | null;
  wanted: string[];
}
interface Draft {
  screenAt: string | null; headline?: string | null; prescriptions: Prescription[]; reason?: string;
  /** Set when a newer run than the screen drafted from was not graded (app/api/coach/prescribe). */
  newerRunAt?: string | null;
}

/**
 * What the panel says when the draft has nothing to add, by the route's reason.
 *
 * MIRROR-COACH P1 (2026-09-25). This used to be one ternary: 'no_screen' asked for a screen, and EVERY other reason
 * said "Their last screen came back clear." But the route also returns 'unreadable_screen' for a row it cannot read —
 * and every screen stored so far was exactly that, because no station has been graded yet and an empty result reads
 * as unreadable. So every athlete who had run a screen was reported to their coach as clear, on zero measurements.
 *
 * Found in review the same day, three more:
 *   · "Clear" came from NO reason at all, and a screen with one stable check out of eight reached this panel with no
 *     reason. "Clear" now needs the route to say 'clear_screen' — a COMPLETE screen with nothing flagged — and a
 *     screen with checks missing is 'partial_screen'. No reason, or one this does not know, is not good news.
 *   · 'no_screen' promised "the correctives draft themselves" after a Mirror screen. No grader exists yet (phase 3),
 *     so a screen run today drafts nothing; the line says so. Bring the promise back when the graders land.
 *   · The route drafts from the newest GRADED screen; when a newer run graded nothing, "their last screen" would be
 *     the wrong one, so the line says a newer run was not graded.
 */
export function emptyDraftLine(reason: string | undefined, opts: { newerRunUngraded?: boolean } = {}): string {
  const newer = opts.newerRunUngraded ? ' A newer run was not graded.' : '';
  switch (reason) {
    case 'clear_screen':
      return `Their last graded screen came back clear.${newer}`;
    case 'partial_screen':
      return `Their last screen was only partly graded, so it does not read as clear — nothing flagged in the checks that came back.${newer}`;
    case 'no_screen':
      return "No movement screen on file. The Mirror's screen can't grade from the camera yet, so there is nothing to draft from it.";
    case 'ungraded_screen':
      return 'Their last screen ran but was not graded — the Mirror cannot score it from the camera yet, so there is nothing to draft from.';
    case 'unreadable_screen':
      return 'Their last screen could not be read, so there is nothing to draft from.';
    default:
      return `Nothing to draft from their last screen.${newer}`;
  }
}

export interface ScreenPrescriptionsProps {
  clientId: string;
  /** The sessions in this program the coach can drop a corrective into. */
  sessions: readonly { id: string; label: string }[];
  onAdd: (sessionId: string, body: Record<string, unknown>) => void | Promise<void>;
}

export function ScreenPrescriptions({ clientId, sessions, onAdd }: ScreenPrescriptionsProps) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [into, setInto] = useState('');

  useEffect(() => {
    setDraft(null);
    fetch(`/api/coach/prescribe?clientId=${encodeURIComponent(clientId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setDraft(j))
      .catch(() => setDraft(null));
  }, [clientId]);

  useEffect(() => { if (!into && sessions[0]) setInto(sessions[0].id); }, [sessions, into]);

  // No screen is not a failure and not an empty state to apologise for — it is a thing to ask the athlete for.
  if (!draft) return null;
  if (!draft.prescriptions.length) {
    return (
      <p className="text-xs text-white/35">{emptyDraftLine(draft.reason, { newerRunUngraded: !!draft.newerRunAt })}</p>
    );
  }

  return (
    <section className="rounded-lg border border-white/6 bg-white/[0.02] p-3" aria-labelledby={`presc-${clientId}`}>
      <h4 id={`presc-${clientId}`} className="flex items-center gap-1.5 text-xs font-semibold text-white/80">
        <ClipboardList className="h-3.5 w-3.5 text-[#00E5FF]" aria-hidden="true" />
        From their screen
        {draft.screenAt && <span className="font-normal text-white/35">· {new Date(draft.screenAt).toLocaleDateString()}</span>}
      </h4>
      {draft.newerRunAt && (
        <p className="mt-1 text-xs text-white/35">A newer run on {new Date(draft.newerRunAt).toLocaleDateString()} was not graded; this draft is from the one before it.</p>
      )}

      {sessions.length > 1 && (
        <label className="mt-2 flex items-center gap-2 text-xs text-white/45">
          Add into
          <select value={into} onChange={(e) => setInto(e.target.value)} className="rounded bg-[#0f0f13] px-2 py-1 text-white/80">
            {sessions.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
      )}

      <ul className="mt-2 space-y-1.5">
        {draft.prescriptions.map((p) => (
          <li key={p.findingId} className="flex items-start justify-between gap-2 text-xs">
            <span>
              <span className="text-white/85">{p.exercise ? p.exercise.name : 'No match in your catalogue'}</span>
              <span className="text-white/45"> — {p.sets}×{p.reps}</span>
              <br />
              <span className="text-white/45">{p.because}</span>
              {!p.exercise && p.wanted.length > 0 && (
                <span className="mt-0.5 flex items-center gap-1 text-white/35">
                  <Search className="h-3 w-3" aria-hidden="true" /> look for: {p.wanted.join(', ')}
                </span>
              )}
            </span>
            {p.exercise && into && (
              <button
                onClick={() => void onAdd(into, { action: 'add', sessionId: into, exerciseId: p.exercise!.id, sets: p.sets, reps: p.reps, workSeconds: p.workSeconds ?? null, coachNote: p.because })}
                className="shrink-0 rounded-lg border border-[#00E5FF]/40 px-2 py-1 text-[#00E5FF]"
                aria-label={`Add ${p.exercise.name} to the program`}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
