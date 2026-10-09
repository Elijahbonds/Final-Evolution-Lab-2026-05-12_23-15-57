// The ARCHETYPE BENCHMARK, unit half (IMPROVE (2026-10-06), CREATOR-PLAN phase 4a): ten generic recipes built with the
// Creator's tools (test-only fixtures) survive the sanitiser unchanged, fit the size caps and budgets, and travel as share
// codes; and no shipped file imports them. The render half is lib/babylon/creator/archetypes.render.test.ts.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ARCHETYPES, MASCOT_VERDICT } from './__fixtures__/archetypes';
import { sanitizeCreatorSlot, sanitizeCreatorSlots } from './sanitize';
import { decodeSlotCode, encodeShareCode, encodeSlotCode } from './shareCode';
import { MAX_DOC_CHARS, MAX_PAINT_LAYERS, MAX_PARTS, MAX_SLOT_CHARS, MAX_SLOTS, MAX_FACE_CHARS } from './doc';
import { partsCost, renderList } from './parts';
import { holdCreator } from './storage';

describe('the ten archetypes', () => {
  it('there are ten, with generic names and unique ids', () => {
    expect(ARCHETYPES).toHaveLength(10);
    expect(new Set(ARCHETYPES.map((a) => a.slot.id)).size).toBe(10);
  });
  for (const a of ARCHETYPES) {
    describe(a.name, () => {
      it('sanitises to itself (nothing silently dropped)', () => {
        expect(sanitizeCreatorSlot(a.slot)).toEqual(a.slot);
      });
      it('fits the caps and budgets', () => {
        expect(JSON.stringify(a.slot.doc).length).toBeLessThanOrEqual(MAX_DOC_CHARS);
        expect(JSON.stringify(a.slot).length).toBeLessThanOrEqual(MAX_SLOT_CHARS);
        expect(partsCost(a.slot.doc.parts)).toBeLessThanOrEqual(MAX_PARTS);
        expect(renderList(a.slot.doc.parts)).toHaveLength(partsCost(a.slot.doc.parts));
        expect(a.slot.doc.paint.length).toBeLessThanOrEqual(MAX_PAINT_LAYERS);
      });
      it('round-trips as a share code (v2 slot code, and v1 for the doc)', async () => {
        const code = await encodeSlotCode(a.slot);
        const r = await decodeSlotCode(code);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.doc).toEqual(a.slot.doc);
        expect(r.base).toEqual(a.slot.base);
        expect(r.slot?.body).toBe(a.slot.body === 'female' ? 'female' : 'male');
        expect(r.slot?.frame).toEqual(a.slot.frame);
        expect(r.slot?.presentation).toEqual(a.slot.presentation);
        expect(code.length).toBeLessThan(encodeShareCode(a.slot.doc, a.slot.base).length);
      });
    });
  }
  it('measured: code lengths and JSON sizes (logged for the report)', async () => {
    const rows: string[] = [];
    for (const a of ARCHETYPES) {
      rows.push(`${a.name.padEnd(46)} ${String(partsCost(a.slot.doc.parts)).padStart(2)} parts, ${String(a.slot.doc.paint.length).padStart(2)} layers, slot ${JSON.stringify(a.slot).length} chars, v1 code ${encodeShareCode(a.slot.doc, a.slot.base).length}, v2 code ${(await encodeSlotCode(a.slot)).length}`);
    }
    console.info(`[archetypes]\n${rows.join('\n')}`);
  });
  it('any five of them fit one face under the whole-face cap, nothing dropped', () => {
    const five = ARCHETYPES.slice(0, MAX_SLOTS).map((a) => a.slot);
    const r = holdCreator({ creatorSlots: five, activeSlot: five[0].id }, null, { uploadFace: true, uploadNumbers: true });
    expect(r.creatorSlots).toHaveLength(5);
    expect(JSON.stringify(r).length).toBeLessThan(MAX_FACE_CHARS);
    expect(sanitizeCreatorSlots(five)).toEqual(five);
  });
  it('phase 4b unlocked what it promised: no recipe still waits for a shape v2 tool, and they use it', () => {
    for (const a of ARCHETYPES) expect(a.later.join(' '), a.name).not.toMatch(/4b|shape v2|presentation|girth|thin limbs|big head/);
    const uses = (f: (a: (typeof ARCHETYPES)[number]) => unknown) => ARCHETYPES.filter((a) => f(a)).length;
    expect(uses((a) => a.slot.doc.shape.body.head)).toBeGreaterThanOrEqual(2);          // head scale
    expect(uses((a) => a.slot.doc.shape.girth?.thighs)).toBeGreaterThanOrEqual(3);      // limb girth
    expect(uses((a) => a.slot.doc.shape.girth?.chest || a.slot.doc.shape.girth?.belly)).toBeGreaterThanOrEqual(3);   // bulk
    expect(uses((a) => a.slot.presentation)).toBeGreaterThanOrEqual(4);                 // the Studio size: giants and the mascot
  });
  it('phase 4c unlocked what it promised: no recipe still waits for a 4c tool, and they use them', () => {
    for (const a of ARCHETYPES) expect(a.later.join(' '), a.name).not.toMatch(/4c|two-tone|skinned|custom stamp|bolt part|long hair/);
    const parts = ARCHETYPES.flatMap((a) => a.slot.doc.parts);
    const layers = ARCHETYPES.flatMap((a) => a.slot.doc.paint);
    expect(parts.filter((p) => p.colour2).length, 'two-tone').toBeGreaterThanOrEqual(2);
    expect(ARCHETYPES.filter((a) => a.slot.doc.parts.some((p) => (p.swing ?? 0) > 0)).length, 'bendable').toBeGreaterThanOrEqual(4);
    expect(ARCHETYPES.filter((a) => a.slot.doc.marks?.length).length, 'a drawn stamp').toBeGreaterThanOrEqual(1);
    expect(layers.filter((l) => l.blend === 'glow').length, 'glow paint').toBeGreaterThanOrEqual(1);
    expect(parts.filter((p) => p.follow).length, 'follow the bulk').toBeGreaterThanOrEqual(2);
    for (const shape of ['bolt', 'beard', 'ear', 'strand'] as const) expect(parts.some((p) => p.shape === shape), shape).toBe(true);
  });
  it('phase 4e dressed what was waiting for clothes: no recipe waits for a garment, and they wear the tools', () => {
    for (const a of ARCHETYPES) expect(a.later.join(' '), a.name).not.toMatch(/garment|gi\b|cloth|layered|trouser|jacket/);
    const worn = ARCHETYPES.flatMap((a) => a.slot.doc.clothes ?? []);
    expect(ARCHETYPES.filter((a) => a.slot.doc.clothes?.length).length, 'dressed').toBeGreaterThanOrEqual(5);
    for (const style of ['jacket', 'pants', 'gloves', 'boots', 'skirt', 'highneck', 'tee'] as const) expect(worn.some((c) => c.style === style), style).toBe(true);
    // layers: a top under a jacket; a long coat (a tube); built clothes over a painted suit
    expect(ARCHETYPES.some((a) => (a.slot.doc.clothes ?? []).filter((c) => c.kind === 'top').length >= 2), 'two tops').toBe(true);
    expect(worn.some((c) => c.hem === 'knee' || c.hem === 'thigh'), 'a long coat').toBe(true);
    expect(ARCHETYPES.some((a) => a.slot.doc.flags.suit && a.slot.doc.clothes?.length), 'clothes over a suit').toBe(true);
    expect(worn.filter((c) => c.colour2).length, 'two-tone').toBeGreaterThanOrEqual(3);
  });
  it('the mascot\'s verdict is pinned: a costume on the human rig, not a creature', () => {
    expect(MASCOT_VERDICT).toBe('costume read, not a creature');
    expect(ARCHETYPES.find((a) => a.name.includes('mascot'))!.later).toContain('a non-human rig is out of scope');
  });
});

describe('the fixtures never ship', () => {
  it('no file under app/, components/ or lib/ outside a test imports the archetype fixtures', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name.startsWith('.')) continue;
        const p = join(dir, name);
        if (statSync(p).isDirectory()) { if (name !== '__fixtures__') walk(p); continue; }
        if (!/\.(ts|tsx|js|mjs)$/.test(name) || /\.test\.(ts|tsx)$/.test(name)) continue;
        // other lanes keep their own __fixtures__ folders; this guard is for these recipes
        if (/__fixtures__\/archetypes/.test(readFileSync(p, 'utf8'))) offenders.push(p);
      }
    };
    for (const d of ['app', 'components', 'lib']) walk(d);
    expect(offenders).toEqual([]);
  });
});
