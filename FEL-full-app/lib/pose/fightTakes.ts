// fightTakes — the combat read's streams, as takes (movement play P7, 2026-09-25): the eye-labelled capture fixtures
// (lib/pose/__fixtures__/fight, built by scripts/body/fight-streams.mts) and the SCRIPTED takes (lib/pose/fightKit: the
// bent-arm hook, the uppercut, the guard raise, the slips, the ducks and the steps no capture on disk holds), each a
// room-space joint clip with its labels. The gate (fightGate.test.ts, bodyFight.gate.test.ts) and the report
// (scripts/body/fight.mts) read the same takes. Seeds 1–3 (and 7–12) are TRAIN (the thresholds were tuned on them), 4–6 TEST.
// HELD OUT, AND WHAT IS NOT (the review, 2026-09-26): a seed re-draws the scripted takes' PATHS (scriptedTakes' `vary`),
// so a test seed's scripted strikes are out of sample; the 18 capture clips are the same clips on every seed (a seed
// changes only their noise and dropouts), and the thresholds cite several of them by name — their numbers are IN sample,
// and the gate and FIGHT.md report them apart from the scripted takes'.
// Pure: the caller reads the fixture files (no fs here).
import { restPose, type JointClip, type Joints, type V3 } from './synth';
import { jogBeat } from './streamKit';
import { LEAD_DEPTH_M, type FightLabel, type Hand } from './fightTruth';
import type { FightTake } from './fightGrade';
import {
  FightBody, stanceItem, blowItem, comboItem, kickItem, guardItem, evadeItem, stepItem, turnItem, fightScript, mirrorJoints, mulberry32,
  chamberItem, clapItem, frontWaveItem, armSwingItem, standBody, drawVariant,
  type ScriptItem, type ScriptLabel, type ScriptBlow, type FightHand, type StrikeVariant,
} from './fightKit';

export const TRAIN_SEEDS = [1, 2, 3] as const;
export const TEST_SEEDS = [4, 5, 6] as const;

/** A fixture file as scripts/body/fight-streams.mts writes it. */
export interface FightFixture {
  name: string;
  role: 'positive' | 'negative';
  description: string;
  eye: string;
  source: { file: string; kind: string; license: string; fps: number; from: number; to: number };
  lead: Hand | null;
  labels: FightLabel[];
  ungraded?: ('fightStep' | 'evade' | 'guard')[];
  clip: { fps: number; foot: JointClip['foot']; joints: string[]; frames: number[][] };
}

/** A take's stance as ONE lead for the whole take: the median of the feet's depth difference (room z, the clean joints)
 *  past fightTruth.LEAD_DEPTH_M, else square. */
export function stanceOfClip(frames: readonly Joints[]): Hand | 'square' {
  const d = frames.map((j) => j.LeftFoot[2] - j.RightFoot[2]).sort((a, b) => a - b);
  const m = d.length ? d[d.length >> 1] : 0;
  return m >= LEAD_DEPTH_M ? 'L' : m <= -LEAD_DEPTH_M ? 'R' : 'square';
}

/** A fixture → a take. */
export function takeOfFixture(fx: FightFixture): FightTake {
  const frames = fx.clip.frames.map((row) => {
    const j = {} as Joints;
    fx.clip.joints.forEach((n, k) => { (j as Record<string, V3>)[n] = [row[3 * k], row[3 * k + 1], row[3 * k + 2]]; });
    return j;
  });
  // (the truth's straights are named by ONE lead per take — the eye's, else the take's own stance, square = the orthodox
  // default — never by the reader's time-varying stance rule, so a stale lead of the reader's shows: FightTake.lead)
  return { name: fx.name, role: fx.role, source: 'real', clip: { fps: fx.clip.fps, frames, foot: fx.clip.foot }, labels: fx.labels, ungraded: fx.ungraded ?? [], lead: fx.lead ?? stanceOfClip(frames) };
}

const other = (h: Hand): Hand => (h === 'L' ? 'R' : 'L');
/** A take joint-mirrored: a southpaw from an orthodox one (the labels' sides swapped). */
export function mirrorTake(t: FightTake): FightTake {
  return {
    ...t, name: `${t.name}~mirror`,
    clip: { ...t.clip, frames: t.clip.frames.map(mirrorJoints) },
    labels: t.labels.map((l) => (l.hand ? { ...l, hand: other(l.hand) } : l)),
    lead: t.lead === 'L' || t.lead === 'R' ? other(t.lead) : t.lead,
  };
}

/** Script labels → truth labels (a straight is named jab / cross by the stance rule, not by the script). */
function labelsOf(ls: ScriptLabel[]): FightLabel[] {
  // a guard coming down is the guard's state (a block let go), not a graded move
  return ls.filter((l) => !(l.kind === 'guard' && l.cls === 'drop')).map((l) => ({
    kind: l.kind, cls: l.cls === 'jab' || l.cls === 'cross' ? 'straight' : l.cls, hand: l.hand, at: Math.max(0, l.from - 0.02),
    span: l.to - l.from + 0.12, labeller: 'scripted' as const,
  }));
}
const shuffle = <T,>(a: T[], rng: () => number): T[] => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
/** Scripted items → a take (its labels on the take's clock). */
export function scriptTake(name: string, role: FightTake['role'], items: ScriptItem[], guardHeld = true, lead?: Hand): FightTake {
  const { clip, labels } = fightScript(items, 60);
  return { name, role, source: 'scripted', clip, labels: labelsOf(labels), guardHeld, lead };
}

/**
 * The scripted takes for one seed and stance. Positives: single strikes, combinations, straights from a chamber, kicks,
 * the guard raised from the hands down and from a LOW guard one hand after the other, the evades, the steps. Negatives: a
 * guard held (bobbing), a rest stance with the hands down, a jog, claps, a wave in front of the face, arm swings.
 *
 * THE PATHS VARY BY SEED (`vary`, on by default; the review, 2026-09-26): each strike's path (a hook's end and load, an
 * uppercut's dip and end, a straight's reach and angle), the body's guard height and the raise's hand lag are drawn from
 * the seed's own generator, apart from the timing's — so the TEST seeds' hooks and uppercuts are paths no threshold was
 * tuned on, where a seed used to change only the noise, the timing and ±5 cm of height. `vary: false` is the reference
 * paths (every draw of the timing generator as before).
 */
export function scriptedTakes(seed: number, lead: FightHand = 'L', o: { vary?: boolean } = {}): FightTake[] {
  const vary = o.vary ?? true;
  const vr = mulberry32(seed * 7907 + (lead === 'L' ? 3 : 503));
  const U = (a: number, b: number) => a + (b - a) * vr();
  const V = (n: ScriptBlow): StrikeVariant | undefined => (vary ? drawVariant(n, vr) : undefined);
  const fb = new FightBody(lead, vary ? { guardDy: U(-0.04, 0.04), guardDz: U(-0.04, 0.04) } : {});
  const rng = mulberry32(seed * 1009 + (lead === 'L' ? 0 : 500));
  const gap = () => 0.4 + rng() * 0.35;
  const rear = other(lead);
  const tag = `${lead === 'L' ? 'orth' : 'south'}_s${seed}`;
  // single strikes, shuffled, twice over
  const singles: [ScriptBlow, FightHand][] = [['jab', lead], ['cross', rear], ['hook', lead], ['hook', rear], ['uppercut', lead], ['uppercut', rear]];
  const blows: ScriptItem[] = [stanceItem(fb, 0.8, rng)];
  for (const [n, h] of [...shuffle(singles, rng), ...shuffle(singles, rng)]) blows.push(blowItem(fb, n, rng, h, V(n)), stanceItem(fb, gap(), rng));
  // combinations at a real 1-2's spacing (0.25–0.4 s onset to onset)
  const combos: ScriptItem[] = [stanceItem(fb, 0.8, rng)];
  const sp = () => 0.25 + rng() * 0.15;
  const COMBOS: ScriptBlow[][] = [['jab', 'cross'], ['jab', 'jab', 'cross'], ['jab', 'cross', 'hook'], ['jab', 'cross', 'uppercut'], ['cross', 'hook', 'cross']];
  for (const c of shuffle(COMBOS, rng)) {
    const hands = c.map((n, i) => (n === 'jab' ? lead : n === 'cross' ? rear : c[i - 1] === 'cross' ? lead : rear));
    combos.push(comboItem(fb, c, rng, c.slice(1).map(sp), hands, c.map((n) => V(n) ?? {})), stanceItem(fb, 0.6 + rng() * 0.3, rng));
  }
  const kicks: ScriptItem[] = [stanceItem(fb, 0.8, rng)];
  for (const [form, f] of shuffle<[ 'front' | 'round', FightHand]>([['front', lead], ['front', rear], ['round', rear], ['round', lead]], rng)) kicks.push(kickItem(fb, form, rng, f), stanceItem(fb, gap(), rng));
  const guard: ScriptItem[] = [stanceItem(fb, 0.8, rng, 'rest')];
  for (let k = 0; k < 3; k++) guard.push(guardItem(fb, 'raise', rng, 0.5 + rng() * 0.4), guardItem(fb, 'drop', rng, 0.5 + rng() * 0.4));
  const evades: ScriptItem[] = [stanceItem(fb, 0.8, rng)];
  for (const e of shuffle<['slip' | 'duck', FightHand]>([['slip', 'L'], ['slip', 'R'], ['duck', 'L'], ['slip', 'L'], ['slip', 'R'], ['duck', 'L']], rng)) evades.push(evadeItem(fb, e[0], rng, e[1]), stanceItem(fb, gap(), rng));
  const steps: ScriptItem[] = [stanceItem(fb, 0.8, rng)];
  for (const [a, b] of shuffle<['in' | 'left', 'out' | 'right']>([['in', 'out'], ['left', 'right'], ['in', 'out'], ['left', 'right']], rng)) {
    const s1 = stepItem(fb, a, rng);
    steps.push(s1.item, stanceItem(fb, gap(), rng, 'guard', s1.end));
    const s2 = stepItem(fb, b, rng, s1.end, Math.hypot(s1.end[0], s1.end[2]));
    steps.push(s2.item, stanceItem(fb, gap(), rng, 'guard', s2.end));
  }
  // (the review's takes, 2026-09-26 — from the variant generator, so the reference takes above are unchanged)
  // straights from a chamber: the rear hand held there, three strikes (karate's reverse punch from the hip; a fist at the
  // ribs; a rear hand cocked back)
  const from = (['hip', 'rib', 'cocked'] as const)[Math.floor(vr() * 3)];
  const chamber: ScriptItem[] = [chamberItem(fb, rear, from, vr, V('cross') ?? {}, 1.0)];
  for (let k = 0; k < 2; k++) chamber.push(chamberItem(fb, rear, from, vr, V('cross') ?? {}, 0.5 + vr() * 0.3));
  // the guard raised from a LOW guard, one hand after the other (lag 0.1–0.3 s; the fists 0.1–0.3 m under the shoulder
  // line, this take's own height), three times: a raise (a parry) and no blow. (Fists held 0.15 m or less under the
  // shoulders are in the guard zone already: the guard is up from the start, and no raise is labelled by the truth.)
  const lowY = U(0.1, 0.3), low: ScriptItem[] = [stanceItem(fb, 1.0, vr, { lowY })];
  for (let k = 0; k < 3; k++) {
    const lag = U(0.1, 0.3), first: FightHand = vr() < 0.5 ? 'L' : 'R';
    low.push(guardItem(fb, 'raise', vr, 0.6 + vr() * 0.3, { lowY, lag, first }), guardItem(fb, 'drop', vr, 0.2, { lowY, lag: U(0, 0.1), first }), stanceItem(fb, 0.6 + vr() * 0.3, vr, { lowY }));
  }
  const sb = standBody();
  return [
    scriptTake(`kit_blows_${tag}`, 'positive', blows, true, lead),
    scriptTake(`kit_combos_${tag}`, 'positive', combos, true, lead),
    scriptTake(`kit_chamber_${tag}`, 'positive', chamber, true, lead),
    scriptTake(`kit_kicks_${tag}`, 'positive', kicks, true, lead),
    scriptTake(`kit_guard_${tag}`, 'positive', guard, false, lead),
    scriptTake(`kit_guardlow_${tag}`, 'positive', low, false, lead),
    scriptTake(`kit_evades_${tag}`, 'positive', evades, true, lead),
    scriptTake(`kit_steps_${tag}`, 'positive', steps, true, lead),
    scriptTake(`kit_idle_${tag}`, 'negative', [stanceItem(fb, 6, rng)], true, lead),
    scriptTake(`kit_rest_${tag}`, 'negative', [stanceItem(fb, 5, rng, 'rest')], false, lead),
    scriptTake(`kit_jog_${tag}`, 'negative', [jogItem(rng)], false, lead),
    scriptTake(`kit_clap_${tag}`, 'negative', [stanceItem(sb, 1.0, vr, 'rest'), clapItem(sb, 6, vr), stanceItem(sb, 0.6, vr, 'rest')], false, 'L'),
    scriptTake(`kit_wavefront_${tag}`, 'negative', [stanceItem(sb, 1.0, vr, 'rest'), frontWaveItem(sb, 4, vr, lead), stanceItem(sb, 0.6, vr, 'rest')], false, 'L'),
    scriptTake(`kit_armswing_${tag}`, 'negative', [stanceItem(sb, 1.0, vr, 'rest'), armSwingItem(sb, 4, vr, lead === 'L' ? 'together' : 'opposite'), stanceItem(sb, 0.6, vr, 'rest')], false, 'L'),
  ];
}

/** Running in place with the arms pumping (streamKit's jog, the arms swung antiphase at the elbow): the feet land where
 *  they left, as a living-room jog's do. */
function jogItem(rng: () => number): ScriptItem {
  const hz = 2.6 + rng() * 0.6, lift = 0.1 + rng() * 0.06, sec = 5;
  const [, legs] = jogBeat(restPose(), sec, hz, lift);
  return {
    sec, labels: [],
    pose: (t) => {
      const j = legs(t), s = Math.sin(t * hz * Math.PI);
      const out = { ...j } as Joints;
      for (const [side, sg] of [['Left', 1], ['Right', -1]] as const) {
        const S = j[`${side}Arm`], ph = s * sg;
        // elbow at ~90°, the forearm forward; the upper arm swinging ±30° with the opposite leg
        const a = (ph * 30 * Math.PI) / 180;
        const E: V3 = [S[0], S[1] - 0.28 * Math.cos(a), S[2] - 0.28 * Math.sin(-a)];
        out[`${side}ForeArm`] = E;
        out[`${side}Hand`] = [E[0] - sg * 0.03, E[1] + 0.03, E[2] + 0.24];
      }
      return out;
    },
  };
}

/** A scripted turn-and-kick (the spin kick's start, the opt-in's stream). */
export function turnKickTake(seed: number, lead: FightHand = 'L'): FightTake {
  const fb = new FightBody(lead), rng = mulberry32(seed * 31 + 7);
  return scriptTake(`kit_turn_${lead}_s${seed}`, 'positive', [stanceItem(fb, 0.8, rng), turnItem(fb, lead === 'L' ? 110 : -110, rng), stanceItem(fb, 0.8, rng)]);
}

export type { FightTake };
