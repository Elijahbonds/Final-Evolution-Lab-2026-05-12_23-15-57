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
import { Activity, Camera, GraduationCap, Layers } from 'lucide-react';
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
                <li key={c.number} className="w-[128px] shrink-0 snap-start">
                  <a href={`/education/playbook/${c.number}`} data-learn-chapter={c.number}
                    className="fel-press flex flex-col items-center gap-2 rounded-[16px] p-2 text-center hover:bg-white/[0.04]">
                    <StatRing value={p.pct} max={100} label={`Chapter ${c.number}, ${c.title}`} display={String(c.number)} size={112} stroke={8} />
                    <span className={`${TYPE.small} line-clamp-2 text-fel-soft`}>{c.title}</span>
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
              <ListRow key={r.id} href={r.href} icon={r.camera ? Camera : Activity} title={r.title}
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
