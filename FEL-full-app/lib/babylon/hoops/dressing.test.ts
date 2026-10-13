// vis-hoops-dunk — the set pieces on a NullEngine: the 3D boards, the lit racks, the judges' table. Each mounts what it says,
// repaints only when what it says changes, and leaves nothing behind.
import { beforeAll, describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { installOffscreenShim } from '../../../tests/helpers/canvasShim';
import { mountBoard3D } from './Board3D';
import { LED_HEX, MONEY_HEX, STAND, apronSize, mountRackDressing, stripHex } from './RackDressing';
import { FLIP_OVERSHOOT, FLIP_SEC, cardRead, flipScale, mountJudgesTable } from './JudgesTable';
import { boardSpot, mountShootoutDressing } from './shootoutDressing';
import { mountDuelDressing, towerSpot } from './duelDressing';
import { DUNK_COURT } from './courtLayout';
import { setCinematic } from './cinematic';

beforeAll(() => installOffscreenShim());
const rig = () => { const scene = new Scene(new NullEngine()); new FreeCamera('cam', new Vector3(0, 3, -8), scene); return scene; };
// (Babylon's own lazies — the default material, the PBR BRDF lookup — are not ours to take down)
const ours = (n: string): boolean => !/^(default material|data:EnvironmentBRDF)/.test(n);
const baseline = (s: Scene) => ({ meshes: s.meshes.length, mats: s.materials.filter((m) => ours(m.name)).length, tex: s.textures.filter((t) => ours(t.name)).length });

describe('Board3D', () => {
  it('a panel named *_led (the glow layer\'s match), never pickable, posts to the floor; repaints only on a new signature', () => {
    const s = rig(); const before = baseline(s);
    let painted = 0;
    const b = mountBoard3D<number>(s, { name: 'tb', at: new Vector3(0, 4, 0), yaw: Math.PI, width: 4, height: 2, px: [256, 128], posts: true }, () => { painted++; });
    expect(b.panel.name).toBe('tb_led');
    expect(b.meshes.every((m) => !m.isPickable)).toBe(true);
    expect(s.meshes.filter((m) => m.name === 'tb_post').length).toBe(2);
    b.set('a', 1); b.set('a', 1); b.set('b', 2);
    expect(painted).toBe(2); expect(b.paints).toBe(2);
    b.dispose();
    expect(baseline(s)).toEqual(before);
  });
  it('the panel stands in front of its frame, on the side it faces', () => {
    const s = rig();
    const b = mountBoard3D<number>(s, { name: 'tf', at: new Vector3(2, 4, -3), yaw: Math.PI, width: 4, height: 2, px: [64, 32] }, () => {});
    expect(b.panel.position.z).toBeGreaterThan(-3);   // yaw π: the front looks to +z, so the face is at +z of the frame
    b.dispose();
  });
});

describe('RackDressing', () => {
  const stands = [0, 1, 2, 3, 4].map((i) => new Vector3(-6 + i * 3, STAND.y, 5 + Math.sin(i)));
  it('legs and aprons are one draw each, a strip and a pool a rack; the strips are *_led', () => {
    const s = rig(); const h = mountRackDressing(s, stands);
    const names = s.meshes.map((m) => m.name);
    expect(names.filter((n) => n === 'tp_rack_legs').length).toBe(1);
    expect(names.filter((n) => n === 'tp_aprons').length).toBe(1);
    for (let i = 0; i < 5; i++) { expect(names).toContain(`tp_rack${i}_led`); expect(names).toContain(`tp_rack${i}_pool`); }
    expect(h.meshes.every((m) => !m.isPickable)).toBe(true);
    h.dispose();
  });
  it('the money rack\'s strip goes gold and the rack in play burns brighter than the rest', () => {
    const s = rig(); const h = mountRackDressing(s, stands, 3);
    const mat = (i: number) => s.getMaterialByName(`tp_rack${i}_led_m`) as unknown as { emissiveColor: { r: number; g: number; b: number } };
    const hexOf = (c: { r: number; g: number; b: number }) => c.r > c.b ? 'gold' : 'cyan';
    expect(hexOf(mat(3).emissiveColor)).toBe('gold'); expect(hexOf(mat(0).emissiveColor)).toBe('cyan');
    h.setActive(1);
    expect(mat(1).emissiveColor.b).toBeGreaterThan(mat(0).emissiveColor.b * 2);
    h.setMoneyRack(0); expect(hexOf(mat(0).emissiveColor)).toBe('gold'); expect(hexOf(mat(3).emissiveColor)).toBe('cyan');
    h.dispose();
  });
  it('the pure parts: the strip hex follows the money rack; the apron is bigger than the plank', () => {
    expect(stripHex(2, 2)).toBe(MONEY_HEX); expect(stripHex(1, 2)).toBe(LED_HEX); expect(stripHex(0, -1)).toBe(LED_HEX);
    expect(apronSize().w).toBeGreaterThan(STAND.w); expect(apronSize().d).toBeGreaterThan(STAND.d);
  });
  it('dispose takes everything', () => {
    const s = rig(); const before = baseline(s);
    const h = mountRackDressing(s, stands, 1); h.setActive(2); h.dispose();
    expect(baseline(s)).toEqual(before);
  });
});

describe('the judges\' table', () => {
  it('the flip is edge-on at the start, overshoots a hair, and settles at 1', () => {
    expect(flipScale(0)).toBeLessThan(0.01);
    expect(flipScale(-1)).toBeLessThan(0.01);
    expect(flipScale(FLIP_SEC)).toBeCloseTo(1 + FLIP_OVERSHOOT, 5);
    expect(flipScale(FLIP_SEC + 5)).toBe(1);
    let prev = 0; for (let t = 0; t <= FLIP_SEC; t += 0.01) { const v = flipScale(t); expect(v).toBeGreaterThanOrEqual(prev - 1e-9); prev = v; }
  });
  it('a card\'s read: 6 is the bottom of the range, 10 the top', () => {
    expect(cardRead(10)).toBe(1); expect(cardRead(6)).toBeCloseTo(0.2, 6); expect(cardRead(2)).toBe(0); expect(cardRead(NaN)).toBe(0);
  });
  it('five cards start down; a flip stands one up on the mode\'s clock; clear puts them down', () => {
    const s = rig(); const t = mountJudgesTable(s, DUNK_COURT.judgesAt, DUNK_COURT.judgesFace, 5);
    const card = (i: number) => s.getMeshByName(`jt_card_${i}`)!;
    expect(s.meshes.filter((m) => m.name.startsWith('jt_card_')).length).toBe(5);
    expect(t.up).toBe(0); expect(card(0).scaling.y).toBeLessThan(0.01);
    t.flip(0, 'Silk', 9); t.flip(4, 'Prime', 10);
    expect(t.up).toBe(2);
    for (let i = 0; i < 6; i++) s.render();   // no tick of the mode's clock: nothing moves
    expect(card(0).scaling.y).toBeLessThan(0.01);
    t.update(1);
    expect(card(0).scaling.y).toBe(1); expect(card(4).scaling.y).toBe(1); expect(card(2).scaling.y).toBeLessThan(0.01);
    t.clear(); t.update(1);
    expect(t.up).toBe(0); expect(card(0).scaling.y).toBeLessThan(0.01);
    t.dispose();
  });
  it('a flip of a card that is not on the table is ignored, and dispose leaves nothing', () => {
    const s = rig(); const before = baseline(s);
    const t = mountJudgesTable(s, { x: 0, z: 0 }, { x: 0, z: 5 }, 3);
    t.flip(7, 'Nobody', 9); expect(t.up).toBe(0);
    t.dispose();
    expect(baseline(s)).toEqual(before);
  });
});

describe('the sets', () => {
  it('the contest\'s set: racks and a board that reads the state, and says a new thing only when it changes', () => {
    const s = rig(); const before = baseline(s);
    const stands = [0, 1, 2, 3, 4].map((i) => new Vector3(-6 + i * 3, STAND.y, 5));
    const init = { score: 0, rack: 0, racks: 5, clock: 60, streak: 0, fireAt: 3, moneyRack: false, moneyRackIdx: -1 };
    const d = mountShootoutDressing(s, stands, new Vector3(0, 3.05, -0.6), init);
    expect(d.board.paints).toBe(1);   // painted at mount: the board reads true through READY
    d.update(init); expect(d.board.paints).toBe(1);
    d.update({ ...init, score: 3 }); expect(d.board.paints).toBe(2);
    d.update({ ...init, score: 3, clock: 58.2 }); expect(d.board.paints).toBe(3);
    d.update({ ...init, score: 3, clock: 58.9 }); expect(d.board.paints).toBe(3);   // the same whole second (59)
    d.update({ ...init, score: 3, clock: 58, streak: 3 }); expect(d.board.paints).toBe(4);
    d.dispose();
    expect(baseline(s)).toEqual(before);
  });
  it('the board hangs beyond the hoop and turned to the arc; the tower beside the hoop turned to the runway', () => {
    const b = boardSpot({ x: 0, z: -0.6 }, { x: 0, z: 6.4 });
    expect(b.z).toBeLessThan(-0.6); expect(b.y).toBeGreaterThan(6); expect(Math.abs(b.x)).toBeLessThan(0.5);   // high behind the hoop, centred: above the backboard from every rack, never across it
    expect(Math.abs(Math.cos(b.yaw))).toBeGreaterThan(0.9);   // and square to the arc
    const t = towerSpot();
    expect(t.z).toBeLessThan(DUNK_COURT.startZ);
  });
  it('the duel\'s set: the tower writes both totals and repaints on a change; the judges table is mounted with it', () => {
    const s = rig(); const before = baseline(s);
    const init = { p1: 0, p2: 0, up: 0 as const, dunk: 'DUNK 1/2', names: ['P1', 'P2'] as [string, string], colors: ['#22d3ee', '#ff2d78'] as [string, string] };
    const d = mountDuelDressing(s, init, 5);
    expect(d.board.paints).toBe(1);
    d.update(init); expect(d.board.paints).toBe(1);
    d.update({ ...init, p1: 44, up: 1 }); expect(d.board.paints).toBe(2);
    expect(s.meshes.filter((m) => m.name.startsWith('jt_card_')).length).toBe(5);
    d.dispose();
    expect(baseline(s)).toEqual(before);
  });
});

describe('cinematic bars', () => {
  it('asks the foundation\'s letterbox through the scene metadata, clamped; a disposed scene is left alone', () => {
    const s = rig();
    setCinematic(s, 1); expect((s.metadata as { felCinematic: number }).felCinematic).toBe(1);
    setCinematic(s, 7); expect((s.metadata as { felCinematic: number }).felCinematic).toBe(1);
    setCinematic(s, NaN); expect((s.metadata as { felCinematic: number }).felCinematic).toBe(0);
    s.dispose();
    expect(() => setCinematic(s, 1)).not.toThrow();
  });
});
