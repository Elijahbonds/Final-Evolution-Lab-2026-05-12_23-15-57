// The CreatorDoc sanitiser (IMPROVE (2026-10-06), CREATOR-PLAN phase 1): allow-listed ids, clamped numbers, validated
// hexes, text through the jersey plate's rule, budgets, a size cap, unknown fields dropped. Every rule has a case that
// would pass a broken sanitiser through, so a mutation of any rule fails here.
import { describe, expect, it } from 'vitest';
import { sanitizeCreatorDoc, sanitizeCreatorSlots, sanitizeHex, sanitizeLookBase, sanitizePaintLayer, sanitizePart, clampNum } from './sanitize';
import {
  CREATOR_DOC_VERSION, MAX_DOC_CHARS, MAX_PAINT_LAYERS, MAX_PARTS, MAX_SLOTS, PART_BONES, PART_SHAPES, PAINT_PATTERNS,
  PAINT_STAMPS, PAINT_REGIONS, FINISHES, emptyCreatorDoc, isEmptyCreatorDoc, mirrorBone, type CreatorDoc,
} from './doc';
import { payloadHasImage } from '../lookPrivacy';

const part = (o: Record<string, unknown> = {}) => ({ id: 'p1', shape: 'spike', bone: 'Head', colour: '#ff0000', ...o });
const layer = (o: Record<string, unknown> = {}) => ({ id: 'l1', type: 'fill', region: 'torsoFront', colours: ['#00ff00'], ...o });
const doc = (o: Record<string, unknown> = {}) => ({ v: 1, ...o });

describe('hex colours', () => {
  it('normalises #rgb and #rrggbb to upper-case #RRGGBB', () => {
    expect(sanitizeHex('#abc')).toBe('#AABBCC');
    expect(sanitizeHex('#00e5ff')).toBe('#00E5FF');
  });
  it('refuses everything else', () => {
    for (const bad of ['00e5ff', '#00e5f', '#00e5ffff', 'red', '#ggg', 'rgb(0,0,0)', '', null, 7, {}, '#00e5ff;background:url(x)']) {
      expect(sanitizeHex(bad), String(bad)).toBeNull();
    }
  });
});

describe('numbers', () => {
  it('clamps, rounds, and replaces non-finite values with the fallback', () => {
    expect(clampNum(5, 0, 1, 0.5)).toBe(1);
    expect(clampNum(-5, 0, 1, 0.5)).toBe(0);
    expect(clampNum(0.123456, 0, 1, 0)).toBe(0.123);
    for (const bad of [NaN, Infinity, -Infinity, '0.5', null, undefined]) expect(clampNum(bad, 0, 1, 0.25)).toBe(0.25);
  });
});

describe('parts', () => {
  it('keeps a valid part and fills defaults', () => {
    expect(sanitizePart(part())).toEqual({
      id: 'p1', shape: 'spike', bone: 'Head', pos: [0, 0, 0], rot: [0, 0, 0], scale: [1, 1, 1], colour: '#FF0000', finish: 'matte', mirror: false,
    });
  });
  it('drops a part with an unknown shape, bone, id or colour', () => {
    expect(sanitizePart(part({ shape: 'logo' }))).toBeNull();
    expect(sanitizePart(part({ bone: 'Tail' }))).toBeNull();
    expect(sanitizePart(part({ bone: 'mixamorig:Head' }))).toBeNull();
    expect(sanitizePart(part({ id: 'Has Space' }))).toBeNull();
    expect(sanitizePart(part({ id: 'waytoolongid' }))).toBeNull();
    expect(sanitizePart(part({ colour: 'blue' }))).toBeNull();
    expect(sanitizePart('spike')).toBeNull();
  });
  it('clamps position, rotation and scale; an unknown finish becomes matte; mirror is strictly boolean', () => {
    const p = sanitizePart(part({ pos: [9, -9, 0.1234], rot: [999, -999, 45.55], scale: [0, 100, 'x'], finish: 'chrome', mirror: 'yes' }))!;
    expect(p.pos).toEqual([0.6, -0.6, 0.123]);
    expect(p.rot).toEqual([180, -180, 45.6]);
    expect(p.scale).toEqual([0.05, 8, 1]);
    expect(p.finish).toBe('matte');
    expect(p.mirror).toBe(false);
  });
  it('drops unknown fields', () => {
    expect(Object.keys(sanitizePart(part({ onClick: 'alert(1)', hitbox: 2, reach: 3 }))!).sort())
      .toEqual(['bone', 'colour', 'finish', 'id', 'mirror', 'pos', 'rot', 'scale', 'shape']);
  });
});

describe('paint layers', () => {
  it('requires the id each type needs', () => {
    expect(sanitizePaintLayer(layer({ type: 'pattern' }))).toBeNull();
    expect(sanitizePaintLayer(layer({ type: 'pattern', pattern: 'web' }))!.pattern).toBe('web');
    expect(sanitizePaintLayer(layer({ type: 'pattern', pattern: 'someone-elses-logo' }))).toBeNull();
    expect(sanitizePaintLayer(layer({ type: 'stamp', stamp: 'bolt' }))!.stamp).toBe('bolt');
    expect(sanitizePaintLayer(layer({ type: 'stamp', stamp: 'bat-symbol' }))).toBeNull();
    // a fill does not carry a pattern it was handed
    expect(sanitizePaintLayer(layer({ pattern: 'web' }))!.pattern).toBeUndefined();
  });
  it('runs text through the jersey plate rule and drops a layer whose text sanitises to nothing', () => {
    expect(sanitizePaintLayer(layer({ type: 'text', text: 'go <b>team</b>!! 2026 extra' }))!.text).toBe('GO BTEAMB 20');
    expect(sanitizePaintLayer(layer({ type: 'text', text: '<<<>>>' }))).toBeNull();
    expect(sanitizePaintLayer(layer({ type: 'text', text: 42 }))).toBeNull();
  });
  it('keeps 1–3 valid colours and drops a layer with none', () => {
    expect(sanitizePaintLayer(layer({ colours: ['#111', 'nope', '#222222', '#333', '#444'] }))!.colours).toEqual(['#111111', '#222222']);
    expect(sanitizePaintLayer(layer({ colours: ['nope'] }))).toBeNull();
    expect(sanitizePaintLayer(layer({ colours: '#fff' }))).toBeNull();
  });
  it('clamps the transform and opacity; unknown region drops; unknown surface → both', () => {
    const l = sanitizePaintLayer(layer({ at: { x: 2, y: -1, rot: 400, scale: 99, stretch: 0 }, opacity: 3, surface: 'soul' }))!;
    expect(l.at).toEqual({ x: 1, y: 0, rot: 180, scale: 4, stretch: 0.2 });
    expect(l.opacity).toBe(1);
    expect(l.surface).toBe('both');
    expect(sanitizePaintLayer(layer({ region: 'tail' }))).toBeNull();
  });
});

describe('the doc', () => {
  it('refuses anything that is not a v1 doc', () => {
    for (const bad of [null, undefined, 'x', 1, [], {}, { v: 2 }, { v: '1' }]) expect(sanitizeCreatorDoc(bad), JSON.stringify(bad)).toBeNull();
    expect(sanitizeCreatorDoc({ v: 1 })).toEqual(emptyCreatorDoc());
  });
  it('drops unknown top-level and nested fields (no name, email or scan can ride along)', () => {
    const d = sanitizeCreatorDoc(doc({
      name: 'Real Person', email: 'a@b.c', scan: { landmarks: [1, 2] },
      colours: { jersey: '#123456', skin: '#ffffff', email: '#000000' },
      shape: { face: { faceLong: 0.5, 'nose width': 1, felShape: 1 }, body: { legs: 1.03, arms: 1.2 }, sliders: {} },
      flags: { suit: true, godMode: true },
    }))!;
    expect(Object.keys(d).sort()).toEqual(['colours', 'flags', 'paint', 'parts', 'shape', 'v']);
    expect(d.colours).toEqual({ jersey: '#123456' });
    expect(d.shape).toEqual({ face: { faceLong: 0.5 }, body: { legs: 1.03 } });
    expect(d.flags).toEqual({ suit: true });
    expect(JSON.stringify(d)).not.toMatch(/Real Person|a@b\.c|landmarks|arms|godMode/);
  });
  it('clamps shape values to their ranges (and has no arm proportion: REACH-FREEZE)', () => {
    const d = sanitizeCreatorDoc(doc({ shape: { face: { jawOpen: 4, browRaise: -1 }, body: { legs: 3, neck: 0.1, head: NaN } } }))!;
    expect(d.shape.face).toEqual({ jawOpen: 1, browRaise: 0 });
    // phase 4b (test changed: the ranges are what 4b retuned): legs to the play clamp's top, the neck to its new floor
    expect(d.shape.body).toEqual({ legs: 1.04, neck: 0.8 });
  });
  it('holds the budgets: first 64 parts, first 24 layers, duplicate ids dropped', () => {
    const parts = Array.from({ length: 100 }, (_, i) => part({ id: `p${i}` }));
    const paint = Array.from({ length: 40 }, (_, i) => layer({ id: `l${i}` }));
    const d = sanitizeCreatorDoc(doc({ parts: [part({ id: 'dup' }), part({ id: 'dup', shape: 'cone' }), ...parts], paint }))!;
    expect(d.parts).toHaveLength(MAX_PARTS);
    expect(d.parts[0].id).toBe('dup');
    expect(d.parts.filter((p) => p.id === 'dup')).toHaveLength(1);
    expect(d.paint).toHaveLength(MAX_PAINT_LAYERS);
    expect(d.paint.map((l) => l.id).slice(0, 3)).toEqual(['l0', 'l1', 'l2']);
  });
  it('a doc at every budget with every field at its longest fits the size cap (budgets and cap agree)', () => {
    const longestShape = [...PART_SHAPES].sort((a, b) => b.length - a.length)[0];
    const longestBone = [...PART_BONES].sort((a, b) => b.length - a.length)[0];
    const longestFinish = [...FINISHES].sort((a, b) => b.length - a.length)[0];
    const longestRegion = [...PAINT_REGIONS].sort((a, b) => b.length - a.length)[0];
    const parts = Array.from({ length: MAX_PARTS }, (_, i) => ({
      id: `p${String(i).padStart(7, '0')}`, shape: longestShape, bone: longestBone, colour: '#ABCDEF', finish: longestFinish, mirror: true,
      pos: [-0.123, -0.456, -0.589], rot: [-179.9, -179.9, -179.9], scale: [0.123, 0.456, 0.789],
    }));
    const paint = Array.from({ length: MAX_PAINT_LAYERS }, (_, i) => ({
      id: `l${String(i).padStart(7, '0')}`, type: 'text', text: 'WWWWWWWWWWWW', region: longestRegion, surface: 'garments',
      at: { x: 0.123, y: 0.456, rot: -179.9, scale: 0.123, stretch: 0.123 + 1 }, colours: ['#ABCDEF', '#ABCDEF', '#ABCDEF'], opacity: 0.123, mirror: true,
    }));
    const full = sanitizeCreatorDoc(doc({
      parts, paint, colours: { jersey: '#ABCDEF', shorts: '#ABCDEF', shoes: '#ABCDEF', accent: '#ABCDEF' },
      shape: { face: { faceLong: 0.123, faceRound: 0.123, faceSquare: 0.123, faceHeart: 0.123, faceDiamond: 0.123, jawOpen: 0.123, browRaise: 0.123 },
        body: { legs: 1.023, torso: 1.023, shoulders: 1.023, neck: 1.023, head: 1.023, hands: 1.023, feet: 1.023 } },
      flags: { suit: true },
    }));
    expect(full).not.toBeNull();
    expect(full!.parts).toHaveLength(MAX_PARTS);
    expect(full!.paint).toHaveLength(MAX_PAINT_LAYERS);
    expect(JSON.stringify(full).length).toBeLessThanOrEqual(MAX_DOC_CHARS);
  });
  it('refuses (null) a doc whose sanitised JSON is over the cap, rather than storing it', () => {
    const d = doc({ parts: Array.from({ length: 10 }, (_, i) => part({ id: `p${i}` })) });
    const size = JSON.stringify(sanitizeCreatorDoc(d)).length;
    expect(sanitizeCreatorDoc(d, size)).not.toBeNull();
    expect(sanitizeCreatorDoc(d, size - 1)).toBeNull();
  });
  it('only looks at a bounded slice of a hostile array', () => {
    const junk = Array.from({ length: 100_000 }, () => 'junk');
    const t0 = Date.now();
    expect(sanitizeCreatorDoc(doc({ parts: [...junk, part()], paint: junk }))!.parts).toEqual([]);
    expect(Date.now() - t0).toBeLessThan(500);
  });
  it('a sanitised doc is a fixed point, and never trips the save routes\' image refusal', () => {
    const d = sanitizeCreatorDoc(doc({
      parts: [part({ shape: 'visor', bone: 'Head', finish: 'glow' })],
      paint: PAINT_STAMPS.slice(0, 3).map((s, i) => layer({ id: `s${i}`, type: 'stamp', stamp: s }))
        .concat(PAINT_PATTERNS.slice(0, 2).map((p, i) => layer({ id: `q${i}`, type: 'pattern', pattern: p })))
        .concat([layer({ id: 't0', type: 'text', text: 'data:image/png;base64,AAAA' })]),
    }))!;
    expect(sanitizeCreatorDoc(d)).toEqual(d);
    expect(payloadHasImage({ face: { creator: d } })).toBe(false);
  });
  it('isEmptyCreatorDoc / mirrorBone', () => {
    expect(isEmptyCreatorDoc(emptyCreatorDoc())).toBe(true);
    expect(isEmptyCreatorDoc({ ...emptyCreatorDoc(), flags: { suit: true } })).toBe(false);
    expect(mirrorBone('LeftForeArm')).toBe('RightForeArm');
    expect(mirrorBone('RightToeBase')).toBe('LeftToeBase');
    expect(mirrorBone('Head')).toBe('Head');
    for (const b of PART_BONES) expect(PART_BONES).toContain(mirrorBone(b));
  });
  it('the version constant is 1 (a bump must come with a migration and new tests)', () => {
    expect(CREATOR_DOC_VERSION).toBe(1);
  });
});

describe('slots', () => {
  it('keeps up to 5 slots with valid docs; labels go through the plate rule', () => {
    const good = { label: 'my <b>guy</b>', doc: { v: 1, colours: { jersey: '#fff' } } };
    const slots = sanitizeCreatorSlots([good, { label: 'x', doc: { v: 9 } }, 'junk', ...Array(10).fill(good)]);
    expect(slots).toHaveLength(MAX_SLOTS);
    // phase 4a: a v1 slot comes back as a v2 slot (an id, the default body, a base from the fallback face: none here)
    expect(slots[0]).toEqual({ id: 's1', label: 'MY BGUYB', body: 'male', base: {}, doc: { ...emptyCreatorDoc(), colours: { jersey: '#FFFFFF' } } as CreatorDoc });
    expect(new Set(slots.map((s) => s.id)).size).toBe(MAX_SLOTS);
    expect(sanitizeCreatorSlots('nope')).toEqual([]);
  });
});

describe('look base (share-code presets)', () => {
  it('keeps catalog names and valid hexes only — never the sliders', () => {
    expect(sanitizeLookBase({
      skinTone: '#c68642', hairStyle: 'Afro', hairColor: 'blonde', faceShape: 'Triangle', eyeShape: 'Almond', brows: 'Arched',
      mouth: 'Full', nose: 'Button', eyeColor: '#3b2a1a', sliders: { faceLong: 0.4 }, email: 'a@b.c',
    })).toEqual({ skinTone: '#C68642', hairStyle: 'Afro', eyeShape: 'Almond', brows: 'Arched', mouth: 'Full', nose: 'Button', eyeColor: '#3B2A1A' });
    expect(sanitizeLookBase(null)).toEqual({});
  });
});
