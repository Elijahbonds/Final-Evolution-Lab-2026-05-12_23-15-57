// lane/hoops-shot-content × lane/hoops-shot-core (merged 2026-10-23): the free-throw line is a DEAD BALL, so ELITE's shot clock
// (core/ShotClock) must not run under it. The modes tick the clock before the line's early return; a trip of two or three shots
// is longer than a 12 s clock, so without the gate a fouled hero would be called for a violation standing at the stripe.
// Each continuation the line runs afterwards starts a new possession (possessionToken++), which resets the clock.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = (f: string) => readFileSync(join(__dirname, '..', 'modes', f), 'utf8');

describe('the free-throw line stops the shot clock', () => {
  for (const f of ['OneVOneMode.ts', 'ThreeVThreeMode.ts']) {
    it(`${f}: the shot clock's live flag is off while a trip is on, and the line's update still returns before live play`, () => {
      const s = src(f);
      const tick = s.split('\n').filter((l) => l.includes('shotClock.tick('));
      expect(tick).toHaveLength(1);
      expect(tick[0]).toMatch(/live:[^}]*&& !ftLine\?\.active\s*\}/);
      expect(s).toMatch(/if \(ftLine\?\.active\) \{[^}]*ftLine\.update\(dt\); return; \}/);
    });
  }
});
