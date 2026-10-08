// Shape v2, the pure half (IMPROVE (2026-10-06), CREATOR-PLAN phase 4b): what each value is per place, the ranges, the
// joint maths, and the doc / slot / storage / share-code plumbing for bulk and the Studio size.
import { describe, expect, it } from 'vitest';
import { COSMETIC_CLAMP, STANDARD_FRAME_MODES } from '../../babylon/core/playFrame';
import {
  FRAME_KEYS, GIRTH_KEYS, GIRTH_RANGE, PRESENTATION_RANGE, PROPORTION_KEYS, PROPORTION_RANGES, REACH_SAFE_KEYS,
  emptyCreatorDoc, isEmptyCreatorDoc, type CreatorSlotV2,
} from './doc';
import { FRAME_JOINTS, FRAME_KEY_CLAMP, GIRTH_BONES, SCALE_GROUPS, effectiveShape, isNeutralShape, legLift, lengthenedOffset, neckOffset, neutralShape } from './shape';
import { sanitizeCreatorDoc, sanitizeCreatorSlot, sanitizeSlotPresentation } from './sanitize';
import { holdCreator } from './storage';
import { decodeSlotCode, decodeShareCode, encodeShareCode, encodeSlotCode } from './shareCode';
import { activeLook, mergeDeviceNumbers } from './slots';
import { SHAPE_RANDOM_SECTIONS, randomiseShape, seededRandom } from './randomise';

const ALL = {
  body: { legs: 1.04, torso: 0.96, shoulders: 1.08, neck: 1.5, head: 1.6, hands: 0.8, feet: 1.5 },
  girth: { head: 1.2, neck: 1.3, chest: 1.6, belly: 0.7, upperArms: 1.4, forearms: 1.1, thighs: 0.9, calves: 1.2 },
};

describe('the ranges', () => {
  it('the frame keys ARE the play clamp (legs and torso the height range, shoulders the build range)', () => {
    expect(PROPORTION_RANGES.legs).toEqual(COSMETIC_CLAMP.height);
    expect(PROPORTION_RANGES.torso).toEqual(COSMETIC_CLAMP.height);
    expect(PROPORTION_RANGES.shoulders).toEqual(COSMETIC_CLAMP.build);
    for (const k of FRAME_KEYS) expect(FRAME_KEY_CLAMP[k]).toEqual(PROPORTION_RANGES[k]);
  });
  it('the reach-safe keys are wide (TUNED: head 0.8–1.6, hands / feet 0.8–1.5, neck 0.8–1.5), and there is no arm key', () => {
    expect(PROPORTION_RANGES.head).toEqual([0.8, 1.6]);
    expect(PROPORTION_RANGES.hands).toEqual([0.8, 1.5]);
    expect(PROPORTION_RANGES.feet).toEqual([0.8, 1.5]);
    expect(PROPORTION_RANGES.neck).toEqual([0.8, 1.5]);
    expect([...REACH_SAFE_KEYS, ...FRAME_KEYS].sort()).toEqual([...PROPORTION_KEYS].sort());
    expect(PROPORTION_KEYS.some((k) => /arm|reach|forearm/i.test(k))).toBe(false);
    expect(GIRTH_RANGE).toEqual([0.7, 1.6]);
    expect(PRESENTATION_RANGE[0]).toBeLessThan(COSMETIC_CLAMP.height[0]);
    expect(PRESENTATION_RANGE[1]).toBeGreaterThan(COSMETIC_CLAMP.height[1]);
  });
  it('no bulk, scale or frame joint ever names an arm bone that sets where the hand sits', () => {
    const joints = Object.values(FRAME_JOINTS).flat();
    // the frame keys lengthen legs, spine and clavicles; never the upper arm → forearm → hand chain
    expect(joints.filter((j) => /ForeArm|Hand/.test(j))).toEqual([]);
    expect(Object.values(SCALE_GROUPS).flatMap((g) => g.bones)).toEqual(['LeftHand', 'RightHand', 'LeftFoot', 'LeftToeBase', 'RightFoot', 'RightToeBase']);
    expect(Object.keys(GIRTH_BONES).sort()).toEqual([...GIRTH_KEYS].sort());
  });
});

describe('effectiveShape: the clamp per frame type', () => {
  it('casual: everything applies, the frame keys inside the play clamp', () => {
    const s = effectiveShape(ALL, {});
    expect(s.body).toEqual(ALL.body);
    expect(s.girth).toEqual(ALL.girth);
    const wild = effectiveShape({ body: { legs: 3, torso: 0.1, shoulders: 9, head: 9, hands: 0 }, girth: { chest: 9, calves: -1 } }, {});
    expect(wild.body).toMatchObject({ legs: 1.04, torso: 0.96, shoulders: 1.08, head: 1.6, hands: 0.8 });
    expect(wild.girth).toMatchObject({ chest: 1.6, calves: 0.7 });
  });
  it('every STANDARD_FRAME_MODES mode and any ranked session: the frame keys are exactly 1.0, the rest unchanged', () => {
    for (const ctx of [...Object.keys(STANDARD_FRAME_MODES).map((modeId) => ({ modeId })), { modeId: 'karate', ranked: true }, { ranked: true }]) {
      const s = effectiveShape(ALL, ctx);
      for (const k of FRAME_KEYS) expect(s.body[k], `${JSON.stringify(ctx)} ${k}`).toBe(1);
      for (const k of REACH_SAFE_KEYS) expect(s.body[k]).toBe(ALL.body[k]);
      expect(s.girth).toEqual(ALL.girth);
    }
  });
  it('a casual mode (not on the list, not ranked) keeps the frame keys', () => {
    expect(effectiveShape(ALL, { modeId: 'karate' }).body.legs).toBe(1.04);
  });
  it('missing, NaN or non-numbers are 1; nothing is neutral', () => {
    expect(effectiveShape(null, {})).toEqual(neutralShape());
    expect(effectiveShape({ body: { head: NaN, legs: 'x' as never } }, {})).toEqual(neutralShape());
    expect(isNeutralShape(neutralShape())).toBe(true);
    expect(isNeutralShape(effectiveShape({ body: {}, girth: { calves: 1.01 } }, {}))).toBe(false);
  });
});

describe('the joint maths (absolute from the bind pose: nothing compounds)', () => {
  it('lengthenedOffset is bind × s, so applying twice is applying once, and 1 is the bind', () => {
    const bind: [number, number, number] = [0, 0.423, 0];
    expect(lengthenedOffset(bind, 1)).toEqual(bind);
    expect(lengthenedOffset(bind, 1.04)[1]).toBeCloseTo(0.43992, 6);
    expect(lengthenedOffset(bind, 1.04)).toEqual(lengthenedOffset(bind, 1.04));   // from the bind, never from the last result
  });
  it('neckOffset moves the head joint up by (neck − 1) × the visible neck', () => {
    const p = neckOffset([0.002, 0.03, 0.02], [0, 1, 0], 1.5, 0.09);
    expect(p[0]).toBeCloseTo(0.002, 9); expect(p[1]).toBeCloseTo(0.075, 9); expect(p[2]).toBeCloseTo(0.02, 9);
    expect(neckOffset([0.002, 0.03, 0.02], [0, 1, 0], 1, 0.09)).toEqual([0.002, 0.03, 0.02]);
  });
  it('legLift keeps the feet on the floor', () => {
    expect(legLift(1, 0.84)).toBe(0);
    expect(legLift(1.04, 0.84)).toBeCloseTo(0.0336, 6);
    expect(legLift(0.96, 0.84)).toBeCloseTo(-0.0336, 6);
  });
});

describe('the doc: bulk', () => {
  it('sanitises: clamped, unknown segments dropped, stored only when set (an older doc is unchanged)', () => {
    const d = sanitizeCreatorDoc({ v: 1, shape: { girth: { chest: 9, calves: 0.1, arms: 2, belly: 'x' } } })!;
    expect(d.shape).toEqual({ face: {}, body: {}, girth: { chest: 1.6, calves: 0.7 } });
    expect(sanitizeCreatorDoc({ v: 1, shape: { body: { head: 1.2 } } })!.shape).toEqual({ face: {}, body: { head: 1.2 } });
    expect('girth' in sanitizeCreatorDoc({ v: 1, shape: { girth: {} } })!.shape).toBe(false);
  });
  it('a doc with only bulk is not empty', () => {
    expect(isEmptyCreatorDoc({ ...emptyCreatorDoc(), shape: { face: {}, body: {}, girth: { chest: 1.2 } } })).toBe(false);
  });
  it('rides a share code, v1 and v2', async () => {
    const doc = sanitizeCreatorDoc({ v: 1, shape: { body: { head: 1.4 }, girth: { thighs: 1.3 } } })!;
    const v1 = decodeShareCode(encodeShareCode(doc));
    expect(v1.ok && v1.doc.shape).toEqual(doc.shape);
    const slot: CreatorSlotV2 = { id: 's1', label: 'A', body: 'male', base: {}, doc };
    const v2 = await decodeSlotCode(await encodeSlotCode(slot));
    expect(v2.ok && v2.doc.shape).toEqual(doc.shape);
    // bulk alone (no proportion, no face value) still travels
    const only = sanitizeCreatorDoc({ v: 1, shape: { girth: { calves: 0.8 } } })!;
    const c = decodeShareCode(encodeShareCode(only));
    expect(c.ok && c.doc.shape.girth).toEqual({ calves: 0.8 });
  });
});

describe('the slot: the Studio size', () => {
  it('sanitises: clamped to PRESENTATION_RANGE, 1 and junk not stored', () => {
    expect(sanitizeSlotPresentation({ scale: 1.2 })).toEqual({ scale: 1.2 });
    expect(sanitizeSlotPresentation({ scale: 9 })).toEqual({ scale: PRESENTATION_RANGE[1] });
    expect(sanitizeSlotPresentation({ scale: 0.1 })).toEqual({ scale: PRESENTATION_RANGE[0] });
    for (const bad of [{ scale: 1 }, { scale: NaN }, { scale: -2 }, { scale: '1.2' }, 1.2, null]) expect(sanitizeSlotPresentation(bad)).toBeUndefined();
    const s = sanitizeCreatorSlot({ id: 's1', label: 'A', body: 'male', base: {}, doc: emptyCreatorDoc(), presentation: { scale: 0.6, extra: 'x' } })!;
    expect(s.presentation).toEqual({ scale: 0.6 });
  });
  it('is NEVER in what activeLook gives identityFrom (the reader every mode spawns through)', () => {
    const slot = sanitizeCreatorSlot({ id: 's1', label: 'A', body: 'male', base: {}, doc: { ...emptyCreatorDoc(), shape: { face: {}, body: { head: 1.3 } } }, presentation: { scale: 1.3 } })!;
    const look = activeLook({ creatorSlots: [slot], activeSlot: 's1' });
    const { slot: _s, ...given } = look;
    void _s;
    expect(JSON.stringify(given)).not.toMatch(/presentation/);
    expect(look.doc!.shape.body.head).toBe(1.3);
  });
  it('is a NUMBER: stored only with the numbers opt-in (with the frame and the doc shape), kept on the device otherwise', () => {
    const slot = { id: 's1', label: 'A', body: 'male', base: {}, doc: { ...emptyCreatorDoc(), shape: { face: {}, body: { head: 1.3 }, girth: { chest: 1.2 } } }, presentation: { scale: 1.3 }, frame: { heightScale: 1.02, buildScale: 1 } };
    const yes = holdCreator({ creatorSlots: [slot], activeSlot: 's1' }, null, { uploadFace: true, uploadNumbers: true });
    expect(yes.creatorSlots![0].presentation).toEqual({ scale: 1.3 });
    expect(yes.creatorSlots![0].doc.shape.girth).toEqual({ chest: 1.2 });
    const no = holdCreator({ creatorSlots: [slot], activeSlot: 's1' }, null, { uploadFace: true, uploadNumbers: false });
    expect(no.creatorSlots![0].presentation).toBeUndefined();
    expect(no.creatorSlots![0].doc.shape).toEqual({ face: {}, body: {} });
    // the Closet puts the device's numbers back over the server's copy
    const merged = mergeDeviceNumbers({ creatorSlots: no.creatorSlots, activeSlot: 's1' }, { creatorSlots: [slot], activeSlot: 's1' });
    expect((merged.creatorSlots as CreatorSlotV2[])[0].presentation).toEqual({ scale: 1.3 });
    expect((merged.creatorSlots as CreatorSlotV2[])[0].doc.shape.girth).toEqual({ chest: 1.2 });
  });
  it('rides a slot code like the frame (a giant arrives a giant in the importer\'s Studio)', async () => {
    const slot: CreatorSlotV2 = { id: 's1', label: 'A', body: 'male', base: {}, doc: emptyCreatorDoc(), presentation: { scale: 0.6 } };
    const r = await decodeSlotCode(await encodeSlotCode(slot));
    expect(r.ok && r.slot?.presentation).toEqual({ scale: 0.6 });
  });
});

describe('randomiseShape (the Shape tab\'s own roll, its own locks)', () => {
  it('stays inside every range, survives the sanitiser, and varies', () => {
    const seen = new Set<number>();
    for (let seed = 0; seed < 100; seed++) {
      const s = randomiseShape({ face: { faceLong: 0.4 }, body: {} }, [], seededRandom(seed));
      for (const k of PROPORTION_KEYS) { const [lo, hi] = PROPORTION_RANGES[k]; expect(s.body[k]).toBeGreaterThanOrEqual(lo); expect(s.body[k]).toBeLessThanOrEqual(hi); }
      for (const k of GIRTH_KEYS) { expect(s.girth![k]).toBeGreaterThanOrEqual(GIRTH_RANGE[0]); expect(s.girth![k]).toBeLessThanOrEqual(GIRTH_RANGE[1]); }
      expect(s.face).toEqual({ faceLong: 0.4 });   // the face sculpt is never rolled
      expect(sanitizeCreatorDoc({ v: 1, shape: s })!.shape).toEqual(s);
      seen.add(s.body.head!);
    }
    expect(seen.size).toBeGreaterThan(10);
  });
  it('a locked section comes back exactly as it went in', () => {
    const cur = { face: {}, body: { head: 1.5 }, girth: { chest: 1.4 } };
    expect(randomiseShape(cur, SHAPE_RANDOM_SECTIONS, seededRandom(1))).toEqual(cur);
    const r = randomiseShape(cur, ['bulk'], seededRandom(2));
    expect(r.girth).toEqual(cur.girth);
    expect(r.body.head).not.toBe(1.5);
    const p = randomiseShape(cur, ['proportions'], seededRandom(3));
    expect(p.body).toEqual(cur.body);
    expect(p.girth).not.toEqual(cur.girth);
  });
});
