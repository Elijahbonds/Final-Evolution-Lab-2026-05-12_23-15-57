// WAVE 3 (lane/w3-present): the made dunk's fourth angle is wired in both contests, keeps the tuned triple, and drops out under reduced motion.
// Source scans, the way dunkImprove.scan / dunkDuelImprove.scan hold the owner's items.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const src = (f: string): string => readFileSync(path.resolve(__dirname, f), 'utf8');

describe('the orbit angle in the dunk contest and the duel', () => {
  for (const f of ['DunkMode.ts', 'DunkDuelMode.ts']) {
    it(`${f}: plays showCuts(motionPolicy().travel), labels the replay by that list and sizes its safety net by it`, () => {
      const s = src(f);
      expect(s).toMatch(/const cuts = showCuts\(motionPolicy\(\)\.travel\);/);
      expect(s).toMatch(/playCuts\(rim, contact(Sec|At), cuts, \{/);
      expect(s).toMatch(/REPLAY \$\{i \+ 1\}\/\$\{cuts\.length\}/);
      expect(s).toMatch(/pausableDelay\(\(?cutsSec\(cuts\)/);
      expect(s, 'no hard-wired three-cut list left').not.toMatch(/TRIPLE_CUT|tripleCutSec/);
    });
  }
  it('the tuned triple is exactly as it was and the orbit is its own export after it (DunkCuts)', () => {
    const s = src('../core/DunkCuts.ts');
    expect(s).toMatch(/\{ id: 'baseline', lead: 0\.5, tail: 0\.1, speed: 0\.85, label: 'UNDER THE RIM' \}/);
    expect(s).toMatch(/\{ id: 'profile', lead: 0\.45, tail: 0\.1, speed: 0\.8, label: 'ON THE IRON' \}/);
    expect(s).toMatch(/\{ id: 'phone', lead: 0\.4, tail: 0\.15, speed: 0\.75, label: 'FROM THE STANDS' \}/);
    expect(s).toMatch(/ORBIT_CUT: CutSpec = \{ id: 'orbit'/);
    expect(s).toMatch(/\(travel \? \[\.\.\.TRIPLE_CUT, ORBIT_CUT\] : TRIPLE_CUT\)/);
  });
  it('the replay camera travels the orbit and pushes in on every other cut', () => {
    const s = src('../scene/DunkReplayCam.ts');
    expect(s).toMatch(/left \/ segs\[s\]\.dur\);\s*const push = c\.id === 'orbit' \? 1 :/);
  });
});
