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
  wanted: string[];
}
interface Draft { screenAt: string | null; headline?: string | null; prescriptions: Prescription[]; reason?: string }

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
      <p className="text-xs text-white/35">
        {draft.reason === 'no_screen'
          ? 'No movement screen on file — ask them to run one in the Mirror and the correctives draft themselves.'
          : 'Their last screen came back clear.'}
      </p>
    );
  }

  return (
    <section className="rounded-lg border border-white/6 bg-white/[0.02] p-3" aria-labelledby={`presc-${clientId}`}>
      <h4 id={`presc-${clientId}`} className="flex items-center gap-1.5 text-xs font-semibold text-white/80">
        <ClipboardList className="h-3.5 w-3.5 text-[#00E5FF]" aria-hidden="true" />
        From their screen
        {draft.screenAt && <span className="font-normal text-white/35">· {new Date(draft.screenAt).toLocaleDateString()}</span>}
      </h4>

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
                onClick={() => void onAdd(into, { action: 'add', sessionId: into, exerciseId: p.exercise!.id, sets: p.sets, reps: p.reps, coachNote: p.because })}
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
