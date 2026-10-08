/**
 * /dev/mirror-correctives — the Mirror's written correctives on fixture data, without a session or a database
 * (MIRROR-COACH P9, 2026-09-30). The real CorrectivesView (the /play/mirror/correctives page's body) over a fixture
 * athlete's saved press/row sets, and the real SessionCorrectives (what the Mirror shows under a press/row set's summary)
 * with the real CorrectivesPicker beside it.
 *
 *   ?case=adult      an adult mid-program: 2 sets set it, 1 done since (retest in 3)
 *   ?case=retest     an adult just past a retest: its comparison, and the next program
 *   ?case=not-kept   an adult whose sets are not kept (every account today: lib/privacy/scanSaveGate.ts)
 *   ?case=hold       an adult whose health intake is due
 *   ?case=minor      under 18 by birth year
 *   ?case=unknown    no birth year on file
 *
 * Not linked from nav. Hard 404 outside development, like the other dev harnesses.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CorrectivesView } from '@/components/mirror/correctives-view';
import { CorrectivesPicker, SessionCorrectives } from '@/components/mirror/session-correctives';
import {
  CORRECTIVES_INTAKE_FIRST, PRESS_ROW_PATTERN_ID, programView, type SavedSetRow, type SetSummaryLike,
} from '@/lib/mirror/correctives';
import type { YouthGate } from '@/lib/mirror/screenCorrectives';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'FEL — Mirror Correctives Harness',
  robots: { index: false, follow: false },
};

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 8, 20);
const set = (i: number, faultCounts: Record<string, number>): SavedSetRow => ({
  patternId: PRESS_ROW_PATTERN_ID, startedAt: new Date(T0 + i * DAY), reps: 12, faultCounts,
});
const DRIFT = { upper_traps: 4, posterior_chain: 3, lat_rhomboid: 3 };

const CASES: Record<string, { youth: YouthGate; rows: SavedSetRow[]; keeping: boolean; hold: string | null }> = {
  adult: { youth: null, rows: [set(0, DRIFT), set(1, DRIFT), set(2, { upper_traps: 2 })], keeping: true, hold: null },
  retest: { youth: null, rows: [set(0, DRIFT), set(1, DRIFT), set(2, { upper_traps: 2 }), set(3, {}), set(4, { upper_traps: 1 }), set(5, {})], keeping: true, hold: null },
  'not-kept': { youth: null, rows: [], keeping: false, hold: null },
  hold: { youth: null, rows: [], keeping: true, hold: CORRECTIVES_INTAKE_FIRST },
  minor: { youth: 'minor', rows: [], keeping: false, hold: null },
  unknown: { youth: 'unknownAge', rows: [], keeping: false, hold: null },
};

/** A press/row set's live summary, as the harness holds it after End (overlay-compositor.ts SessionSummary). */
const SUMMARY: SetSummaryLike = {
  durationMs: 120_000, reps: 12, avgTempo: { pullSec: 1.6, pressSec: 1.4 },
  faultCounts: { rib_thoracic: 8, lumbo_pelvic: 8, posterior_chain: 6, lat_rhomboid: 6, upper_traps: 5 },
  timeInStableMs: { rib_thoracic: 20_000, lumbo_pelvic: 20_000, posterior_chain: 30_000, lat_rhomboid: 30_000, upper_traps: 40_000 },
};

export default function DevMirrorCorrectivesPage({ searchParams }: { searchParams: { case?: string } }) {
  if (process.env.NODE_ENV !== 'development') notFound();
  const key = searchParams.case && searchParams.case in CASES ? searchParams.case : 'adult';
  const c = CASES[key];
  return (
    <div className="min-h-screen bg-[#050505] pb-20 text-white" data-dev-case={key}>
      <CorrectivesView youth={c.youth} hold={c.hold} program={programView(c.rows, c.youth, { keeping: c.keeping })} />
      <div className="mx-auto max-w-[900px] px-4">
        <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">In the Mirror: beside the pattern tabs</p>
        <CorrectivesPicker youth={c.youth} />
        <section className="mt-2 rounded-2xl border border-white/8 bg-white/[0.02] p-5">
          <h2 className="fel-heading text-[15px] font-bold text-white/80">In the Mirror: under a press/row set&apos;s summary · estimated</h2>
          <SessionCorrectives summary={SUMMARY} youth={c.youth} />
        </section>
      </div>
    </div>
  );
}
