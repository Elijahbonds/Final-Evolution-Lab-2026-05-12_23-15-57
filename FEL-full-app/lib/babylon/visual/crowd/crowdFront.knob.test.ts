// VENUE-SMOOTH-1 (2026-10-30): the forge front row sits behind crowd.forgeFront, default OFF.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CROWD_FORGE_FRONT_ON, CROWD_FRONT_KEYS, fanBody, forgeFrontOn, frontRowOf } from './crowdFront';
import { FEEL_KNOBS } from '../../../feel-panel/knobs';
import { FEEL_STORAGE_KEY, resetFeelForTests, setFeelSession, setFeelUser } from '../../../feel-panel/feel';
import { feelSessionBlock } from '../../../feel-panel/sessionGate';

class FakeStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}
const g = globalThis as { window?: unknown };
let ls: FakeStorage;
beforeEach(() => { resetFeelForTests(); ls = new FakeStorage(); g.window = { localStorage: ls }; });
afterEach(() => { resetFeelForTests(); delete g.window; });
const knob = (v: number) => { ls.m.set(FEEL_STORAGE_KEY, JSON.stringify({ 'crowd.forgeFront': v })); setFeelUser(true); setFeelSession(feelSessionBlock('/play/dunk', '?playtest=1')); };

const seats = [0, 1, 2, 3].flatMap((row) => [0, 1, 2, 3, 4].map((body) => ({ stand: 's', row, body })));
const bake = readFileSync(join(__dirname, 'crowdBake.ts'), 'utf8');

describe('crowd.forgeFront OFF (the default)', () => {
  it('is a 0/1 knob, default 0, read from crowdFront.ts', () => {
    expect(CROWD_FORGE_FRONT_ON).toBe(0);
    const k = FEEL_KNOBS.find((x) => x.id === 'crowd.forgeFront')!;
    expect([k.def, k.min, k.max, k.step, k.source]).toEqual([0, 0, 1, 1, 'lib/babylon/visual/crowd/crowdFront.ts CROWD_FORGE_FRONT_ON']);
    expect(forgeFrontOn()).toBe(false);
    knob(0); expect(forgeFrontOn()).toBe(false);
  });
  it('no forge body is baked (no download), so every row is a Meshy body, front row included', () => {
    expect(bake).toMatch(/const frontBake = !forgeFrontOn\(\) \? null : await bakeFront\(/);
    expect(bake).toMatch(/const front = frontBake\?\.front \?\? \[\];/);
    const front = frontRowOf(seats);
    for (const s of seats) expect(fanBody(s, front, 0, 5)).toEqual({ front: false, index: s.body });
  });
});

describe('crowd.forgeFront ON', () => {
  it('turns the front row forge, the Meshy bodies behind', () => {
    knob(1); expect(forgeFrontOn()).toBe(true);
    const front = frontRowOf(seats);
    for (const s of seats) expect(fanBody(s, front, CROWD_FRONT_KEYS.length, 5).front).toBe(s.row === 0);
  });
});
