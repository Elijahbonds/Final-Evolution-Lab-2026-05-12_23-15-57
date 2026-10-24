// lane/h3-handler (#312 / #314 ports): the hooks are in both hoops modes, one line each (the logic lives in modes/handlerRest,
// core/HoopsLook, anim/ProtectSink, anim/RestDribble, anim/MoveEase, core/JumperHop) — and the old hop line is gone from both.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = (f: string) => readFileSync(`lib/babylon/modes/${f}`, 'utf8');

describe('the hooks (1v1 and 3v3)', () => {
  for (const f of ['OneVOneMode.ts', 'ThreeVThreeMode.ts']) {
    it(`${f}: the rest (mount, dress, step) and the jumper's rise (built, stepped)`, () => {
      const s = src(f);
      expect(s.match(/meRest\.mount\(/g)?.length).toBe(1);
      expect(s.match(/meRest\.dress\(/g)?.length).toBe(1);
      expect(s.match(/meRest\.step\(/g)?.length).toBe(1);
      expect(s.match(/new JumperRise\(/g)?.length).toBe(1);
      expect(s.match(/riseHop\.step\(/g)?.length).toBe(1);
      expect(s).not.toMatch(/riseHop\.dur/);
      // the meter's pace is still syncedShotSpeed's, computed before the rise is built and handed to the held clip unchanged
      expect(s).toMatch(/const sync = syncedShotSpeed\(clipSec, shotMeter\.riseSec, greenInRise01, releaseFrameOf\(/);
      expect(s).toMatch(/hold\('jumpshot', \{ speedRatio: sync, fadeSec: 0\.08 \}\)/);
    });
  }
});
