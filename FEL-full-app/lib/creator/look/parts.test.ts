// The Creator's part budget and editor operations (IMPROVE (2026-10-06), docs/CREATOR-PLAN.md phase 2). Pure.
import { describe, expect, it } from 'vitest';
import { MAX_PARTS, PART_BONES, PART_SHAPES, type CreatorPart } from './doc';
import {
  BONE_GROUPS, BONE_LABELS, PART_BUDGET, PART_START, SHAPE_LABELS, SHAPE_ORDER, duplicatePart, fitsBudget, newPart,
  nextPartId, partsCost, removePart, renderList, spikeCluster, updatePart,
} from './parts';
import { sanitizeCreatorDoc, sanitizePart } from './sanitize';

const part = (i: number, mirror = false): CreatorPart => ({
  id: `p${i}`, shape: 'spike', bone: 'LeftArm', pos: [0, 0, 0], rot: [0, 0, 0], scale: [1, 1, 1], colour: '#FF0000', finish: 'matte', mirror,
});
const many = (n: number, mirror = false) => Array.from({ length: n }, (_, i) => part(i + 1, mirror));

describe('the 64-part budget counts what is drawn (mirrored copies count)', () => {
  it('is the plan\'s 64', () => { expect(PART_BUDGET).toBe(64); expect(MAX_PARTS).toBe(64); });

  it('a mirrored part costs two', () => {
    expect(partsCost([part(1), part(2, true)])).toBe(3);
  });

  it('64 mirrored entries draw 64 copies, not 128; the last fitting mirror pair is whole', () => {
    const list = renderList(many(64, true));
    expect(list).toHaveLength(64);
    expect(list.filter((x) => x.mirrored)).toHaveLength(32);
    expect(new Set(list.map((x) => x.part.id)).size).toBe(32);
  });

  it('a mirrored part with one slot left draws its first side only', () => {
    const list = renderList([...many(63), part(99, true)]);
    expect(list).toHaveLength(64);
    expect(list[63]).toEqual({ part: expect.objectContaining({ id: 'p99' }), mirrored: false });
  });

  it('plain parts past the budget are not drawn', () => {
    expect(renderList(many(80))).toHaveLength(64);
    expect(renderList(many(10))).toHaveLength(10);
  });

  it('the editor refuses what the renderer would drop', () => {
    expect(fitsBudget(many(63), 1)).toBe(true);
    expect(fitsBudget(many(63), 2)).toBe(false);
    expect(newPart(many(64), 'spike', '#FFFFFF')).toBeNull();
    // a mirrored start with one slot left comes in unmirrored
    const p = newPart(many(63), 'horn', '#FFFFFF');
    expect(p?.mirror).toBe(false);
    expect(duplicatePart(many(64), 'p1')).toBeNull();
    // turning mirror on with no slot left is refused
    const full = many(64);
    expect(updatePart(full, 'p1', { mirror: true }).find((x) => x.id === 'p1')!.mirror).toBe(false);
    expect(updatePart(many(63), 'p1', { mirror: true }).find((x) => x.id === 'p1')!.mirror).toBe(true);
  });
});

describe('new parts, ids and edits stay inside what the sanitiser keeps', () => {
  it('every shape has a start, a label and one place in the picker', () => {
    for (const s of PART_SHAPES) {
      expect(PART_START[s], s).toBeTruthy();
      expect(SHAPE_LABELS[s], s).toBeTruthy();
      expect(SHAPE_ORDER.filter((x) => x === s), s).toHaveLength(1);
    }
    expect(SHAPE_ORDER).toHaveLength(PART_SHAPES.length);
  });

  it('every bone has a readable name and appears in exactly one group', () => {
    const grouped = BONE_GROUPS.flatMap((g) => g.bones);
    expect([...grouped].sort()).toEqual([...PART_BONES].sort());
    for (const b of PART_BONES) expect(BONE_LABELS[b]).toBeTruthy();
  });

  it('a new part of every shape survives the sanitiser unchanged', () => {
    let parts: CreatorPart[] = [];
    for (const s of PART_SHAPES) {
      const p = newPart(parts, s, '#12AB34')!;
      expect(sanitizePart(p), s).toEqual(p);
      parts = [...parts, p];
    }
    expect(new Set(parts.map((p) => p.id)).size).toBe(parts.length);
  });

  it('ids are the first free p-number and valid sanitiser ids', () => {
    expect(nextPartId([])).toBe('p1');
    expect(nextPartId([{ id: 'p1' }, { id: 'p3' }])).toBe('p2');
    expect(nextPartId(many(64))).toMatch(/^[a-z0-9]{1,8}$/);
  });

  it('duplicate inserts a nudged copy after the original with a new id; remove takes it out', () => {
    const d = duplicatePart([part(1), part(2)], 'p1')!;
    expect(d.map((p) => p.id)).toEqual(['p1', 'p3', 'p2']);
    expect(d[1].pos[2]).toBeCloseTo(0.02);
    expect(d[1].rot).not.toBe(d[0].rot);   // its own arrays, so an edit to one cannot move the other
    expect(removePart(d, 'p3').map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  it('updatePart clamps to the sanitiser ranges and ignores unknown shapes and bones', () => {
    const [p] = updatePart([part(1)], 'p1', { pos: [1, -1, 0.1234], rot: [500, -500, 12.34], scale: [0, 99, 1], shape: 'nope' as never, bone: 'Tail' as never });
    expect(p.pos).toEqual([0.6, -0.6, 0.123]);
    expect(p.rot).toEqual([180, -180, 12.3]);
    expect(p.scale).toEqual([0.05, 8, 1]);
    expect(p.shape).toBe('spike');
    expect(p.bone).toBe('LeftArm');
    expect(sanitizePart(p)).toEqual(p);
  });
});

describe('the spike cluster is a convenience that makes ordinary parts', () => {
  it('adds N spikes on the head, each a plain sanitiser-valid part', () => {
    const out = spikeCluster([], { count: 10, colour: '#222222' });
    expect(out).toHaveLength(10);
    for (const p of out) {
      expect(p.shape).toBe('spike');
      expect(p.bone).toBe('Head');
      expect(sanitizePart(p)).toEqual(p);
    }
    expect(new Set(out.map((p) => p.id)).size).toBe(10);
    // a whole doc of them round-trips the sanitiser
    expect(sanitizeCreatorDoc({ v: 1, parts: out })?.parts).toEqual(out);
  });

  it('stops at the budget', () => {
    expect(spikeCluster(many(60), { count: 10, colour: '#222222' })).toHaveLength(64);
  });
});
