'use client';

// LearnHome — /learn, the one home for learning (PLAT-P04, 2026-10-27). It replaces three doors (/learn the feed,
// /education, /education/playbook) with one place, top to bottom:
//   1. Continue — one card, one tap back into the lesson you were in (components/learn/continue.ts);
//   2. the Playbook — its ten chapters as rings that fill as you finish lessons;
//   3. Practice — the lessons that open the camera or a drill;
//   4. the feed — quick cards and spaced reviews, now at /learn/feed;
//   5. the Academy — the older game tips (owner call §5.2 (a): moved here, its Lab Credit rules unchanged).
// Progress is read where it already lives: the course's own record for a signed-in account (/api/education/playbook),
// this device for the place-marker and the feed. Nothing new is stored on a server, so a teen's learning stays on the
// device. Words are draft copy for the owner (OWN-24); chapter and lesson titles are the book's.

import { useContext, useEffect, useMemo, useState } from 'react';
import { SessionContext } from 'next-auth/react';
import { Activity, Camera, ChevronRight, GraduationCap, Layers } from 'lucide-react';
import { CHAPTERS, chapterProgress } from '@/lib/education/course';
import { loadState } from '@/lib/knowledge/storage';
import { loginPath } from '@/lib/auth/safeNext';
import { TYPE } from '@/lib/design/type';
import { HeroHeader } from '@/components/ui/fel/hero-header';
import { PrimaryCta } from '@/components/ui/fel/primary-cta';
import { StatRing } from '@/components/ui/fel/stat-ring';
import { ListRow } from '@/components/ui/fel/cards';
import { EducationView } from '@/components/education-view';
import { deviceStore, readLastLesson } from '@/components/education/last-lesson';
import { continueTarget } from './continue';
import { practiceRows } from './practice';

/** The hero picture: the owner's own dunk photograph (public/brand, credited in lib/credits/credits.ts, owner-brand). */
export const LEARN_HERO_IMAGE = '/brand/bonds-dunk-arena.jpg';

const NO_DONE: ReadonlySet<string> = new Set();

export function LearnHome() {
  // the context, not useSession(): this renders outside a SessionProvider in tests (and must not throw there)
  const session = useContext(SessionContext);
  const signedIn = session?.status === 'authenticated';
  const [done, setDone] = useState<ReadonlySet<string>>(NO_DONE);
  const [device, setDevice] = useState<{ last: ReturnType<typeof readLastLesson>; feedStarted: boolean } | null>(null);

  useEffect(() => {
    setDevice({ last: readLastLesson(deviceStore()), feedStarted: loadState().onboarded });
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    fetch('/api/education/playbook')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (live && Array.isArray(j?.done)) setDone(new Set<string>(j.done)); })
      .catch(() => {});
    return () => { live = false; };
  }, [signedIn]);

  const target = useMemo(
    () => continueTarget({ last: device?.last ?? null, done, signedIn, feedStarted: device?.feedStarted ?? false }),
    [device, done, signedIn],
  );
  const practice = useMemo(() => practiceRows(), []);

  return (
    <div className="relative min-h-screen bg-fel-bg pb-28 md:pb-12" data-learn-home>
      {/* 1. Continue: the hero IS the card — where you were, and the one button back into it. */}
      <HeroHeader image={LEARN_HERO_IMAGE} imagePosition="50% 25%" eyebrow={target.eyebrow} title={target.title} line={target.line} testId="learn-continue-card">
        <PrimaryCta href={target.href} testId="learn-continue">{target.cta}</PrimaryCta>
      </HeroHeader>

      <main data-couch-scale className="fel-fade relative mx-auto max-w-[1080px] px-5 pt-2">
        {/* 2. The course: ten rings that fill as lessons are done. */}
        <section aria-labelledby="learn-playbook" data-learn-playbook>
          <h2 id="learn-playbook" className={`${TYPE.heading} text-white`}>The Playbook</h2>
          <ol className="-mx-5 mt-3 flex snap-x gap-2 overflow-x-auto px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {CHAPTERS.map((c) => {
              const p = chapterProgress(c, done);
              return (
                <li key={c.number} className="shrink-0 snap-start">
                  {/* the ring is the chapter: its number, how full it is; its title is its name to a screen reader and on
                      hover (ten titles in a sideways row were 36 words on a phone's first screen) */}
                  <a href={`/education/playbook/${c.number}`} data-learn-chapter={c.number} aria-label={`Chapter ${c.number}: ${c.title}`} title={c.title}
                    className="fel-press flex flex-col items-center rounded-[16px] p-2 text-center hover:bg-white/[0.04]">
                    <StatRing value={p.pct} max={100} label={`Chapter ${c.number}, ${c.title}`} display={String(c.number)} size={112} stroke={8} />
                  </a>
                </li>
              );
            })}
          </ol>
        </section>

        {/* 3. Practice: the lessons that open the camera or a drill. */}
        <section aria-labelledby="learn-practice" className="mt-8" data-learn-practice>
          <h2 id="learn-practice" className={`${TYPE.heading} text-white`}>Practice</h2>
          <div className="mt-2 grid gap-1 md:grid-cols-2">
            {practice.map((r) => (
              <PracticeRowLink key={r.id} href={r.href} camera={r.camera} title={r.title}
                line={`Chapter ${r.chapter} · ${r.camera && r.drill ? 'camera and drill' : r.camera ? 'on camera' : 'drill'}`} testId={`learn-practice-${r.id}`} />
            ))}
          </div>
        </section>

        {/* 4. The feed, on its own page now. */}
        <section aria-labelledby="learn-feed" className="mt-8" data-learn-feed-door>
          <h2 id="learn-feed" className={`${TYPE.heading} text-white`}>The feed</h2>
          <div className="mt-2">
            <ListRow href="/learn/feed" icon={Layers} title="Quick cards" line="A minute at a time. Reviews come back." testId="learn-feed-door" />
          </div>
        </section>

        {/* 5. The Academy: the game tips, at the bottom (owner call §5.2 (a)); its Lab Credits are unchanged. */}
        <section aria-labelledby="academy" className="mt-8" data-learn-academy>
          {signedIn ? (
            <EducationView />
          ) : (
            <>
              <h2 id="academy" className={`${TYPE.heading} text-white`}>Academy</h2>
              <div className="mt-2">
                <ListRow href={loginPath('/learn')} icon={GraduationCap} title="Game tips" line="Sign in to open the Academy." testId="learn-academy-signin" />
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}

/** A Practice row: the kit's ListRow shape on the small sizes (14 / 12), so the shelf adds no fifth type size to the first
 *  screen. look: premium-ui may fold this into ListRow as a `compact` size. */
function PracticeRowLink({ href, camera, title, line, testId }: { href: string; camera: boolean; title: string; line: string; testId: string }) {
  const Icon = camera ? Camera : Activity;
  return (
    <a href={href} data-testid={testId} data-fel-card="row" className="fel-press group flex min-h-[60px] items-center gap-3 rounded-[16px] px-3 py-2.5 hover:bg-white/[0.04]">
      <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-fel-cyan/[0.12] shadow-[inset_0_0_0_1px_rgba(0,229,255,0.28)]">
        <Icon className="h-5 w-5 text-fel-cyan" strokeWidth={2.1} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={`${TYPE.small} truncate font-semibold text-white`}>{title}</span>
        <span className={`${TYPE.label} truncate normal-case tracking-normal text-fel-dim`}>{line}</span>
      </span>
      <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-fel-quiet transition-transform group-hover:translate-x-0.5" />
    </a>
  );
}
