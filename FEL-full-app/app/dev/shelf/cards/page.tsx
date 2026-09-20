import { TabPage } from '@/components/shell/tab-page';
import { BoostShelf } from '@/components/cards/boost-shelf';
import { gameVitals } from '@/lib/cards/boosts';
import { prqGrade } from '@/lib/prq';

export const dynamic = 'force-dynamic';

/**
 * A session-less view of the Profile tab's new half — the creator-card shelf and the PRQ header that shows the
 * measured number and the in-game one apart. Same components the real page mounts. Buying from here will 401,
 * which is correct: this is for looking at, and the wallet does not care that you are a developer.
 */
export default function DevCardsPage() {
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
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-right">
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/35">In game</p>
            <p className="fel-heading text-[20px] font-black leading-none text-white">{vitals.boosted}</p>
            <p className="mt-0.5 font-mono text-[9px] text-[#A855F7]">+{vitals.lift} from cards</p>
          </div>
        </div>
      }
    >
      <BoostShelf shards={620} owned={['coach-v-elite', 'neural-max']} />
    </TabPage>
  );
}
