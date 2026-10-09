'use client';

// FormBlock — the end card's FORM block (movement play P10; Mirror & coaching Plan Phase 7, 2026-10-07): what the camera
// read of the player's form in the run that just ended — the 3PT's shots, the Dunk's jumps, a fight's strikes — in the
// book's words (lib/move/formRead). It shows only after a run the body played in a game with a block, and only that run.
//
// Every line is a number or "unread": a read the camera could not make is never shown as 0. The block keeps nothing:
// the reads are this page's memory, and for a minor or an age this page cannot show is 18+ it says so — they stay on
// this device (formRead.formForPost refuses to send them).
import { useEffect, useState } from 'react';
import { formReadStore, formForPost, UNREAD, type FormView } from '@/lib/move/formRead';
import { sessionStore } from '@/lib/babylon/core/sessionStore';

const pageStore = () => { try { return typeof sessionStorage === 'undefined' ? null : sessionStorage; } catch { return null; } };

export function FormBlockView({ view, onDevice }: { view: FormView; onDevice: boolean }) {
  return (
    <section data-form-block={view.kind} aria-label="Form read" className="rounded-2xl border border-white/10 bg-white/[0.03] p-[0.7em]">
      <div className="flex items-baseline justify-between gap-[0.6em]">
        <h3 className="text-[0.8em] font-bold uppercase tracking-[0.18em] text-[#00E5FF]">Form</h3>
        <span className="text-[0.72em] text-white/55">{view.head}</span>
      </div>
      <ul className="mt-[0.4em] flex flex-col gap-[0.25em]">
        {view.lines.map((l) => (
          <li key={l.label} data-form-line={l.read ? 'read' : 'unread'} className="flex items-baseline justify-between gap-[0.6em] text-[0.88em]">
            <span className="min-w-0 text-white/80">{l.label}</span>
            <span className={l.read ? 'font-semibold tabular-nums text-white' : 'italic text-white/45'}>{l.read ? l.value : UNREAD}</span>
          </li>
        ))}
      </ul>
      <p className="mt-[0.4em] text-[0.7em] text-white/45">
        Camera estimates, not measurements.{onDevice ? ' Kept on this device only — nothing is saved.' : ''}
      </p>
    </section>
  );
}

/** The run that just ended, read once when the card mounts (its open attempts closed). Renders nothing without a read. */
export function FormBlock() {
  const [view, setView] = useState<FormView | null>(null);
  useEffect(() => { setView(formReadStore.finishRun(sessionStore.record()?.runId)); }, []);
  if (!view) return null;
  // the same rule the send uses: nothing leaves this page unless it can show the player is an adult
  const onDevice = formForPost(view, pageStore()) === null;
  return <FormBlockView view={view} onDevice={onDevice} />;
}
