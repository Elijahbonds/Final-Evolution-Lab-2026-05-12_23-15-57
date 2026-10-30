// VENUE-SMOOTH-1 (2026-10-29): forge rivals on each stand's front row, the five Meshy crowd bodies behind it.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LoadAssetContainerAsync, NullEngine, Scene } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { gateContainerRig } from '../../anim/rigNormalize';
import { ATHLETE_ROSTER, REPLACED_MESHY } from '../../core/athleteRoster';
import { bakeBody, CROWD_BODY_URLS } from './crowdBake';
import { CROWD_FRONT_AVOIDS, CROWD_FRONT_KEYS, CROWD_FRONT_URLS, fanBody, frontRowOf } from './crowdFront';
import { layoutSeats } from './crowdLayout';
import { layoutClips } from './crowdVat';

const PUB = join(__dirname, '..', '..', '..', '..', 'public');

describe('the front-row bodies', () => {
  it('are forge rivals on the roster, on disk, none a Meshy body, none cast in a hoops mode', () => {
    expect(CROWD_FRONT_KEYS.length).toBeGreaterThanOrEqual(3);
    for (const [i, k] of CROWD_FRONT_KEYS.entries()) {
      expect(ATHLETE_ROSTER.some((a) => a.key === k)).toBe(true);
      expect(CROWD_FRONT_URLS[i]).toBe(`/models/rivals/${k}.glb`);
      expect(existsSync(join(PUB, CROWD_FRONT_URLS[i]))).toBe(true);
      expect(REPLACED_MESHY.some((m) => m.includes(k))).toBe(false);
      expect(CROWD_FRONT_AVOIDS).not.toContain(k);
    }
    expect(CROWD_FRONT_AVOIDS.length).toBeGreaterThan(8);
    for (const u of CROWD_BODY_URLS) expect(CROWD_FRONT_URLS).not.toContain(u);   // the Meshy five stay the back rows
  });
});

describe('which body a seat gets', () => {
  const venue = { id: 'v', stands: [
    { id: 'a', front: [0, 0, 10] as [number, number, number], yaw: Math.PI, width: 20, rows: 4, step: [0.8, 0.45] as [number, number], posture: 'seated' as const },
    { id: 'b', front: [30, 0, 10] as [number, number, number], yaw: Math.PI, width: 20, rows: 5, step: [0.8, 0.45] as [number, number], posture: 'standing' as const, firstRow: 2 },
  ], focus: [0, 1, 0], eye: [0, 4, -10], camera: { at: [0, 4, -10], into: [0, 1], margin: 2 } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seats = layoutSeats(venue as any, 11);
  const front = frontRowOf(seats);
  it('the front row is each stand\'s lowest laid row (its firstRow when it has one)', () => {
    expect(front.get('a')).toBe(0); expect(front.get('b')).toBe(2);
  });
  it('front row: a forge body; every row behind: a Meshy body; nothing forge loaded: Meshy everywhere', () => {
    let nf = 0, nb = 0;
    for (const s of seats) {
      const f = fanBody(s, front, CROWD_FRONT_KEYS.length, CROWD_BODY_URLS.length);
      if (s.row === front.get(s.stand)) { expect(f.front).toBe(true); expect(f.index).toBeLessThan(CROWD_FRONT_KEYS.length); nf++; }
      else { expect(f.front).toBe(false); expect(f.index).toBeLessThan(5); nb++; }
      expect(fanBody(s, front, 0, 5)).toEqual({ front: false, index: s.body % 5 });
    }
    expect(nf).toBeGreaterThan(0); expect(nb).toBeGreaterThan(nf);
    // the front row is not one face: more than one forge body across it
    expect(new Set(seats.filter((s) => s.row === front.get(s.stand)).map((s) => fanBody(s, front, CROWD_FRONT_KEYS.length, 5).index)).size).toBeGreaterThan(1);
  });
});

describe('baking a forge body for the crowd (NullEngine)', () => {
  it('its skinned parts share one load transform (one VAT), and the bake is finite and full', async () => {
    const engine = new NullEngine(); const scene = new Scene(engine);
    const url = CROWD_FRONT_URLS[0];
    const data = 'data:model/gltf-binary;base64,' + readFileSync(join(PUB, url)).toString('base64');
    const c = await LoadAssetContainerAsync(data, scene, { pluginExtension: '.glb', pluginOptions: { gltf: { skipMaterials: true } } });
    gateContainerRig(c, url);
    c.addAllToScene();
    const sk = c.skeletons[0];
    const parts = c.meshes.filter((m) => !!m.skeleton && m.getTotalVertices() > 0);
    expect(parts.length).toBeGreaterThan(1);
    const w = parts.map((m) => m.computeWorldMatrix(true).clone());
    expect(w.every((m) => m.equalsWithEpsilon(w[0], 1e-6))).toBe(true);
    const { ranges, rows } = layoutClips();
    const vat = bakeBody(scene, sk, parts[0], ranges, rows);
    expect(vat.length).toBe((sk.bones.length + 1) * 16 * rows);
    expect(vat.every(Number.isFinite)).toBe(true);
    scene.dispose(); engine.dispose();
  }, 60000);
});

describe('VENUE-SMOOTH-1 wiring', () => {
  const stands = readFileSync(join(__dirname, 'crowdStands.ts'), 'utf8');
  const bake = readFileSync(join(__dirname, 'crowdBake.ts'), 'utf8');
  it('the stands pick bodies through fanBody, and a forge fan is a slot in each of its parts\' blocks', () => {
    expect(stands).toMatch(/const fb = fanBody\(s, frontRow, b\.front\.length, b\.bodies\.length\);/);
    expect(stands).toMatch(/for \(const fb of fbs\) \{ fb\.block\.settings\.set/);
    expect(stands).toMatch(/mesh\.material = body\.material \?\? b\.material;/);
  });
  it('a failed front-row bake leaves the Meshy crowd (front = []), and the bake disposes and clocks it', () => {
    expect(bake).toMatch(/bakeFront\(scene, ranges, rows\)\.catch\(/);
    expect(bake).toMatch(/const front = frontBake\?\.front \?\? \[\];/);
    expect(bake).toMatch(/frontBake\?\.dispose\(\);/);
    expect(bake).toMatch(/for \(const m of frontBake\?\.managers \?\? \[\]\) m\.time = CLOCK_T0 \+ t;/);
  });
});
