// H2e: the dunk additions are wired — the family by the stick in both modes' flights before the trick stick, the contest tricks on 1v1's
// trick stick, the putbacks at the boards, the received alley-oop in 3v3's call for the ball.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const one = readFileSync('lib/babylon/modes/OneVOneMode.ts', 'utf8');
const three = readFileSync('lib/babylon/modes/ThreeVThreeMode.ts', 'utf8');

describe('more dunks are wired (H2e)', () => {
  it('the family by the stick reads the takeoff in both modes; in 1v1 it comes before the trick stick, which waits for the stick to come home', () => {
    for (const src of [one, three]) expect(src).toMatch(/if \(!familyPicked && !showtime && k < FAMILY_PICK_K\) \{\s*const fam = familyFromStick\(lookX, lookY\);/);
    expect(one.indexOf('familyFromStick(lookX, lookY)')).toBeLessThan(one.indexOf('const asked = trickFromFlick(lookX, lookY);'));
    expect(one).toMatch(/if \(!trickThrown && !showtime && trickArmed\) \{/);
  });
  it('1v1: the trick stick throws the contest\'s four on a breakaway, priced by the spec it threw', () => {
    expect(one).toMatch(/const spec = \(contestTricks \? CONTEST_TRICK : STICK_TRICK\)\[asked\];/);
    expect((one.match(/trickPctFor\(c\.pct, spec, judge\)/g) ?? []).length).toBe(2);
  });
  it('the putback dunk comes before the tip-in; 1v1 both sides, 3v3 the hero (live: no check)', () => {
    expect(one.indexOf('putbackDunkOn({')).toBeLessThan(one.indexOf('if (offensive && isTipInEligible(ballAt, RIM, true)) {'));
    expect(one).toMatch(/foeDunk\(ctx, PUTBACK_DUNK\)/);
    expect(three).toMatch(/giveBallTo\('me'\);[^\n]*\n\s*startDunk\(ctx, 'standing', [^\n]*PUTBACK_DUNK\);/);
  });
  it('3v3: a call for the ball on a cut at the rim is a lob, and my lob\'s catch is the dunk', () => {
    expect(three).toMatch(/const oop = oopCut\(me\.char\.root\.position, me\.drib\.vel, RIM_FLOOR\);\s*passType = oop \? 'lob' : 'chest';/);
    expect(three).toMatch(/if \(passType === 'lob' && passTargetId === 'me'\) \{[\s\S]{0,300}startDunk\(ctx, 'dunk', [^\n]*ALLEY_OOP\);/);
  });
});
