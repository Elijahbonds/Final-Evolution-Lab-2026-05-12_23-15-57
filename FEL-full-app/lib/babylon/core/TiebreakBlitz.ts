// Tiebreak Blitz rules — a first-to-seven rally the 3D mode and the scripted run share.
//
// The posted score stays the arena ceiling's formula (TARGET 7, myPts × 120 + bestRally × 30, AI nets a
// return at 0.16 + 0.05 × rally). What changed is the contest around that formula: the hit window tightens
// as a lead grows and as a rally goes on, and the server prefers the side you just missed once you are ahead.
// A read of an on-screen "COMING LEFT" label is not the game any more — the side is the ball's side.

export const TARGET = 7;

export type Side = 'left' | 'right';

/** Feel for a normal rally. Flagged in the lane report: these are the numbers a player feels. */
export interface BlitzFeel {
  /** Fraction of the flight at which the hit window opens. Higher = later = tighter. */
  windowOpen: number;
  tightenPerLead: number;
  tightenPerRally: number;
  windowOpenMax: number;
  /** The window opens earlier when the player is behind, so a deficit is still a rally. */
  easePerTrail: number;
  flight0: number;
  flightPerRally: number;
  flightMin: number;
  /** Seconds the court holds between points. */
  gapSec: number;
  /** A normal swing's timing noise, in seconds. */
  humanSigma: number;
  misreadBase: number;
  misreadPerLead: number;
  /** Once ahead, how often the next ball repeats the side just missed. */
  adaptRepeat: number;
  adaptRepeatPerLead: number;
}

/**
 * Opening window is about ±90 ms around the cue (a party swing still connects). A lead or a stacked
 * rally closes it to a floor around ±40–45 ms, which is where an early or late swing loses the point.
 * The between-point hold stays 1.4 s (was 4.0 s, originally 1.1 s). Dead time is not the challenge.
 *
 * At READY (react 0.95): windowOpen 0.905 → 0.801, tightenPerLead 0.012 → 0.022,
 * tightenPerRally 0.014 → 0.085, windowOpenMax 0.935 → 0.889, flight0 1.05 → 0.95,
 * flightPerRally 0.045 → 0.06, flightMin 0.74 → 0.77. gapSec stays 1.4.
 */
export const NORMAL_FEEL: BlitzFeel = {
  windowOpen: 0.801,
  tightenPerLead: 0.022,
  tightenPerRally: 0.085,
  windowOpenMax: 0.889,
  easePerTrail: 0.02,
  flight0: 0.95,
  flightPerRally: 0.06,
  flightMin: 0.77,
  gapSec: 1.4,
  humanSigma: 0.13,
  misreadBase: 0.1,
  misreadPerLead: 0.055,
  adaptRepeat: 0.28,
  adaptRepeatPerLead: 0.07,
};

/** The AI nets the return. The arena ceiling reads this exact rate off the host; keep the two copies identical. */
export function aiNetsIt(rally: number, rng: () => number): boolean {
  return rng() < 0.16 + rally * 0.05;
}

export function gradeReactBase(gradeKey: string | undefined): number {
  if (gradeKey === 'ELITE') return 1.15;
  if (gradeKey === 'PRIMED') return 1.05;
  if (gradeKey === 'READY') return 0.95;
  return 0.85;
}

export function windowOpenFrac(lead: number, rally: number, feel: BlitzFeel): number {
  const ahead = Math.max(0, lead);
  const trail = Math.max(0, -lead);
  const open = feel.windowOpen + ahead * feel.tightenPerLead + rally * feel.tightenPerRally - trail * feel.easePerTrail;
  return Math.min(feel.windowOpenMax, Math.max(0.55, open));
}

export function flightOf(rally: number, reactBase: number, feel: BlitzFeel): number {
  return Math.max(feel.flightMin, (feel.flight0 - rally * feel.flightPerRally) * reactBase);
}

export interface BlitzState {
  myPts: number;
  aiPts: number;
  rally: number;
  bestRally: number;
  incoming: Side;
  ballT: number;
  ballLen: number;
  windowOpenAt: number;
  awaiting: boolean;
  gap: number;
  over: boolean;
  elapsed: number;
  lastMissed: Side | null;
  /** Set when a scripted player has chosen a swing for this ball. */
  pendingAt: number;
  pendingDir: Side | null;
}

export function freshBlitz(): BlitzState {
  return {
    myPts: 0, aiPts: 0, rally: 0, bestRally: 0,
    incoming: 'left', ballT: 0, ballLen: 1, windowOpenAt: 0.7,
    awaiting: false, gap: 0.45, over: false, elapsed: 0, lastMissed: null,
    pendingAt: 0, pendingDir: null,
  };
}

function leadOf(s: BlitzState): number {
  return s.myPts - s.aiPts;
}

function serve(s: BlitzState, rng: () => number, reactBase: number, feel: BlitzFeel): void {
  const lead = leadOf(s);
  let side: Side = rng() > 0.5 ? 'left' : 'right';
  if (s.lastMissed && lead > 0 && rng() < feel.adaptRepeat + lead * feel.adaptRepeatPerLead) side = s.lastMissed;
  s.incoming = side;
  s.ballLen = flightOf(s.rally, reactBase, feel);
  s.windowOpenAt = s.ballLen * windowOpenFrac(lead, s.rally, feel);
  s.ballT = 0;
  s.awaiting = true;
  s.pendingAt = 0;
  s.pendingDir = null;
}

/** A press during the between-point hold cuts it. The next tick serves. */
export function skipGap(s: BlitzState): boolean {
  if (s.over || s.awaiting || s.gap <= 0) return false;
  s.gap = 0;
  return true;
}

function award(s: BlitzState, mine: boolean, feel: BlitzFeel): void {
  if (mine) s.myPts += 1;
  else s.aiPts += 1;
  s.bestRally = Math.max(s.bestRally, s.rally);
  s.rally = 0;
  s.awaiting = false;
  s.pendingDir = null;
  s.gap = feel.gapSec;
  if (s.myPts >= TARGET || s.aiPts >= TARGET) s.over = true;
}

export type SwingResult = 'ignore' | 'return' | 'point-me' | 'point-ai';

/** A swing on the ball that is in the air now. */
export function commitSwing(
  s: BlitzState, dir: Side, rng: () => number, reactBase: number, feel: BlitzFeel,
  aiNets: (rally: number, rng: () => number) => boolean,
): SwingResult {
  if (s.over || !s.awaiting) return 'ignore';
  const inWindow = s.ballT >= s.windowOpenAt && s.ballT < s.ballLen;
  s.pendingDir = null;
  if (dir === s.incoming && inWindow) {
    s.rally += 1;
    s.bestRally = Math.max(s.bestRally, s.rally);
    if (aiNets(s.rally, rng)) {
      award(s, true, feel);
      return 'point-me';
    }
    serve(s, rng, reactBase, feel);
    return 'return';
  }
  s.lastMissed = s.incoming;
  award(s, false, feel);
  return 'point-ai';
}

function gaussian(rng: () => number): number {
  const u = Math.max(1e-9, rng());
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v);
}

/**
 * On-cue swing: the correct side, aimed at the middle of the window, plus a timing error uniform in
 * [-errorSec, errorSec]. errorSec 0 is a perfect read of the cue.
 */
export function planCueSwing(s: BlitzState, rng: () => number, errorSec: number): { at: number; dir: Side } {
  const center = (s.windowOpenAt + s.ballLen) / 2;
  const error = (rng() * 2 - 1) * Math.max(0, errorSec);
  return { at: Math.max(0, center + error), dir: s.incoming };
}

/** A normal player: correct side most of the time, swing aimed at the middle of the window, with noise. */
export function planNormalSwing(s: BlitzState, rng: () => number, feel: BlitzFeel): { at: number; dir: Side } {
  const lead = Math.max(0, leadOf(s));
  const misread = rng() < feel.misreadBase + lead * feel.misreadPerLead;
  const dir: Side = misread ? (s.incoming === 'left' ? 'right' : 'left') : s.incoming;
  const center = (s.windowOpenAt + s.ballLen) / 2;
  return { at: Math.max(0.05, center + gaussian(rng) * feel.humanSigma), dir };
}

export interface TickOpts {
  rng: () => number;
  reactBase: number;
  feel: BlitzFeel;
  aiNets: (rally: number, rng: () => number) => boolean;
  /** When set, a ball with no plan yet gets one (the scripted normal player). */
  plan?: (s: BlitzState, rng: () => number, feel: BlitzFeel) => { at: number; dir: Side };
}

/** Advance one slice. Returns what the slice resolved, if a point or a return landed. */
export function tickBlitz(s: BlitzState, dt: number, opts: TickOpts): SwingResult | 'ace' | null {
  if (s.over) return null;
  const step = Math.max(0, dt);
  s.elapsed += step;
  if (!s.awaiting) {
    s.gap -= step;
    if (s.gap <= 0) serve(s, opts.rng, opts.reactBase, opts.feel);
    return null;
  }
  s.ballT += step;
  if (opts.plan && s.pendingDir === null) {
    const plan = opts.plan(s, opts.rng, opts.feel);
    s.pendingAt = plan.at;
    s.pendingDir = plan.dir;
  }
  if (s.ballT >= s.ballLen) {
    s.lastMissed = s.incoming;
    award(s, false, opts.feel);
    return 'ace';
  }
  if (s.pendingDir && s.ballT >= s.pendingAt) {
    const dir = s.pendingDir;
    return commitSwing(s, dir, opts.rng, opts.reactBase, opts.feel, opts.aiNets);
  }
  return null;
}

export interface ScriptedRun {
  myPts: number;
  aiPts: number;
  bestRally: number;
  elapsed: number;
  over: boolean;
}

function runScripted(
  seed: number,
  plan: (s: BlitzState, rng: () => number, feel: BlitzFeel) => { at: number; dir: Side },
  reactBase: number,
  feel: BlitzFeel,
  dt: number,
): ScriptedRun {
  const rng = mulberry32(seed);
  const s = freshBlitz();
  const cap = 180;
  while (!s.over && s.elapsed < cap) {
    tickBlitz(s, dt, { rng, reactBase, feel, aiNets: aiNetsIt, plan });
  }
  return { myPts: s.myPts, aiPts: s.aiPts, bestRally: s.bestRally, elapsed: s.elapsed, over: s.over };
}

/** A seeded normal player through a whole tiebreak. `dt` is the sim step in seconds. */
export function scriptedNormalRun(seed: number, reactBase = 0.95, feel: BlitzFeel = NORMAL_FEEL, dt = 1 / 60): ScriptedRun {
  return runScripted(seed, planNormalSwing, reactBase, feel, dt);
}

/**
 * A seeded player who hits the correct side on the cue, with a timing error of ±errorSec.
 * errorSec 0 is perfect timing. The match uses the same net rate and the same window as live play.
 */
export function scriptedCueRun(
  seed: number, errorSec: number, reactBase = 0.95, feel: BlitzFeel = NORMAL_FEEL, dt = 1 / 60,
): ScriptedRun {
  return runScripted(seed, (s, rng) => planCueSwing(s, rng, errorSec), reactBase, feel, dt);
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Posted points. The host writes this same expression; the arena ceiling is built from it. */
export function postedScore(myPts: number, bestRally: number): number {
  return myPts * 120 + bestRally * 30;
}
