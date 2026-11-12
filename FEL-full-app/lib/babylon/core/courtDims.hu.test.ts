// HU-1 … HU-7 (HOOP-UNIFY-2026-10-23): one shared hoop module, step 1 a pure move — every caller reads courtDims with today's value.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DUNK_RIM_RADIUS, HOOP, RIM_HEIGHT_M, RIM_RADIUS, VENUE_HOOP } from './courtDims';
import { RIM_RADIUS as PHYS_RIM_RADIUS } from './RimPhysics';
import { HOOP_RIM_OFFSET } from '../nexus/NexusWebScene';
import { DUNK_CONFIG } from '../modes/modeConfigs';

const APP = path.resolve(__dirname, '../../..');
const rel = (p: string) => path.relative(APP, p).split(path.sep).join('/');
const read = (p: string) => readFileSync(path.join(APP, p), 'utf8');
function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (e === 'node_modules' || e === '__fixtures__') continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e) && !/\.test\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}
/** Code only: strip line and block comments (a comment may cite a value; it should cite RIM_HEIGHT_M). */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('HOOP-UNIFY', () => {
  it('HU-1 / DR-H12: no 3.05 / 3.048 rim-height literal and no 0.2286 / rim-radius literal in lib/ or src/ code outside courtDims.ts', () => {
    const roots = ['lib', 'src'].map((d) => path.join(APP, d)).filter((d) => { try { return statSync(d).isDirectory(); } catch { return false; } });
    const bad: string[] = [];
    for (const f of roots.flatMap((r) => walk(r))) {
      if (rel(f) === 'lib/babylon/core/courtDims.ts' || rel(f).startsWith('lib/pose/')) continue;
      code(readFileSync(f, 'utf8')).split('\n').forEach((line, i) => {
        if (/(?<![\d.])3\.0(5|48)(?![\d])/.test(line)) bad.push(`${rel(f)}:${i + 1} ${line.trim()}`);
        if (/(?<![\d.])0\.2286(?![\d])/.test(line)) bad.push(`${rel(f)}:${i + 1} ${line.trim()}`);
        if (/rimRing\([^)]*,\s*0\.45\s*\)|CreateTorus\('[^']*rim[^']*',[^)]*diameter:\s*0\.(90?|46)\b/.test(line)) bad.push(`${rel(f)}:${i + 1} ${line.trim()}`);
      });
    }
    expect(bad).toEqual([]);
  });

  it('HU-2: the dunk hoop and the VenueKit hoop builders take every dimension from courtDims, and the dims reproduce the measured AABBs (HOOP-BOUNDS.md) within 1e-3', () => {
    const nexus = read('lib/babylon/nexus/NexusWebScene.ts'), venue = read('lib/babylon/visual/VenueKit.ts');
    for (const k of ['POLE_H_M', 'POLE_D_M', 'BOARD_W', 'BOARD_H', 'BOARD_D', 'BOARD_CENTRE_ABOVE_RIM_M', 'BOARD_CENTRE_Z_M', 'RIM_TUBE_M', 'NET_H', 'NET_TOP_D', 'NET_BOTTOM_D', 'NET_CENTRE_BELOW_RIM_M']) expect(nexus).toContain(`HOOP.${k}`);
    expect(nexus).toContain('DUNK_RIM_RADIUS * 2 * s');
    for (const k of ['POLE_H_M', 'POLE_D_M', 'POLE_Y', 'POLE_Z', 'BOARD_W', 'BOARD_H', 'BOARD_D', 'BOARD_Y', 'BOARD_Z', 'RIM_RADIUS', 'RIM_TUBE_M', 'RIM_Z', 'NET_H', 'NET_TOP_D', 'NET_BOTTOM_D', 'NET_Y']) expect(venue).toContain(`VENUE_HOOP.${k}`);
    // The basketball_dunk prop at (0, 0, −11), scale 1 (venueSpecs.ts) — the world AABBs 3D Art measured (HOOP-BOUNDS.md).
    const z0 = -11, near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(1e-3);
    near(HOOP.POLE_H_M, 3.30); near(z0 - HOOP.POLE_D_M / 2, -11.08);
    const board = { y0: HOOP_RIM_OFFSET.y + HOOP.BOARD_CENTRE_ABOVE_RIM_M - HOOP.BOARD_H / 2, y1: HOOP_RIM_OFFSET.y + HOOP.BOARD_CENTRE_ABOVE_RIM_M + HOOP.BOARD_H / 2, z0: z0 + HOOP.BOARD_CENTRE_Z_M - HOOP.BOARD_D / 2, z1: z0 + HOOP.BOARD_CENTRE_Z_M + HOOP.BOARD_D / 2 };
    near(board.y0, 2.975); near(board.y1, 4.025); near(board.z0, -10.73); near(board.z1, -10.67); near(HOOP.BOARD_W / 2, 0.9);
    const rimR = DUNK_RIM_RADIUS + HOOP.RIM_TUBE_M / 2;
    near(rimR, 0.4775); near(HOOP_RIM_OFFSET.y - HOOP.RIM_TUBE_M / 2, 3.0225); near(z0 + HOOP_RIM_OFFSET.z - rimR, -10.7575); near(z0 + HOOP_RIM_OFFSET.z + rimR, -9.8025);
    near(HOOP_RIM_OFFSET.y - HOOP.NET_CENTRE_BELOW_RIM_M - HOOP.NET_H / 2, 2.63); near(HOOP.NET_TOP_D / 2, 0.41);
    near(VENUE_HOOP.RIM_RADIUS * 2, 0.46); near(VENUE_HOOP.BOARD_Y, 3.45); near(VENUE_HOOP.POLE_H_M, 3.9); near(VENUE_HOOP.NET_Y, 2.83);
  });

  it('HU-3: RimPhysics RIM_RADIUS is HOOP.RIM_RADIUS; Dunk mode\'s ring is the named, non-regulation DUNK_RIM_RADIUS, which the dunk hoop\'s torus also uses', () => {
    expect(PHYS_RIM_RADIUS).toBe(HOOP.RIM_RADIUS); expect(RIM_RADIUS).toBe(0.2286); expect(DUNK_RIM_RADIUS).toBe(0.45);
    expect(read('lib/babylon/modes/DunkMode.ts')).toMatch(/rimRing\(\{ x: 0, y: CFG\.rimHeight, z: CFG\.rimZ \}, DUNK_RIM_RADIUS\)/);
    expect(read('lib/babylon/nexus/NexusWebScene.ts')).toMatch(/CreateTorus\('rim', \{ diameter: DUNK_RIM_RADIUS \* 2 \* s/);
  });

  it('HU-4: the DunkMode glass box is derived from HOOP (face offset, bottom, top, width), not literals', () => {
    expect(read('lib/babylon/modes/DunkMode.ts')).toContain('const glass = { z: CFG.rimZ - HOOP.BOARD_FACE_TO_RIM_CENTRE_M, xMin: -HOOP.BOARD_W / 2, xMax: HOOP.BOARD_W / 2, yMin: CFG.rimHeight - HOOP.BOARD_BOTTOM_BELOW_RIM_M, yMax: CFG.rimHeight + HOOP.BOARD_TOP_ABOVE_RIM_M, found: false };');
  });

  it('HU-5: step 1 is a no-op — every moved value is bit-identical to the literal it replaced', () => {
    expect(RIM_HEIGHT_M).toBe(3.05); expect(HOOP_RIM_OFFSET).toEqual({ y: 3.05, z: 0.72 }); expect(DUNK_CONFIG.rimHeight).toBe(3.05);
    expect(DUNK_RIM_RADIUS * 2).toBe(0.90); expect(VENUE_HOOP.RIM_RADIUS * 2).toBe(0.46); expect(HOOP.BOARD_W / 2).toBe(0.9); expect(-HOOP.BOARD_W / 2).toBe(-0.9);
    expect(HOOP).toMatchObject({ BOARD_FACE_TO_RIM_CENTRE_M: 0.39, BOARD_BOTTOM_BELOW_RIM_M: 0.075, BOARD_TOP_ABOVE_RIM_M: 0.975, RIM_TUBE_M: 0.055, POLE_H_M: 3.30, POLE_D_M: 0.16, NET_TOP_D: 0.82, NET_BOTTOM_D: 0.44, NET_H: 0.42, NET_CENTRE_BELOW_RIM_M: 0.21, BOARD_CENTRE_ABOVE_RIM_M: 0.45, BOARD_CENTRE_Z_M: 0.3 });
    expect(VENUE_HOOP).toMatchObject({ RIM_TUBE_M: 0.03, RIM_Z: -0.6, BOARD_Y: 3.45, BOARD_Z: -1.15, POLE_H_M: 3.9, POLE_D_M: 0.16, POLE_Y: 1.95, POLE_Z: -1.6, NET_TOP_D: 0.44, NET_BOTTOM_D: 0.3, NET_H: 0.42, NET_Y: 2.83 });
    expect(Object.isFrozen(HOOP)).toBe(true); expect(Object.isFrozen(VENUE_HOOP)).toBe(true);
  });

  it('HU-6: the dragon clearance tests run against the courtDims dunk hoop (a value change re-runs DR-H14 / DR-J1 / J2 / J12)', () => {
    const sdf = read('tests/dragon-ride/hoopSdf.ts');
    expect(sdf).toMatch(/import \{ HOOP \} from '..\/..\/lib\/babylon\/core\/courtDims'/);
    expect(sdf).not.toMatch(/(?<![\d.])(3\.05|0\.45|2\.63|2\.975)(?![\d])/);
  });

  it('HU-7: DUNK_RIM_RADIUS is read only by the Dunk-mode / dunk-hoop paths; 1v1, 3v3 and RimPhysics use RIM_RADIUS', () => {
    const users = walk(path.join(APP, 'lib')).filter((f) => /\bDUNK_RIM_RADIUS\b/.test(code(readFileSync(f, 'utf8')))).map(rel).sort();
    // HoopJuice's ring outlines the hoop prop's torus (the dunk-hoop visual), so it reads the same named radius.
    expect(users).toEqual(['lib/babylon/core/courtDims.ts', 'lib/babylon/modes/DunkMode.ts', 'lib/babylon/nexus/NexusWebScene.ts', 'lib/babylon/visual/HoopJuice.ts']);
    for (const f of ['lib/babylon/modes/OneVOneMode.ts', 'lib/babylon/modes/ThreeVThreeMode.ts', 'lib/babylon/core/RimPhysics.ts']) expect(code(read(f))).not.toMatch(/DUNK_RIM_RADIUS/);
    expect(code(read('lib/babylon/modes/OneVOneMode.ts'))).toMatch(/\bRIM_RADIUS\b/);
  });
});
