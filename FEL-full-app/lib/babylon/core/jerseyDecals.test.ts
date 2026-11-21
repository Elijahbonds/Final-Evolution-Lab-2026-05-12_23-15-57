// lane/kit-numbers: the player's number and name printed on the new court jerseys (jerseyDecals.ts, kit.jerseyDecals).
import { describe, expect, it } from 'vitest';
import type { AbstractMesh } from '@babylonjs/core';
import { JERSEY_DECALS, decalTopOf, drawJersey, inkFor } from './jerseyDecals';
import { FEEL_KNOB_BY_ID } from '../../feel-panel/knobs';

/** A canvas context that records what is written, and where. */
function fakeCtx() {
  const calls: { op: string; text?: string; x?: number; y?: number; font?: string }[] = [];
  const ctx = {
    font: '', fillStyle: '', strokeStyle: '', lineWidth: 0, textAlign: '', textBaseline: '', lineJoin: '',
    clearRect: () => calls.push({ op: 'clear' }), save: () => undefined, restore: () => undefined,
    translate: () => undefined, scale: () => undefined,
    measureText: (t: string) => ({ width: t.length * 30 }),
    fillText: (text: string, x: number, y: number) => calls.push({ op: 'fill', text, x, y, font: ctx.font }),
    strokeText: (text: string, x: number, y: number) => calls.push({ op: 'stroke', text, x, y }),
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

describe('the printed jersey (kit.jerseyDecals)', () => {
  it('ships on (1), and 0 on its row is a blank jersey as before', () => {
    expect(JERSEY_DECALS).toBe(1);
    const k = FEEL_KNOB_BY_ID.get('kit.jerseyDecals')!;
    expect([k.def, k.min, k.max]).toEqual([1, 0, 1]);
  });
  it('the ink reads against the tint: light on a dark jersey, dark on a light one', () => {
    expect(inkFor('#0B1220').fill).toBe('#F8FAFC');
    expect(inkFor('#2C6E55').fill).toBe('#F8FAFC');
    expect(inkFor('#F5F5F5').fill).toBe('#111827');
    expect(inkFor('#FFD700').fill).toBe('#111827');
  });
  it('prints the number on the chest (left half) and the back (right half), and the name on the back only', () => {
    const { ctx, calls } = fakeCtx();
    drawJersey(ctx, { number: 23, name: 'BONDS' }, inkFor('#2C6E55'));
    const fills = calls.filter((c) => c.op === 'fill');
    expect(fills.filter((c) => c.text === '23').map((c) => c.x)).toEqual([0, 0]);   // each drawn at its half's centre (translated to u 0.25 and 0.75, mirrored)
    expect(fills.filter((c) => c.text === 'BONDS')).toHaveLength(1);
  });
  it('the print goes only on a worn court jersey that has the decal UVs', () => {
    const m = (name: string, uv2: boolean, visible = true) => ({ name, isVisible: visible, isEnabled: () => true, isVerticesDataPresent: () => uv2 }) as unknown as AbstractMesh;
    expect(decalTopOf([m('Kit_tops_top_lab_c1', true), m('Kit_tops_top_basketball_c1', true)])?.name).toBe('Kit_tops_top_basketball_c1');
    expect(decalTopOf([m('Kit_tops_top_basketball_c1', false)])).toBeNull();
    expect(decalTopOf([m('Kit_tops_top_basketball_c1', true, false)])).toBeNull();
  });
});
