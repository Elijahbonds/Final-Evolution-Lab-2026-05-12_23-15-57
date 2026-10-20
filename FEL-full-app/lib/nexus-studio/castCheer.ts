// The cast fans cheer WITH the crowd (studio-5, docs/NEXUS-STUDIO.md §13.1). Pure: no Babylon import; the clock is the caller's.
//
// A cast fan (castLayer.ts mountCrowdCastLayer) is the kit body in a project character's look, seated in an empty seat of the
// venue's stands. Before this it sat (or stood) through every cheer. Now it hears every reaction the crowd hears — a momentum
// report, the rise to ON FIRE, the match's end, a script's crowd action, the dev handle — and answers with the crowd's OWN
// vocabulary and timing, read from visual/crowd and never re-tuned here:
//   - the plan     crowdReact.planFor   (sit_cheer; stand_cheer × 1–2; rise → stand_cheer × 3 → sit_down; groans; claps when calm)
//   - the clips    crowdClips.crowdClipKeys, at crowdVat.CROWD_CLIPS' seconds (legs, hips, spine, head: the fans' own keys)
//   - the stagger  crowdReact.delayFor  (the hash spread plus the ripple along its row; no ripple under reduced motion)
//   - the priority crowdReact.PRIORITY  (a groan never cuts a cheer; two cheers at once are one; nothing cuts the finish)
// The one difference, on purpose: EVERY cast fan takes part in every reaction. The crowd picks a share of its fans by the play's
// size (crowdReact.shareFor); a cast fan is the creator's own character, put in the stands to be seen, and a share rule would leave
// it sitting out up to half the small cheers. assumption: the owner wants their characters in every cheer (§13.1).
//
// The hands: the kit body's arms can move (the crowd bodies' cannot: their skin is weighted to the torso — crowdClips.ts), and left
// unkeyed they hang in the bind pose's T. Each key places them from the posed shoulder, by how low the hips are: on the thighs when
// seated, at the sides when standing, between the two while the fan is up off the seat. Visual only: nothing here reads or writes a
// score, a timer, a rule or a tuned number.

import { delayFor, idleOf, planFor, PRIORITY, type ClipChange, type FanSeat, type PlanStep, type ReactionKind } from '../babylon/visual/crowd/crowdReact';
import { CROWD_CLIPS, type CrowdClipName, type Posture } from '../babylon/visual/crowd/crowdVat';
import { crowdClipKeys, SEAT_DROP } from '../babylon/visual/crowd/crowdClips';
import type { PoseKey } from '../babylon/anim/poseClip';

export type { ReactionKind };

/** A reaction source: the crowd layer's `onReact` (runtime.ts mountCrowdLayer). Returns the unsubscribe. */
export interface CrowdReactions { onReact(fn: (kind: ReactionKind, strength: number) => void): () => void }

/** Where the hands rest, from the posed shoulder (poseClip handsRel, REF_ARM_LEN proportions). */
export const CAST_FAN_HANDS: Record<Posture, NonNullable<PoseKey['handsRel']>> = {
  seated: { Left: [-0.07, -0.36, 0.30], Right: [0.07, -0.36, 0.30] },
  standing: { Left: [-0.10, -0.50, 0.06], Right: [0.10, -0.50, 0.06] },
};

/** How seated a key is, 0 (standing) .. 1 (seated), from its hips' drop. Snapped at the ends so a resting key is exactly a rest. */
export function seatedness(hipsY: number | undefined): number {
  const w = Math.max(0, Math.min(1, -(hipsY ?? 0) / SEAT_DROP));
  return w >= 0.95 ? 1 : w <= 0.05 ? 0 : w;
}

/** The hands for a key whose hips sit at `hipsY`: the two rests, blended by how seated it is. Pure. */
export function fanHands(hipsY: number | undefined): NonNullable<PoseKey['handsRel']> {
  const w = seatedness(hipsY);
  if (w === 1) return CAST_FAN_HANDS.seated;
  if (w === 0) return CAST_FAN_HANDS.standing;
  const mix = (a: readonly number[], b: readonly number[]): [number, number, number] => [0, 1, 2].map((i) => +(b[i] + (a[i] - b[i]) * w).toFixed(4)) as [number, number, number];
  return { Left: mix(CAST_FAN_HANDS.seated.Left!, CAST_FAN_HANDS.standing.Left!), Right: mix(CAST_FAN_HANDS.seated.Right!, CAST_FAN_HANDS.standing.Right!) };
}

/** One crowd clip as a cast fan plays it: the crowd's own keys, unchanged, plus the hands. Pure. */
export function castFanClipKeys(name: CrowdClipName): PoseKey[] {
  return crowdClipKeys(name).map((k) => ({ ...k, handsRel: fanHands(k.hipsY) }));
}

/** The crowd's own length for a clip (crowdVat.CROWD_CLIPS). */
export const CAST_CLIP_SECONDS: Record<CrowdClipName, number> = Object.fromEntries(CROWD_CLIPS.map((c) => [c.name, c.seconds])) as Record<CrowdClipName, number>;
/** Whether the crowd loops a clip. */
export const CAST_CLIP_LOOPS: Record<CrowdClipName, boolean> = Object.fromEntries(CROWD_CLIPS.map((c) => [c.name, c.loop])) as Record<CrowdClipName, boolean>;
/** The animation group's name for a clip on a cast fan's body. */
export const castFanClipName = (clip: CrowdClipName): string => `studio_fan_${clip}`;

interface Pending { at: number; rank: number; kind: ReactionKind; strength: number; reduced: boolean }
interface Fan { posture: Posture; along: number; clip: CrowdClipName; since: number; until: number; plan: PlanStep[]; pending: Pending | null; rank: number }

const endPosture = (clip: CrowdClipName, from: Posture): Posture => (clip === 'rise' ? 'standing' : clip === 'sit_down' ? 'seated' : from);

/**
 * The cast fans' director: crowdReact.CrowdDirector's rules (plan, stagger, priority, the mid-rise posture, the finish that ends
 * all reactions), with every fan taking part. castCheer.test.ts holds its timeline to CrowdDirector's for every crowd fan that took
 * part in the same reactions.
 */
export class CastFanDirector {
  private fans: Fan[];
  private reactions = 0;
  private finished = false;

  constructor(seats: readonly FanSeat[]) {
    this.fans = seats.map((s) => ({ posture: s.home, along: s.along, clip: idleOf(s.home), since: -Infinity, until: Infinity, plan: [], pending: null, rank: 0 }));
  }

  get size(): number { return this.fans.length; }
  get done(): boolean { return this.finished; }
  clipOf(i: number): CrowdClipName { return this.fans[i].clip; }
  sinceOf(i: number): number { return this.fans[i].since; }
  /** True while fan `i` is in a reaction (or waiting for its start). */
  busy(i: number): boolean { return this.fans[i].plan.length > 0 || this.fans[i].pending !== null; }

  /** The crowd reacted at `now`: every fan joins, on the crowd's rules. Returns how many fans will play it. */
  react(kind: ReactionKind, strength: number, now: number, reduced: boolean): number {
    if (this.finished) return 0;
    if (kind === 'finish') this.finished = true;
    const n = ++this.reactions;
    const rank = PRIORITY[kind];
    let joined = 0;
    this.fans.forEach((f, i) => {
      const busy = f.plan.length > 0 || f.pending !== null;
      const held = Math.max(f.rank, f.pending?.rank ?? 0);
      if (busy && held > rank) return;
      if (busy && kind !== 'finish' && held === rank) return;
      f.pending = { at: now + delayFor(i, n, f.along, reduced), rank, kind, strength, reduced };
      joined++;
    });
    return joined;
  }

  /** Advance to `now`; the fans whose clip changed (each at most once). */
  tick(now: number): ClipChange[] {
    const out: ClipChange[] = [];
    this.fans.forEach((f, i) => {
      let changed = false;
      if (f.pending && now >= f.pending.at) {
        const p = f.pending;
        f.pending = null;
        if (f.plan.length && (f.clip === 'rise' || f.clip === 'sit_down') && now - f.since > (f.until - f.since) / 2) f.posture = endPosture(f.clip, f.posture);
        f.plan = planFor(p.kind, f.posture, p.reduced, p.strength);
        f.rank = p.rank;
        this.start(f, p.at);
        changed = true;
      }
      while (f.plan.length && now >= f.until) {
        const done = f.plan.shift()!;
        f.posture = endPosture(done.clip, f.posture);
        const at = f.until;
        if (f.plan.length) this.start(f, at);
        else { f.clip = idleOf(f.posture); f.since = at; f.until = Infinity; f.rank = 0; }
        changed = true;
      }
      if (changed) out.push({ fan: i, clip: f.clip, since: f.since, idle: f.plan.length === 0 });
    });
    return out;
  }

  private start(f: Fan, at: number): void {
    const s = f.plan[0];
    f.clip = s.clip; f.since = at; f.until = at + s.seconds;
  }
}
