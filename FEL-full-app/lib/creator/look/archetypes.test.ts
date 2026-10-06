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
