// DunkRivalSim — a rival's dunk, judged without flying it (dunk-next phase 4, 2026-10-06).
//
// Owner, 2026-10-06: "skip a rival's dunk straight to his card (pad/keyboard/tap), keeping a short highlight so the night still has
// drama; the rival's result is unchanged." A rival dunk is ~13 s of somebody else's run-up, flight, landing, triple cut and five-card
// reveal — four times a night (docs/DUNK-NEXT.md §1 row 5). Watching it is the show; sitting through it the fourth time is dead air.
//
// The rival's dunk is decided by a PLAN before he runs (DUNK MOTION phase 11): his nerve picks what he goes for and how clean his
// slam will be, and whether he blows it. The AI pad then performs that plan through the player's own pipeline. This file is the same
// plan, judged by the same functions, without the performance:
//   · the PLAN is rolled here — the live rival rolls it here too (DunkMode.planRivalAttempt → rollRivalAttempt), so a skipped dunk and
//     a watched one come from one roll, with the same random calls in the same order;
//   · the FLIGHT is the real DunkFlight: his launch buys the same air and trick capacity, his tricks take the same window tax;
//   · the SLAM is placed where his pad presses it (RivalPlay.rivalSlamOffset) and read by the real curve (slamExecution, slamReadout);
//     a blown plan never presses, and a slam under RIM_CLEAN hits iron — the two ways the live rival misses;
//   · the BEATS, ORIGINALITY, the exact-repeat rule, the CARD (dunkCard), the PANEL (judgeDunk) and the STAKES are the mode's own calls
//     with the inputs the mode passes on his turn; a miss is judged exactly as finishAttempt judges one, and is retried the same way.
// A skip taken mid-attempt judges the plan he is ALREADY on (it is not re-rolled), so skipping can neither rescue nor sink his dunk.
// What the sim cannot know is the physics of his run-up; it takes the run-up the mode measured at his last real take-off (or a
// default before he has taken one) — see RivalRunUp.
//
// Pure: no Babylon, no clock. The only randomness is the injected `rand`, used by the roll alone.
import { DunkFlight, SLAM_EDGE_EXEC, slamExecution, slamReadout, signatureFor, type DunkTrick, type SignatureDunk } from './DunkSystem';
import { dunkCard, slamIsClean } from './DunkCard';
import { judgeDunk, type JudgeScore } from './JudgePanel';
import { rivalNerve, rivalExecution, type RivalSituation } from './RivalNerve';
import { rivalTricksFor, rivalSlamOffset, rivalHitsBeats } from './RivalPlay';
import { flightFlow, trickBeats, type BeatMark } from './DunkBeats';
import { dunkElements, type NightMemory, type DunkElement, type OriginalityRead } from './DunkOriginality';
import { spendAttempt, canRetry, stakesScale, ATTEMPTS_PER_DUNK, type Stakes } from './DunkStakes';
import { rangeLabel } from './DunkApproach';

/** What a rival goes for on one attempt, and how it goes. */
export interface RivalAttempt {
  tricks: DunkTrick[];
  /** 0..1: where his slam lands in his execution band (RivalPlay.rivalSlamOffset reads it back as the execution). */
  acc: number;
  /** a clean slam on the early side of the beat */
  early: boolean;
  /** he never finds the window */
  blew: boolean;
  /** dunk-next phase 1: a clean attempt throws each trick on its beat */
  onBeat: boolean;
  /** his nerve's words ('' when neutral) and the reach he rolled — for the log */
  nerveLabel: string;
  reach: number;
}

/** The temperament a roll reads (DunkRivals.DunkRival has all three). */
export interface RivalTemper { reach: number; risk: number; signature: string }

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** Roll one attempt. The live rival's plan, word for word (it was DunkMode.planRivalAttempt's body): the blow, the reach, the
 *  execution, the tricks, the early side — in that order of `rand` calls. */
export function rollRivalAttempt(sit: RivalSituation, foe: RivalTemper, rand: () => number = Math.random): RivalAttempt {
  const nerve = rivalNerve(sit);
  const band = rivalExecution(nerve);
  const blew = rand() < Math.min(0.85, nerve.blownChance * foe.risk);
  const reach = (nerve.diffMin + rand() * (nerve.diffMax - nerve.diffMin)) * foe.reach;
  const exec = band.min + rand() * (band.max - band.min);
  const acc = clamp01((exec - band.min) / Math.max(0.1, band.max - band.min));
  const tricks = rivalTricksFor(reach, foe.signature, rand);
  // (a clean one can land either side of the beat; one that leaks is LATE — the side the execution reads linearly, so the slam
  //  scores the execution he rolled, whatever tax his tricks put on the window)
  const early = acc >= SLAM_EDGE_EXEC && rand() < 0.4;
  return { tricks, acc, early, blew, onBeat: rivalHitsBeats(acc, blew), nerveLabel: nerve.label, reach };
}

/** His take-off, as the mode measured it at his last real one (DunkMode.launchDunk on his turn). */
export interface RivalRunUp {
  charge: number;
  launchSpeed01: number;
  /** DunkApproach.approachBonus + DunkParkour.launchProfile difficulty — what flight.launch is handed */
  approachDifficulty: number;
  foot: 'one' | 'two';
  rangeM: number;
  side: string;
  launchTag: string;
}
/** assumption (dunk-next phase 4): before any rival has taken off this visit, his run-up is the AI pad's usual one — RUN held from the
 *  top of the runway (a full-speed, one-foot SPEED LAUNCH, head-on, in the paint, no jump charge). Replaced by the measured one at
 *  his first real take-off. */
export const DEFAULT_RIVAL_RUNUP: RivalRunUp = {
  charge: 0, launchSpeed01: 1, approachDifficulty: 0.6, foot: 'one', rangeM: 1.6, side: 'HEAD-ON', launchTag: 'SPEED LAUNCH',
};

/** The room and the rules the mode judges his dunk under (the same values finishAttempt reads on his turn). */
export interface RivalJudgeContext {
  /** the style id and its tier the mode is in (the rival dunks in the mode's current style) */
  styleId: string;
  styleTier: number;
  /** the room, 0..100 (the mode's hype) and 0..1 (the momentum the panel hears) */
  hype: number;
  crowd01: number;
  /** half the slam window before the tricks' tax (DunkMode.slamWindowBase() / 2) */
  slamHalf: number;
  runUp: RivalRunUp;
  /** the night's shared element memory, and who he is in it */
  memory: NightMemory;
  dunker: string;
  /** his own exact-repeat memory (DunkMode.usedCombos on his turn): read, and added to on a make */
  usedCombos: Set<string>;
}

export interface RivalDunkResult {
  made: boolean;
  /** the panel's total after the stakes */
  total: number;
  scores: JudgeScore[];
  difficulty: number;
  execution: number;
  style: number;
  /** the execution read off the slam (0 for a miss with no slam) */
  execution01: number;
  tricks: DunkTrick[];
  signature: SignatureDunk | null;
  /** the dunk's name for a banner: the signature, the tricks, or '' for a plain one */
  name: string;
  flowLabel: string;
  perfect: boolean;
  fresh: OriginalityRead | null;
  seenIt: boolean;
  elements: DunkElement[];
  /** the dunk's stakes after it (attempts spent) */
  stakes: Stakes;
  attempts: number;
}

/** The flight his plan flies: the real DunkFlight launched off his run-up, his tricks taken in order (capacity refuses the extra). */
export function rivalFlight(plan: RivalAttempt, ctx: Pick<RivalJudgeContext, 'runUp' | 'styleTier'>): DunkFlight {
  const f = new DunkFlight();
  const r = ctx.runUp;
  f.launch(Math.min(1, r.charge * 0.5 + r.launchSpeed01 * 0.5), ctx.styleTier, r.approachDifficulty);
  for (const t of plan.tricks) f.take(t);
  return f;
}

/** One attempt, judged as finishAttempt judges it — WITHOUT the stakes (the caller applies them) and without remembering it. */
export function judgeRivalAttempt(plan: RivalAttempt, ctx: RivalJudgeContext): {
  made: boolean; tricks: DunkTrick[]; execution01: number; scores: JudgeScore[]; difficulty: number; execution: number; style: number;
  signature: SignatureDunk | null; flowLabel: string; perfect: boolean; fresh: OriginalityRead | null; seenIt: boolean; elements: DunkElement[]; combo: string;
} {
  const flight = rivalFlight(plan, ctx);
  const attempt = flight.attempt;
  const tricks = attempt.tricks;
  // THE SLAM: where his pad presses it, read by the real curve; a blown plan never presses
  const half = ctx.slamHalf * flight.slamWindowScale;
  const offset = plan.blew ? null : rivalSlamOffset(plan.acc, plan.early, half);
  const execution01 = offset == null ? 0 : slamExecution(offset, 0, half, 1);
  const made = offset != null && slamIsClean(execution01);
  const elements = dunkElements({
    tricks: tricks.map((t) => ({ id: t.id, label: t.label })), runway: [], prop: null,
    launch: ctx.runUp.launchTag.includes('→') ? ctx.runUp.launchTag : '',
    foot: ctx.runUp.foot, range: rangeLabel(ctx.runUp.rangeM), side: ctx.runUp.side, hang: false,
  });
  const combo = `${ctx.styleId}_none_${tricks.map((t) => t.label).join('+') || 'plain'}`;
  if (!made) {
    // finishAttempt's miss: the panel saw the tricks thrown and the style called, and saw it fail
    const missDiff = Math.max(0, (ctx.styleTier + tricks.reduce((a, t) => a + t.difficulty, 0)) * 0.60);
    const missStyle = Math.max(0, ctx.styleTier * 0.22);
    return { made, tricks, execution01, scores: judgeDunk(missDiff, 0, missStyle), difficulty: missDiff, execution: 0, style: missStyle,
      signature: null, flowLabel: '', perfect: false, fresh: null, seenIt: false, elements, combo };
  }
  // THE BEATS: a clean attempt throws each trick on its beat; otherwise his press arms it early (neutral)
  const marks: BeatMark[] = tricks.map((t) => ({ beat: trickBeats(t)[0] ?? 'rise', label: t.label, grade: plan.onBeat ? 'onbeat' : 'early' }));
  const zone = slamReadout(offset!, 0, execution01, half).zone;
  const flow = flightFlow(marks, zone);
  const isRepeat = ctx.usedCombos.has(combo);
  const fresh = ctx.memory.read(elements, ctx.dunker);
  const seenIt = isRepeat || fresh.copiedWhole;
  const signature = signatureFor([], tricks.map((t) => t.id));
  const card = dunkCard({
    trickDifficulty: attempt.difficulty - ctx.styleTier, runwayDifficulty: signature?.nod ?? 0, propBonus: 0,
    charge: ctx.runUp.charge, launchSpeed01: ctx.runUp.launchSpeed01, styleTier: ctx.styleTier, styleTaps: 0,
    hype: ctx.hype, hang: false, repeat: seenIt, execution01,
    chainTricks: Math.max(0, tricks.length - 1),
    beatExec: flow.beatExec, flowStyle: flow.flowStyle + fresh.style,
  });
  return { made, tricks, execution01, scores: judgeDunk(card.difficulty, card.execution, card.style, ctx.crowd01),
    difficulty: card.difficulty, execution: card.execution, style: card.style, signature, flowLabel: flow.label, perfect: flow.perfect,
    fresh, seenIt, elements, combo };
}

/**
 * His whole dunk: `plan` (the attempt he is on, or null to roll one) under `stakes` (the attempts already spent on this dunk), each
 * miss retried with a fresh roll while the stakes allow — exactly the live loop (finishAttempt → retryThisDunk → planRivalAttempt).
 * A make is remembered by the night (memory.show) and by his repeat memory, as finishAttempt does.
 */
export function simRivalDunk(plan: RivalAttempt | null, stakes: Stakes, roll: () => RivalAttempt, ctx: RivalJudgeContext): RivalDunkResult {
  let st = stakes;
  let p = plan ?? roll();
  for (let guard = 0; ; guard++) {
    const a = judgeRivalAttempt(p, ctx);
    st = spendAttempt(st);
    const ids = a.tricks.map((t) => t.id);
    if (a.made || !canRetry(st, false) || guard >= ATTEMPTS_PER_DUNK) {
      const total = Math.round(a.scores.reduce((s, j) => s + j.score, 0) * stakesScale(st, ids, a.made));
      if (a.made) { ctx.usedCombos.add(a.combo); ctx.memory.show(a.elements, ctx.dunker); }
      const name = a.signature ? `${a.signature.name} — ${a.signature.by.toUpperCase()}` : a.tricks.map((t) => t.label).join(' → ');
      return {
        made: a.made, total, scores: a.scores, difficulty: a.difficulty, execution: a.execution, style: a.style, execution01: a.execution01,
        tricks: a.tricks, signature: a.signature, name, flowLabel: a.flowLabel, perfect: a.perfect, fresh: a.fresh, seenIt: a.seenIt,
        elements: a.elements, stakes: st, attempts: st.attemptsUsed,
      };
    }
    p = roll();
  }
}
