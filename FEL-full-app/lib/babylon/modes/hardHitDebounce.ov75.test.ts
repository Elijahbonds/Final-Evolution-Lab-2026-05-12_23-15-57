// OV75-2 (ALL-MODES-TO-75 §9; Gameplay TUNE sheet 2026-10-23): one contact reaction per bump in 1v1.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HardHitDebounce, HARD_HIT_DEBOUNCE_MS } from './hardHitDebounce';
import { HARD_CONTACT_SPEED } from '../core/ContactSystem';

/** hardHit's gate, as OneVOneMode runs it: the speed / dunk gate first, then the pair's debounce. Counts impact sounds. */
function sounds(calls: { t: number; closing: number; a?: string; v?: string }[], dunking = false): number {
  const gate = new HardHitDebounce(); let n = 0;
  for (const c of calls) {
    if (dunking || c.closing < HARD_CONTACT_SPEED) continue;
    if (!gate.accept(c.a ?? 'me', c.v ?? 'foe', c.t)) continue;
    n++;
  }
  return n;
}
const lean = (sec: number, closing: number) => Array.from({ length: Math.round(sec * 60) }, (_, i) => ({ t: (i * 1000) / 60, closing }));

describe('OV75-2: one contact reaction per bump', () => {
  it('the window is Gameplay\'s 250 ms', () => { expect(HARD_HIT_DEBOUNCE_MS).toBe(250); });
  it('a 1 s lean (same pair, closing ≥ 2.4 m/s every frame) gives ≤ 4 impact sounds', () => {
    const n = sounds(lean(1, HARD_CONTACT_SPEED + 0.5));
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(4);
  });
  it('two bumps 300 ms apart give 2', () => {
    expect(sounds([{ t: 0, closing: 3 }, { t: 300, closing: 3 }])).toBe(2);
  });
  it('a 1.0 m/s brush gives 0', () => {
    expect(sounds(lean(1, 1.0))).toBe(0);
  });
  it('the window is per ORDERED pair: the other body\'s hit inside it still lands', () => {
    expect(sounds([{ t: 0, closing: 3 }, { t: 50, closing: 3, a: 'foe', v: 'me' }])).toBe(2);
  });
  it('a dunk\'s own contact never reads here', () => { expect(sounds(lean(0.5, 5), true)).toBe(0); });
  it('a rejected (slow) call never starts the window', () => {
    expect(sounds([{ t: 0, closing: 1 }, { t: 100, closing: 3 }])).toBe(1);
  });
  it('OneVOneMode.hardHit gates FIRST, then debounces, then plays the sound / feel / react / shake', () => {
    const src = readFileSync('lib/babylon/modes/OneVOneMode.ts', 'utf8');
    const body = src.slice(src.indexOf('function hardHit('), src.indexOf('function hardHit(') + 1400);
    const gate = body.indexOf('closing < HARD_CONTACT_SPEED) return;');
    const deb = body.indexOf('hardHitGate.accept(attacker, victim, performance.now())');
    const snd = body.indexOf("SoundKit.play('impact'");
    const shake = body.indexOf('ctx.juice.shake(');
    expect(gate).toBeGreaterThan(-1); expect(deb).toBeGreaterThan(gate); expect(snd).toBeGreaterThan(deb); expect(shake).toBeGreaterThan(snd);
  });
});
