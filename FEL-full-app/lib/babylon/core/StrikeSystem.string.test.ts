import { describe, it, expect } from 'vitest';
import { StrikeController, bookMoveset, karateMoveset, stringRule, QUEUE_MS } from './StrikeSystem';
import { KARATE_ATTACKS } from './FightCore';

// Phase 4 — the Storm string rule on StrikeSystem. Measured before: a mash of one button on showdown / duel produced 8
// swings of 40 presses (jab could cancel into kick or heavy only; a heavy into nothing; the queue died before a swing did).
const DT = 1 / 60;
function mash(ctrl: StrikeController, id: string, presses: number, gapMs: number, extraMs = 1500): { swings: number; latencies: number[] } {
  let t = 0, swings = 0; const lat: number[] = []; let lastPress = -1;
  const pressAt = Array.from({ length: presses }, (_, i) => 200 + i * gapMs);
  let pi = 0; let prevActive: unknown = null;
  const total = 200 + presses * gapMs + extraMs;
  while (t < total) {
    if (pi < pressAt.length && t >= pressAt[pi]) { ctrl.request(id, t); lastPress = t; pi++; }
    ctrl.update(DT, t);
    const after = (ctrl as unknown as { current: { phase: string } | null }).current;
    if (after && after !== prevActive) { swings++; if (lastPress >= 0) lat.push(t - lastPress); }   // a new StrikeInstance = a swing started
    prevActive = after;
    t += DT * 1000;
  }
  return { swings, latencies: lat };
}

describe('the string rule', () => {
  it('a mash of one button under the book is a swing per link, not one in five', () => {
    const book = new StrikeController(bookMoveset(KARATE_ATTACKS));
    const r = mash(book, 'jab', 12, 260);
    expect(r.swings).toBeGreaterThanOrEqual(10);
    const old = new StrikeController(karateMoveset(KARATE_ATTACKS));
    expect(mash(old, 'jab', 12, 260).swings).toBeLessThan(r.swings);
  });
  it('a press at the start of a heavy outlives the swing and fires at the cancel point', () => {
    const ctrl = new StrikeController(bookMoveset(KARATE_ATTACKS));
    let t = 0; ctrl.request('heavy', t);
    t += 50; expect(ctrl.request('jab', t)).toBe(false);   // queued, not eaten
    let fired = -1;
    for (let i = 0; i < 120 && fired < 0; i++) { t += DT * 1000; ctrl.update(DT, t); const c = (ctrl as unknown as { current: { move: { atk: { id: string } } } | null }).current; if (c && c.move.atk.id === 'jab') fired = t; }
    expect(fired).toBeGreaterThan(0);
    expect(fired).toBeLessThan(600);   // the heavy's cancel point (0.3 s / 1.25 speed) + a frame, well inside the old QUEUE_MS
    expect(QUEUE_MS).toBe(400);
  });
  it('a weapon moveset under stringRule keeps its ids and cancels into anything past the cancel point', () => {
    const ms = stringRule(karateMoveset(KARATE_ATTACKS));
    expect(Object.keys(ms)).toEqual(['jab', 'kick', 'heavy']);
    const ctrl = new StrikeController(ms);
    expect(mash(ctrl, 'heavy', 6, 400).swings).toBeGreaterThanOrEqual(5);
  });
  it('the book keeps the rival ids and every move validates', () => {
    const ms = bookMoveset(KARATE_ATTACKS);
    for (const id of ['jab', 'kick', 'heavy', 'uppercut', 'hook', 'sweep']) expect(ms[id]).toBeTruthy();
    for (const m of Object.values(ms)) { expect(m.startupSec).toBeGreaterThanOrEqual(0.1); expect(m.activeSec).toBeGreaterThan(0); expect(m.cancelAtSec!).toBeGreaterThan(0); }
  });
});
