// The Paint tab's operations (IMPROVE (2026-10-06), CREATOR-PLAN phase 3): the budget, the stack order, the sanitiser on
// every edit, and suit mode's base fill.
import { describe, expect, it } from 'vitest';
import { MAX_PAINT_LAYERS, PAINT_PATTERNS, PAINT_REGIONS, PAINT_STAMPS, type PaintLayer } from './doc';
import {
  PAINT_BUDGET, PATTERN_LABELS, REGION_GROUPS, REGION_LABELS, STAMP_LABELS, STAMP_ORDER, duplicateLayer, layerName, moveLayer, newLayer,
  nextLayerId, removeLayer, suitBase, toggleHidden, updateLayer,
} from './paint';
import { sanitizeCreatorDoc } from './sanitize';

const fill = (id: string, o: Partial<PaintLayer> = {}): PaintLayer => ({ id, type: 'fill', region: 'torsoFront', surface: 'both', at: { x: 0.5, y: 0.5, rot: 0, scale: 1, stretch: 1 }, colours: ['#FF0000'], opacity: 1, mirror: false, ...o });

describe('paint layer operations', () => {
  it('new layers go on top, each type starting somewhere that reads, and stop at the 24-layer budget', () => {
    expect(PAINT_BUDGET).toBe(MAX_PAINT_LAYERS);
    const t = newLayer([], 'text', ['#FFFFFF'])!;
    expect(t).toMatchObject({ type: 'text', text: 'TEAM', region: 'torsoBack' });
    expect(newLayer([], 'stamp', ['#FFFFFF'])).toMatchObject({ stamp: 'star', region: 'torsoFront' });
    expect(newLayer([], 'pattern', ['#FFFFFF'])).toMatchObject({ pattern: 'stripes' });
    const full = Array.from({ length: MAX_PAINT_LAYERS }, (_, i) => fill(`l${i + 1}`));
    expect(newLayer(full, 'fill', ['#000000'])).toBeNull();
    expect(duplicateLayer(full, 'l3')).toBeNull();
    expect(nextLayerId([fill('l1'), fill('l3')])).toBe('l2');
  });
  it('every edit goes through the sanitiser: clamped numbers, allow-listed ids, jersey-rule text; a refused edit changes nothing', () => {
    const ls = [fill('l1'), { ...fill('l2'), type: 'text' as const, text: 'GO' }];
    const a = updateLayer(ls, 'l1', { opacity: 7, at: { x: -3, y: 0.5, rot: 999, scale: 99, stretch: 1 } });
    expect(a[0].opacity).toBe(1);
    expect(a[0].at).toEqual({ x: 0, y: 0.5, rot: 180, scale: 4, stretch: 1 });
    expect(updateLayer(ls, 'l1', { region: 'tail' as never })[0]).toEqual(ls[0]);
    expect(updateLayer(ls, 'l2', { text: 'go <b>team</b>' })[1].text).toBe('GO BTEAMB');
    expect(updateLayer(ls, 'l2', { text: '<<<' })[1]).toEqual(ls[1]);
    // switching type brings the id that type needs, and drops the old one
    const st = updateLayer(ls, 'l1', { type: 'stamp' })[0];
    expect(st.stamp).toBe('star');
    expect(updateLayer([st], 'l1', { type: 'fill' })[0].stamp).toBeUndefined();
  });
  it('reorder, hide, duplicate and delete keep the stack consistent', () => {
    const ls = [fill('l1'), fill('l2', { colours: ['#00FF00'] }), fill('l3')];
    expect(moveLayer(ls, 'l1', 1).map((l) => l.id)).toEqual(['l2', 'l1', 'l3']);
    expect(moveLayer(ls, 'l3', 1).map((l) => l.id)).toEqual(['l1', 'l2', 'l3']);   // already on top
    expect(moveLayer(ls, 'l1', -1).map((l) => l.id)).toEqual(['l1', 'l2', 'l3']);
    const h = toggleHidden(ls, 'l2');
    expect(h[1].hidden).toBe(true);
    expect(toggleHidden(h, 'l2')[1]).toEqual(ls[1]);
    const d = duplicateLayer(ls, 'l2')!;
    expect(d.map((l) => l.id)).toEqual(['l1', 'l2', 'l4', 'l3']);
    expect(d[2].colours).toEqual(['#00FF00']);
    expect(removeLayer(ls, 'l2').map((l) => l.id)).toEqual(['l1', 'l3']);
  });
  it('suit mode on bare skin brings a body fill at the bottom of the stack; over an existing base it adds nothing', () => {
    const s = suitBase([fill('l1')], '#C8102E');
    expect(s.map((l) => [l.region, l.colours[0]])).toEqual([['body', '#C8102E'], ['torsoFront', '#FF0000']]);
    expect(suitBase(s, '#000000')).toEqual(s);
  });
  it('every id has a readable name, and every region is in the picker exactly once', () => {
    for (const r of PAINT_REGIONS) expect(REGION_LABELS[r], r).toBeTruthy();
    for (const p of PAINT_PATTERNS) expect(PATTERN_LABELS[p], p).toBeTruthy();
    for (const s of PAINT_STAMPS) expect(STAMP_LABELS[s], s).toBeTruthy();
    expect([...STAMP_ORDER].sort()).toEqual([...PAINT_STAMPS].sort());
    expect(REGION_GROUPS.flatMap((g) => g.regions).sort()).toEqual([...PAINT_REGIONS].sort());
    expect(layerName({ ...fill('l1'), type: 'text', text: 'GO', region: 'torsoBack' })).toBe('“GO” · Back');
  });
});

describe("the sanitiser on phase 3's fields", () => {
  const raw = (o: Record<string, unknown>) => sanitizeCreatorDoc({ v: 1, paint: [{ ...fill('l1'), ...o }] })!.paint[0];
  it('blend, hidden and weight are optional, stored only when not the default, and clamped', () => {
    expect(Object.keys(raw({}))).not.toContain('blend');
    expect(raw({ blend: 'multiply' }).blend).toBe('multiply');
    expect(raw({ blend: 'screen' }).blend).toBeUndefined();
    expect(raw({ hidden: true }).hidden).toBe(true);
    expect(raw({ hidden: 'yes' }).hidden).toBeUndefined();
    expect(raw({ weight: 0.5 }).weight).toBeUndefined();
    expect(raw({ weight: 9 }).weight).toBe(0.95);
    expect(raw({ weight: -1 }).weight).toBe(0.05);
    expect(raw({ weight: Number.NaN }).weight).toBeUndefined();
  });
  it('a phase 1–2 layer sanitises to exactly what it was', () => {
    expect(raw({})).toEqual(fill('l1'));
  });
  it('the new regions, patterns and stamps are allowed; unknown ones still drop the layer', () => {
    expect(raw({ region: 'shinLeft' }).region).toBe('shinLeft');
    expect(raw({ type: 'pattern', pattern: 'hexes' }).pattern).toBe('hexes');
    expect(raw({ type: 'stamp', stamp: 'slash' }).stamp).toBe('slash');
    expect(sanitizeCreatorDoc({ v: 1, paint: [{ ...fill('l1'), region: 'cape' }] })!.paint).toEqual([]);
  });
});
