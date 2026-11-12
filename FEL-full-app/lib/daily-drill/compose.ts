// DAILY-DRILL (value round item 3, 2026-10-24; the promise "get measurably better"): today's drill as one chart.
//
// Client-safe and pure. The server decides WHICH phases run today (lib/daily-drill/plan.ts: the pick, the safety gates)
// and hands the page phase references, never a chart; this builds the chart back from the drill catalogue
// (lib/drills/drills.ts), so the page's bundle carries the charts it already ships for /play/drills and nothing of the
// pick's rules or rows. The charts themselves are never edited: a phase is copied from its drill as written.
import type { Drill, DrillPhase } from '@/lib/drills/chart';
import { drillById } from '@/lib/drills/drills';

/** One phase of one catalogue drill, by id: { drill: 'wake-up', phase: 'pressurize' }. */
export interface PhaseRef { drill: string; phase: string }

/** What the page needs to rebuild today's chart: its name, the drill it is built around, and the phases in order. */
export interface DailyChartSpec {
  /** The daily key ("jump:pogo-bilateral"): the chart's id, and what the claim names. */
  key: string;
  name: string;
  /** The catalogue drill the day is built around (its source line, its blurb, its demo). */
  drillId: string;
  phases: PhaseRef[];
}

/** The phase a reference names, or null when the catalogue has no such drill or phase. */
export function phaseOf(ref: PhaseRef): DrillPhase | null {
  return drillById(ref.drill)?.phases.find((p) => p.id === ref.phase) ?? null;
}

/**
 * Today's chart: the referenced phases, in the order given, under the main drill's name and source. Phase ids stay
 * the catalogue's own (the runner and the coach's prompts read them); a spec that repeats one is refused, as is one
 * naming a phase the catalogue does not have (an old page against a newer catalogue): null, and the page says so.
 */
export function composeDailyDrill(spec: DailyChartSpec): Drill | null {
  const main = drillById(spec.drillId);
  if (!main || !spec.phases.length) return null;
  const phases: DrillPhase[] = [];
  const seen = new Set<string>();
  for (const ref of spec.phases) {
    const p = phaseOf(ref);
    if (!p || seen.has(p.id)) return null;
    seen.add(p.id);
    phases.push(p);
  }
  return { id: `daily:${spec.key}`, name: spec.name, blurb: main.blurb, source: main.source, checks: main.checks, phases };
}

/** Minutes, rounded up ("6 min"): the same rounding as the drills shelf (lib/drills/route.ts drillMinutes). */
export function specMinutes(spec: Pick<DailyChartSpec, 'phases'>): number {
  const sec = spec.phases.reduce((s, r) => s + (phaseOf(r)?.durationSec ?? 0), 0);
  return Math.max(1, Math.ceil(sec / 60));
}
