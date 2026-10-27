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
import { PALETTE } from '@/lib/design/palette';
// A11-07: the page's words live in messages/en/train.json
import { t } from '@/lib/i18n';

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
      href: '/play/mirror', icon: ScanLine, accent: PALETTE.emerald, title: t('train.cards.mirror.title'),
      line: t('train.cards.mirror.line'),
      tag: t('train.cards.mirror.tag'),
    },
    {
      // MIRROR-FIRST P1 (2026-10-07): the Quick Screen (/screen → /play/mirror/assess, no sign-in) was linked from nowhere
      // in the app. It goes in at its front door, never a deep link past it: the screen asks its own age question first and,
      // under 18 or unanswered, the grown-up step (app/play/mirror/assess/_components/gate-steps.tsx), for every visitor —
      // it does not read the account, so the same card is right for a teen and an adult. Nothing is sent: the screen has
      // no fetch (assess-app.tsx "KIDS SEND NOTHING"), and results stay in the tab.
      href: '/screen', icon: Timer, accent: PALETTE.cyan, title: t('train.cards.quickScreen.title'),
      line: t('train.cards.quickScreen.line'),
      tag: t('train.cards.quickScreen.tag'),
    },
    {
      // COACH-READINESS (2026-10-25): the 30-second daily jump check (verified adults; the page says so to anyone else)
      href: '/train/readiness', icon: Activity, accent: PALETTE.emerald, title: t('train.cards.readiness.title'),
      line: t('train.cards.readiness.line'),
      tag: t('train.cards.readiness.tag'),
    },
    {
      // SPRINT-SPEED (2026-10-25): sprint and agility timed by the phone's camera (verified adults; the page says so to anyone else)
      href: '/train/speed', icon: Gauge, accent: '#00FF9D', title: t('train.cards.sprint.title'),
      line: t('train.cards.sprint.line'),
      tag: t('train.cards.sprint.tag'),
    },
    {
      // DRILLS (2026-10-07, Mirror & coaching Phase 6): the Playbook's ch. 5 wake-up and ch. 6 jump-and-land drills on the
      // camera (/play/drills). The page reads the age and today's checks itself and holds back the jumps they say to;
      // this card reads nothing, so it is the same for every account.
      href: '/play/drills', icon: Footprints, accent: PALETTE.emerald, title: t('train.cards.drills.title'),
      line: t('train.cards.drills.line'),
      tag: t('train.cards.drills.tag'),
    },
    {
      href: '/training', icon: ClipboardList, accent: PALETTE.cyan, title: t('train.cards.programming.title'),
      line: coachLink?.coach?.name ? t('train.cards.programming.lineCoach', { name: coachLink.coach.name }) : t(programCount > 0 ? 'train.cards.programming.lineBlocks' : 'train.cards.programming.lineNone'),
      tag: t(programCount > 0 || coachLink ? 'train.cards.programming.tagOpen' : 'train.cards.programming.tagHow'),
    },
    {
      // SIGNATURE-PROGRAMS (2026-10-25): approved programs only (lib/signature/access.ts); the list shows the athlete's week
      href: '/train/programs', icon: Layers, accent: PALETTE.emerald, title: t('train.cards.signature.title'),
      line: TRAIN_LINE_IDLE,
      tag: t('train.cards.signature.tag'),
    },
    {
      // EXERCISE-LIBRARY (2026-10-25): the shared library — search it or ask it; approved entries only for athletes
      href: '/train/library', icon: Library, accent: PALETTE.cyan, title: t('train.cards.library.title'),
      line: t('train.cards.library.line'),
      tag: t('train.cards.library.tag'),
    },
    {
      href: '/play/training', icon: Dumbbell, accent: PALETTE.gold, title: t('train.cards.iron.title'),
      line: t('train.cards.iron.line'),
      tag: t('train.cards.iron.tag'),
    },
    {
      href: '/education/playbook', icon: BookOpen, accent: PALETTE.violet, title: t('train.cards.playbook.title'),
      line: t('train.cards.playbook.line'),
      tag: t('train.cards.playbook.tag'),
    },
    {
      href: '/kitchens', icon: UtensilsCrossed, accent: PALETTE.ember, title: t('train.cards.fuel.title'),
      // MIRROR-COACH P1 review (2026-09-25): was "Your meal prescription from your own movement screen". The Kitchens
      // input is sliders the athlete sets (sample numbers "until a Mirror scan lands": your-build-panel.tsx), not their
      // screen, and "prescription" is a treatment word (lib/share/screen.ts). Said as what it is.
      line: t('train.cards.fuel.line'),
      tag: t('train.cards.fuel.tag'),
    },
    {
      // TEAMS-SQUADS (2026-10-25): squads (friends) and teams (a coach's) — daily drills together, a weekly league
      href: '/squads', icon: Users, accent: PALETTE.cyan, title: t('train.cards.squads.title'),
      line: t('train.cards.squads.line'),
      tag: t('train.cards.squads.tag'),
    },
    ...(coachesAnyone ? [{
      href: '/coach', icon: Users, accent: PALETTE.violet, title: t('train.cards.roster.title'),
      line: t('train.cards.roster.line'),
      tag: t('train.cards.roster.tag'),
    }] : []),
    // COMBINE-DAY (2026-10-25): a coach's tryout / testing day; a coached athlete's own combine numbers
    ...(coachesAnyone ? [{
      href: '/coach/combine', icon: Timer, accent: PALETTE.cyan, title: t('train.cards.combine.title'),
      line: t('train.cards.combine.line'),
      tag: t('train.cards.combine.tag'),
    }] : []),
    ...(coachLink ? [{
      href: '/train/combine', icon: Timer, accent: PALETTE.cyan, title: t('train.cards.combines.title'),
      line: t('train.cards.combines.line'),
      tag: t('train.cards.combines.tag'),
    }] : []),
    {
      href: '/profile', icon: Activity, accent: PALETTE.indigo, title: t('train.cards.standing.title'),
      line: t('train.cards.standing.line'),
      tag: t('train.cards.standing.tag'),
    },
  ];

  // IRON-PARADISE-OUT (2026-10-03): a card whose href opens a parked mode (lib/unlisted-modes.ts — the Iron
  // Paradise card's '/play/training' today) stays in the array above, unlisted, and comes back with the list entry.
  const shown = cards.filter((c) => !isUnlistedPlayHref(c.href));

  return (
    <TabPage
      eyebrow={t('train.eyebrow')}
      title={t('train.title')}
      lede={t('train.lede')}
      accent={PALETTE.emerald}
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
                  <span className="mt-1.5 block text-[13px] leading-relaxed text-fel-dim">{c.line}</span>
                  {/* One colour moment per card. The icon tile carries the accent because it is the destination's
                      identity; the call to action repeating it gave five cards ten coloured marks on a page whose
                      own colour is green, and the eye had nowhere to land. */}
                  <span className="mt-3 inline-block font-sans text-[12px] font-semibold uppercase tracking-[0.14em]
                                   text-fel-dim transition-colors group-hover:text-white/75">
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
