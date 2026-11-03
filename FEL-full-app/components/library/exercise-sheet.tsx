'use client';
// ExerciseSheet — PLAT-P08 (2026-11-02): one exercise, opened from the library's search (athletes on /train/library, coaches
// on the /coach Exercises tab and in the builder). Owner: demos are the avatar + coach video + anatomy + text
// (2026-10-25); "autoplay, no extra taps, never confusing" (2026-10-27).
//
//   the demo      LibraryDemo (the library stage, demo-loops' loops, read-only): it opens on the moving demo by itself;
//                 an entry with no faithful loop opens on its cue card — never another movement;
//   anatomy       the primary muscles as one row of chips (the Muscles tab has the body);
//   three cues    cue-rewrite's own card lines, unchanged;
//   Try it        THE primary: a one-exercise session in the phase-1 player (lib/session-player/fromLibrary.ts), one tap;
//   coach         "Use in program" (the builder's own add, when the builder passes onUse) and "Add to my catalogue";
//   How to set up the set-up, every cue, Watch for (with each fix), the dose, cautions, easier and harder — closed until
//                 asked, so the first screen stays short.
import { useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Check, ChevronDown, Loader2, Plus, X } from 'lucide-react';
import { LibraryDemo, type DemoTab } from '@/components/library/library-demo';
import { PrimaryCta } from '@/components/ui/fel/primary-cta';
import { Layer } from '@/components/session-player/layer';
import { fromLibrary } from '@/lib/session-player/fromLibrary';
import type { LibraryCard } from '@/lib/library/server';
import { LIB_LOOK as L, SHEET_KEYFRAMES } from './look';

// the player (and its 3D) loads only when Try it is tapped
const SessionPlayer = dynamic(() => import('@/components/session-player/session-player').then((m) => m.SessionPlayer), { ssr: false });

export const SHEET_COPY = {
  tryIt: 'Try it',
  howTo: 'How to set up',
  useInProgram: 'Use in program',
  addToCatalogue: 'Add to my catalogue',
  inCatalogue: 'In your catalogue',
  backToLibrary: 'Back to the library',
  close: 'Close',
} as const;

const dose = (d: LibraryCard['dosage']) => [
  `${d.sets} × ${d.reps ?? (d.seconds ? `${d.seconds} s` : d.contacts ? `${d.contacts} contacts` : d.meters ? `${d.meters} m` : '')}`,
  d.restSec ? `rest ${d.restSec} s` : null, d.tempo ? `tempo ${d.tempo}` : null,
].filter(Boolean).join(' · ');

const muscleWord = (m: string) => m.replace(/-/g, ' ');

export function ExerciseSheet({ e, tab, onClose, onUse, canAdd = false, onAdded, onOpen }: {
  e: LibraryCard; tab?: DemoTab; onClose: () => void;
  /** The builder's "Use in program" (it receives the entry). */
  onUse?: (e: LibraryCard) => Promise<void> | void;
  /** Coaches: "Add to my catalogue". */
  canAdd?: boolean; onAdded?: () => void;
  /** Open another entry (easier, harder) in this sheet. */
  onOpen: (id: string) => void;
}) {
  const [busy, setBusy] = useState<'add' | 'use' | null>(null);
  const [added, setAdded] = useState(false);
  const [more, setMore] = useState(false);
  const [trying, setTrying] = useState(false);
  const add = async () => {
    setBusy('add');
    try {
      const r = await fetch('/api/coach/programs/exercises/from-library', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ libraryId: e.id }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(j.error === 'name_taken_fel' ? 'Another coach already uses that exact name.' : 'Could not add that. Try again.'); return; }
      setAdded(true);
      toast.success(j.already ? `${e.name} is already in your catalogue` : `${e.name} added to your catalogue`);
      onAdded?.();
    } finally { setBusy(null); }
  };
  // Try it: the player takes the whole screen; the sheet steps aside (it sits above the player's layer) and comes back
  // when the player closes
  if (trying) {
    return <Layer><SessionPlayer session={fromLibrary(e)} mode="preview" doneLabel={SHEET_COPY.backToLibrary} onClose={() => setTrying(false)} /></Layer>;
  }
  return (
    <Layer>
      <style>{SHEET_KEYFRAMES}</style>
      <div className={L.veil} onClick={onClose} aria-hidden />
      <div className={L.sheet} role="dialog" aria-modal="true" aria-label={e.name} data-testid="library-sheet" data-exercise-sheet={e.id}>
        <div className={L.head}>
          <div className="min-w-0">
            <h3 className={L.title}>{e.name}</h3>
            {e.review.status === 'draft' && <p className={`${L.section} mt-1 text-[#FFD700]/80`} data-testid="draft-badge">Draft</p>}
          </div>
          <button type="button" onClick={onClose} aria-label={SHEET_COPY.close} className={L.close}><X className="h-5 w-5" /></button>
        </div>

        <LibraryDemo entry={e} initialTab={tab} cuesShown />

        <div className={L.body}>
          {e.primaryMuscles.length > 0 && (
            <ul className={L.muscles} aria-label="Muscles" data-testid="muscle-map">
              {e.primaryMuscles.slice(0, 4).map((m) => <li key={m} className={L.muscle}>{muscleWord(m)}</li>)}
            </ul>
          )}
          <ul className={L.cues} data-sheet-cues>
            {e.cues.slice(0, 3).map((c) => <li key={c} className={L.cue}><span aria-hidden className="text-fel-cyan">•</span><span>{c}</span></li>)}
          </ul>

          <div className={L.cta} data-sheet-try><PrimaryCta onClick={() => { setMore(false); setTrying(true); }} testId="try-it">{SHEET_COPY.tryIt}</PrimaryCta></div>
          {onUse && (
            <button type="button" disabled={busy !== null} onClick={async () => { setBusy('use'); try { await onUse(e); } finally { setBusy(null); } }} className={L.quiet} data-testid="use-in-program">
              {busy === 'use' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} {SHEET_COPY.useInProgram}
            </button>
          )}
          {canAdd && (
            <button type="button" disabled={busy !== null || added} onClick={() => void add()} className={L.quiet} data-testid="add-to-catalogue">
              {busy === 'add' ? <Loader2 className="h-4 w-4 animate-spin" /> : added ? <Check className="h-4 w-4 text-[#7BD389]" /> : <Plus className="h-4 w-4" />} {added ? SHEET_COPY.inCatalogue : SHEET_COPY.addToCatalogue}
            </button>
          )}

          <div className="border-t border-white/[0.08]">
            <button type="button" className={L.more} aria-expanded={more} onClick={() => setMore((m) => !m)} data-sheet-more>
              <span>{SHEET_COPY.howTo}</span><ChevronDown className={`h-4 w-4 transition-transform ${more ? 'rotate-180' : ''}`} />
            </button>
            {more && (
              <div className="space-y-3 pb-2">
                <Section label="Set-up"><p className={L.text}>{e.setup}</p></Section>
                {e.cues.length > 3 && <Section label="Cues"><ul className={`${L.text} list-disc space-y-1 pl-4`}>{e.cues.map((c) => <li key={c}>{c}</li>)}</ul></Section>}
                {/* CUE-REWRITE (2026-10-27): "Watch for", each with its fix */}
                {e.faults.length > 0 && (
                  <Section label="Watch for">
                    <ul className="space-y-1.5">{e.faults.map((f) => <li key={f.fault} className={L.text}><span className="text-white">{f.fault}.</span> <span className="text-fel-cyan">Fix: {f.fix}</span></li>)}</ul>
                  </Section>
                )}
                <Section label="Dose"><p className={L.text}>{dose(e.dosage)}</p></Section>
                {e.prehabNote && <p className={L.text}>{e.prehabNote}</p>}
                {e.cautions.length > 0 && <Section label="Before you load it"><ul className={`${L.text} list-disc space-y-1 pl-4`}>{e.cautions.map((c) => <li key={c}>{c}</li>)}</ul></Section>}
                {e.secondaryMuscles.length > 0 && <p className={L.text}>Also: {e.secondaryMuscles.map(muscleWord).join(', ')}</p>}
                {(e.regressionId || e.progressionId) && (
                  <div className="flex flex-wrap gap-2">
                    {e.regressionId && <button type="button" onClick={() => onOpen(e.regressionId!)} className={`${L.chip} gap-1`}><ArrowDown className="h-3.5 w-3.5" /> Easier version</button>}
                    {e.progressionId && <button type="button" onClick={() => onOpen(e.progressionId!)} className={`${L.chip} gap-1`}><ArrowUp className="h-3.5 w-3.5" /> Harder version</button>}
                  </div>
                )}
                {(e.variants ?? []).length > 0 && (
                  <Section label="Variants">
                    <div className="flex flex-wrap gap-2" data-testid="variants-list">
                      {(e.variants ?? []).map((v) => <button key={v.id} type="button" onClick={() => onOpen(v.id)} className={L.chip}>{v.name}{v.status === 'draft' ? ' · draft' : ''}</button>)}
                    </div>
                  </Section>
                )}
                <p className={L.section}>{e.source.kind === 'seed' ? `From an open public-domain list (${e.source.licence}); words by FEL.` : e.source.kind === 'coach-submitted' ? 'Submitted by a FEL coach.' : 'Written by FEL.'}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layer>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return <div><h5 className={L.section}>{label}</h5>{children}</div>;
}
