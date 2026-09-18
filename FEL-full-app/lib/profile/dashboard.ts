// ATHLETE STATUS — what the hub shows, and the one thing to do next (2026-09-13).
//
// The brief, §2.5: "Central hub: real-time PRQ shifts, completed Academy modules, calibration history,
// active sessions." Build-order item #4, and the read surface over everything the previous items produced.
//
// THIS IS THE DATA, NOT THE SCREEN. Assembling a status is full of judgement — what counts as a shift, what
// to do when there is only one data point, which of six possible next actions to lead with — and every one
// of those decisions is testable. A React page reading this can be dumb, which is what a React page should
// be.
//
// THREE DECISIONS WORTH ARGUING WITH:
//
//   1. A SHIFT NEEDS TWO POINTS, and with one it says so rather than showing +0. "No change" and "we cannot
//      tell yet" look identical on a dashboard and mean opposite things — the first says keep going, the
//      second says come back and scan. Every delta here is `number | null`.
//
//   2. ONE NEXT ACTION, not a to-do list. A hub that shows six things a player could do is a hub they close.
//      The action is chosen by what is most blocking, and there is always exactly one — including "nothing,
//      you are on track", which is a real answer and not a fallback.
//
//   3. A SHIFT IS SHOWN AGAINST THE ATHLETE'S OWN HISTORY, never against other athletes. There is no
//      percentile anywhere in this file. Comparing an athlete to a population is where a performance tool
//      starts telling people things about their bodies that it has not measured.
//
// Pure: no Prisma, no DOM.

import type { SharedProfile, PRQSnapshot } from './sharedProfile';
import { currentPRQ, credentials, completedModules } from './sharedProfile';
import { missingAxes, suggestNextMeasurements } from './scanToSnapshot';
import type { Protocol } from './protocol';
import { partition } from './protocol';

/** A change against this athlete's own past. Null means not enough history to say. */
export interface Shift {
  now: number | null;
  was: number | null;
  delta: number | null;
  /** What a UI renders. Never "0" when the answer is "we cannot tell". */
  label: string;
}

export type NextActionKind =
  | 'first-scan' | 'rescan' | 'measure-gap' | 'unlock-close' | 'academy' | 'on-track';

export interface NextAction {
  kind: NextActionKind;
  /** One sentence. What to do, not why the system wants it. */
  text: string;
  /** Where it points, when it points somewhere. */
  href?: string;
}

export interface AthleteStatus {
  clientId: string;
  displayName: string;
  /** Null when never scanned — "unscanned" is not a score of 0. */
  composite: number | null;
  /** Composite against 28 days ago. */
  shift: Shift;
  /** Per-axis, same rules. */
  axisShifts: Record<string, Shift>;
  /** Days since the most recent scan, or null if there has never been one. */
  scanAgeDays: number | null;
  /** Axes with no measurement behind them at all. */
  gaps: string[];
  /** Modules finished, and of those, credentials passed. */
  modulesCompleted: number;
  credentialsEarned: number;
  /** Protocols open to this athlete right now, out of the catalogue. */
  openProtocols: number;
  totalProtocols: number;
  /** The single closest locked protocol, so progress has a target. */
  nextUnlock: { key: string; title: string; need: string } | null;
  /** Exactly one. */
  next: NextAction;
}

const DAY = 86_400_000;
export const SHIFT_WINDOW_DAYS = 28;
export const RESCAN_AFTER_DAYS = 14;

function shiftOf(now: number | null, was: number | null): Shift {
  if (now === null) return { now: null, was, delta: null, label: 'Not scanned yet' };
  if (was === null) return { now, was: null, delta: null, label: 'First reading' };
  const delta = Math.round((now - was) * 10) / 10;
  const label = delta === 0 ? 'Level' : `${delta > 0 ? '+' : ''}${delta} in ${SHIFT_WINDOW_DAYS} days`;
  return { now, was, delta, label };
}

/** The newest snapshot at or before `at`. */
function snapshotAt(profile: SharedProfile, atIso: string): PRQSnapshot | null {
  const before = profile.prq.filter((s) => s.at <= atIso).sort((a, b) => a.at.localeCompare(b.at));
  return before.length ? before[before.length - 1] : null;
}

export function buildStatus(
  profile: SharedProfile,
  catalogue: readonly Protocol[],
  now: number = Date.now(),
): AthleteStatus {
  const snap = currentPRQ(profile);
  const windowStart = new Date(now - SHIFT_WINDOW_DAYS * DAY).toISOString();
  const past = snapshotAt(profile, windowStart);

  const shift = shiftOf(snap?.composite ?? null, past?.composite ?? null);

  const axisShifts: Record<string, Shift> = {};
  for (const axis of Object.keys(snap?.axes ?? {})) {
    axisShifts[axis] = shiftOf(snap?.axes[axis] ?? null, past?.axes[axis] ?? null);
  }

  const scanAgeDays = snap ? Math.floor((now - Date.parse(snap.at)) / DAY) : null;
  const { open, locked } = partition(catalogue, profile, now);

  // the closest thing to unlocking, so progress always has a target rather than a list of refusals
  const closest = locked
    .flatMap((l) => l.gate.blocking.filter((b) => b.have !== null).map((b) => ({ l, b })))
    .sort((a, b) => a.b.short - b.b.short)[0];

  return {
    clientId: profile.clientId,
    displayName: profile.displayName,
    composite: snap?.composite ?? null,
    shift,
    axisShifts,
    scanAgeDays,
    gaps: missingAxes(snap),
    modulesCompleted: completedModules(profile, 'blueprint').length,
    credentialsEarned: credentials(profile).length,
    openProtocols: open.length,
    totalProtocols: catalogue.length,
    nextUnlock: closest
      ? { key: closest.l.protocol.key, title: closest.l.protocol.title, need: `${closest.b.label} at ${closest.b.need} — you're at ${closest.b.have}` }
      : null,
    next: chooseAction(snap, scanAgeDays, missingAxes(snap), closest, profile),
  };
}

/**
 * The one action.
 *
 * Ordered by what actually blocks the athlete, not by what the product would like them to do. A player with
 * no scan cannot be sold a protocol; a player whose data is stale cannot be given a real answer about
 * anything. Only once those are handled does it point at progress, and if none of it applies it says so
 * plainly rather than inventing a task.
 */
function chooseAction(
  snap: PRQSnapshot | null,
  scanAgeDays: number | null,
  gaps: string[],
  closest: { l: { protocol: Protocol }; b: { label: string; need: number; have: number | null } } | undefined,
  profile: SharedProfile,
): NextAction {
  if (!snap) {
    return { kind: 'first-scan', text: 'Run your first System Scan — everything else keys off it.', href: '/play/mirror' };
  }
  if ((scanAgeDays ?? 0) >= RESCAN_AFTER_DAYS) {
    return { kind: 'rescan', text: `Your last scan was ${scanAgeDays} days ago. Scan again to keep the numbers real.`, href: '/play/mirror' };
  }
  if (gaps.length) {
    const next = suggestNextMeasurements(snap, 1)[0];
    return {
      kind: 'measure-gap',
      text: next
        ? `Nothing measures your ${gaps[0]} yet — add a ${next.key.replace(/([A-Z])/g, ' $1').toLowerCase().trim()}.`
        : `Nothing measures your ${gaps[0]} yet.`,
      href: '/play/mirror',
    };
  }
  if (closest) {
    return {
      kind: 'unlock-close',
      text: `${closest.l.protocol.title} opens at ${closest.b.label} ${closest.b.need} — you're at ${closest.b.have}.`,
    };
  }
  if (completedModules(profile, 'blueprint').length < 12) {
    return { kind: 'academy', text: 'Everything is open. Take the next Academy module.', href: '/education' };
  }
  // a real answer, not a fallback
  return { kind: 'on-track', text: 'Nothing needs you today — go and play.' };
}

/**
 * The axes that moved most, best first, for a "what changed" strip.
 *
 * Only axes with a real delta appear. An axis with one reading has not moved — it has been seen once — and
 * putting it in a change list as "0" is the same lie the shift labels exist to avoid.
 */
export function biggestMovers(status: AthleteStatus, max = 3): { axis: string; delta: number }[] {
  return Object.entries(status.axisShifts)
    .filter(([, s]) => s.delta !== null && s.delta !== 0)
    .map(([axis, s]) => ({ axis, delta: s.delta as number }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, max);
}
