// H2 leftovers (2026-10-16, after H2e): the euro's stick read off the line to the rim; the in-air trick stick and the dunk contest's tricks
// in 3v3; the 3v3 mates' alley-oop and the AI's putback slams; and a thrown trick no longer keeps the ball in the hand past the iron.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { euroSell } from '../core/HoopsMoves';

const one = readFileSync('lib/babylon/modes/OneVOneMode.ts', 'utf8');
const three = readFileSync('lib/babylon/modes/ThreeVThreeMode.ts', 'utf8');

describe('the euro reads the stick across the line to the rim', () => {
  it('a held sell, read off a facing that has turned to follow it, comes out "forward"; off the rim line it is still the sell', () => {
    // driving at the rim straight up +z (the rim line's yaw 0); the stick held hard right, a little forward
    const wishX = 0.9, wishZ = 0.45;
    expect(euroSell(wishX, wishZ, 0)).toBe('right');
    // the facing follows the stick at 10 rad/s: 0.1 s later the body has turned ~1 rad toward it, and the same push is ahead of him
    expect(euroSell(wishX, wishZ, 1.0)).toBeNull();
  });
  for (const [name, src, pos] of [['1v1', one, 'me.root.position'], ['3v3', three, 'me.char.root.position']] as const) {
    it(`${name}: startFootwork passes the rim line's yaw to euroSell`, () => {
      expect(src).toContain(`const sell = euroSell(mx, -my, yawTo(${pos}, RIM_FLOOR));`);
      expect(src).not.toContain('const sell = euroSell(mx, -my, yaw);');
    });
  }
});

describe('a thrown trick still lets the ball go at the iron (both modes)', () => {
  for (const [name, src] of [['1v1', one], ['3v3', three]] as const) {
    it(`${name}: the hero's release keys on \`released\`, not on the \`resolved\` a trick sets`, () => {
      expect(src).toMatch(/let resolved = false, released = false; dunkFlight = \{ k: 0, made: null \};/);
      expect(src).toMatch(/if \(!released && !swatted && k >= DRIVE_DUNK\.resolveK\) \{[\s\S]{0,400}resolved = true; released = true;\s+const releasePos = ball\.getAbsolutePosition\(\)\.clone\(\); releaseBall\(ball\);/);
    });
  }
});

describe('3v3 throws the trick stick, and the contest\'s four on a breakaway', () => {
  it('the breakaway reads the nearest live defender to the takeoff, and the window rides the bump', () => {
    expect(three).toMatch(/const contestTricks = contestTricksOn\(\{ contested: c\.contested, nearestDefenderM: nearestDefM, momentum01: mbus\.score01 \}\);/);
    expect(three).toMatch(/const trickWin = trickWindow\(c\.bumpK\);/);
  });
  it('the family pick comes first and disarms it; the trick is judged on the flight clock and decides the make', () => {
    const fam = three.indexOf('familyPicked = true; trickArmed = false;'), trick = three.indexOf('const asked = trickFromFlick(lookX, lookY);');
    expect(fam).toBeGreaterThan(0); expect(trick).toBeGreaterThan(fam);
    expect(three).toMatch(/if \(!trickArmed && Math\.hypot\(lookX, lookY\) < 0\.3\) trickArmed = true;/);
    expect(three).toMatch(/const judge = judgeFlick\(k, trickWin\);\s+const spec = \(contestTricks \? CONTEST_TRICK : STICK_TRICK\)\[asked\];/);
    expect(three).toMatch(/made = roll\(\) < trickPctFor\(c\.pct, spec, judge\) \+ \(onTheBump \? CONTACT_TRICK_BONUS : 0\);/);
    expect(three.indexOf('const asked = trickFromFlick(lookX, lookY);')).toBeLessThan(three.indexOf('if (!released && !swatted && k >= DRIVE_DUNK.resolveK)'));
  });
});

describe('3v3: the mates dunk their oops and their putbacks; the rival slams his putback', () => {
  const shoots = three.slice(three.indexOf('async function teammateShoots('), three.indexOf('async function teammateShoots(') + 6000);
  it('his oop (and his putback) is the flush clip on the bodies\' jump arc, not a tomahawk beat on the floor', () => {
    expect(shoots).toMatch(/const slam = finish === 'alleyoop' \? ALLEY_OOP : finish === 'putback' \? PUTBACK_DUNK : null;/);
    expect(shoots).toMatch(/body\.tree\.beat\(slam\.clip, \{ fadeSec: 0\.05, speedRatio: dunkSpeedRatio\(slam, JUMP_SEC\) \}\); body\.jumpAge = 0;/);
    expect(shoots).not.toContain('SPORT_CLIP.dunkFinishTomahawk');
  });
  it('the AI putback is read before the tip-in, a mate\'s through his slam, a foe\'s through the rival\'s real flight', () => {
    const ai = three.indexOf("if (r.winner.id !== 'me' && putbackDunkOn({ offensive: putback, atIron: isTipInEligible(ballSim.pos, RIM, true), who: 'foe', sprintHeld: false, roll })) {");
    expect(ai).toBeGreaterThan(0);
    expect(ai).toBeLessThan(three.indexOf('if (putback && isTipInEligible(ballSim.pos, RIM, true)) {'));
    expect(three).toMatch(/mateShooting = false;[^\n]*\n\s*void teammateShoots\(ctx, mates\[idx\], idx, 'putback'\);/);
    expect(three).toMatch(/else foePutbackSlam\(ctx, foes\[Number\(r\.winner\.id\.slice\(3\)\)\]\);/);
    expect(three).toMatch(/function foePutbackSlam\(ctx: ModeContext, body: Body\): void \{[\s\S]{0,700}possessionToken\+\+;[\s\S]{0,700}void driverDunk\(ctx, body, PUTBACK_DUNK\);/);
    expect(three).toMatch(/function driverDunk\(ctx: ModeContext, shooter: Body, force\?: HoopsDunk\): Promise<void> \{/);
    expect(three).toMatch(/const theirDunk = force \?\? pickHoopsDunk\(\{/);
  });
});
