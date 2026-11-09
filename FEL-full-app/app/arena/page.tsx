import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { prisma } from '@/lib/db';
import { ArenaView } from '@/components/arena-view';
import { TeenArenaView } from '@/components/arena/teen-arena-view';
import { arenaBand, ARENA_BIRTH_YEAR_HREF } from '@/lib/age/arenaAgeBand';
import { teenPrizeLc, teenDailyCapLc } from '@/lib/arena-teen';
import { TEEN_ARENA_COPY } from '@/lib/arena-teen-copy';

export const dynamic = 'force-dynamic';

/**
 * M14 — Triumph Arena. Skill-based head-to-head duels wagered in virtual Lab
 * Credits (LC). No cash on-ramp exists for LC, so the Arena is a pure
 * skill-competition ladder — entirely separate from the (dark) real-money
 * competition path gated behind REAL_MONEY_COMPETITION.
 *
 * ARENA-AGE-1 (Cyber F1 fix 2, T5): the page reads the account's band on the SERVER (DB birth year, unknown = not an
 * adult). A teen or unknown-age account gets the practice Arena (no entry, fixed prize, house rivals only); an unknown
 * age is also asked to add a birth year. The client never picks the mode.
 */
export default async function ArenaPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginPath('/arena'));
  const userId = (session.user as { id?: string } | undefined)?.id ?? '';
  const { band, reason } = await arenaBand(prisma as any, userId);

  if (band === 'teen') {
    return (
      <div className="min-h-screen bg-[#050505] pb-20">
        <main className="mx-auto max-w-[960px] px-4 py-8">
          <div className="flex items-center gap-3">
            <h1 className="fel-heading text-3xl font-bold text-white">
              PRACTICE <span className="text-[#00E5FF]">ARENA</span>
            </h1>
          </div>
          <p className="mt-1 max-w-2xl font-mono text-sm text-white/70">{TEEN_ARENA_COPY.intro}</p>
          <TeenArenaView
            prize={teenPrizeLc()}
            dailyCap={teenDailyCapLc()}
            birthYearHref={reason === 'age_unknown' ? ARENA_BIRTH_YEAR_HREF : null}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      <main className="mx-auto max-w-[960px] px-4 py-8">
        <div className="flex items-center gap-3">
          <h1 className="fel-heading text-3xl font-bold text-white">
            TRIUMPH <span className="text-[#FF3366]">ARENA</span>
          </h1>
        </div>
        {/* HOTFIX (2026-09-24): "the same seeded challenge" was never true — no mode reads the match seed. Each player
            plays their own run of the same mode. */}
        <p className="mt-1 max-w-2xl font-mono text-xs text-white/50">
          Head-to-head skill duels wagered in Lab Credits. Post a stake, match an
          opponent, then each of you plays the same mode. Highest score takes the
          pot &mdash; ties are refunded in full.
        </p>
        <ArenaView />
      </main>
    </div>
  );
}
