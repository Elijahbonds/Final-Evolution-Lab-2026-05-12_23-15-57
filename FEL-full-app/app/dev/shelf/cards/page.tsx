import { notFound } from 'next/navigation';
import { TabPage } from '@/components/shell/tab-page';
import { BoostShelf } from '@/components/cards/boost-shelf';
import { gameVitals } from '@/lib/cards/boosts';
import { prqGrade } from '@/lib/prq';

export const dynamic = 'force-dynamic';

/**
 * A session-less view of the Profile tab's new half — the creator-card shelf and the PRQ header (the measured
 * number; CARD-SAFE-2: cards are cosmetic, so there is no separate in-game number). Same components the real page mounts. Buying from here will 401,
 * which is correct: this is for looking at, and the wallet does not care that you are a developer.
 *
 * Hard 404 outside `next dev`, like every other app/dev page. It was being served on the live site (bug sweep
 * 2026-10-14) with a made-up "Elijah Bonds" profile and a PRQ of 64 that nobody earned.
 */
export default function DevCardsPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  const vitals = gameVitals(64, ['coach-v-elite', 'neural-max']);
  const grade = prqGrade(vitals.base);
  return (
    <TabPage
      eyebrow="Profile"
      title="Elijah Bonds"
      lede="Your measured self, your deck, and the card you hand to somebody else."
      accent="#FFD700"
      aside={
        <div className="flex items-end gap-5">
          <div className="text-right">
            <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.18em] text-white/35">PRQ</p>
            <p className="fel-heading text-[34px] font-black leading-none" style={{ color: grade.color }}>{vitals.base}</p>
            <p className="mt-1 font-mono text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: grade.color }}>{grade.label}</p>
          </div>
        </div>
      }
    >
      <BoostShelf shards={620} owned={['coach-v-elite', 'neural-max']} />
    </TabPage>
  );
}
