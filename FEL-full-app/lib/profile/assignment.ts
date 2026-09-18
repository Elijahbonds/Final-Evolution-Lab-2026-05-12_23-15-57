// COACH PROGRAMS — authoring a block, and assigning it to somebody (2026-09-13).
//
// The brief, §3.3: "Coaches package specialized drills into sub-tracks alongside the 12-Module Academy.
// Modules can be private (1-on-1 clients) or published to the platform. Outcome-based packaging: an 8-week
// knee-resilience block, a 12-week vertical explosion track — backed by interactive visual tracking."
//
// `Protocol` already carries `visibility` and `assignable()` already answers who may use what. What did not
// exist is the thing a coach actually sells: a BLOCK — several protocols, over weeks, with a schedule and an
// end.
//
// THE DECISION THAT SHAPES THIS FILE: what happens when a program contains a protocol the athlete's PRQ has
// not unlocked. There are three options and only one of them is honest:
//
//   · SILENTLY DROP IT — the athlete does a shorter program and never knows. The coach's block is not the
//     block they wrote, and nobody is told.
//   · ASSIGN IT ANYWAY — the gate becomes decorative, which defeats the reason it exists.
//   · SHOW IT, LOCKED, WITH THE REASON — the athlete sees the whole arc of what they were given, knows
//     exactly which threshold opens the next piece, and the gate still holds.
//
// The third. A program is a plan, and a plan with a hidden gap is not one. It also turns the gate from an
// obstacle into the most motivating thing on the screen: "ankle compliance needs 60, you're at 52" is a
// target, where a missing row is nothing at all.
//
// AN OUTCOME, NOT A CALENDAR. Every program declares what it is FOR and when to retest, because "8-week
// knee-resilience block" is a promise and a block with no defined end is a subscription to being coached
// rather than a thing that finishes.
//
// Pure: no Prisma, no DOM.

import type { Protocol, GateResult } from './protocol';
import { evaluateUnlock, assignable } from './protocol';
import type { SharedProfile } from './sharedProfile';

/** One protocol inside a week, with the dose. */
export interface ProgramItem {
  protocolKey: string;
  /** Times per week. */
  frequency: number;
  /** Free text the coach writes: "3 x 8 per side, slow down". Never parsed. */
  prescription?: string;
}

export interface ProgramWeek {
  /** 1-based. */
  week: number;
  items: ProgramItem[];
  /** What this week is for, in one line. */
  focus: string;
}

export interface CoachProgram {
  key: string;
  title: string;
  coachId: string;
  /** What finishing this is supposed to change. The promise the block makes. */
  outcome: string;
  weeks: ProgramWeek[];
  visibility: 'private' | 'published';
  /** Scan again after this many weeks to see whether it moved. */
  retestAfterWeeks: number;
}

export const MAX_WEEKS = 16;
export const MAX_ITEMS_PER_WEEK = 6;

// ── authoring ────────────────────────────────────────────────────────────────────────────────────────────

export interface AuthoringProblem {
  where: string;
  problem: string;
}

/**
 * Is this program publishable?
 *
 * Checked at AUTHORING time rather than at assignment, because the coach is the one who can fix it and the
 * athlete is not. A program referencing a protocol the coach cannot assign is the important case: a coach
 * can build a block around somebody else's private work and never find out until a client hits a wall.
 */
export function validateProgram(program: CoachProgram, catalogue: readonly Protocol[]): AuthoringProblem[] {
  const problems: AuthoringProblem[] = [];
  const usable = new Set(assignable(catalogue, program.coachId).map((p) => p.key));
  const known = new Set(catalogue.map((p) => p.key));

  if (!program.title.trim()) problems.push({ where: 'title', problem: 'Give the block a name.' });
  if (!program.outcome.trim()) {
    problems.push({ where: 'outcome', problem: 'Say what finishing this is meant to change.' });
  }
  if (!program.weeks.length) problems.push({ where: 'weeks', problem: 'A block needs at least one week.' });
  if (program.weeks.length > MAX_WEEKS) {
    problems.push({ where: 'weeks', problem: `Blocks run to ${MAX_WEEKS} weeks at most.` });
  }
  if (program.retestAfterWeeks < 1 || program.retestAfterWeeks > program.weeks.length) {
    problems.push({ where: 'retest', problem: 'Retest has to land inside the block.' });
  }

  const seenWeeks = new Set<number>();
  for (const w of program.weeks) {
    const at = `week ${w.week}`;
    if (seenWeeks.has(w.week)) problems.push({ where: at, problem: 'Two weeks share a number.' });
    seenWeeks.add(w.week);
    if (!w.items.length) problems.push({ where: at, problem: 'Empty week.' });
    if (w.items.length > MAX_ITEMS_PER_WEEK) {
      problems.push({ where: at, problem: `More than ${MAX_ITEMS_PER_WEEK} things in one week is not a week anybody finishes.` });
    }
    for (const item of w.items) {
      if (!known.has(item.protocolKey)) {
        problems.push({ where: at, problem: `"${item.protocolKey}" is not a protocol.` });
      } else if (!usable.has(item.protocolKey)) {
        // the case a coach cannot otherwise discover until a client hits it
        problems.push({ where: at, problem: `"${item.protocolKey}" is another coach's private work.` });
      }
      if (item.frequency < 1 || item.frequency > 7) {
        problems.push({ where: at, problem: `"${item.protocolKey}" needs a frequency between 1 and 7.` });
      }
    }
  }
  return problems;
}

export function canPublish(program: CoachProgram, catalogue: readonly Protocol[]): boolean {
  // a published block must be built entirely from published protocols — otherwise buyers get a block with
  // holes in it that only the author can see through
  if (validateProgram(program, catalogue).length) return false;
  const published = new Set(catalogue.filter((p) => p.visibility === 'published').map((p) => p.key));
  return program.weeks.every((w) => w.items.every((i) => published.has(i.protocolKey)));
}

// ── assignment ───────────────────────────────────────────────────────────────────────────────────────────

export interface AssignedItem {
  protocolKey: string;
  title: string;
  frequency: number;
  prescription?: string;
  /** The gate, evaluated against THIS athlete right now. */
  gate: GateResult;
  /** Convenience: gate.unlocked. */
  open: boolean;
}

export interface AssignedWeek {
  week: number;
  focus: string;
  items: AssignedItem[];
  /** Items open to this athlete today. */
  openCount: number;
}

export interface Assignment {
  programKey: string;
  title: string;
  outcome: string;
  clientId: string;
  weeks: AssignedWeek[];
  /** Nothing in the whole block is open — the athlete has been handed a wall. */
  fullyLocked: boolean;
  /** What the athlete is told at the top. */
  summary: string;
  retestAfterWeeks: number;
}

/**
 * Hand a program to an athlete.
 *
 * Every item keeps its place and carries its gate. Nothing is dropped, nothing is unlocked — see the header
 * for why the third option is the only honest one.
 */
export function assignProgram(
  program: CoachProgram,
  catalogue: readonly Protocol[],
  profile: SharedProfile | null,
  clientId: string,
  now: number = Date.now(),
): Assignment {
  const byKey = new Map(catalogue.map((p) => [p.key, p]));

  const weeks: AssignedWeek[] = program.weeks
    .slice()
    .sort((a, b) => a.week - b.week)
    .map((w) => {
      const items: AssignedItem[] = w.items.flatMap((i) => {
        const proto = byKey.get(i.protocolKey);
        if (!proto) return [];                       // an unknown key was already an authoring error
        const gate = evaluateUnlock(proto, profile, now);
        return [{
          protocolKey: i.protocolKey, title: proto.title, frequency: i.frequency,
          ...(i.prescription ? { prescription: i.prescription } : {}),
          gate, open: gate.unlocked,
        }];
      });
      return { week: w.week, focus: w.focus, items, openCount: items.filter((i) => i.open).length };
    });

  const totalItems = weeks.reduce((n, w) => n + w.items.length, 0);
  const totalOpen = weeks.reduce((n, w) => n + w.openCount, 0);
  const fullyLocked = totalItems > 0 && totalOpen === 0;

  return {
    programKey: program.key,
    title: program.title,
    outcome: program.outcome,
    clientId,
    weeks,
    fullyLocked,
    summary: summaryFor(totalOpen, totalItems, weeks),
    retestAfterWeeks: program.retestAfterWeeks,
  };
}

function summaryFor(open: number, total: number, weeks: readonly AssignedWeek[]): string {
  if (!total) return 'This block is empty.';
  if (open === total) return `${weeks.length} weeks, all of it open to you.`;
  if (open === 0) {
    // never leave somebody staring at a wall with no first step — name the nearest threshold
    const nearest = nearestThreshold(weeks);
    return nearest
      ? `Nothing here is open yet. The first thing that opens needs ${nearest}.`
      : 'Nothing here is open yet — run a System Scan to see where you are.';
  }
  return `${open} of ${total} open now. The rest unlocks as your readiness comes up.`;
}

/** The single closest thing to being unlocked, so a wall always comes with a next step. */
function nearestThreshold(weeks: readonly AssignedWeek[]): string | null {
  const blocked = weeks
    .flatMap((w) => w.items)
    .flatMap((i) => i.gate.blocking)
    .filter((b) => b.have !== null);
  if (!blocked.length) return null;
  const closest = blocked.reduce((a, b) => (b.short < a.short ? b : a));
  return `${closest.label} at ${closest.need} — you're at ${closest.have}`;
}

/**
 * What the athlete should do TODAY: this week's open items only.
 *
 * A block is motivating in the abstract and paralysing in practice; the useful answer to "what now" is a
 * short list, not sixteen weeks of plan.
 */
export function today(assignment: Assignment, week: number): AssignedItem[] {
  return assignment.weeks.find((w) => w.week === week)?.items.filter((i) => i.open) ?? [];
}

/** How much of the block is open to this athlete, 0..1 — the "visual tracking" the brief asks for. */
export function unlockedFraction(assignment: Assignment): number {
  const total = assignment.weeks.reduce((n, w) => n + w.items.length, 0);
  if (!total) return 0;
  return assignment.weeks.reduce((n, w) => n + w.openCount, 0) / total;
}
