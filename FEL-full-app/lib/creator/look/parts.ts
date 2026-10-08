// Parts: the budget, the editor's operations and the readable names (IMPROVE (2026-10-06), docs/CREATOR-PLAN.md phase 2).
//
// Pure (no Babylon): the Closet's Parts tab and the renderer (lib/babylon/creator/parts/renderParts.ts) both use it, so
// the editor can never let a player build what the renderer would then drop.
//
// THE BUDGET IS IN RENDERED PARTS. 64 parts on the body, and a mirrored part is two (CREATOR-PLAN: "mirrored copies
// count"). The doc's own cap (MAX_PARTS, sanitize.ts) counts entries; this one counts what is drawn, so a doc of 64
// mirrored entries renders the first 64 copies, never 128.
//
// THE FRAME A PART IS PLACED IN (renderParts / rigFrames): metres from its bone's joint, along the bone's own axes at
// rest — y runs down the bone towards the next joint (up the spine and neck, out along the arms, down the legs, along
// the foot), z faces the body's front (the top of the foot, on the feet), x is the third axis. A RIGHT-side bone's
// frame is the mirror image of its left twin's, so the same numbers mean the same place on either side, and `mirror`
// is the same part again on the other side. Rotations are degrees in that frame (Babylon's x, y, z order).

import {
  MAX_PARTS, PART_BONES, PART_SHAPES, RANGES, mirrorBone,
  type CreatorPart, type Finish, type PartBone, type PartShape, type PartTone, type ToneAxis, type Vec3,
} from './doc';
import { sanitizePart } from './sanitize';

/** Most rendered parts on one body (mirrored copies count). */
export const PART_BUDGET = MAX_PARTS;

export const partCost = (p: Pick<CreatorPart, 'mirror'>): number => (p.mirror ? 2 : 1);
export const partsCost = (parts: readonly Pick<CreatorPart, 'mirror'>[]): number => parts.reduce((n, p) => n + partCost(p), 0);

/** What the renderer draws, in doc order, inside the budget. A mirrored part with one slot left draws its first side only. */
export function renderList(parts: readonly CreatorPart[], budget = PART_BUDGET): { part: CreatorPart; mirrored: boolean }[] {
  const out: { part: CreatorPart; mirrored: boolean }[] = [];
  for (const part of parts) {
    if (out.length >= budget) break;
    out.push({ part, mirrored: false });
    if (part.mirror && out.length < budget) out.push({ part, mirrored: true });
  }
  return out;
}

/** True when `extra` more rendered parts still fit. */
export const fitsBudget = (parts: readonly Pick<CreatorPart, 'mirror'>[], extra: number): boolean => partsCost(parts) + extra <= PART_BUDGET;

/** The bone the mirror copy hangs on (the same bone, reflected, for a centre bone). */
export { mirrorBone };

// ── names a player reads ─────────────────────────────────────────────────────────────────────────────────────────────

export const SHAPE_LABELS: Record<PartShape, string> = {
  spike: 'Spike', cone: 'Cone', horn: 'Horn', blade: 'Blade', plate: 'Plate', disc: 'Disc', ring: 'Ring', sphere: 'Sphere',
  capsule: 'Capsule', box: 'Box', visor: 'Visor', lens: 'Lens', fin: 'Fin', wing: 'Wing', strap: 'Strap',
  capeStrip: 'Cape strip', shoulderPad: 'Shoulder pad', belt: 'Belt', maskShell: 'Mask shell', torus: 'Torus', tube: 'Tube',
  cylinder: 'Cylinder', wedge: 'Wedge', dome: 'Dome', pyramid: 'Pyramid', gem: 'Gem', crescent: 'Crescent', leaf: 'Leaf',
  claw: 'Claw', arc: 'Arc',
  bolt: 'Bolt', skirt: 'Skirt', helmet: 'Helmet', hood: 'Hood', ear: 'Ear', tailSeg: 'Tail segment', beard: 'Beard',
  bootShell: 'Boot shell', gloveShell: 'Glove shell', strand: 'Hair strand',
};

/** Shapes in the order the picker shows them: points, flats, rounds, wraps. */
export const SHAPE_ORDER: readonly PartShape[] = [
  'spike', 'cone', 'horn', 'claw', 'blade', 'leaf', 'fin', 'wing', 'bolt', 'ear', 'tailSeg', 'strand',
  'plate', 'shoulderPad', 'disc', 'lens', 'ring', 'crescent', 'strap', 'capeStrip',
  'sphere', 'capsule', 'box', 'cylinder', 'tube', 'wedge', 'dome', 'pyramid', 'gem',
  'visor', 'maskShell', 'helmet', 'hood', 'beard', 'belt', 'skirt', 'torus', 'arc', 'bootShell', 'gloveShell',
];

export const BONE_LABELS: Record<PartBone, string> = {
  Head: 'Head', Neck: 'Neck', Spine2: 'Chest', Spine1: 'Upper spine', Spine: 'Spine', Hips: 'Hips',
  LeftShoulder: 'L shoulder', LeftArm: 'L upper arm', LeftForeArm: 'L forearm', LeftHand: 'L hand',
  RightShoulder: 'R shoulder', RightArm: 'R upper arm', RightForeArm: 'R forearm', RightHand: 'R hand',
  LeftUpLeg: 'L thigh', LeftLeg: 'L shin', LeftFoot: 'L foot', LeftToeBase: 'L toes',
  RightUpLeg: 'R thigh', RightLeg: 'R shin', RightFoot: 'R foot', RightToeBase: 'R toes',
};

/** The bone list grouped the way a body reads, head to toe. */
export const BONE_GROUPS: readonly { label: string; bones: readonly PartBone[] }[] = [
  { label: 'Head & body', bones: ['Head', 'Neck', 'Spine2', 'Spine1', 'Spine', 'Hips'] },
  { label: 'Left arm', bones: ['LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand'] },
  { label: 'Right arm', bones: ['RightShoulder', 'RightArm', 'RightForeArm', 'RightHand'] },
  { label: 'Left leg', bones: ['LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase'] },
  { label: 'Right leg', bones: ['RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'] },
];

export const FINISH_LABELS: Record<Finish, string> = { matte: 'Matte', gloss: 'Gloss', metal: 'Metal', glow: 'Glow' };

/** Phase 4c: the two-tone axes as a player reads them (the shape's own frame: x across, y along its length, z its front). */
export const TONE_AXIS_LABELS: Record<ToneAxis, string> = { x: 'Across', y: 'Along', z: 'Front–back' };
export const TONE_LABELS: Record<PartTone, string> = { split: 'Split', band: 'Stripe' };

// ── where a new part starts ──────────────────────────────────────────────────────────────────────────────────────────
// A first placement that already reads as the thing, measured on the kit body (rigFrames.test.ts checks a few land where
// they say). The player moves it from there; nothing here is a character, only "a horn goes on a head".

type Start = Pick<CreatorPart, 'bone' | 'pos' | 'rot' | 'scale' | 'mirror'> & { finish?: Finish };
const S = (bone: PartBone, pos: Vec3, rot: Vec3 = [0, 0, 0], scale: Vec3 = [1, 1, 1], mirror = false, finish?: Finish): Start => ({ bone, pos, rot, scale, mirror, finish });

export const PART_START: Record<PartShape, Start> = {
  spike: S('Head', [0, 0.2, 0.035], [0, 0, 0], [1, 1.2, 1]),
  cone: S('Head', [0, 0.21, 0.035], [0, 0, 0], [0.6, 0.8, 0.6]),
  horn: S('Head', [0.06, 0.15, 0.05], [0, 0, -25], [1, 1, 1], true),
  claw: S('LeftHand', [0, 0.09, 0.02], [-60, 0, 0], [1, 1, 1], true, 'metal'),
  blade: S('LeftForeArm', [0.04, 0.03, 0], [0, 0, 0], [1.4, 2, 1], true, 'metal'),
  leaf: S('Head', [0.07, 0.14, -0.02], [0, 0, -40], [1, 1.2, 1], true),
  fin: S('Spine2', [0, 0.05, -0.1], [0, 0, 0], [1, 1.5, 1.2]),
  wing: S('Spine2', [0.06, 0.08, -0.14], [0, -20, 10], [3.5, 3.5, 1], true),
  plate: S('Spine2', [0, 0.03, 0.165], [0, 0, 0], [2.2, 1.6, 1], false, 'metal'),
  shoulderPad: S('LeftShoulder', [0.04, 0.11, 0], [0, 0, -90], [1.3, 1.1, 1.3], true, 'gloss'),
  disc: S('Spine2', [0, 0.06, 0.17], [0, 0, 0], [0.6, 0.6, 1]),
  lens: S('Head', [0.035, 0.09, 0.12], [0, 0, 0], [0.7, 0.7, 1], true, 'gloss'),
  ring: S('Spine2', [0, 0.06, 0.17], [0, 0, 0], [0.8, 0.8, 1]),
  crescent: S('Head', [0, 0.15, 0.14], [0, 0, 90], [0.5, 0.5, 1], false, 'metal'),
  strap: S('Spine2', [0, 0, 0.15], [0, 0, 35], [1, 4, 1]),
  capeStrip: S('Spine2', [0, 0.12, -0.12], [0, 180, 0], [3.2, 8, 1]),
  sphere: S('LeftHand', [0, 0.1, 0]),
  capsule: S('LeftForeArm', [0, 0.04, 0], [0, 0, 0], [1.8, 1.6, 1.8], true),
  box: S('Hips', [0.17, -0.05, 0], [0, 0, 0], [0.5, 0.7, 0.9]),
  cylinder: S('LeftForeArm', [0, 0.06, 0], [0, 0, 0], [1.9, 1.5, 1.9], true),
  tube: S('LeftForeArm', [0, 0.08, 0], [0, 0, 0], [2.1, 1.4, 2.1], true),
  wedge: S('LeftFoot', [0, 0.08, 0.05], [0, 0, 0], [0.6, 0.4, 0.6], true),
  dome: S('Head', [0, 0.15, 0.03], [0, 0, 0], [1.9, 2, 2.1]),
  pyramid: S('Head', [0, 0.2, 0.03], [0, 0, 0], [0.4, 0.5, 0.4]),
  gem: S('Head', [0, 0.15, 0.135], [0, 0, 0], [0.3, 0.3, 0.3], false, 'gloss'),
  visor: S('Head', [0, 0.09, 0.035], [0, 0, 0], [0.95, 1, 1.15], false, 'gloss'),
  maskShell: S('Head', [0, 0.08, 0.035], [0, 0, 0], [0.92, 0.85, 1.18]),
  belt: S('Hips', [0, 0.02, 0.015], [0, 0, 0], [3.4, 1.6, 2.6]),
  torus: S('Head', [0, 0.27, 0.03], [0, 0, 0], [1.4, 1, 1.4], false, 'glow'),
  arc: S('Head', [0, 0.09, 0.03], [-90, 0, 0], [1.9, 1.5, 3]),
  // phase 4c (2026-10-06): first guesses on the male kit, like the rest (assumption: for the owner's eye)
  bolt: S('Hips', [0, 0.02, -0.14], [-120, 0, 0], [1.5, 1.5, 1.5]),
  skirt: S('Hips', [0, 0.02, 0.015], [0, 0, 0], [3.4, 2.5, 2.6]),
  helmet: S('Head', [0, 0.09, 0.02], [0, 0, 0], [1, 1.05, 1.15]),
  hood: S('Head', [0, 0.08, 0], [0, 0, 0], [1.1, 1.15, 1.25]),
  ear: S('Head', [0.085, 0.07, 0], [0, 90, -15], [0.9, 1, 1], true),
  tailSeg: S('Hips', [0, -0.02, -0.12], [-120, 0, 0]),
  beard: S('Head', [0, 0.05, 0.02], [0, 0, 0], [0.95, 0.9, 1.15]),
  bootShell: S('LeftFoot', [0, -0.01, 0.015], [0, 0, 0], [1.25, 2.1, 1.1], true),
  gloveShell: S('LeftHand', [0, 0, 0], [0, 0, 0], [1.2, 1.1, 0.8], true),
  strand: S('Head', [0.06, 0.08, -0.06], [0, 0, 10], [1, 3, 1], true),
};

const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** The first free id in `p1, p2, …` (sanitize.ts ids are [a-z0-9]{1,8}). */
export function nextPartId(parts: readonly Pick<CreatorPart, 'id'>[]): string {
  const taken = new Set(parts.map((p) => p.id));
  for (let i = 1; i < 10_000_000; i++) { const id = `p${i}`; if (!taken.has(id)) return id; }
  // unreachable inside the budget; kept total
  let id = ''; for (let i = 0; i < 8; i++) id += ID_CHARS[(Math.random() * ID_CHARS.length) | 0];
  return id;
}

const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, v));
const round = (v: number, dp: number) => { const k = 10 ** dp; const r = Math.round(v * k) / k; return r === 0 ? 0 : r; };   // never -0 (the sanitiser and JSON have none; phase 4a)

/** A new part of `shape` at its start placement, or null when it would not fit the budget. */
export function newPart(parts: readonly CreatorPart[], shape: PartShape, colour: string): CreatorPart | null {
  const s = PART_START[shape];
  if (!fitsBudget(parts, s.mirror ? 2 : 1)) {
    if (!fitsBudget(parts, 1)) return null;
    return { id: nextPartId(parts), shape, bone: s.bone, pos: [...s.pos], rot: [...s.rot], scale: [...s.scale], colour, finish: s.finish ?? 'matte', mirror: false };
  }
  return { id: nextPartId(parts), shape, bone: s.bone, pos: [...s.pos], rot: [...s.rot], scale: [...s.scale], colour, finish: s.finish ?? 'matte', mirror: s.mirror };
}

/** A copy of part `id`, nudged so it is visible next to the original, inserted after it; null if it would not fit. */
export function duplicatePart(parts: readonly CreatorPart[], id: string): CreatorPart[] | null {
  const i = parts.findIndex((p) => p.id === id);
  if (i < 0 || !fitsBudget(parts, partCost(parts[i]))) return null;
  const src = parts[i];
  const copy: CreatorPart = {
    ...src, id: nextPartId(parts), pos: [src.pos[0], src.pos[1], round(clamp(src.pos[2] + 0.02, RANGES.partPos), 3)],
    rot: [...src.rot], scale: [...src.scale],
  };
  return [...parts.slice(0, i + 1), copy, ...parts.slice(i + 1)];
}

export function removePart(parts: readonly CreatorPart[], id: string): CreatorPart[] {
  return parts.filter((p) => p.id !== id);
}

/** Change part `id`, clamped to the sanitiser's ranges. Turning mirror on past the budget is refused (the part is unchanged). */
export function updatePart(parts: readonly CreatorPart[], id: string, patch: Partial<Omit<CreatorPart, 'id'>>): CreatorPart[] {
  return parts.map((p) => {
    if (p.id !== id) return p;
    const next: CreatorPart = { ...p, ...patch };
    if (patch.mirror && !p.mirror && !fitsBudget(parts, 1)) next.mirror = false;
    if (!(PART_SHAPES as readonly string[]).includes(next.shape)) next.shape = p.shape;
    if (!(PART_BONES as readonly string[]).includes(next.bone)) next.bone = p.bone;
    next.pos = next.pos.map((v) => round(clamp(v, RANGES.partPos), 3)) as Vec3;
    next.rot = next.rot.map((v) => round(clamp(v, RANGES.partRot), 1)) as Vec3;
    next.scale = next.scale.map((v) => round(clamp(v, RANGES.partScale), 3)) as Vec3;
    // phase 4c: the optional fields (two-tone, swing, follow) in the sanitiser's own canonical form — clamped, defaults
    // left out, a tone without a second colour dropped, swing only on a bendable shape
    return sanitizePart(next) ?? p;
  });
}

/**
 * Editor convenience: `count` spikes fanned over the top and back of the head — spiked hair in one tap. They are ORDINARY
 * parts (each one editable, deletable, undoable), not a special hair type. Fewer than `count` when the budget is short.
 */
export function spikeCluster(parts: readonly CreatorPart[], opts: { count: number; colour: string; length?: number; spread?: number; bone?: PartBone }): CreatorPart[] {
  const count = Math.max(1, Math.min(24, Math.floor(opts.count)));
  const len = opts.length ?? 1.4;
  const spread = opts.spread ?? 1;
  const bone = opts.bone ?? 'Head';
  const out = [...parts];
  for (let i = 0; i < count; i++) {
    if (!fitsBudget(out, 1)) break;
    // a golden-angle fan over a cap of the head, tilted outward with distance from the crown, leaning back
    const t = count === 1 ? 0 : i / (count - 1);
    const ring = Math.sqrt(t) * spread;
    const az = i * 137.508 * (Math.PI / 180);
    const x = Math.sin(az) * 0.07 * ring, z = 0.035 - Math.cos(az) * 0.07 * ring - 0.02 * ring;
    const y = 0.2 - 0.06 * ring * ring;
    const tiltZ = -Math.sin(az) * 55 * ring, tiltX = -Math.cos(az) * 55 * ring - 15 * ring;
    out.push({
      id: nextPartId(out), shape: 'spike', bone, mirror: false, colour: opts.colour, finish: 'matte',
      pos: [round(x, 3), round(y, 3), round(z, 3)],
      rot: [round(clamp(tiltX, RANGES.partRot), 1), 0, round(clamp(tiltZ, RANGES.partRot), 1)],
      scale: [round(clamp(len * 1.1, RANGES.partScale), 3), round(clamp(len * (1 - 0.25 * ring), RANGES.partScale), 3), round(clamp(len * 1.1, RANGES.partScale), 3)],
    });
  }
  return out;
}
