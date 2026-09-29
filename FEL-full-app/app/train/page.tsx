import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Activity, BookOpen, ClipboardList, Dumbbell, UtensilsCrossed, Users, ScanLine } from 'lucide-react';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { TabPage } from '@/components/shell/tab-page';
import { DoorsRow } from '@/components/shell/doors-row';

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
  if (!me) redirect('/login?next=%2Ftrain');

  const [coachLink, coachesAnyone, programCount] = await Promise.all([
    prisma.coachClient.findFirst({ where: { clientId: me, endedAt: null }, select: { coach: { select: { name: true } } } }).catch(() => null),
    prisma.coachClient.findFirst({ where: { coachId: me, endedAt: null }, select: { id: true } }).catch(() => null),
    prisma.coachingProgram.count({ where: { clientId: me } }).catch(() => 0),
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
      href: '/training', icon: ClipboardList, accent: '#00E5FF', title: 'Your programming',
      line: coachLink?.coach?.name ? `Written by ${coachLink.coach.name}.` : programCount > 0 ? 'Your blocks and sessions.' : 'No coach yet — an invite link puts their programming here.',
      tag: programCount > 0 || coachLink ? 'Open' : 'How it works',
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
    ...(coachesAnyone ? [{
      href: '/coach', icon: Users, accent: '#A855F7', title: 'Your roster',
      line: 'The athletes you coach, what they have done this fortnight, and who is drifting.',
      tag: 'Coach',
    }] : []),
    {
      href: '/profile', icon: Activity, accent: '#7B61FF', title: 'Where you stand',
      line: 'PRQ, your grade, and what has moved since the last screen.',
      tag: 'Read',
    },
  ];

  return (
    <TabPage
      eyebrow="Train"
      title="The work between games"
      lede="Screen it, program it, eat for it. This is the loop the games are the proof of."
      accent="#00FF9D"
    >
      <ul className="grid gap-3 sm:grid-cols-2">
        {cards.map((c, i) => {
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
