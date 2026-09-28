// QA P1-07 (2026-09-27): "spawns overlap in Ones and Showdown". Ones set the rival at x 0, 3 m in front of the ball handler
// and dead in line with him, so from the camera at the handler's back the two bodies stacked into one silhouette at the
// first frame. Showdown's fighters stand 8 m apart (0,4) / (0,−4), measured apart on its first frame; unchanged.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const src = readFileSync(path.resolve(__dirname, 'OneVOneMode.ts'), 'utf8');
const vec = (name: string): { x: number; z: number } => {
  const m = new RegExp(`${name} = new Vector3\\(([-\\d.]+), ([-\\d.]+), ([-\\d.]+)\\)`).exec(src);
  if (!m) throw new Error(`no ${name}`);
  return { x: Number(m[1]), z: Number(m[3]) };
};
const BODY_W = 0.6;         // a body's width: less lateral offset than this and one hides the other from behind
const HALF_COURT = { x: 7.5, zMin: 0, zMax: 14 };

describe('Ones: the first frame shows two players', () => {
  const me = vec('MY_SPAWN'), foe = vec('FOE_SPAWN');
  it('the spawns are ≥ 1 m apart and inside the half court', () => {
    expect(Math.hypot(me.x - foe.x, me.z - foe.z)).toBeGreaterThanOrEqual(1);
    for (const p of [me, foe]) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(HALF_COURT.x);
      expect(p.z).toBeGreaterThanOrEqual(HALF_COURT.zMin);
      expect(p.z).toBeLessThanOrEqual(HALF_COURT.zMax);
    }
  });
  it('the rival is off the handler\'s line by more than a body, so the camera behind the handler sees both', () => {
    expect(Math.abs(foe.x - me.x)).toBeGreaterThan(BODY_W);
    expect(foe.z).toBeLessThan(me.z);   // still between the ball and the rim
  });
});

describe('Showdown: already apart', () => {
  it('the fighters spawn 8 m apart', () => {
    const sd = readFileSync(path.resolve(__dirname, 'ShowdownMode.ts'), 'utf8');
    expect(sd).toContain("position: new Vector3(0, 0, 4), startClip: 'karate_idle_stance', modeId: 'showdown-me'");
    expect(sd).toContain("position: new Vector3(0, 0, -4), tint: '#8b1e2d'");
  });
});
