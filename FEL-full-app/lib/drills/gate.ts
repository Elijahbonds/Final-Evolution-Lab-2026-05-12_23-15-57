// gate — what /play/drills may run today, as the page hands it to the browser (Mirror & coaching plan Phase 6,
// 2026-10-07). The decision is lib/drills/access.ts (server-side: it reads the warm-up's context and rules); this is its
// answer's shape and the one thing the client does with it — build the drill that runs from the chart's own data — kept
// apart so the drills page's bundle carries neither the warm-up's rules nor its copy.
import type { Drill } from './chart';
import { drillById } from './drills';
import type { HeldReason } from '../coach/warmup';

/** open: as written · trimmed: some phases held (the Wake-Up's jumps) · held: not today. */
export type DrillGate = 'open' | 'trimmed' | 'held';

export interface DrillAccess {
  id: string;
  gate: DrillGate;
  /** The phases that run, in the chart's order (all of them when open; none when held). */
  phases: string[];
  /** The phases left out, by name ("Build the Rhythm, Prime the Launch"). */
  heldPhases: string[];
}

export interface DrillsAccess {
  /** A standing intake red flag: no drill is offered. */
  stopped: boolean;
  /** Why jumps and landings wait today, or null when they do not. */
  impactHeld: Extract<HeldReason, 'youth_impact' | 'pain' | 'jump_gate' | 'unavailable'> | null;
  /** The one line that says so (the warm-up's words), or null. */
  note: string | null;
  /** Where that line points (the gate's own link: the health answers; for the landing check, the Quick Screen's front
   *  page), or null. */
  noteHref: string | null;
  /** The jumps wait on P8's jump gate for a LANDING CHECK (its lead reason is landing_*): the one wait a player can end
   *  here and now, with the Quick Screen's jump test (the owner's "landing check to unlock" button, 2026-10-07). */
  landingCheck: boolean;
  drills: DrillAccess[];
}

/**
 * The drill as it runs today: the chart itself when open, the chart with only its kept phases (in order) when trimmed,
 * null when held or not on the route. Built from the chart's own data; lib/drills' charts are never edited.
 */
export function drillToRun(access: Pick<DrillsAccess, 'stopped' | 'drills'>, id: string): Drill | null {
  if (access.stopped) return null;
  const a = access.drills.find((x) => x.id === id);
  const d = drillById(id);
  if (!a || !d || a.gate === 'held') return null;
  if (a.gate === 'open') return d;
  const phases = d.phases.filter((p) => a.phases.includes(p.id));
  return phases.length ? { ...d, phases } : null;
}

