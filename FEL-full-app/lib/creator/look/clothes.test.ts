// CODE-BUILT CLOTHES, the pure half (IMPROVE (2026-10-06), CREATOR-PLAN phase 4e): the doc's pieces sanitise to one
// canonical form (defaults left out, allow-lists, caps per kind), travel in both share codes, fit the size caps; the cut
// maths is ordered the way a player reads the names; the layering never puts a layer inside the one under it; the
// editor's operations and randomise keep to the budgets; and the kit slots a doc covers are the ones applyKit hides.
import { describe, expect, it } from 'vitest';
import {
  CLOTH_KINDS, CLOTH_STYLES, CLOTH_STYLE_DEFAULTS, CLOTH_SLEEVES, CLOTH_HEMS, CLOTH_LEGS, CLOTH_SHAFTS, CLOTH_RISES, CLOTH_NECKS,
  CLOTH_TONES, MAX_CLOTHES, MAX_CLOTHES_PER_KIND, MAX_DOC_CHARS, emptyCreatorDoc, isEmptyCreatorDoc, type ClothStyle, type CreatorCloth,
} from './doc';
import { sanitizeCloth, sanitizeClothes, sanitizeCreatorDoc } from './sanitize';
import {
  FIT_OFFSET, LAYER_GAP, SLEEVE_REACH, addCloth, canAddCloth, clothKitSlots, clothLabel, fitOffset, hemHeights, hoodUp, layerOffset,
  legCutHeight, moveCloth, randomiseClothes, removeCloth, resolveCloth, riseHeight, shaftHeight, sleeveReach, updateCloth,
} from './clothes';
import { decodeShareCode, decodeSlotCode, encodeShareCode, encodeSlotCode } from './shareCode';
import { seededRandom } from './randomise';
import { MARK_CELLS, MAX_MARK_RUNS, emptyMark, encodeMark } from './marks';
import { MAX_SHARE_CODE_CHARS } from './shareCode';
import { MAX_FACE_CHARS, MAX_SLOT_CHARS } from './doc';

const piece = (o: Partial<CreatorCloth> & Pick<CreatorCloth, 'style'>): CreatorCloth => ({ id: 'c1', kind: 'top', colour: '#112233', ...o } as CreatorCloth);
const H = { crotch: 0.834, torsoTop: 1.48, knee: 0.496, ankle: 0.071 };

describe('sanitizeCloth', () => {
  it('keeps a piece in canonical form: style defaults left out, the rest kept', () => {
    expect(sanitizeCloth({ id: 'c1', kind: 'top', style: 'tee', colour: '#abc', sleeve: 'short', fit: 0.35, hem: 'crop' }))
      .toEqual({ id: 'c1', kind: 'top', style: 'tee', colour: '#AABBCC', hem: 'crop' });
    // a style change re-reads what is a default: long sleeves are the long-sleeve's default
    expect(sanitizeCloth({ id: 'c1', kind: 'top', style: 'longsleeve', colour: '#112233', sleeve: 'long' })).toEqual({ id: 'c1', kind: 'top', style: 'longsleeve', colour: '#112233' });
  });
  it('refuses what is not a piece: a missing id / colour, an unknown kind or style, a style of another kind', () => {
    expect(sanitizeCloth(null)).toBeNull();
    expect(sanitizeCloth({ kind: 'top', style: 'tee', colour: '#112233' })).toBeNull();
    expect(sanitizeCloth({ id: 'c1', kind: 'top', style: 'tee' })).toBeNull();
    expect(sanitizeCloth({ id: 'c1', kind: 'hat', style: 'tee', colour: '#112233' })).toBeNull();
    expect(sanitizeCloth({ id: 'c1', kind: 'top', style: 'pants', colour: '#112233' })).toBeNull();
    expect(sanitizeCloth({ id: 'C1!', kind: 'top', style: 'tee', colour: '#112233' })).toBeNull();
  });
  it('drops options from other kinds, unknown values and unknown fields; clamps numbers', () => {
    const c = sanitizeCloth({ id: 'c1', kind: 'feet', style: 'boots', colour: '#112233', sleeve: 'long', leg: 'ankle', shaft: 'sideways', fit: 7, evil: '<script>', open: 0.5 });
    expect(c).toEqual({ id: 'c1', kind: 'feet', style: 'boots', colour: '#112233', fit: 1 });
    const t = sanitizeCloth({ id: 'c1', kind: 'top', style: 'jacket', colour: '#112233', open: -3, flare: 0.123456, fit: Number.NaN });
    expect(t).toEqual({ id: 'c1', kind: 'top', style: 'jacket', colour: '#112233', open: 0, flare: 0.12 });
  });
  it('a second colour keeps its tone only when it differs from the style default; a tone without a colour is dropped', () => {
    expect(sanitizeCloth({ id: 'c1', kind: 'feet', style: 'shoes', colour: '#112233', colour2: '#ffffff', tone: 'sole' })).toEqual({ id: 'c1', kind: 'feet', style: 'shoes', colour: '#112233', colour2: '#FFFFFF' });
    expect(sanitizeCloth({ id: 'c1', kind: 'top', style: 'tee', colour: '#112233', colour2: '#FFFFFF', tone: 'sleeves' })!.tone).toBe('sleeves');
    expect(sanitizeCloth({ id: 'c1', kind: 'top', style: 'tee', colour: '#112233', tone: 'sleeves' })).toEqual({ id: 'c1', kind: 'top', style: 'tee', colour: '#112233' });
    expect(sanitizeCloth({ id: 'c1', kind: 'top', style: 'tee', colour: '#112233', colour2: '#FFFFFF', tone: 'plaid' })).toEqual({ id: 'c1', kind: 'top', style: 'tee', colour: '#112233', colour2: '#FFFFFF' });
  });
  it('waistband is a boolean, stored only against the style default', () => {
    expect(sanitizeCloth({ id: 'c1', kind: 'bottom', style: 'pants', colour: '#112233', waistband: false })!.waistband).toBe(false);
    expect(sanitizeCloth({ id: 'c1', kind: 'bottom', style: 'leggings', colour: '#112233', waistband: false })!.waistband).toBeUndefined();
    expect(sanitizeCloth({ id: 'c1', kind: 'bottom', style: 'pants', colour: '#112233', waistband: 'yes' })!.waistband).toBeUndefined();
  });
  it('every style of every kind sanitises, and sanitising is idempotent', () => {
    for (const k of CLOTH_KINDS) for (const style of CLOTH_STYLES[k]) {
      const c = sanitizeCloth({ id: 'c1', kind: k, style, colour: '#112233', colour2: '#445566', tone: 'stripe', fit: 0.77 });
      expect(c, style).not.toBeNull();
      expect(sanitizeCloth(c)).toEqual(c);
    }
  });
});

describe('sanitizeClothes: budgets and order', () => {
  it('keeps at most MAX_CLOTHES and MAX_CLOTHES_PER_KIND of a kind, in order, ids unique', () => {
    const raw = [
      ...Array.from({ length: 5 }, (_, i) => ({ id: `t${i}`, kind: 'top', style: 'tee', colour: '#111111' })),
      { id: 't0', kind: 'bottom', style: 'pants', colour: '#111111' },
      { id: 'b1', kind: 'bottom', style: 'pants', colour: '#111111' }, { id: 'b2', kind: 'bottom', style: 'skirt', colour: '#111111' }, { id: 'b3', kind: 'bottom', style: 'shorts', colour: '#111111' },
      { id: 'g1', kind: 'gloves', style: 'gloves', colour: '#111111' }, { id: 'f1', kind: 'feet', style: 'boots', colour: '#111111' },
    ];
    const out = sanitizeClothes(raw);
    expect(out.length).toBeLessThanOrEqual(MAX_CLOTHES);
    expect(out.map((c) => c.id)).toEqual(['t0', 't1', 't2', 'b1', 'b2', 'g1']);
    for (const k of CLOTH_KINDS) expect(out.filter((c) => c.kind === k).length).toBeLessThanOrEqual(MAX_CLOTHES_PER_KIND[k]);
  });
  it('a hostile array is looked at only so far; anything not an array is none', () => {
    expect(sanitizeClothes(Array.from({ length: 100_000 }, () => 'junk'))).toEqual([]);
    expect(sanitizeClothes({ 0: { id: 'c1' } })).toEqual([]);
  });
});

describe('the doc carries its clothes', () => {
  const clothes: CreatorCloth[] = [
    { id: 'c1', kind: 'bottom', style: 'pants', colour: '#222222', colour2: '#FFFFFF' },
    { id: 'c2', kind: 'top', style: 'tee', colour: '#CC0000' },
    { id: 'c3', kind: 'top', style: 'jacket', colour: '#0A0A0A', hem: 'knee', open: 0.8, hood: 'up' },
    { id: 'c4', kind: 'feet', style: 'boots', colour: '#333333', shaft: 'knee', colour2: '#EEEEEE' },
  ];
  it('stored only when there is one (a phase 1–4d doc sanitises to exactly what it was)', () => {
    const plain = sanitizeCreatorDoc(emptyCreatorDoc())!;
    expect('clothes' in plain).toBe(false);
    expect(isEmptyCreatorDoc(plain)).toBe(true);
    const d = sanitizeCreatorDoc({ ...emptyCreatorDoc(), clothes })!;
    expect(d.clothes).toEqual(clothes);
    expect(isEmptyCreatorDoc(d)).toBe(false);
  });
  it('round-trips through the v1 and the v2 share codes, unchanged', async () => {
    const doc = sanitizeCreatorDoc({ ...emptyCreatorDoc(), clothes })!;
    const r1 = decodeShareCode(encodeShareCode(doc));
    expect(r1.ok && r1.doc.clothes).toEqual(clothes);
    const r2 = await decodeSlotCode(await encodeSlotCode({ body: 'female', base: {}, doc }));
    expect(r2.ok && r2.doc.clothes).toEqual(clothes);
  });
  it('a worst case of six pieces, every option off its default, is small next to the doc cap', () => {
    const worst = sanitizeClothes([
      { id: 'c0000001', kind: 'top', style: 'longsleeve', colour: '#ABCDEF', fit: 0.123, sleeve: 'threeQuarter', hem: 'thigh', neck: 'collar', hood: 'up', open: 0.123, flare: 0.123, colour2: '#ABCDEF', tone: 'stripe' },
      { id: 'c0000002', kind: 'top', style: 'highneck', colour: '#ABCDEF', fit: 0.123, sleeve: 'threeQuarter', hem: 'thigh', neck: 'scoop', hood: 'down', open: 0.123, flare: 0.123, colour2: '#ABCDEF', tone: 'stripe' },
      { id: 'c0000003', kind: 'top', style: 'longsleeve', colour: '#ABCDEF', fit: 0.123, sleeve: 'threeQuarter', hem: 'thigh', neck: 'collar', hood: 'up', open: 0.123, flare: 0.123, colour2: '#ABCDEF', tone: 'stripe' },
      { id: 'c0000004', kind: 'bottom', style: 'leggings', colour: '#ABCDEF', fit: 0.123, leg: 'capri', rise: 'low', waistband: true, flare: 0.123, colour2: '#ABCDEF', tone: 'sleeves' },
      { id: 'c0000005', kind: 'bottom', style: 'leggings', colour: '#ABCDEF', fit: 0.123, leg: 'capri', rise: 'low', waistband: true, flare: 0.123, colour2: '#ABCDEF', tone: 'sleeves' },
      { id: 'c0000006', kind: 'gloves', style: 'fingerless', colour: '#ABCDEF', fit: 0.123, cuff: 'gauntlet', colour2: '#ABCDEF', tone: 'stripe' },
    ]);
    expect(worst).toHaveLength(6);
    const size = JSON.stringify(worst).length;
    console.info(`[4e] worst-case clothes: ${size} characters of JSON`);
    expect(size).toBeLessThan(2_000);
    expect(size).toBeLessThan(MAX_DOC_CHARS / 10);
  });
});

describe('the size caps still agree with clothes in the doc', () => {
  it('the 4c worst case (64 parts, 24 layers, two heaviest marks, 64 face morphs) plus six worst-case pieces fits MAX_DOC_CHARS; its codes fit', async () => {
    const c = emptyMark();
    const long = Math.floor((MARK_CELLS - MAX_MARK_RUNS) / 127);
    let at = 0, ink = 0;
    for (let i = 0; i < MAX_MARK_RUNS; i++) { const r = i === MAX_MARK_RUNS - 1 ? MARK_CELLS - at : i < long ? 128 : 1; if (ink) c.fill(1, at, at + r); at += r; ink ^= 1; }
    const heavy = encodeMark(c)!;
    const parts = Array.from({ length: 64 }, (_, i) => ({
      id: `p${String(i).padStart(7, '0')}`, shape: i % 2 ? 'gloveShell' : 'capeStrip', bone: 'RightToeBase', colour: '#ABCDEF', finish: 'matte', mirror: true,
      pos: [-0.123, -0.456, -0.589], rot: [-179.9, -179.9, -179.9], scale: [0.123, 0.456, 0.789],
      colour2: '#ABCDEF', tone: 'band', toneAxis: 'z', toneAt: 0.123, toneWidth: 0.123, swing: 0.12, follow: true,
    }));
    const paint = Array.from({ length: 24 }, (_, i) => ({
      id: `l${String(i).padStart(7, '0')}`, type: i < 2 ? 'mark' : 'text', mark: `m${i + 1}`, text: 'WWWWWWWWWWWW', region: 'upperArmRight', surface: 'garments',
      at: { x: 0.123, y: 0.456, rot: -179.9, scale: 0.123, stretch: 1.123 }, colours: ['#ABCDEF', '#ABCDEF', '#ABCDEF'], opacity: 0.123, mirror: true, blend: 'multiply', hidden: true, weight: 0.123,
    }));
    const face = Object.fromEntries(Array.from({ length: 64 }, (_, i) => [`m${String(i).padStart(2, '0')}${'x'.repeat(21)}`, 0.123]));
    const clothes = Array.from({ length: 6 }, (_, i) => (i < 3
      ? { id: `c000000${i}`, kind: 'top', style: 'longsleeve', colour: '#ABCDEF', fit: 0.123, sleeve: 'threeQuarter', hem: 'thigh', neck: 'collar', hood: 'up', open: 0.123, flare: 0.123, colour2: '#ABCDEF', tone: 'stripe' }
      : i < 5 ? { id: `c000000${i}`, kind: 'bottom', style: 'leggings', colour: '#ABCDEF', fit: 0.123, leg: 'capri', rise: 'low', waistband: true, flare: 0.123, colour2: '#ABCDEF', tone: 'sleeves' }
        : { id: `c000000${i}`, kind: 'gloves', style: 'fingerless', colour: '#ABCDEF', fit: 0.123, cuff: 'gauntlet', colour2: '#ABCDEF', tone: 'stripe' }));
    const d = sanitizeCreatorDoc({
      v: 1, parts, paint, marks: [{ id: 'm1', data: heavy }, { id: 'm2', data: heavy }], clothes,
      colours: { jersey: '#ABCDEF', shorts: '#ABCDEF', shoes: '#ABCDEF', accent: '#ABCDEF' },
      shape: { face, body: { legs: 1.023, torso: 1.023, shoulders: 1.023, neck: 1.023, head: 1.023, hands: 1.023, feet: 1.023 }, girth: { head: 1.123, neck: 1.123, chest: 1.123, belly: 1.123, upperArms: 1.123, forearms: 1.123, thighs: 1.123, calves: 1.123 } },
      flags: { suit: true, hide: { eyes: true, ears: true, head: true, hair: true } }, eyes: { sclera: '#ABCDEF', size: 1.23, pupil: 'slit', pupilSize: 0.12, glow: 0.12 },
    }, Infinity)!;
    expect(d.clothes).toHaveLength(6);
    const size = JSON.stringify(d).length;
    console.info(`[4e] worst-case doc with clothes: ${size} characters (cap ${MAX_DOC_CHARS}); slot cap ${MAX_SLOT_CHARS}, face cap ${MAX_FACE_CHARS}`);
    expect(size).toBeLessThanOrEqual(MAX_DOC_CHARS);
    expect(sanitizeCreatorDoc(d)).toEqual(d);
    const v1 = encodeShareCode(d);
    expect(v1.length).toBeLessThanOrEqual(MAX_SHARE_CODE_CHARS);
    expect(decodeShareCode(v1)).toMatchObject({ ok: true, doc: d });
    const v2 = await decodeSlotCode(await encodeSlotCode({ body: 'male', base: {}, doc: d }));
    expect(v2.ok && v2.doc).toEqual(d);
  });
});

describe('cut maths, against the body', () => {
  it('sleeves get longer in the order a player reads them, none inside the shoulder, knuckles past the wrist', () => {
    const r = CLOTH_SLEEVES.map((s) => sleeveReach(s, 0.483, 0.245));
    for (let i = 1; i < r.length; i++) expect(r[i], CLOTH_SLEEVES[i]).toBeGreaterThan(r[i - 1]);
    expect(sleeveReach('none', 0.483, 0.245)).toBeLessThan(0);
    expect(sleeveReach('long', 0.483, 0.245)).toBeGreaterThanOrEqual(0.483);
    expect(sleeveReach('knuckles', 0.483, 0.245)).toBeCloseTo(0.483 + 0.4 * 0.245, 6);
    expect(sleeveReach('elbow', 0.483, 0.245)).toBeCloseTo(SLEEVE_REACH.elbow.arm * 0.483, 6);
  });
  it('hems run down from crop to the knee; a coat hangs a tube below the hip, a short top none', () => {
    const hs = CLOTH_HEMS.map((h) => hemHeights(h, H));
    expect(hs[0].torso).toBeGreaterThan(hs[1].torso);
    expect(hs[1].torso).toBeGreaterThan(hs[2].torso);
    expect(hs[2].torso).toBeGreaterThan(H.crotch);
    for (const h of hs.slice(0, 3)) expect(h.tube).toBeNull();
    expect(hs[3].tube!).toBeLessThan(H.crotch);
    expect(hs[4].tube!).toBeLessThan(hs[3].tube!);
    expect(hs[4].tube!).toBeCloseTo(H.knee - 0.02, 6);
  });
  it('legs reach further down in order, ankle at the ankle; rises go up; shafts go up to the knee', () => {
    const legs = CLOTH_LEGS.map((l) => legCutHeight(l, H));
    for (let i = 1; i < legs.length; i++) expect(legs[i]).toBeLessThan(legs[i - 1]);
    expect(legs[legs.length - 1]).toBeCloseTo(H.ankle + 0.012, 6);
    expect(legs[0]).toBeLessThan(H.crotch);
    const rises = CLOTH_RISES.map((r) => riseHeight(r, H));
    for (let i = 1; i < rises.length; i++) expect(rises[i]).toBeGreaterThan(rises[i - 1]);
    expect(rises[0]).toBeGreaterThan(H.crotch);
    const shafts = CLOTH_SHAFTS.map((s) => shaftHeight(s, H));
    for (let i = 1; i < shafts.length; i++) expect(shafts[i]).toBeGreaterThan(shafts[i - 1]);
    expect(shafts[shafts.length - 1]).toBeLessThan(H.knee);
  });
  it('a piece sits off the skin by its fit, inside its kind\'s range; a jacket a little further', () => {
    for (const k of CLOTH_KINDS) for (const style of CLOTH_STYLES[k]) {
      for (const fit of [0, 0.5, 1]) {
        const o = fitOffset({ kind: k, style, fit });
        expect(o).toBeGreaterThanOrEqual(FIT_OFFSET[k][0]);
        expect(o).toBeLessThanOrEqual(FIT_OFFSET[k][1] + 0.0041);
      }
      expect(fitOffset({ kind: k, style, fit: 1 })).toBeGreaterThan(fitOffset({ kind: k, style, fit: 0 }));
    }
    expect(fitOffset({ kind: 'top', style: 'jacket', fit: 0.5 })).toBeCloseTo(fitOffset({ kind: 'top', style: 'tee', fit: 0.5 }) + 0.004, 9);
  });
  it('a layer is never inside the one under it: at least LAYER_GAP out wherever they overlap', () => {
    for (const own of [0.003, 0.01, 0.03]) for (const under of [0, 0.003, 0.012, 0.04]) {
      const o = layerOffset(own, under);
      expect(o).toBeGreaterThanOrEqual(own);
      if (under > 0) expect(o).toBeGreaterThanOrEqual(under + LAYER_GAP - 1e-12);
    }
    expect(layerOffset(0.01, 0)).toBe(0.01);
  });
});

describe('the editor', () => {
  it('a bottom and gloves go under the first top, a top and footwear on the outside', () => {
    let list: CreatorCloth[] = [];
    list = addCloth(list, 'tee', '#111111')!.list;
    list = addCloth(list, 'pants', '#222222')!.list;
    list = addCloth(list, 'jacket', '#333333')!.list;
    list = addCloth(list, 'boots', '#444444')!.list;
    list = addCloth(list, 'gloves', '#555555')!.list;
    expect(list.map((c) => c.style)).toEqual(['pants', 'gloves', 'tee', 'jacket', 'boots']);
    expect(new Set(list.map((c) => c.id)).size).toBe(5);
  });
  it('refuses past the budgets', () => {
    let list: CreatorCloth[] = [];
    for (let i = 0; i < 3; i++) list = addCloth(list, 'tee', '#111111')!.list;
    expect(canAddCloth(list, 'top')).toBe(false);
    expect(addCloth(list, 'hoodie', '#111111')).toBeNull();
    list = addCloth(list, 'boots', '#111111')!.list;
    expect(addCloth(list, 'shoes', '#111111')).toBeNull();
    list = addCloth(list, 'pants', '#111111')!.list;
    list = addCloth(list, 'skirt', '#111111')!.list;
    expect(list).toHaveLength(MAX_CLOTHES);
    expect(addCloth(list, 'gloves', '#111111')).toBeNull();
  });
  it('update re-sanitises (a style change takes the new style\'s defaults for what was never set); move and remove', () => {
    let list = addCloth([], 'tee', '#111111', { hem: 'crop' })!.list;
    const id = list[0].id;
    list = updateCloth(list, id, { style: 'longsleeve' as ClothStyle });
    expect(resolveCloth(list[0]).sleeve).toBe('long');
    expect(list[0].hem).toBe('crop');
    expect(updateCloth(list, id, { colour: 'red' })[0].colour).toBe('#111111');   // an invalid patch keeps the piece
    list = addCloth(list, 'jacket', '#222222')!.list;
    expect(moveCloth(list, list[1].id, -1).map((c) => c.style)).toEqual(['jacket', 'longsleeve']);
    expect(moveCloth(list, list[0].id, -1).map((c) => c.style)).toEqual(['longsleeve', 'jacket']);
    expect(removeCloth(list, id).map((c) => c.style)).toEqual(['jacket']);
  });
  it('labels read like clothes', () => {
    expect(clothLabel(piece({ style: 'jacket', hem: 'knee' }))).toBe('Jacket · knee coat');
    expect(clothLabel({ id: 'c', kind: 'feet', style: 'boots', colour: '#111111', shaft: 'knee' })).toBe('Boots · knee');
    expect(clothLabel(piece({ style: 'hoodie' }))).toBe('Hoodie');
  });
});

describe('kit slots and hoods', () => {
  it('a top covers the kit top, a bottom the shorts, footwear the shoes; gloves nothing', () => {
    expect([...clothKitSlots([{ kind: 'top' }])]).toEqual(['tops']);
    expect([...clothKitSlots([{ kind: 'bottom' }, { kind: 'feet' }, { kind: 'gloves' }])].sort()).toEqual(['shoes', 'shorts']);
    expect(clothKitSlots(null).size).toBe(0);
  });
  it('a raised hood is seen on any top', () => {
    expect(hoodUp([piece({ style: 'tee', hood: 'up' })])).toBe(true);
    expect(hoodUp([piece({ style: 'hoodie' })])).toBe(false);
    expect(CLOTH_STYLE_DEFAULTS.hoodie.hood).toBe('down');
  });
});

describe('randomise with a lock per kind', () => {
  const start = sanitizeClothes([{ id: 'c1', kind: 'top', style: 'tee', colour: '#123456' }, { id: 'c2', kind: 'feet', style: 'boots', colour: '#654321' }]);
  it('is deterministic for a seed and stays inside the budgets and allow-lists', () => {
    const a = randomiseClothes(start, [], seededRandom(7)), b = randomiseClothes(start, [], seededRandom(7));
    expect(a).toEqual(b);
    for (let s = 0; s < 200; s++) {
      const r = randomiseClothes(start, [], seededRandom(s));
      expect(sanitizeClothes(r)).toEqual(r);
      expect(r.length).toBeLessThanOrEqual(MAX_CLOTHES);
    }
  });
  it('a locked kind keeps exactly what it had', () => {
    for (let s = 0; s < 50; s++) {
      const r = randomiseClothes(start, ['top'], seededRandom(s));
      expect(r.filter((c) => c.kind === 'top')).toEqual(start.filter((c) => c.kind === 'top'));
      const all = randomiseClothes(start, ['top', 'bottom', 'gloves', 'feet'], seededRandom(s));
      expect(all).toEqual(start);
    }
  });
  it('rolls every kind over enough seeds, and changes something', () => {
    const seen = new Set<string>();
    let changed = 0;
    for (let s = 0; s < 200; s++) { const r = randomiseClothes(start, [], seededRandom(s)); r.forEach((c) => seen.add(c.kind)); if (JSON.stringify(r) !== JSON.stringify(start)) changed++; }
    expect([...seen].sort()).toEqual([...CLOTH_KINDS].sort());
    expect(changed).toBeGreaterThan(190);
  });
  it('every option list is non-empty and every tone has a name', () => {
    for (const l of [CLOTH_SLEEVES, CLOTH_HEMS, CLOTH_LEGS, CLOTH_SHAFTS, CLOTH_RISES, CLOTH_NECKS, CLOTH_TONES]) expect(l.length).toBeGreaterThan(1);
  });
});
