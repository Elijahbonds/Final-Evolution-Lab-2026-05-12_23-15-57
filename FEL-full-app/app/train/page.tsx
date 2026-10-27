import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { Activity, ArrowUpFromLine, BookOpen, ClipboardList, Dumbbell, Footprints, Gauge, Layers, Library, UtensilsCrossed, Users, ScanLine, Timer } from 'lucide-react';
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
import { TYPE } from '@/lib/design/type';
import { ListRow } from '@/components/ui/fel/cards';
import { enterDelay } from '@/components/ui/fel/page-enter';
// A11-07: the page's words live in messages/en/train.json
import { t } from '@/lib/i18n';
import { MEASURE_VERTICAL_HREF } from '@/lib/vertical/door';

export const dynamic = 'force-dynamic';

type Group = 'measure' | 'program' | 'learn';
const GROUPS: readonly Group[] = ['measure', 'program', 'learn'];

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
      // VERTICAL-EASY (2026-10-27; owner: "It needs to be way easier to measure vertical"): the one front door, first in
      // Measure — one tap from this page into the jump-only run (it asks its own age question; under 18, no camera).
      href: MEASURE_VERTICAL_HREF, group: 'measure' as Group, icon: ArrowUpFromLine, accent: PALETTE.cyan, title: t('train.cards.vertical.title'),
      line: t('train.cards.vertical.line'),
    },
    {
      // MIRROR-COACH P1 (2026-09-25): this said "Scored, with the corrective work written for you." Nothing grades the
      // screen's stations yet (no app code calls ScreenRunner.record, so every screen came back unscored), and a camera
      // number is an estimate, not a score. It now says what the Mirror does. Put "graded" back only for a station a
      // grader actually scores (lib/workout/workout-copy.test.tsx holds the line).
      href: '/play/mirror', group: 'measure' as Group, icon: ScanLine, accent: PALETTE.emerald, title: t('train.cards.mirror.title'),
      line: t('train.cards.mirror.line'),
    },
    {
      // MIRROR-FIRST P1 (2026-10-07): the Quick Screen (/screen → /play/mirror/assess, no sign-in) was linked from nowhere
      // in the app. It goes in at its front door, never a deep link past it: the screen asks its own age question first and,
      // under 18 or unanswered, the grown-up step (app/play/mirror/assess/_components/gate-steps.tsx), for every visitor —
      // it does not read the account, so the same card is right for a teen and an adult. Nothing is sent: the screen has
      // no fetch (assess-app.tsx "KIDS SEND NOTHING"), and results stay in the tab.
      href: '/screen', group: 'measure' as Group, icon: Timer, accent: PALETTE.cyan, title: t('train.cards.quickScreen.title'),
      line: t('train.cards.quickScreen.line'),
    },
    {
      // COACH-READINESS (2026-10-25): the 30-second daily jump check (verified adults; the page says so to anyone else)
      href: '/train/readiness', group: 'measure' as Group, icon: Activity, accent: PALETTE.emerald, title: t('train.cards.readiness.title'),
      line: t('train.cards.readiness.line'),
    },
    {
      // SPRINT-SPEED (2026-10-25): sprint and agility timed by the phone's camera (verified adults; the page says so to anyone else)
      href: '/train/speed', group: 'measure' as Group, icon: Gauge, accent: '#00FF9D', title: t('train.cards.sprint.title'),
      line: t('train.cards.sprint.line'),
    },
    {
      // VBT (2026-10-25; wired by coach-delivery 2026-10-27, docs/VBT.md §7.1): camera bar speed (13+; a teen sees technique
      // speed only; the page says so)
      href: '/train/velocity', group: 'measure' as Group, icon: Dumbbell, accent: PALETTE.cyan, title: t('train.cards.velocity.title'),
      line: t('train.cards.velocity.line'),
    },
    {
      // DRILLS (2026-10-07, Mirror & coaching Phase 6): the Playbook's ch. 5 wake-up and ch. 6 jump-and-land drills on the
      // camera (/play/drills). The page reads the age and today's checks itself and holds back the jumps they say to;
      // this card reads nothing, so it is the same for every account.
      href: '/play/drills', group: 'measure' as Group, icon: Footprints, accent: PALETTE.emerald, title: t('train.cards.drills.title'),
      line: t('train.cards.drills.line'),
    },
    {
      href: '/training', group: 'program' as Group, icon: ClipboardList, accent: PALETTE.cyan, title: t('train.cards.programming.title'),
      line: coachLink?.coach?.name ? t('train.cards.programming.lineCoach', { name: coachLink.coach.name }) : t(programCount > 0 ? 'train.cards.programming.lineBlocks' : 'train.cards.programming.lineNone'),
    },
    {
      // SIGNATURE-PROGRAMS (2026-10-25): approved programs only (lib/signature/access.ts); the list shows the athlete's week
      href: '/train/programs', group: 'program' as Group, icon: Layers, accent: PALETTE.emerald, title: t('train.cards.signature.title'),
      line: TRAIN_LINE_IDLE,
    },
    {
      // EXERCISE-LIBRARY (2026-10-25): the shared library — search it or ask it; approved entries only for athletes
      href: '/train/library', group: 'program' as Group, icon: Library, accent: PALETTE.cyan, title: t('train.cards.library.title'),
      line: t('train.cards.library.line'),
    },
    {
      href: '/play/training', group: 'learn' as Group, icon: Dumbbell, accent: PALETTE.gold, title: t('train.cards.iron.title'),
      line: t('train.cards.iron.line'),
    },
    {
      href: '/education/playbook', group: 'learn' as Group, icon: BookOpen, accent: PALETTE.violet, title: t('train.cards.playbook.title'),
      line: t('train.cards.playbook.line'),
    },
    {
      href: '/kitchens', group: 'learn' as Group, icon: UtensilsCrossed, accent: PALETTE.ember, title: t('train.cards.fuel.title'),
      // MIRROR-COACH P1 review (2026-09-25): was "Your meal prescription from your own movement screen". The Kitchens
      // input is sliders the athlete sets (sample numbers "until a Mirror scan lands": your-build-panel.tsx), not their
      // screen, and "prescription" is a treatment word (lib/share/screen.ts). Said as what it is.
      line: t('train.cards.fuel.line'),
    },
    {
      // TEAMS-SQUADS (2026-10-25): squads (friends) and teams (a coach's) — daily drills together, a weekly league
      href: '/squads', group: 'program' as Group, icon: Users, accent: PALETTE.cyan, title: t('train.cards.squads.title'),
      line: t('train.cards.squads.line'),
    },
    ...(coachesAnyone ? [{
      href: '/coach', group: 'program' as Group, icon: Users, accent: PALETTE.violet, title: t('train.cards.roster.title'),
      line: t('train.cards.roster.line'),
    }] : []),
    // COMBINE-DAY (2026-10-25): a coach's tryout / testing day; a coached athlete's own combine numbers
    ...(coachesAnyone ? [{
      href: '/coach/combine', group: 'program' as Group, icon: Timer, accent: PALETTE.cyan, title: t('train.cards.combine.title'),
      line: t('train.cards.combine.line'),
    }] : []),
    ...(coachLink ? [{
      href: '/train/combine', group: 'program' as Group, icon: Timer, accent: PALETTE.cyan, title: t('train.cards.combines.title'),
      line: t('train.cards.combines.line'),
    }] : []),
    {
      href: '/profile', group: 'measure' as Group, icon: Activity, accent: PALETTE.indigo, title: t('train.cards.standing.title'),
      line: t('train.cards.standing.line'),
    },
  ];

  // IRON-PARADISE-OUT (2026-10-03): a card whose href opens a parked mode (lib/unlisted-modes.ts — the Iron
  // Paradise card's '/play/training' today) stays in the array above, unlisted, and comes back with the list entry.
  const shown = cards.filter((c) => !isUnlistedPlayHref(c.href));

  // PREMIUM-UI P4 (2026-10-27): Muscle Beach full-bleed; today's drill first — it IS the screen's one primary (its card
  // carries the start); then the rest as list rows in three groups, each one line of twelve words or fewer. The shelf used
  // to be sixteen cards of a paragraph each: the owner's "walls of small text".
  const SECTION: Record<Group, string> = { measure: t('train.section.measure'), program: t('train.section.program'), learn: t('train.section.learn') };
  const groupOf = (g: Group) => shown.filter((c) => c.group === g);
  let n = 0;
  return (
    <TabPage
      eyebrow={t('train.eyebrow')}
      title={t('train.title')}
      lede={t('train.lede')}
      hero={{ image: '/backdrops/training.jpg', imagePosition: '50% 60%' }}
    >
      <DailyDrillCard view={dailyDrill} />
      <TodayCard view={todayCard} />
      <WeekCardEntry />
      {GROUPS.map((g) => (
        <section key={g} aria-labelledby={`train-${g}`} className="mt-8 first:mt-0">
          <h2 id={`train-${g}`} className={`${TYPE.label} mb-2 px-1 text-fel-dim`}>{SECTION[g]}</h2>
          <ul className="fel-surface flex flex-col p-1.5">
            {groupOf(g).map((c) => (
              <li key={c.href} className="fel-enter" style={enterDelay(n++)}>
                <ListRow href={c.href} icon={c.icon} accent={c.accent} title={c.title} line={c.line} />
              </li>
            ))}
          </ul>
        </section>
      ))}
      <DoorsRow tab="train" />
    </TabPage>
  );
}
