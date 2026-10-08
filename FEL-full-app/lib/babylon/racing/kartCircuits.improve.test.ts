// IMPROVE (2026-10-06), velocitykart #8 #12 #13 + the phone pass: the shortcut, the GP / mirror variants, the road height
// read off a fix, and the kerbs / gantry merged out of the draw and caster lists.
import { describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import {
  kartCircuits, kartCircuitById, kartCircuitVariant, variantKey, parseVariant, shortcutAt, clearOfShortcuts, surfaceFromFix,
  KART_GP_LAPS,
} from './kartCircuits';
import { locate, pointAlong } from './racingLine';
import { startRace, stepRace } from '../core/RaceCourse';
import { buildGantry, buildKerbs, kartSceneryFor, kartSettingFor, placeObstacles, SHORTCUT_CLEAR, buildShortcuts } from './kartDressing';

const board = kartCircuitById('boardwalk-loop')!;

describe('#8 the shortcut', () => {
  const sc = board.shortcuts[0];

  it('BOARDWALK LOOP has one: shorter than the road, narrower, and off it', () => {
    expect(board.shortcuts).toHaveLength(1);
    expect(sc.saved).toBeGreaterThan(10);
    expect(sc.halfWidth).toBeLessThan(board.halfWidth);
    const mid = sc.a.add(sc.b).scale(0.5);
    expect(Math.abs(locate(board.line, mid.x, mid.z).lateral)).toBeGreaterThan(board.halfWidth + 4);   // a separate route, not a wider corner
  });

  it('never comes near another part of the lap (it cannot be a cut to somewhere else)', () => {
    for (let u = 0.05; u <= 0.95; u += 0.02) {
      const x = sc.a.x + (sc.b.x - sc.a.x) * u, z = sc.a.z + (sc.b.z - sc.a.z) * u;
      const at = locate(board.line, x, z);
      const inSpan = at.dist >= sc.from - 10 && at.dist <= sc.to + 10;
      if (!inSpan) expect(Math.hypot(x - at.point.x, z - at.point.z)).toBeGreaterThan(board.halfWidth + 6);
    }
  });

  it('a lap that takes it still counts every gate in order — and one that skips the road elsewhere does not', () => {
    const drive = (pts: Vector3[]) => {
      const race = startRace();
      for (let i = 1; i < pts.length; i++) stepRace(race, board.course, pts[i - 1], pts[i], 0.1);
      return race;
    };
    const L = board.line.length, pts: Vector3[] = [board.course.start.at.clone()];
    for (let d = 0; d <= sc.from; d += 2) pts.push(pointAlong(board.line, d).pos);
    for (let u = 0; u <= 1; u += 0.02) pts.push(Vector3.Lerp(sc.a, sc.b, u));
    for (let d = sc.to; d <= L + 2; d += 2) pts.push(pointAlong(board.line, d).pos);
    const r = drive(pts);
    expect(r.passed).toBe(board.course.gates.length);
    expect(r.lap).toBe(2);
    // control: a straight line across the infield from 200 m to 500 m is NOT a shortcut — the gates between refuse it
    const cheat: Vector3[] = [board.course.start.at.clone()];
    for (let d = 0; d <= 200; d += 2) cheat.push(pointAlong(board.line, d).pos);
    for (let u = 0; u <= 1; u += 0.02) cheat.push(Vector3.Lerp(pointAlong(board.line, 200).pos, pointAlong(board.line, 500).pos, u));
    for (let d = 500; d <= L + 2; d += 2) cheat.push(pointAlong(board.line, d).pos);
    expect(drive(cheat).lap).toBe(1);
    // a gate's radius is widened only where the path's own crossing needs it, and never past the path's reach
    const base = board.halfWidth + 6;
    const widened = board.course.gates.filter((g) => g.radius > base);
    for (const g of widened) expect(g.radius).toBeLessThan(base + 20);
  });

  it('shortcutAt is on the sand and nowhere else; the height runs end to end', () => {
    const mid = shortcutAt(board, (sc.a.x + sc.b.x) / 2, (sc.a.z + sc.b.z) / 2)!;
    expect(mid).not.toBeNull();
    expect(mid.u).toBeCloseTo(0.5, 2);
    expect(mid.y).toBeCloseTo((sc.a.y + sc.b.y) / 2, 3);
    const side = new Vector3(sc.b.z - sc.a.z, 0, -(sc.b.x - sc.a.x)).normalize();
    const edge = sc.a.add(sc.b).scale(0.5).add(side.scale(sc.halfWidth + 0.5));
    expect(shortcutAt(board, edge.x, edge.z)).toBeNull();
    expect(shortcutAt(board, edge.x, edge.z, 1)).not.toBeNull();
    const before = sc.a.subtract(sc.b.subtract(sc.a).normalize().scale(3));
    expect(shortcutAt(board, before.x, before.z)).toBeNull();
    expect(kartCircuitById('stadium-oval')!.shortcuts).toHaveLength(0);
  });

  it('nothing in the scenery stands on it', () => {
    for (const p of [...kartSceneryFor(board), ...kartSettingFor(board)]) {
      expect(clearOfShortcuts(board, p.at[0], p.at[2], SHORTCUT_CLEAR - 0.01), `${p.model} at ${p.at}`).toBe(true);
    }
  });
});

describe('#12 Grand Prix and mirror', () => {
  it('variant keys and loose input', () => {
    expect(variantKey({ laps: 2, mirror: false })).toBe('');
    expect(variantKey({ laps: 3, mirror: false })).toBe('gp');
    expect(variantKey({ laps: 2, mirror: true })).toBe('m');
    expect(variantKey({ laps: 3, mirror: true })).toBe('gp-m');
    expect(parseVariant('3', '1')).toEqual({ laps: 3, mirror: true });
    expect(parseVariant('7', 'nope')).toEqual({ laps: 2, mirror: false });
    expect(parseVariant(undefined, true)).toEqual({ laps: 2, mirror: true });
  });

  it('the standard variant IS the published circuit; a variant is built once', () => {
    expect(kartCircuitVariant('rooftop-circuit', { laps: 2, mirror: false })).toBe(kartCircuitById('rooftop-circuit'));
    const gp = kartCircuitVariant('rooftop-circuit', { laps: 3, mirror: false })!;
    expect(kartCircuitVariant('rooftop-circuit', { laps: 3, mirror: false })).toBe(gp);
    expect(kartCircuitVariant('no-such-course', { laps: 3, mirror: true })).toBeNull();
  });

  it('a GP is the same road for three laps, with the gold scaled to match', () => {
    for (const c of kartCircuits()) {
      const gp = kartCircuitVariant(c.course.id, { laps: KART_GP_LAPS, mirror: false })!;
      expect(gp.course.laps).toBe(3);
      expect(gp.course.id).toBe(c.course.id);
      expect(gp.line.length).toBeCloseTo(c.line.length, 6);
      expect(gp.course.gold / c.course.gold).toBeCloseTo(1.5, 1);
      expect(gp.course.name).toContain('GP');
    }
  });

  it('a mirrored course is the same course reflected: same length, same corners, x flipped, obstacles on the mirrored spot', () => {
    for (const c of kartCircuits()) {
      const m = kartCircuitVariant(c.course.id, { laps: 2, mirror: true })!;
      expect(m.line.length).toBeCloseTo(c.line.length, 6);
      expect(m.measuredMinRadius).toBeCloseTo(c.measuredMinRadius, 3);
      expect(m.course.gates.length).toBe(c.course.gates.length);
      expect(m.line.pts[5].x).toBeCloseTo(-c.line.pts[5].x, 6);
      expect(m.line.pts[5].z).toBeCloseTo(c.line.pts[5].z, 6);
      const a = placeObstacles(c), b = placeObstacles(m);
      a.forEach((o, i) => { expect(b[i].pos.x).toBeCloseTo(-o.pos.x, 4); expect(b[i].pos.z).toBeCloseTo(o.pos.z, 4); });
      expect(m.kerbs.map((k) => k.side)).toEqual(c.kerbs.map((k) => -k.side));
      expect(m.course.name).toContain('MIRROR');
      for (const sc of m.shortcuts) expect(sc.a.x).toBeCloseTo(-c.shortcuts[0].a.x, 4);
    }
  });
});

describe('#13 the road height off a fix', () => {
  it('surfaceFromFix(locate(..)) is exactly surfaceAt, on the road and off it', () => {
    for (const c of [board, kartCircuitById('summit-climb')!]) {
      for (let d = 0; d < c.line.length; d += 37) {
        const at = pointAlong(c.line, d);
        for (const off of [0, 4, c.halfWidth + 3, 30]) {
          const p = at.pos.add(at.right.scale(off));
          expect(surfaceFromFix(locate(c.line, p.x, p.z), c.halfWidth)).toBeCloseTo(c.surfaceAt(p.x, p.z), 9);
        }
      }
    }
  });
});

describe('phone pass: the kerbs and the gantry banner are merged', () => {
  it('a course\'s kerbs are two meshes named off the caster list, the checker banner two listed meshes; the path one', () => {
    const scene = new Scene(new NullEngine());
    new FreeCamera('c', new Vector3(0, 2, -8), scene);
    const before = scene.meshes.length;
    const kerbs = buildKerbs(scene, board);
    const ks = kerbs.getChildMeshes();
    expect(ks.length).toBeLessThanOrEqual(2);
    expect(ks.every((m) => m.name.startsWith('__') && m.receiveShadows)).toBe(true);
    expect(board.kerbs.length).toBeGreaterThan(3);   // was one mesh per 3 m block: ~96 on this course
    const gantry = buildGantry(scene, board);
    const tiles = gantry.getChildMeshes().filter((m) => m.name.startsWith('kart_check'));
    expect(tiles.map((m) => m.name).sort()).toEqual(['kart_check_black', 'kart_check_white']);
    const path = buildShortcuts(scene, board)!;
    expect(path.getChildMeshes()).toHaveLength(1);
    expect(path.getChildMeshes()[0].name.startsWith('__')).toBe(true);
    expect(buildShortcuts(scene, kartCircuitById('stadium-oval')!)).toBeNull();
    expect(scene.meshes.length - before).toBeLessThan(12);
    scene.dispose();
  });
});
