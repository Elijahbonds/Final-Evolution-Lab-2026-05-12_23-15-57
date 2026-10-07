// access — which drills on /play/drills a player may run today, and why some wait (Mirror & coaching plan Phase 6,
// 2026-10-07).
//
// NOT A NEW RULE. These are the warm-up's gates (lib/coach/warmup.ts generateWarmup, "THE GATES"), applied to the same
// charts on the drills page, read from the same server context (lib/coach/warmupServer.ts loadWarmupContext):
//   · a standing intake red flag (hardStopped): no drill at all — Today shows its hard-stop card for the same reason;
//   · IMPACT — any phase with a 'jump' or 'land' target (warmup.ts phaseImpact, read off the chart, never a list here) —
//     is held back for an athlete under 18 or with no birth year (rule (b): "jumps wait until your coach adds them";
//     this page never knows a coach's assignment, so a youth's jumps always wait here), on a day the pain check-in
//     decided a step-down or a stop, and while P8's jump gate is shut (jumpGate.closed: no landing check yet, an intake
//     answer, …). The context that could not be read is the careful one (FALLBACK_WARMUP_CONTEXT: youth rules).
//   · The Wake-Up keeps its calm phases in its own order (release, pressurize, tripod, joints) and drops only the
//     jumping ones, exactly as the warm-up does; the two switches that let the owner keep its pogos and launch
//     (WAKE_UP_IMPACT_GATED, WARMUP_FOLLOWS_JUMP_GATE) are the warm-up's own, read here, so one line moves both
//     surfaces. A chapter-6 drill that is all impact (the pogos, the safe landing) is held whole; the countermovement
//     geometry check never leaves the floor and is always open.
// The words are the warm-up's (NOTE_COPY, jumpGateNote): one voice for one rule.
//
// Pure: the server page computes it (it reads the context) and hands the client ids and lines, never the context.
import { WAKE_UP } from './drills';
import { ROUTE_DRILLS } from './route';
import type { DrillAccess, DrillGate, DrillsAccess } from './gate';
import {
  NOTE_COPY, WAKE_UP_IMPACT_GATED, WARMUP_FOLLOWS_JUMP_GATE, jumpGateNote, phaseImpact, type WarmupContext,
} from '../coach/warmup';
import { isHardStop, isStopOutcome } from '../health/painRule';

export { drillToRun, type DrillAccess, type DrillGate, type DrillsAccess } from './gate';

export function drillsAccess(ctx: Pick<WarmupContext, 'isYouth' | 'painDecision' | 'hardStopped' | 'jumpGate' | 'unavailable'>): DrillsAccess {
  if (ctx.hardStopped) {
    return {
      stopped: true, impactHeld: null, note: null, noteHref: null,
      drills: ROUTE_DRILLS.map((d) => ({ id: d.id, gate: 'held', phases: [], heldPhases: d.phases.map((p) => p.name) })),
    };
  }
  const pain = ctx.painDecision ?? null;
  const painStop = pain !== null && isStopOutcome(pain);
  const unavailable = !!ctx.unavailable;
  const youthHold = !!ctx.isYouth;
  const gateClosed = ctx.jumpGate?.closed !== false;     // an answer that does not say open is shut (readWarmupContext)
  // the reason, in the warm-up's own order (generateWarmup gatedWhy)
  const why = (gate: boolean): DrillsAccess['impactHeld'] =>
    painStop ? 'pain' : unavailable ? 'unavailable' : youthHold ? 'youth_impact' : gate ? 'jump_gate' : null;
  // the Wake-Up follows the warm-up's two switches; a chapter-6 jump drill is a plyometric under rule (b) either way
  const wakeHeld = WAKE_UP_IMPACT_GATED ? why(WARMUP_FOLLOWS_JUMP_GATE && gateClosed) : null;
  const drillHeld = why(gateClosed);

  const drills = ROUTE_DRILLS.map((d): DrillAccess => {
    const held = d.id === WAKE_UP.id ? wakeHeld : drillHeld;
    const keep = d.phases.filter((p) => !(held && phaseImpact(p)));
    const out = d.phases.filter((p) => !keep.includes(p));
    // a drill whose only phases left would be rests is not a drill
    const runs = keep.some((p) => p.presence === 'required');
    const gate: DrillGate = !out.length ? 'open' : runs ? 'trimmed' : 'held';
    return { id: d.id, gate, phases: gate === 'held' ? [] : keep.map((p) => p.id), heldPhases: (gate === 'held' ? d.phases : out).map((p) => p.name) };
  });

  const anyHeld = drills.some((d) => d.gate !== 'open');
  const impactHeld = anyHeld ? (drills.find((d) => d.id === WAKE_UP.id)?.gate !== 'open' ? wakeHeld : drillHeld) : null;
  let note: string | null = null;
  let noteHref: string | null = null;
  if (impactHeld === 'pain') note = isHardStop(pain!) ? NOTE_COPY.pain_hard : NOTE_COPY.pain;
  else if (impactHeld === 'unavailable') note = NOTE_COPY.context_unavailable;
  else if (impactHeld === 'youth_impact') note = NOTE_COPY.youth_impact;
  else if (impactHeld === 'jump_gate') { note = jumpGateNote(ctx.jumpGate?.why ?? ''); noteHref = ctx.jumpGate?.href ?? null; }
  return { stopped: false, impactHeld, note, noteHref, drills };
}

/** The access when nothing could be read: the careful context (youth rules, the gate shut), said as such. */
export const CAREFUL_ACCESS: DrillsAccess = drillsAccess({
  isYouth: true, painDecision: null, hardStopped: false, unavailable: true, jumpGate: { closed: true, why: '', href: null },
});
