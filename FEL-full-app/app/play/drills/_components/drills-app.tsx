'use client';

// /play/drills, the client (Mirror & coaching plan Phase 6, "drills and warm-up by body", 2026-10-07): the shelf of
// drills, one drill's page (where it is written, the book's own words, the demo, what waits today), and the camera run
// (drill-live.tsx). The server page decided what may run today (lib/drills/access.ts) and hands it down as ids and lines.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, BookOpen, Camera, Clock } from 'lucide-react';
import { setBodyPlayDobYear } from '@/lib/move/bodyPlayGrownUp';
import { drillById } from '@/lib/drills/drills';
import {
  DRILLS_PATH, LANDING_CHECK_ENTRY, LANDING_UNLOCK_LABEL, LANDING_UNLOCK_LIVE, ROUTE_DRILLS, drillChapterHref, drillHref,
  drillMinutes, drillSourceLine,
} from '@/lib/drills/route';
import { drillToRun, type DrillAccess, type DrillsAccess } from '@/lib/drills/gate';
import type { BookLesson } from '@/lib/drills/playbookLinks';
import { DrillDemo } from './drill-demo';
import { DrillLive } from './drill-live';

export const CAMERA_LINE = 'Runs on your camera, on this device. Nothing from a drill is saved or sent.';
export const HARD_STOP_LINE = "Drills are paused here until you've checked with a clinician and cleared it from the Mirror. This isn't a diagnosis — it's just a pause.";

const GATE_BADGE: Record<DrillAccess['gate'], string | null> = {
  open: null,
  trimmed: 'Calm phases today',
  held: 'Waits today',
};

function Badge({ gate }: { gate: DrillAccess['gate'] }) {
  const t = GATE_BADGE[gate];
  return t ? <span className="rounded-full border border-amber-300/40 px-2 py-0.5 text-[11px] font-bold text-amber-200/90" data-drill-gate={gate}>{t}</span> : null;
}

function Note({ access }: { access: DrillsAccess }) {
  if (!access.note) return null;
  return (
    <p className="rounded-xl border border-amber-300/25 bg-amber-300/[0.05] px-3 py-2 text-[13px] leading-snug text-amber-100/90" data-drill-note={access.impactHeld ?? ''}>
      {access.note}{' '}
      {access.noteHref && <a href={access.noteHref} className="font-bold underline">See what&apos;s needed</a>}
    </p>
  );
}

/**
 * "Do the 1-minute landing check to unlock" (owner, 2026-10-07): where jumps wait on the jump gate's landing check — the
 * shelf, a held drill's page, the Wake-Up's page with its jump phases left out. A plain anchor to the Quick Screen's
 * front page (its age step first); coming back re-reads the gate (DrillsApp). Shown only while LANDING_UNLOCK_LIVE: today
 * no landing check reaches the gate (lib/drills/route.ts says why), and a button that cannot unlock is not offered.
 */
export function LandingUnlock({ access, live = LANDING_UNLOCK_LIVE }: { access: Pick<DrillsAccess, 'landingCheck'>; live?: boolean }) {
  if (!live || !access.landingCheck) return null;
  return (
    <a href={LANDING_CHECK_ENTRY} data-drill-landing-unlock
      className="inline-flex items-center gap-2 rounded-2xl border border-[#00E5FF]/40 bg-[#00E5FF]/[0.07] px-4 py-2.5 text-sm font-black text-[#00E5FF] hover:border-[#00E5FF]/70">
      {LANDING_UNLOCK_LABEL}
    </a>
  );
}

function Shelf({ access, unlockLive }: { access: DrillsAccess; unlockLive?: boolean }) {
  return (
    <div className="space-y-4">
      <Note access={access} />
      {access.drills.some((d) => d.gate !== 'open') && <LandingUnlock access={access} live={unlockLive} />}
      <ul className="grid gap-3 sm:grid-cols-2">
        {ROUTE_DRILLS.map((d) => {
          const a = access.drills.find((x) => x.id === d.id)!;
          return (
            <li key={d.id}>
              <Link href={drillHref(d.id)} data-drill-card={d.id}
                className="flex h-full flex-col gap-2 rounded-2xl border border-white/8 bg-white/[0.02] p-4 transition-colors hover:border-white/20">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-[16px] font-bold text-white">{d.name}</span>
                  <Badge gate={a.gate} />
                </span>
                <span className="text-[13px] leading-relaxed text-white/55">{d.blurb}</span>
                <span className="mt-auto flex items-center gap-3 font-mono text-[10.5px] uppercase tracking-[0.12em] text-white/40">
                  <span>Playbook ch. {d.source.chapter}</span>
                  <span className="flex items-center gap-1"><Clock aria-hidden className="h-3 w-3" />{drillMinutes(d)} min</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="text-[12px] text-white/45">{CAMERA_LINE}</p>
    </div>
  );
}

function BookWords({ lessons, chapterHref }: { lessons: BookLesson[]; chapterHref: string | null }) {
  if (!lessons.length) return null;
  return (
    <section className="space-y-3 rounded-2xl border border-white/8 bg-white/[0.02] p-4" data-drill-book>
      <h3 className="flex items-center gap-2 font-mono text-[10.5px] font-bold uppercase tracking-[0.16em] text-[#A855F7]">
        <BookOpen aria-hidden className="h-3.5 w-3.5" /> From the Playbook
      </h3>
      {lessons.map((l) => (
        <div key={l.id} className="space-y-1">
          <p className="text-[14px] font-bold text-white">{l.title}</p>
          {l.purpose && <p className="text-[13px] text-white/65">Purpose: {l.purpose}</p>}
          {l.steps.length > 0 ? (
            <ol className="list-decimal space-y-0.5 pl-5 text-[13px] leading-relaxed text-white/70">
              {l.steps.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
          ) : l.firstProse ? <p className="text-[13px] leading-relaxed text-white/70">{l.firstProse}</p> : null}
        </div>
      ))}
      {chapterHref && <Link href={chapterHref} className="inline-block text-[13px] font-bold text-[#A855F7] underline-offset-2 hover:underline" data-drill-chapter-link>Read the chapter</Link>}
    </section>
  );
}

function DrillPage({ id, access, lessons, unlockLive }: { id: string; access: DrillsAccess; lessons: BookLesson[]; unlockLive?: boolean }) {
  const drill = drillById(id)!;
  const a = access.drills.find((x) => x.id === id)!;
  const run = useMemo(() => drillToRun(access, id), [access, id]);
  const [live, setLive] = useState(false);
  if (live && run) return <DrillLive drill={run} onLeave={() => setLive(false)} />;
  return (
    <article className="space-y-4" data-drill-page={id}>
      <Link href={DRILLS_PATH} className="inline-flex items-center gap-1.5 text-[13px] text-white/55 hover:text-white">
        <ArrowLeft aria-hidden className="h-4 w-4" /> All drills
      </Link>
      <header className="space-y-1">
        <div className="flex items-center gap-2"><h2 className="text-2xl font-black text-white">{drill.name}</h2><Badge gate={a.gate} /></div>
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/45">{drillSourceLine(drill)} · {drillMinutes(run ?? drill)} min</p>
        <p className="text-[14px] leading-relaxed text-white/70">{drill.blurb}</p>
        {drill.source.adapted && <p className="text-[13px] text-white/55">On camera: {drill.source.adapted}</p>}
      </header>
      {a.gate !== 'open' && <Note access={access} />}
      {a.gate === 'trimmed' && <p className="text-[13px] text-white/60" data-drill-held-phases>Left out today: {a.heldPhases.join(', ')}.</p>}
      {a.gate !== 'open' && <LandingUnlock access={access} live={unlockLive} />}
      <ol className="space-y-1.5" data-drill-phases>
        {(run ?? drill).phases.map((p) => (
          <li key={p.id} className="rounded-xl bg-white/[0.03] px-3 py-2 text-[13px] text-white/75">
            <span className="font-bold text-white">{p.name}</span> · {Math.round(p.durationSec / 6) / 10} min{p.presence === 'free' ? ' · rest' : ''}
            <span className="block text-white/55">{p.cue}</span>
          </li>
        ))}
      </ol>
      {run ? (
        <button type="button" onClick={() => setLive(true)} data-drill-start
          className="flex items-center gap-2 rounded-2xl bg-white px-6 py-3 text-sm font-black text-black">
          <Camera aria-hidden className="h-4 w-4" /> Start with the camera
        </button>
      ) : null}
      <p className="text-[12px] text-white/45">{CAMERA_LINE}</p>
      <DrillDemo drill={drill} />
      <BookWords lessons={lessons} chapterHref={drillChapterHref(drill)} />
    </article>
  );
}

export function DrillsApp({ access, drillId, lessons, dobYear, unlockLive }: {
  access: DrillsAccess; drillId: string | null; lessons: BookLesson[]; dobYear: number | null;
  /** Tests only: the landing-unlock button with LANDING_UNLOCK_LIVE's value overridden. */
  unlockLive?: boolean;
}) {
  const router = useRouter();
  // back from the landing check (a return to this tab, or the browser's Back restoring the page): read the gate again,
  // so jumps it now opens show unlocked without a manual reload
  useEffect(() => {
    if (!access.landingCheck) return;
    const again = () => { if (document.visibilityState === 'visible') router.refresh(); };
    const shown = (e: PageTransitionEvent) => { if (e.persisted) router.refresh(); };
    document.addEventListener('visibilitychange', again);
    window.addEventListener('pageshow', shown);
    return () => { document.removeEventListener('visibilitychange', again); window.removeEventListener('pageshow', shown); };
  }, [access.landingCheck, router]);
  // body play's grown-up step reads the account's birth year when the page has it (lib/move/bodyPlayGrownUp): a verified
  // adult is not asked; under 18 or none on file, the step comes before the camera
  useEffect(() => { setBodyPlayDobYear(dobYear); return () => setBodyPlayDobYear(undefined); }, [dobYear]);
  if (access.stopped) {
    return (
      <div className="space-y-3 rounded-xl border border-amber-300/25 p-6 text-center" data-drill-hard-stop>
        <p className="text-[14px] text-white/75">{HARD_STOP_LINE}</p>
        <Link href="/play/mirror" className="inline-block rounded-lg bg-white/10 px-4 py-2 text-xs font-semibold text-white/85">Go to the Mirror</Link>
      </div>
    );
  }
  return drillId
    ? <DrillPage key={drillId} id={drillId} access={access} lessons={lessons} unlockLive={unlockLive} />
    : <Shelf access={access} unlockLive={unlockLive} />;
}
