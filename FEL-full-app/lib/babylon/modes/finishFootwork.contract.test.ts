// H2e (owner 2026-10-16): both modes take the hop step on a double tap (before the squeeze block, off the first press's drive) and the
// skip gather after the euro read (help in the lane keeps the euro), and the skip's finish goes off the glass.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const one = readFileSync('lib/babylon/modes/OneVOneMode.ts', 'utf8');
const three = readFileSync('lib/babylon/modes/ThreeVThreeMode.ts', 'utf8');

describe('the player-asked finishes are wired in both modes (H2e)', () => {
  for (const [name, src] of [['1v1', one], ['3v3', three]] as const) {
    it(`${name}: the double tap converts the young gather, the skip comes after the euro, its finish is banked`, () => {
      const dt = src.indexOf('hopOnDoubleTap(tapRead())'), sq = src.indexOf(name === '1v1' ? "if (!shooting && !dunking && !spin && carrying && (meSlot.intent.actionHeld > 0.02" : 'if (iAmCarrier && !shooting && !dunking && !finish && !spin && !arc.active');
      expect(dt).toBeGreaterThan(0); expect(dt).toBeLessThan(sq);   // read before the squeeze block, so the second press is not a new squeeze
      expect(src).toMatch(/squeezeAt = performance\.now\(\) \/ 1000; squeezeVel\.copyFrom\(/);
      expect(src).toMatch(/if \(force\?\.hopVel\) plan = planHopStep\(force\.hopVel,/);
      const euro = src.indexOf('if (sell) plan = planEuro('), skip = src.indexOf('planSkipGather(');
      expect(euro).toBeGreaterThan(0); expect(skip).toBeGreaterThan(euro);
      expect(src).toMatch(/const lineYaw = yawTo\(me(\.char)?\.root\.position, RIM_FLOOR\);[^\n]*\n\s*const away = skipAwaySide\(mx, -my, lineYaw,/);   // read across the line to the rim, not the facing
      expect(src).toMatch(/plan\.kind === 'skip' \? `bball_skip_gather_\$\{plan\.side \?\? 'right'\}`/);
      expect(src).toMatch(/if \(plan\.glass\) banked = bankPoint\(/);
    });
    it(`${name}: the first press's quick release is held while the hop is on, then sent as taken; the hop takes it over`, () => {
      const held = src.indexOf('tapReleaseHeld(tapRead())) { tapRelease = pumpNow ? \'pump\' : meterRelease();'), pump = src.indexOf('else if (meIntent.action && pumpNow) doPump();'.replace('meIntent', name === '1v1' ? 'meSlot.intent' : 'meIntent'));
      expect(held).toBeGreaterThan(0); expect(pump).toBeGreaterThan(held);   // read before the pump and the release
      expect(src).toMatch(/else if \(tapRelease\) \{ if \(!tapReleaseHeld\(tapRead\(\)\)\) \{ const r = tapRelease; tapRelease = null; if \(r === 'pump'\) doPump\(\);/);
      expect(src).toMatch(/gather = null; shooting = false; tapRelease = null;/);   // the conversion drops the held release
      expect(src).toMatch(/squeezeVel\.copyFrom\([^)]*\); tapRelease = null;/);      // a new squeeze never inherits one
    });
    it(`${name}: a double-tapped hop ends in a finish, and tapped it releases itself, untimed (owner 2026-10-16, decisions 17-19)`, () => {
      const act = name === '1v1' ? 'meSlot.intent.action' : 'meIntent.action';
      expect(src).toMatch(/if \(force\?\.hopVel\) plan = planHopStep\(force\.hopVel, [^,]+, RIM_FLOOR, hopThen\(dist\)\);/);
      expect(src).toMatch(/\{ squeezeAt = -1; hopRelease = 'armed';/);
      expect(src).toContain(`if (${act} && hopRelease === 'armed') { hopRelease = hopReleaseOnButtonUp(hopRelease, gather?.plan.kind === 'hop');`);
      const auto = src.indexOf("if (hopRelease === 'auto') { if (hopAutoReleaseNow(hopRelease, t, shotMeter.greenCenter01)) {");
      expect(auto).toBeGreaterThan(0);
      expect(auto).toBeLessThan(src.indexOf(`else if (${act} && pumpNow) doPump();`));   // the tap's button-up is no pump
      expect(src).toMatch(/shotMeter\.release\(\); meter3d\?\.end\(HOP_AUTO_QUALITY\); stickShot = null; (void resolveMyShot|releaseJumper)\(ctx, HOP_AUTO_QUALITY\);/);
      expect(src).toMatch(/tapRelease = null; hopRelease = null;/);
    });
  }
});
