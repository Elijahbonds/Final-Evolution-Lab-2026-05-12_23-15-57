// ARCHETYPE FIXTURES — TEST ONLY (IMPROVE (2026-10-06), CREATOR-PLAN phase 4a; the "make anyone" benchmark, section 4).
//
// Ten generic character RECIPES built with the Creator's own tools, used by the tests to prove the tools reach them
// (sanitise round-trip, size, share code, budgets, and a render on the real kit with the cosmetic-only invariant).
// They are NOT shipped: archetypes.test.ts fails if any file outside a test imports this folder, and the names are
// generic descriptions only. The game ships tools, never characters (CREATOR-PLAN: no preset, name or logo of anyone
// else's character).
//
// Each is a whole slot (doc.ts CreatorSlotV2) in the sanitiser's own canonical form, so `sanitizeCreatorSlot(f)` must
// give `f` back exactly (no silent drops). Fields from tools that land in later phases (new art) are not here; `later`
// says what each still waits for. Phase 4b (2026-10-06) filled in what shape v2 unlocked: head and hand / foot scale, the
// frame keys, bulk per segment, and the Studio-only presentation size. Phase 4c (2026-10-06) filled in its tools: two-tone
// quills, bendable capes / loincloths / long hair (`swing`), a player-drawn chest emblem (a mark), the bolt tail, the
// beard shell, ears, a helmet, glow paint, and parts that ride out on the bulk (`follow`). Phase 4e (2026-10-06) dressed
// them in CODE-BUILT CLOTHES where a recipe wanted clothes (the brawler's loose gi was waiting on "layered garments"):
// a high-neck long sleeve and trousers, a gi jacket open over an undershirt, baggy trousers, gloves, knee boots, a long
// coat — generic garments only, in the doc's canonical form (style defaults left out).

import { emptyCreatorDoc, type CreatorCloth, type CreatorPart, type CreatorShape, type CreatorSlotV2, type Finish, type PaintLayer, type PartBone, type PartShape, type SlotBody } from '../doc';
import { spikeCluster } from '../parts';
import { MARK_SIZE, emptyMark, encodeMark, strokeMark } from '../marks';

type V = [number, number, number];
const r = (v: number, dp: number) => Math.round(v * 10 ** dp) / 10 ** dp;

const z = (v: V): V => v.map((x) => (x === 0 ? 0 : x)) as V;   // -0 → 0 (JSON has no -0, so a code would not round-trip it)
let pid = 0;
type Extra = Pick<CreatorPart, 'colour2' | 'tone' | 'toneAxis' | 'toneAt' | 'toneWidth' | 'swing' | 'follow'>;
function P(shape: PartShape, bone: PartBone, colour: string, o: { pos?: V; rot?: V; scale?: V; finish?: Finish; mirror?: boolean } & Extra = {}): CreatorPart {
  const { pos, rot, scale, finish, mirror, ...extra } = o;
  return {
    id: `a${++pid}`, shape, bone,
    pos: z((pos ?? [0, 0, 0]).map((v) => r(v, 3)) as V),
    rot: z((rot ?? [0, 0, 0]).map((v) => r(v, 1)) as V),
    scale: z((scale ?? [1, 1, 1]).map((v) => r(v, 3)) as V),
    colour, finish: finish ?? 'matte', mirror: mirror ?? false,
    ...extra,
  };
}
/** Phase 4c: a player-drawn emblem for the acrobat's chest — a generic eight-armed star of brush strokes (not anyone's
 *  mark: the point is that the PLAYER draws it; the test draws something generic). */
function drawnEmblem(): string {
  const c = emptyMark(), m = MARK_SIZE / 2;
  for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4; strokeMark(c, m, m, m + Math.cos(a) * 50, m + Math.sin(a) * 50, 4, true); }
  strokeMark(c, m, m - 14, m, m + 14, 12, true);
  return encodeMark(c)!;
}
let lid = 0;
function L(type: PaintLayer['type'], region: PaintLayer['region'], colours: string[], o: Partial<Omit<PaintLayer, 'id' | 'type' | 'region' | 'colours' | 'at'>> & { at?: Partial<PaintLayer['at']> } = {}): PaintLayer {
  const { at, ...rest } = o;
  return {
    id: `l${++lid}`, type, region, surface: 'both',
    at: { x: 0.5, y: 0.5, rot: 0, scale: 1, stretch: 1, ...(at ?? {}) },
    colours, opacity: 1, mirror: false, ...rest,
  };
}
const fill = (region: PaintLayer['region'], c: string, surface: PaintLayer['surface'] = 'both') => L('fill', region, [c], { surface });
function slot(id: string, label: string, body: SlotBody, base: CreatorSlotV2['base'], doc: Partial<CreatorSlotV2['doc']>, extra: Partial<CreatorSlotV2> = {}): CreatorSlotV2 {
  return { id, label, body, base, doc: { ...emptyCreatorDoc(), ...doc }, ...extra };
}
/** Phase 4e: a built piece, written in its canonical form (the test proves the sanitiser gives it back unchanged). */
const cl = (c: CreatorCloth): CreatorCloth => c;
/** Re-number a part list's ids (a1…) after a helper such as spikeCluster made some. */
const ids = (parts: CreatorPart[]): CreatorPart[] => parts.map((p, i) => ({ ...p, id: `a${i + 1}`, pos: z(p.pos), rot: z(p.rot), scale: z(p.scale) }));
const spikes = (count: number, colour: string, length: number, spread = 1) => spikeCluster([], { count, colour, length, spread });
/** Phase 4b: a doc shape — proportions and bulk (no face values: the fixtures sculpt no face). */
const shape = (body: CreatorShape['body'], girth?: CreatorShape['girth']): CreatorShape => (girth ? { face: {}, body, girth } : { face: {}, body });
const LIMBS = (g: number) => ({ upperArms: g, forearms: g, thighs: g, calves: g });

export interface Archetype {
  /** generic description only */
  name: string;
  slot: CreatorSlotV2;
  /** what this recipe still waits for (later phases) — the honest gap */
  later: string[];
}

export const ARCHETYPES: Archetype[] = [
  {
    name: 'white-haired blindfolded sorcerer',
    slot: slot('f1', 'SORCERER', 'male', { skinTone: '#F3D2B3', hairStyle: 'Bald', faceShape: 'Long', eyeColor: '#7FD8FF' }, {
      // phase 4e: a dark high-neck long sleeve and loose trousers instead of a painted suit (the old neck tube is the collar)
      clothes: [
        cl({ id: 'c1', kind: 'bottom', style: 'pants', colour: '#141826', fit: 0.6 }),
        cl({ id: 'c2', kind: 'top', style: 'highneck', colour: '#141826', fit: 0.5, hem: 'thigh', flare: 0.2 }),
        cl({ id: 'c3', kind: 'feet', style: 'shoes', colour: '#0B0B0B', colour2: '#141826' }),
      ],
      parts: ids([
        ...spikes(14, '#F4F6FA', 1.6),
        P('visor', 'Head', '#0B0B0B', { pos: [0, 0.09, 0.035], scale: [0.97, 1.1, 1.18] }),
      ]),
      eyes: { glow: 0.8 },
      shape: shape({ legs: 1.04, neck: 1.1 }, LIMBS(0.85)),
    }, { frame: { heightScale: 1.04, buildScale: 0.94 }, presentation: { scale: 1.1 } }),
    later: [],
  },
  {
    name: 'quilled black-and-red speedster',
    slot: slot('f2', 'SPEEDSTER', 'male', { hairStyle: 'Bald', eyeColor: '#E01020' }, {
      flags: { suit: true, hide: { eyes: true, ears: true } },
      paint: [fill('all', '#111111'), fill('handLeft', '#FFFFFF'), fill('handRight', '#FFFFFF')],
      parts: [
        // phase 4c: the red stripe is IN each quill now (a two-tone band), not three extra red horns on top
        ...[-110, -120, -130, -140, -150].map((x, i) => P('horn', 'Head', '#111111', { pos: [(i - 2) * 0.03, 0.12, -0.04], rot: [x, 0, (i - 2) * 12], scale: [1.4, 2.2, 1.4], colour2: '#C8102E', tone: 'band', toneAt: 0.62, toneWidth: 0.22 })),
        ...[0, 1, 2].map((i) => P('leaf', 'Spine2', '#FFFFFF', { pos: [(i - 1) * 0.03, 0.12, 0.15], rot: [0, 0, (i - 1) * 25] })),
        P('sphere', 'Head', '#D9A066', { pos: [0, 0.06, 0.11], scale: [1, 0.7, 0.8] }),
        P('lens', 'Head', '#E01020', { pos: [0.035, 0.1, 0.13], finish: 'glow', mirror: true }),
        P('cone', 'Head', '#111111', { pos: [0.07, 0.17, 0], mirror: true }),
        P('torus', 'LeftForeArm', '#D4A017', { pos: [0, 0.22, 0], finish: 'metal', mirror: true }),
        P('capsule', 'LeftFoot', '#C8102E', { pos: [0, 0.06, 0.04], scale: [1.4, 1.8, 1.4], finish: 'gloss', mirror: true }),
        P('strap', 'LeftFoot', '#FFFFFF', { pos: [0, 0.05, 0.05], mirror: true }),
      ],
      shape: shape({ head: 1.4, hands: 1.15, feet: 1.3 }, LIMBS(0.8)),
    }),
    later: [],
  },
  {
    name: 'skull-masked giant warlord',
    slot: slot('f3', 'WARLORD', 'male', { skinTone: '#C68642', hairStyle: 'Bald' }, {
      colours: { shorts: '#1A0A0A' },
      // phase 4e: baggy dark trousers into knee boots (the chest stays bare under the kit's own top, the sport's default)
      clothes: [
        cl({ id: 'c1', kind: 'bottom', style: 'pants', colour: '#1A0A0A', fit: 0.95, colour2: '#7A0F0F' }),
        cl({ id: 'c2', kind: 'feet', style: 'boots', colour: '#3A2A1A', shaft: 'knee' }),
      ],
      parts: [
        P('maskShell', 'Head', '#E8E2D0', { pos: [0, 0.08, 0.06] }),
        P('dome', 'Head', '#E8E2D0', { pos: [0, 0.14, 0], scale: [2, 1.6, 2.2] }),
        P('lens', 'Head', '#0B0B0B', { pos: [0.035, 0.1, 0.12], mirror: true }),
        P('horn', 'Head', '#E8E2D0', { pos: [0.07, 0.17, 0], rot: [0, 0, -40], mirror: true }),
        P('shoulderPad', 'LeftShoulder', '#5A0000', { finish: 'gloss', mirror: true, follow: true }),
        ...[0, 1, 2].map((i) => P('spike', 'LeftShoulder', '#9A9A9A', { pos: [0.02 * i, 0.08, 0], finish: 'metal', mirror: true })),
        P('belt', 'Hips', '#8A6D3B', { finish: 'metal' }),
        P('capeStrip', 'Hips', '#7A0F0F', { pos: [0, -0.1, 0.12], scale: [1.6, 3.2, 1], swing: 0.6 }),
        P('capeStrip', 'Hips', '#7A0F0F', { pos: [0, -0.1, -0.12], rot: [0, 180, 0], scale: [1.6, 3.2, 1], swing: 0.6 }),
        P('tube', 'LeftForeArm', '#111111', { pos: [0, 0.15, 0], mirror: true }),
        P('cylinder', 'RightHand', '#5A3A1A', { scale: [1, 6, 1] }),
        P('box', 'RightHand', '#6B6B6B', { pos: [0, 0.6, 0], scale: [2.5, 1.5, 1.5], finish: 'metal' }),
      ],
      shape: shape({ legs: 1.04, torso: 1.04, shoulders: 1.08, neck: 0.85, hands: 1.25, feet: 1.15 }, { chest: 1.3, upperArms: 1.3, forearms: 1.3, neck: 1.3, thighs: 1.15 }),
    }, { frame: { heightScale: 1.04, buildScale: 1.08 }, presentation: { scale: 1.2 } }),
    later: ['muscle body morphs (phase 5 art)'],
  },
  {
    name: 'web-lined masked acrobat',
    slot: slot('f4', 'ACROBAT', 'male', { hairStyle: 'Bald' }, {
      flags: { suit: true, hide: { eyes: true } },
      paint: [
        fill('all', '#C8102E'), fill('legLeft', '#1B3A8A'), fill('legRight', '#1B3A8A'),
        ...(['head', 'torsoFront', 'armLeft', 'armRight', 'handLeft', 'handRight'] as const).map((region) => L('pattern', region, ['#0B0B0B'], { pattern: 'web', weight: 0.1 })),
        L('stamp', 'face', ['#FFFFFF', '#0B0B0B'], { stamp: 'eyeSharp', at: { x: 0.62, y: 0.6, scale: 0.5 }, weight: 0.45, mirror: true }),
        // phase 4c: the chest emblem is one the player drew
        L('mark', 'torsoFront', ['#0B0B0B'], { mark: 'm1', at: { y: 0.66, scale: 1.6 } }),
      ],
      marks: [{ id: 'm1', data: drawnEmblem() }],
    }),
    later: [],
  },
  {
    name: 'spike-haired orange-gi brawler',
    slot: slot('f5', 'BRAWLER', 'male', { hairStyle: 'Bald' }, {
      // phase 4e: the loose gi it waited for — a blue undershirt under an orange gi jacket open in a V, loose orange
      // trousers, blue mid boots (layers: the undershirt shows only where the gi is open)
      clothes: [
        cl({ id: 'c1', kind: 'bottom', style: 'pants', colour: '#F77F00', fit: 0.85 }),
        cl({ id: 'c2', kind: 'top', style: 'tee', colour: '#1B3A8A', fit: 0.2 }),
        cl({ id: 'c3', kind: 'top', style: 'jacket', colour: '#F77F00', fit: 0.85, sleeve: 'threeQuarter', neck: 'v', open: 0.3 }),
        cl({ id: 'c4', kind: 'feet', style: 'boots', colour: '#1B3A8A' }),
      ],
      parts: ids([
        ...spikes(20, '#0B0B0B', 1.8, 1.2),
        P('belt', 'Hips', '#1B3A8A'),
        P('tube', 'LeftForeArm', '#1B3A8A', { pos: [0, 0.2, 0], mirror: true }),
      ]),
    }),
    later: [],
  },
  {
    name: 'olive armoured visor soldier',
    slot: slot('f6', 'SOLDIER', 'male', { hairStyle: 'Bald' }, {
      flags: { suit: true, hide: { head: true } },
      paint: [fill('all', '#2B2F2A'), L('pattern', 'body', ['#3A3F38', '#2B2F2A'], { pattern: 'carbon' }),
        // phase 4c: glowing panel lines on the undersuit's arms
        L('pattern', 'armLeft', ['#7CFF4F'], { pattern: 'lines', blend: 'glow', weight: 0.1 }), L('pattern', 'armRight', ['#7CFF4F'], { pattern: 'lines', blend: 'glow', weight: 0.1 })],
      parts: [
        P('dome', 'Head', '#556B2F', { pos: [0, 0.1, 0], scale: [2.2, 2.1, 2.4], finish: 'metal' }),
        P('visor', 'Head', '#D4A017', { pos: [0, 0.09, 0.05], finish: 'gloss' }),
        P('plate', 'Spine2', '#556B2F', { pos: [0, 0.05, 0.14], finish: 'metal', follow: true }),
        P('shoulderPad', 'LeftShoulder', '#556B2F', { finish: 'metal', mirror: true }),
        P('cylinder', 'LeftForeArm', '#556B2F', { pos: [0, 0.12, 0], scale: [1.4, 1.6, 1.4], mirror: true }),
        P('plate', 'LeftUpLeg', '#556B2F', { pos: [0, -0.2, 0.08], mirror: true }),
        P('plate', 'LeftLeg', '#556B2F', { pos: [0, -0.2, 0.06], mirror: true }),
        P('wedge', 'LeftFoot', '#3A3F38', { pos: [0, 0.04, 0.06], mirror: true }),
        P('belt', 'Hips', '#3A3F38'),
      ],
      // phase 4e: gloves and knee boots over the painted undersuit (built clothes stay on in suit mode)
      clothes: [
        cl({ id: 'c1', kind: 'gloves', style: 'gloves', colour: '#3A3F38', cuff: 'gauntlet' }),
        cl({ id: 'c2', kind: 'feet', style: 'boots', colour: '#2B2F2A', shaft: 'knee', colour2: '#1A1A1A' }),
      ],
      shape: shape({ shoulders: 1.06 }, { chest: 1.15, upperArms: 1.1, thighs: 1.1, calves: 1.1 }),
    }),
    later: ['an environment map so metal reads (4d)'],
  },
  {
    name: 'black-caped dark lord with a glowing blade',
    slot: slot('f7', 'DARK LORD', 'male', { hairStyle: 'Bald' }, {
      flags: { suit: true, hide: { head: true } },
      paint: [fill('all', '#0A0A0A')],
      parts: [
        P('dome', 'Head', '#0A0A0A', { pos: [0, 0.12, 0], scale: [2.2, 2, 2.3], finish: 'gloss' }),
        P('maskShell', 'Head', '#0A0A0A', { pos: [0, 0.08, 0.07], finish: 'gloss' }),
        P('plate', 'Head', '#0A0A0A', { pos: [0, 0.1, -0.09], rot: [-20, 0, 0] }),
        P('pyramid', 'Head', '#6B6B6B', { pos: [0, 0.04, 0.12], finish: 'metal' }),
        P('box', 'Spine2', '#6B6B6B', { pos: [0, 0.02, 0.17] }),
        P('gem', 'Spine2', '#FF3030', { pos: [-0.02, 0.03, 0.19], finish: 'glow' }),
        P('gem', 'Spine2', '#30FF60', { pos: [0, 0.03, 0.19], finish: 'glow' }),
        P('gem', 'Spine2', '#3080FF', { pos: [0.02, 0.03, 0.19], finish: 'glow' }),
        P('belt', 'Hips', '#6B6B6B', { finish: 'metal' }),
        ...[-1, 0, 1].map((i) => P('capeStrip', 'Spine2', '#0A0A0A', { pos: [i * 0.08, 0, -0.15], rot: [0, 180, 0], scale: [1.2, 6, 1], swing: 0.8 })),
        P('cylinder', 'RightHand', '#C0C0C0', { finish: 'metal' }),
        P('cylinder', 'RightHand', '#FF2020', { pos: [0, 0.1, 0], scale: [0.8, 8, 0.8], finish: 'glow' }),
      ],
      // phase 4e: a black knee coat with a high neck, gloves and knee boots over the painted suit
      clothes: [
        cl({ id: 'c1', kind: 'gloves', style: 'gloves', colour: '#0A0A0A', fit: 0.3 }),
        cl({ id: 'c2', kind: 'top', style: 'jacket', colour: '#0A0A0A', fit: 0.5, hem: 'knee', neck: 'high', open: 0.12, flare: 0.5 }),
        cl({ id: 'c3', kind: 'feet', style: 'boots', colour: '#0A0A0A', shaft: 'knee' }),
      ],
    }, { frame: { heightScale: 1.04, buildScale: 1.06 }, presentation: { scale: 1.12 } }),
    later: [],
  },
  {
    name: 'ash-skinned bearded warrior with a red stripe',
    slot: slot('f8', 'WARRIOR', 'male', { skinTone: '#D8D6CF', hairStyle: 'Bald' }, {
      paint: (['scalp', 'face', 'torsoFront', 'upperArmLeft', 'forearmLeft'] as const).map((region) =>
        L('stamp', region === 'scalp' ? 'head' : region, ['#B01818'], { stamp: 'square', surface: 'skin', at: { x: region === 'face' ? 0.62 : 0.5, stretch: 0.25, scale: 1.4 } })),
      parts: [
        P('beard', 'Head', '#1A1A1A', { pos: [0, 0.05, 0.02], scale: [0.95, 0.9, 1.15] }),
        P('shoulderPad', 'LeftShoulder', '#6B6B6B', { finish: 'metal' }),
        P('strap', 'Spine2', '#3B2A1A', { rot: [0, 0, 35], scale: [1, 3, 1] }),
        P('blade', 'LeftHand', '#B0B0B0', { finish: 'metal', mirror: true }),
        P('capeStrip', 'Hips', '#5A1A1A', { pos: [0, -0.1, 0.12], scale: [1.5, 3, 1], swing: 0.5 }),
        P('capeStrip', 'Hips', '#5A1A1A', { pos: [0, -0.1, -0.12], rot: [0, 180, 0], scale: [1.5, 3, 1], swing: 0.5 }),
        P('tube', 'LeftForeArm', '#3B2A1A', { pos: [0, 0.15, 0], mirror: true }),
      ],
    }),
    later: ['a hair beard, not a shell (phase 5 art)', 'muscle (phase 5 art)'],
  },
  {
    name: 'white-haired caped weather queen',
    slot: slot('f9', 'STORM QUEEN', 'female', { skinTone: '#5A351A', hairStyle: 'Ponytail', hairColor: '#F4F6FA', eyeColor: '#FFFFFF' }, {
      flags: { suit: true },
      paint: [fill('body', '#0B0B0B')],
      parts: [
        P('crescent', 'Head', '#C0C0C0', { pos: [0, 0.16, 0.06], finish: 'metal' }),
        P('gem', 'Head', '#C0C0C0', { pos: [0, 0.15, 0.09], finish: 'metal' }),
        P('capeStrip', 'Spine2', '#0B0B0B', { pos: [-0.06, 0, -0.15], rot: [0, 180, 0], scale: [1.2, 6, 1], swing: 0.8 }),
        P('capeStrip', 'Spine2', '#0B0B0B', { pos: [0.06, 0, -0.15], rot: [0, 180, 0], scale: [1.2, 6, 1], swing: 0.8 }),
        // phase 4c: long white hair as bendable strands down the back and over the shoulders
        ...[[0.04, -0.07], [0.07, -0.04], [0.02, -0.09]].map(([x, zz]) => P('strand', 'Head', '#F4F6FA', { pos: [x, 0.1, zz], rot: [10, 0, 8], scale: [2, 5, 2], mirror: true, swing: 0.7 })),
        P('wing', 'Spine2', '#0B0B0B', { pos: [0.1, 0.05, -0.1], mirror: true }),
      ],
      eyes: { sclera: '#FFFFFF', pupil: 'none', glow: 1 },
      // phase 4e: a skirt over the painted suit, and knee boots
      clothes: [
        cl({ id: 'c1', kind: 'bottom', style: 'skirt', colour: '#0B0B0B', leg: 'capri', flare: 0.7, colour2: '#C0C0C0' }),
        cl({ id: 'c2', kind: 'feet', style: 'boots', colour: '#0B0B0B', shaft: 'knee' }),
      ],
    }),
    later: [],
  },
  {
    name: 'yellow round mascot with a bolt tail',
    slot: slot('f10', 'MASCOT', 'male', { hairStyle: 'Bald' }, {
      flags: { suit: true, hide: { head: true } },
      paint: [fill('all', '#FFD800'), L('stamp', 'face', ['#E02020'], { stamp: 'circle', at: { x: 0.75, y: 0.35, scale: 0.35 }, mirror: true })],
      parts: [
        P('sphere', 'Head', '#FFD800', { pos: [0, 0.1, 0], scale: [3, 2.8, 3] }),
        P('lens', 'Head', '#0B0B0B', { pos: [0.05, 0.12, 0.15], finish: 'gloss', mirror: true }),
        // phase 4c: ears with black tips (a two-tone split near the top)
        P('ear', 'Head', '#FFD800', { pos: [0.08, 0.25, 0], rot: [0, 0, -25], scale: [2.4, 3.6, 1.5], mirror: true, colour2: '#0B0B0B', toneAt: 0.78 }),
        P('sphere', 'Spine1', '#FFD800', { scale: [4.5, 5, 4] }),
        // phase 4c: the bolt tail is one bolt part
        P('bolt', 'Hips', '#FFD800', { pos: [0, 0.02, -0.16], rot: [-120, 0, 0], scale: [3, 3.2, 1.5] }),
      ],
      shape: shape({ head: 1.6, hands: 1.5, feet: 1.5, legs: 0.96 }, { belly: 1.6, thighs: 1.3, calves: 1.2 }),
    }, { presentation: { scale: 0.6 } }),
    later: ['a non-human rig is out of scope'],
  },
];

/** The stress case's pinned verdict: a costume read on the human rig, not a creature. */
export const MASCOT_VERDICT = 'costume read, not a creature';
