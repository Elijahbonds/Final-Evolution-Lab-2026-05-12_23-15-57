// crowdReact — who in the stands reacts, how, and when (w3-crowds, A9.9).
//
// A reaction is a PLAN per fan: a short list of clips (crowdVat's vocabulary) played one after another from a staggered
// start, after which the fan settles back to its posture's idle. The director owns every fan's plan and tells the renderer
// only what changed this frame (`tick` returns the fans whose clip switched), so a quiet crowd costs nothing on the CPU and
// a cheer rewrites each fan's four instance numbers once per clip, not per frame.
//
//   cheer  — a big moment (a make, a goal, a homer): seated fans throw both arms up; standing fans jump with them
//   groan  — a miss, a blunder: hands to the head
//   stand  — a standing ovation for a while (a tier went ON FIRE): the seated rise, cheer three times, sit back down
//   finish — the end of the match: everybody up and cheering until the mode is torn down
//
// Strength decides how much of the crowd takes part (a block of a stand, not every single person, cheers a 7-point play).
// The start is staggered by a hash and by where the fan sits along its stand, so a cheer ripples down a row instead of
// three hundred people moving on the same frame. Reduced motion (motionPolicy().reduced) keeps every reaction SMALL: a
// third as many fans, claps in place of thrown arms and jumps, and nobody stands — the stand applauds in its seats.
//
// PURE: no Babylon import; time is the caller's (seconds).

import type { CrowdClipName, Posture } from './crowdVat';
import { CROWD_CLIPS } from './crowdVat';

export type ReactionKind = 'cheer' | 'groan' | 'stand' | 'finish';

export interface PlanStep {
  clip: CrowdClipName;
  /** How long this step plays (s). Infinity holds it until the next reaction (only the finish does). */
  seconds: number;
}

const CLIP_SECONDS = new Map(CROWD_CLIPS.map((c) => [c.name, c.seconds] as const));
const secondsOf = (c: CrowdClipName): number => CLIP_SECONDS.get(c) ?? 1;
const step = (clip: CrowdClipName, cycles = 1): PlanStep => ({ clip, seconds: secondsOf(clip) * cycles });

/** The clips one fan plays for a reaction, from the posture it is in now. Pure. */
export function planFor(kind: ReactionKind, posture: Posture, reduced: boolean, strength = 1): PlanStep[] {
  const seated = posture === 'seated';
  const big = strength >= 0.75;
  if (kind === 'groan') return [step(seated ? 'sit_groan' : 'stand_groan')];
  if (kind === 'cheer') {
    if (reduced) return [step(seated ? 'sit_clap' : 'stand_clap')];
    return seated ? [step('sit_cheer')] : [step('stand_cheer', big ? 2 : 1)];
  }
  if (kind === 'stand') {
    if (reduced) return [step(seated ? 'sit_clap' : 'stand_clap', 2)];
    return seated ? [step('rise'), step('stand_cheer', 3), step('sit_down')] : [step('stand_cheer', 3)];
  }
  // finish: up on its feet — jumping for a big finish (a win the mode calls out), applauding for any other end
  if (reduced) return [{ clip: seated ? 'sit_clap' : 'stand_clap', seconds: Infinity }];
  const hold: PlanStep = { clip: big ? 'stand_cheer' : 'stand_clap', seconds: Infinity };
  return seated ? [step('rise'), hold] : [hold];
}

/** Priority: a reaction only replaces one of equal or lower rank (a groan never cuts a cheer off; nothing cuts the finish). */
export const PRIORITY: Record<ReactionKind, number> = { groan: 1, cheer: 2, stand: 3, finish: 4 };

/** The share of the crowd that takes part (0..1). Reduced motion: a third of it. */
export function shareFor(kind: ReactionKind, strength: number, reduced: boolean): number {
  const s = Math.max(0, Math.min(1, strength));
  const base = kind === 'finish' ? 1 : kind === 'stand' ? 0.55 + 0.4 * s : kind === 'cheer' ? 0.35 + 0.6 * s : 0.25 + 0.45 * s;
  return reduced ? base / 3 : base;
}

/** Deterministic 0..1 from two integers (no state: the same fan makes the same choice for the same reaction number). */
export function hash01(a: number, b: number): number {
  let t = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  t = Math.imul(t ^ (t >>> 13), 1274126177);
  return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
}

/** Seconds before a fan joins in: a hash spread plus a ripple along its stand (`along01`). Reduced motion: no ripple. */
export function delayFor(fan: number, reaction: number, along01: number, reduced: boolean): number {
  const jitter = 0.04 + hash01(fan, reaction * 7 + 3) * 0.3;
  return reduced ? jitter : jitter + Math.max(0, Math.min(1, along01)) * 0.35;
}

export interface FanSeat {
  /** The posture the fan lives in: seated stands, or standing room. */
  home: Posture;
  /** Where along its stand it sits, 0..1 (the ripple). */
  along: number;
}

interface Pending { at: number; rank: number; kind: ReactionKind; strength: number; reduced: boolean }

interface FanState {
  home: Posture;
  along: number;
  posture: Posture;
  clip: CrowdClipName;
  /** When the current clip started (s, the director's clock). */
  since: number;
  /** When the current clip ends and the next step begins (Infinity: holds). */
  until: number;
  plan: PlanStep[];
  /** A reaction waiting for its start (its stagger); its plan is drawn up when it starts. */
  pending: Pending | null;
  rank: number;
}

/** One clip change, for the renderer: fan `fan` plays `clip` from time `since`; `idle` = a looping idle at its own phase. */
export interface ClipChange { fan: number; clip: CrowdClipName; since: number; idle: boolean }

export const idleOf = (p: Posture): CrowdClipName => (p === 'seated' ? 'sit_idle' : 'stand_idle');
const endPosture = (clip: CrowdClipName, from: Posture): Posture => (clip === 'rise' ? 'standing' : clip === 'sit_down' ? 'seated' : from);

/** The crowd's director: the plans, the stagger, the priority. Pure (the clock is passed in). */
export class CrowdDirector {
  private fans: FanState[];
  private reactions = 0;
  private finished = false;

  constructor(seats: readonly FanSeat[]) {
    this.fans = seats.map((s) => ({ home: s.home, along: s.along, posture: s.home, clip: idleOf(s.home), since: -Infinity, until: Infinity, plan: [], pending: null, rank: 0 }));
  }

  get size(): number { return this.fans.length; }
  /** The clip a fan is playing now. */
  clipOf(i: number): CrowdClipName { return this.fans[i].clip; }
  postureOf(i: number): Posture { return this.fans[i].posture; }
  /** When the fan's current clip started (−Infinity: its first idle). */
  sinceOf(i: number): number { return this.fans[i].since; }
  /** True once the finish has been called: later reactions are ignored. */
  get done(): boolean { return this.finished; }

  /** Ask the crowd to react at time `now`. Returns how many fans will take part. */
  react(kind: ReactionKind, strength: number, now: number, reduced: boolean): number {
    if (this.finished) return 0;
    if (kind === 'finish') this.finished = true;
    const n = ++this.reactions;
    const share = shareFor(kind, strength, reduced);
    const rank = PRIORITY[kind];
    let joined = 0;
    this.fans.forEach((f, i) => {
      if (kind !== 'finish' && hash01(i, n) >= share) return;
      const busy = f.plan.length > 0 || f.pending !== null;
      if (busy && Math.max(f.rank, f.pending?.rank ?? 0) > rank) return;
      // a fan with a reaction of the same rank still running lets it finish (two cheers in a second are one cheer)
      if (busy && kind !== 'finish' && Math.max(f.rank, f.pending?.rank ?? 0) === rank) return;
      // the plan is drawn up when it starts, from the posture the fan is in THEN
      f.pending = { at: now + delayFor(i, n, f.along, reduced), rank, kind, strength, reduced };
      joined++;
    });
    return joined;
  }

  /** Advance to `now`; returns the fans whose clip changed (each at most once). */
  tick(now: number): ClipChange[] {
    const out: ClipChange[] = [];
    for (let i = 0; i < this.fans.length; i++) {
      const f = this.fans[i];
      let changed = false;
      if (f.pending && now >= f.pending.at) {
        const p = f.pending;
        f.pending = null;
        // the posture it is in at this moment: mid-rise counts as standing once past half
        const pos = f.plan.length && (f.clip === 'rise' || f.clip === 'sit_down') && now - f.since > (f.until - f.since) / 2 ? endPosture(f.clip, f.posture) : f.posture;
        f.posture = pos;
        f.plan = planFor(p.kind, pos, p.reduced, p.strength);
        f.rank = p.rank;
        this.startStep(f, p.at);
        changed = true;
      }
      // advance through finished steps (a long frame can finish more than one)
      while (f.plan.length && now >= f.until) {
        const done = f.plan.shift()!;
        f.posture = endPosture(done.clip, f.posture);
        const at = f.until;
        if (f.plan.length) this.startStep(f, at);
        else { f.clip = idleOf(f.posture); f.since = at; f.until = Infinity; f.rank = 0; }
        changed = true;
      }
      if (changed) out.push({ fan: i, clip: f.clip, since: f.since, idle: f.plan.length === 0 });
    }
    return out;
  }

  private startStep(f: FanState, at: number): void {
    const s = f.plan[0];
    f.clip = s.clip;
    f.since = at;
    f.until = at + s.seconds;
  }
}
