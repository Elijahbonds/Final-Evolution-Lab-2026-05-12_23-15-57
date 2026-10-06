// Player-drawn stamps (IMPROVE (2026-10-06), CREATOR-PLAN phase 4c): the compact encoding, the sanitiser (size cap,
// detail cap, canonical form), the pad's brush, the doc and share-code plumbing, and the privacy line.
import { describe, expect, it } from 'vitest';
import {
  MARK_CELLS, MARK_SIZE, MAX_MARKS, MAX_MARK_CHARS, MAX_MARK_RUNS, brushMark, decodeMark, discMark, emptyMark, encodeMark,
  markComplexity, markRuns, nextMarkId, sanitizeMark, strokeMark,
} from './marks';
import { MAX_DOC_CHARS, emptyCreatorDoc, type CreatorDoc } from './doc';
import { sanitizeCreatorDoc, sanitizePaintLayer } from './sanitize';
import { decodeShareCode, decodeSlotCode, encodeShareCode, encodeSlotCode } from './shareCode';
import { addMarkLayer, redrawMark, usedMarks, updateLayer } from './paint';
import { payloadHasImage } from '../lookPrivacy';

let seed = 11;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
/** A drawing: a few random brush strokes, the way a player draws. */
function drawing(strokes = 6): Uint8Array {
  const c = emptyMark();
  for (let i = 0; i < strokes; i++) strokeMark(c, rnd() * MARK_SIZE, rnd() * MARK_SIZE, rnd() * MARK_SIZE, rnd() * MARK_SIZE, 2 + rnd() * 8, rnd() < 0.85, rnd() < 0.3);
  return c;
}
/** The most bytes a mark may take: MAX_MARK_RUNS runs, as many of them ≥ 128 cells (2 varint bytes) as fit. */
function heaviestMark(): Uint8Array {
  const c = emptyMark();
  const long = Math.floor((MARK_CELLS - MAX_MARK_RUNS) / 127);
  let at = 0, ink = 0;
  for (let i = 0; i < MAX_MARK_RUNS; i++) {
    const r = i === MAX_MARK_RUNS - 1 ? MARK_CELLS - at : i < long ? 128 : 1;
    if (ink) c.fill(1, at, at + r);
    at += r; ink ^= 1;
  }
  return c;
}
/** A raw mark text from hand-made varint bytes (for refusal tests). */
const raw = (bytes: number[]) => `r${Buffer.from(bytes).toString('base64url')}`;

describe('the compact encoding', () => {
  it('round-trips 200 drawings exactly, and is a fixed point', () => {
    for (let n = 0; n < 200; n++) {
      const c = drawing(1 + (n % 10));
      const text = encodeMark(c);
      if (!text) continue;   // a drawing erased to nothing
      expect(decodeMark(text)).toEqual(c);
      expect(encodeMark(decodeMark(text)!)).toBe(text);
      expect(sanitizeMark({ id: 'm1', data: text })).toEqual({ id: 'm1', data: text });
    }
  });
  it('is compact: a typical drawing is well under the cap; the heaviest allowed mark is still under it', () => {
    const sizes = Array.from({ length: 50 }, () => encodeMark(drawing(8))?.length ?? 0);
    expect(Math.max(...sizes)).toBeLessThan(1_200);
    const heavy = heaviestMark();
    expect(markComplexity(heavy)).toBe(MAX_MARK_RUNS);
    const text = encodeMark(heavy)!;
    expect(text).not.toBeNull();
    expect(text.length).toBeLessThanOrEqual(MAX_MARK_CHARS);
    expect(decodeMark(text)).toEqual(heavy);
  });
  it('an empty pad is no mark; all ink is one', () => {
    expect(encodeMark(emptyMark())).toBeNull();
    expect(decodeMark(encodeMark(new Uint8Array(MARK_CELLS).fill(1))!)).toEqual(new Uint8Array(MARK_CELLS).fill(1));
  });
  it('runs alternate empty / ink from the top-left, the first may be empty', () => {
    const c = emptyMark(); c[0] = 1; c[5] = 1;
    expect(markRuns(c).slice(0, 4)).toEqual([0, 1, 4, 1]);
  });
});

describe('what is refused', () => {
  it('too detailed: a checkerboard or a dithered "photo" (noise) is not a mark — the privacy line and the size cap', () => {
    const checker = emptyMark(); for (let i = 0; i < MARK_CELLS; i++) checker[i] = ((i % MARK_SIZE) + Math.floor(i / MARK_SIZE)) & 1;
    expect(encodeMark(checker)).toBeNull();
    const noise = emptyMark(); for (let i = 0; i < MARK_CELLS; i++) noise[i] = rnd() < 0.5 ? 1 : 0;
    expect(encodeMark(noise)).toBeNull();
    // one run past the cap
    const past = heaviestMark(); const runs = markRuns(past);
    expect(runs.length).toBe(MAX_MARK_RUNS);
    const over = past.slice(); over[MARK_CELLS - 2] = over[MARK_CELLS - 2] ? 0 : 1;   // split the last run in three
    expect(encodeMark(over)).toBeNull();
  });
  it('decode refuses every malformed text', () => {
    const ok = encodeMark(discMark())!;
    for (const bad of [
      '', 'r', 'x' + ok.slice(1), ok + 'A', ok.slice(0, -3), ok.replace(/./g, (ch, i) => (i === 5 ? '+' : ch)), 'r' + 'A'.repeat(MAX_MARK_CHARS),
      raw([0, 100, 100]),                            // runs that stop short of 128²
      raw([0, 0, 1]),                                // an empty run after the first
      raw([0x80, 0x80, 0x80, 0x01]),                 // a varint longer than any run needs
      raw([0x80, 0x80, 0x01, 0x01]),                 // a run past 128² (16 384 + 1)
      7, null, { data: ok },
    ]) expect(decodeMark(bad), String(bad).slice(0, 30)).toBeNull();
  });
  it('sanitizeMark re-encodes a non-canonical (over-long varint) mark into the canonical text, and checks the id', () => {
    // 16 384 as one empty run is "empty": use ink first — run lengths 0, 16 384 written with a padded varint for the 0
    const canonical = encodeMark(new Uint8Array(MARK_CELLS).fill(1))!;
    const padded = raw([0x80, 0x00, 0x80, 0x80, 0x01]);
    expect(decodeMark(padded)).toEqual(new Uint8Array(MARK_CELLS).fill(1));
    expect(sanitizeMark({ id: 'm1', data: padded })).toEqual({ id: 'm1', data: canonical });
    expect(sanitizeMark({ id: 'M1', data: canonical })).toBeNull();
    expect(sanitizeMark({ id: 'm1', data: encodeMark(emptyMark()) })).toBeNull();
  });
});

describe('the pad\'s brush', () => {
  it('a dab inks a disc of the radius; erase clears it; mirror does both sides', () => {
    const c = brushMark(emptyMark(), 30, 40, 5, true);
    const inked = c.reduce((a, b) => a + b, 0);
    expect(inked).toBeGreaterThan(Math.PI * 25 * 0.8); expect(inked).toBeLessThan(Math.PI * 25 * 1.2);
    expect(c[40 * MARK_SIZE + 30]).toBe(1);
    brushMark(c, 30, 40, 6, false);
    expect(c.every((v) => v === 0)).toBe(true);
    const m = brushMark(emptyMark(), 30, 40, 5, true, true);
    for (let y = 0; y < MARK_SIZE; y++) for (let x = 0; x < MARK_SIZE; x++) expect(m[y * MARK_SIZE + x]).toBe(m[y * MARK_SIZE + (MARK_SIZE - 1 - x)]);
  });
  it('a stroke leaves no gaps along its line', () => {
    const c = strokeMark(emptyMark(), 10, 64, 118, 64, 2, true);
    for (let x = 10; x <= 118; x++) expect(c[64 * MARK_SIZE + x], `x ${x}`).toBe(1);
  });
});

describe('in the doc', () => {
  const layer = (o: object) => ({ id: 'l1', type: 'mark', region: 'torsoFront', surface: 'both', at: {}, colours: ['#FFFFFF'], opacity: 1, mark: 'm1', ...o });
  const mark = (id = 'm1') => ({ id, data: encodeMark(discMark())! });
  it('a mark layer needs its mark; a mark no layer uses is not kept; at most MAX_MARKS', () => {
    expect(sanitizePaintLayer(layer({ mark: undefined }))).toBeNull();
    expect(sanitizeCreatorDoc({ v: 1, paint: [layer({})] })!.paint).toEqual([]);
    expect(sanitizeCreatorDoc({ v: 1, paint: [], marks: [mark()] })!.marks).toBeUndefined();
    const d = sanitizeCreatorDoc({ v: 1, paint: [layer({}), layer({ id: 'l2', mark: 'm2' }), layer({ id: 'l3', mark: 'm3' })], marks: [mark('m1'), mark('m2'), mark('m3')] })!;
    expect(MAX_MARKS).toBe(2);
    expect(d.marks!.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(d.paint.map((l) => l.id)).toEqual(['l1', 'l2']);
    expect(sanitizeCreatorDoc(d)).toEqual(d);
    // a phase 1–4b doc has no marks key at all
    expect('marks' in sanitizeCreatorDoc(emptyCreatorDoc())!).toBe(false);
  });
  it('rides in a share code (v1 and the deflated v2 slot code), and never trips the save routes\' image refusal', async () => {
    const d = sanitizeCreatorDoc({ v: 1, paint: [layer({ blend: 'glow', mirror: true })], marks: [{ id: 'm1', data: encodeMark(drawing(9))! }] })!;
    expect(decodeShareCode(encodeShareCode(d))).toMatchObject({ ok: true, doc: d });
    const v2 = await decodeSlotCode(await encodeSlotCode({ body: 'male', base: {}, doc: d }));
    expect(v2).toMatchObject({ ok: true, doc: d });
    expect(payloadHasImage({ face: { creator: d } })).toBe(false);
  });
  it('the editor\'s operations: add (one step: layer and mark), redraw, refuse an empty redraw, and drop unused marks', () => {
    const made = addMarkLayer([], undefined, discMark(), ['#FF0000', '#111111'])!;
    expect(made.paint).toHaveLength(1);
    expect(made.paint[0]).toMatchObject({ type: 'mark', mark: made.marks[0].id });
    expect(nextMarkId(made.marks)).toBe('m2');
    const redrawn = redrawMark(made.marks, made.marks[0].id, drawing(4))!;
    expect(redrawn[0].data).not.toBe(made.marks[0].data);
    expect(redrawMark(made.marks, made.marks[0].id, emptyMark())).toBeNull();
    expect(usedMarks([], made.marks)).toEqual([]);
    // a mark layer cannot be turned into another drawing by a type switch, nor something else into a mark
    expect(updateLayer(made.paint, made.paint[0].id, { type: 'stamp' })[0]).toMatchObject({ type: 'stamp', stamp: 'star' });
    expect('mark' in updateLayer(made.paint, made.paint[0].id, { type: 'stamp' })[0]).toBe(false);
    const fill = sanitizePaintLayer({ id: 'f', type: 'fill', region: 'all', colours: ['#000000'], at: {} })!;
    expect(updateLayer([fill], 'f', { type: 'mark' })[0]).toEqual(fill);
    // the budget: two marks, then no more
    const two = addMarkLayer(made.paint, made.marks, discMark(), ['#00FF00'])!;
    expect(addMarkLayer(two.paint, two.marks, discMark(), ['#00FF00'])).toBeNull();
  });
});

describe('the size caps still agree', () => {
  it('a doc at every 4c budget, every field at its longest, two heaviest marks, fits MAX_DOC_CHARS; its v1 code fits the code cap', () => {
    const heavy = encodeMark(heaviestMark())!;
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
    const d = sanitizeCreatorDoc({
      v: 1, parts, paint, marks: [{ id: 'm1', data: heavy }, { id: 'm2', data: heavy }],
      colours: { jersey: '#ABCDEF', shorts: '#ABCDEF', shoes: '#ABCDEF', accent: '#ABCDEF' },
      shape: { face, body: { legs: 1.023, torso: 1.023, shoulders: 1.023, neck: 1.023, head: 1.023, hands: 1.023, feet: 1.023 }, girth: { head: 1.123, neck: 1.123, chest: 1.123, belly: 1.123, upperArms: 1.123, forearms: 1.123, thighs: 1.123, calves: 1.123 } },
      flags: { suit: true, hide: { eyes: true, ears: true, head: true, hair: true } }, eyes: { sclera: '#ABCDEF', size: 1.23, pupil: 'slit', pupilSize: 0.12, glow: 0.12 },
    }, Infinity) as CreatorDoc;
    expect(d.parts).toHaveLength(64);
    expect(d.marks).toHaveLength(2);
    expect(Object.keys(d.shape.face)).toHaveLength(64);
    const size = JSON.stringify(d).length;
    expect(size).toBeLessThanOrEqual(MAX_DOC_CHARS);
    expect(sanitizeCreatorDoc(d)).toEqual(d);
    expect(decodeShareCode(encodeShareCode(d))).toMatchObject({ ok: true, doc: d });
  });
});
