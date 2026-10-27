import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Activity, BookOpen, ClipboardList, Dumbbell, Footprints, Gauge, Layers, Library, UtensilsCrossed, Users, ScanLine, Timer } from 'lucide-react';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { prisma } from '@/lib/db';
import { isUnlistedPlayHref } from '@/lib/unlisted-modes';
import { TabPage } from '@/components/shell/tab-page';
// DAILY-DRILL (value round item 3): today's drill from the weakest measured number, for every account
import { DailyDrillCard } from '@/components/daily-drill/daily-drill-card';
import { loadDailyDrill } from '@/lib/daily-drill/load';
import { loadWarmupContext } from '@/lib/coach/warmupServer';
import { DoorsRow } from '@/components/shell/doors-row';
// MIRROR-PROGRESS (2026-10-07): a coached athlete's door to today's session, first on the page (nothing for anyone else)
import { TodayCard } from '@/components/coach/today-card';
import { todayCardFor } from '@/lib/coach/todayCard';
// PROGRESS CARD (value round item 1): the weekly door to /profile/week; reads nothing
import { WeekCardEntry } from '@/components/progress-card/week-entry';
// SIGNATURE-PROGRAMS (2026-10-25): FEL's four signature programs. The card is the same for everyone (this page reads no
// age to draw its cards — tests/drills, tests/mirror-first); the athlete's week shows on /train/programs.
import { TRAIN_LINE_IDLE } from '@/lib/signature/copy';

export const dynamic = 'force-dynamic';

/**
 * TRAIN — the Mirror, the programming, the coach and the fuel, on one shelf.
 *
 * Owner: "one tab where the mirror and all the coaching and training stuff lives". Until this, the movement screen,
 * the coach product, the athlete's programming and the Fuel floor were four unrelated URLs — two of them reachable
 * only by typing. They are one thing: the work you do on yourself between games.
 */
export default async function TrainPage() {
  const session = await getServerSession(authOptions);
  const me = (session?.user as { id?: string } | undefined)?.id;
  if (!me) redirect(loginPath('/train'));

  const [coachLink, coachesAnyone, programCount, todayCard, dailyDrill] = await Promise.all([
    prisma.coachClient.findFirst({ where: { clientId: me, endedAt: null }, select: { coach: { select: { name: true } } } }).catch(() => null),
    prisma.coachClient.findFirst({ where: { coachId: me, endedAt: null }, select: { id: true } }).catch(() => null),
    prisma.coachingProgram.count({ where: { clientId: me } }).catch(() => 0),
    todayCardFor(prisma, me),
    loadDailyDrill(prisma, me, { warmupContext: (id, now) => loadWarmupContext(prisma, id, now) }).catch(() => null),
  ]);

  const cards = [
    {
      // MIRROR-COACH P1 (2026-09-25): this said "Scored, with the corrective work written for you." Nothing grades the
      // screen's stations yet (no app code calls ScreenRunner.record, so every screen came back unscored), and a camera
      // number is an estimate, not a score. It now says what the Mirror does. Put "graded" back only for a station a
      // grader actually scores (lib/workout/workout-copy.test.tsx holds the line).
      href: '/play/mirror', icon: ScanLine, accent: '#00FF9D', title: 'The Mirror',
      line: 'A squat coach and a movement screen on your own camera. It cues what it can see, and every number it shows is an estimate.',
      tag: 'Start a screen',
    },
    {
      // MIRROR-FIRST P1 (2026-10-07): the Quick Screen (/screen → /play/mirror/assess, no sign-in) was linked from nowhere
      // in the app. It goes in at its front door, never a deep link past it: the screen asks its own age question first and,
      // under 18 or unanswered, the grown-up step (app/play/mirror/assess/_components/gate-steps.tsx), for every visitor —
      // it does not read the account, so the same card is right for a teen and an adult. Nothing is sent: the screen has
      // no fetch (assess-app.tsx "KIDS SEND NOTHING"), and results stay in the tab.
      href: '/screen', icon: Timer, accent: '#00E5FF', title: 'Quick Screen',
      line: 'A free movement check on this camera: your jump in about a minute, or the full screen in about five. Nothing is sent.',
      tag: 'Check it',
    },
    {
      // COACH-READINESS (2026-10-25): the 30-second daily jump check (verified adults; the page says so to anyone else)
      href: '/train/readiness', icon: Activity, accent: '#00FF9D', title: 'Readiness check',
      line: 'Three jumps a day against your own normal: ready, normal or low. A low day eases your coached session and your coach is told. 18 and over.',
      tag: 'Check in',
    },
    {
      // SPRINT-SPEED (2026-10-25): sprint and agility timed by the phone's camera (verified adults; the page says so to anyone else)
      href: '/train/speed', icon: Gauge, accent: '#00FF9D', title: 'Sprint speed',
      line: 'Your phone on the finish line times the sprint; side-on it reads your top speed. Camera estimates, each with its ±. 18 and over.',
      tag: 'Time a run',
    },
    {
      // VBT (2026-10-25; wired by coach-delivery 2026-10-27, docs/VBT.md §7.1): camera bar speed (13+; a teen sees technique
      // speed only; the page says so)
      href: '/train/velocity', icon: Dumbbell, accent: '#00E5FF', title: 'Bar speed',
      line: 'Rep speed from your camera: zones, speed loss, your load-velocity line. Estimates, not lab numbers.',
      tag: 'Track a set',
    },
    {
      // DRILLS (2026-10-07, Mirror & coaching Phase 6): the Playbook's ch. 5 wake-up and ch. 6 jump-and-land drills on the
      // camera (/play/drills). The page reads the age and today's checks itself and holds back the jumps they say to;
      // this card reads nothing, so it is the same for every account.
      href: '/play/drills', icon: Footprints, accent: '#00FF9D', title: 'Drills',
      line: "The Playbook's wake-up and jump-and-land drills, on your camera. Follow the targets; nothing is sent.",
      tag: 'Run a drill',
    },
    {
      href: '/training', icon: ClipboardList, accent: '#00E5FF', title: 'Your programming',
      line: coachLink?.coach?.name ? `Written by ${coachLink.coach.name}.` : programCount > 0 ? 'Your blocks and sessions.' : 'No coach yet — an invite link puts their programming here.',
      tag: programCount > 0 || coachLink ? 'Open' : 'How it works',
    },
    {
      // SIGNATURE-PROGRAMS (2026-10-25): approved programs only (lib/signature/access.ts); the list shows the athlete's week
      href: '/train/programs', icon: Layers, accent: '#00FF9D', title: 'Signature programs',
      line: TRAIN_LINE_IDLE,
      tag: 'Browse',
    },
    {
      // EXERCISE-LIBRARY (2026-10-25): the shared library — search it or ask it; approved entries only for athletes
      href: '/train/library', icon: Library, accent: '#00E5FF', title: 'Exercise library',
      line: 'Search every exercise by name, muscle or goal, or ask in plain words. Cues and faults on every one.',
      tag: 'Search',
    },
    {
      href: '/play/training', icon: Dumbbell, accent: '#FFD700', title: 'Iron Paradise',
      line: 'The gym floor. Lift, jump, and put a number on it.',
      tag: 'Train',
    },
    {
      href: '/education/playbook', icon: BookOpen, accent: '#A855F7', title: 'The Playbook',
      line: 'Ten chapters on how the body actually moves, from the book. Every drill is one you can run tonight.',
      tag: 'Learn',
    },
    {
      href: '/kitchens', icon: UtensilsCrossed, accent: '#FF7A2F', title: 'Fuel',
      // MIRROR-COACH P1 review (2026-09-25): was "Your meal prescription from your own movement screen". The Kitchens
      // input is sliders the athlete sets (sample numbers "until a Mirror scan lands": your-build-panel.tsx), not their
      // screen, and "prescription" is a treatment word (lib/share/screen.ts). Said as what it is.
      line: 'Meals keyed to the numbers you enter, and the kitchens behind it.',
      tag: 'Eat',
    },
    {
      // TEAMS-SQUADS (2026-10-25): squads (friends) and teams (a coach's) — daily drills together, a weekly league
      href: '/squads', icon: Users, accent: '#00E5FF', title: 'Squads and teams',
      line: 'Train with friends: a group streak on the daily drill, a weekly league, reactions. No messages.',
      tag: 'Train together',
    },
    ...(coachesAnyone ? [{
      href: '/coach', icon: Users, accent: '#A855F7', title: 'Your roster',
      line: 'The athletes you coach, what they have done this fortnight, and who is drifting.',
      tag: 'Coach',
    }] : []),
    // COMBINE-DAY (2026-10-25): a coach's tryout / testing day; a coached athlete's own combine numbers
    ...(coachesAnyone ? [{
      href: '/coach/combine', icon: Timer, accent: '#00E5FF', title: 'Combine day',
      line: 'Run a tryout: jump, agility, sprint and a skill drill, station by station, then a ranked report.',
      tag: 'Run a combine',
    }] : []),
    ...(coachLink ? [{
      href: '/train/combine', icon: Timer, accent: '#00E5FF', title: 'Your combines',
      line: 'Your numbers from your coach’s combines, and where you placed.',
      tag: 'See results',
    }] : []),
    {
      href: '/profile', icon: Activity, accent: '#7B61FF', title: 'Where you stand',
      line: 'PRQ, your grade, and what has moved since the last screen.',
      tag: 'Read',
    },
  ];

  // IRON-PARADISE-OUT (2026-10-03): a card whose href opens a parked mode (lib/unlisted-modes.ts — the Iron
  // Paradise card's '/play/training' today) stays in the array above, unlisted, and comes back with the list entry.
  const shown = cards.filter((c) => !isUnlistedPlayHref(c.href));

  return (
    <TabPage
      eyebrow="Train"
      title="The work between games"
      lede="Screen it, program it, eat for it. This is the loop the games are the proof of."
      accent="#00FF9D"
    >
      <DailyDrillCard view={dailyDrill} />
      <TodayCard view={todayCard} />
      <WeekCardEntry />
      <ul className="grid gap-3 sm:grid-cols-2">
        {shown.map((c, i) => {
          const Icon = c.icon;
          return (
            <li key={c.href} className="fel-rise" style={{ ['--fel-rise-delay' as string]: `${i * 45}ms` }}>
              <Link
                href={c.href}
                className="group flex h-full gap-4 rounded-2xl border border-white/8 bg-white/[0.02] p-5
                           transition-all duration-300 hover:-translate-y-0.5 hover:border-white/15
                           hover:bg-white/[0.045] hover:shadow-[0_18px_40px_-24px_rgba(0,0,0,0.9)]"
                // the colour arrives on approach rather than sitting there shouting
              >
                <span
                  aria-hidden
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-xl transition-transform duration-300 group-hover:scale-105"
                  style={{ background: `${c.accent}14`, boxShadow: `inset 0 0 0 1px ${c.accent}33` }}
                >
                  <Icon className="h-[19px] w-[19px]" style={{ color: c.accent }} strokeWidth={2.1} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="fel-heading block text-[16px] font-bold leading-tight text-white">{c.title}</span>
                  <span className="mt-1.5 block text-[13px] leading-relaxed text-white/45">{c.line}</span>
                  {/* One colour moment per card. The icon tile carries the accent because it is the destination's
                      identity; the call to action repeating it gave five cards ten coloured marks on a page whose
                      own colour is green, and the eye had nowhere to land. */}
                  <span className="mt-3 inline-block font-mono text-[10px] font-bold uppercase tracking-[0.16em]
                                   text-white/40 transition-colors group-hover:text-white/75">
                    {c.tag} →
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <DoorsRow tab="train" />
    </TabPage>
  );
}
