// H2c (owner decision 3): the defenders' reactions are wired the same way in 1v1 and 3v3 — read off the modes' source (the reads
// themselves are core/DefenderReact.test.ts). A reaction moves a defender through his MOVER (never a root write), only a read that did
// not break him gets one (a break keeps reactToBreak's stumble and bite), and the jab's retreat is read before its stun is set.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const one = readFileSync('lib/babylon/modes/OneVOneMode.ts', 'utf8');
const three = readFileSync('lib/babylon/modes/ThreeVThreeMode.ts', 'utf8');
const after = (src: string, from: string, len = 900) => { const i = src.indexOf(from); expect(i, from).toBeGreaterThan(0); return src.slice(i, i + len); };

describe('the defenders react to the fakes (H2c)', () => {
  it('doMove: after reactToBreak, and only when the move did not break him — the lunge, the yoyo\'s shade, the hesi\'s stand-up', () => {
    for (const [name, src, react] of [['1v1', one, 'defReact('], ['3v3', three, 'defReactOn(foe, ']] as const) {
      const tail = after(src, name === '1v1' ? '    reactToBreak(ctx, outcome, biteDir, ' : '    reactToBreak(ctx, outcome, foe, move, biteDir, ', 800);
      expect(tail, name).toMatch(/if \(outcome\.broke === 'none'/);
      expect(tail, name).toContain(`if (lungesOn(move)) ${react}lungeFor(`);
      expect(tail, name).toContain(`else if (move === 'yoyo') ${react}shadeToward(`);
      expect(tail, name).toContain(`else if (move === 'hesi') ${react}standUpOn(`);
    }
  });
  it('the jab he bought: the retreat is read BEFORE the stun is set (it reads a live defender), and replaces the contact react', () => {
    const j1 = after(one, 'if (bought) {', 400), j3 = after(three, 'if (bought && nf) {', 400);
    expect(j1.indexOf('retreatFrom(defGeo())')).toBeLessThan(j1.indexOf('foeStunSec = Math.max(foeStunSec, 0.3)'));
    expect(j3.indexOf('retreatFrom(defGeoFor(nf))')).toBeLessThan(j3.indexOf('nf.stunSec = Math.max(nf.stunSec, 0.3)'));
    expect(j1).toMatch(/if \(rr\) defReact\(rr\); else foeAnimTree\.beat\('bball_contact_react'/);
    expect(j3).toMatch(/if \(rr\) defReactOn\(nf, rr\); else nf\.tree\.beat\('bball_contact_react'/);
  });
  it('the hesi bite plays the stand-up (its 0.45 s stun unchanged), once — not again when doMove\'s hesi already started it', () => {
    expect(one).toMatch(/foeStunSec = 0\.45;[\s\S]{0,200}if \(foeReact\?\.kind !== 'standup'\) foeAnimTree\.beat\('bball_def_standup'/);
    expect(three).toMatch(/f\.stunSec = 0\.45;[\s\S]{0,80}if \(f\.react\?\.kind !== 'standup'\) f\.tree\.beat\('bball_def_standup'/);
  });
  it('a reaction moves him through his mover (track on the reaction\'s wish), then steps; it is cleared on every reset', () => {
    expect(one).toMatch(/const foeMove = foeReacting \? foeMover\.track\(dt, reactionWish\(foeReact!\)\) : foeMover\.stepIntent\(/);
    expect(one).toMatch(/if \(foeReacting\) foeReact = stepReaction\(foeReact!, dt, foeVel\);/);
    expect(three).toMatch(/if \(f\.react\) f\.react = stepReaction\(f\.react, dt, vel\);/);
    expect((one.match(/victimSlide = null; foeReact = null;/g) ?? []).length).toBe(2);
    expect(three).toMatch(/b\.react = null; b\.layers\?\.reset\(\); \}/);
    for (const src of [one, three]) expect(src).not.toMatch(/react[^\n]{0,40}root\.position\.addInPlace/i);
  });
  it('the yoyo size-up reads the shade too (its other size-up steps read nothing)', () => {
    expect(one).toMatch(/if \(sizeUpMoveOf\(suClip\) === 'yoyo'\) defReact\(shadeToward\(defGeo\(\), su\.endHand\)\);/);
    expect(three).toMatch(/if \(sizeUpMoveOf\(suClip\) === 'yoyo'\) \{ const nfY = nearestLiveFoe\(\); if \(nfY\) defReactOn\(nfY, shadeToward\(defGeoFor\(nfY\), su\.endHand\)\); \}/);
  });
  it('plan 4f: a soft break\'s stumble beats when the ball crosses (readBeatMs of the started move); 3v3 slips and stumbles like 1v1 now', () => {
    expect(one).toContain("reactToBreak(ctx, outcome, biteDir, r.ball === 'started' ? readBeatMs(meCarry?.move) : 0);");
    expect(three).toContain("reactToBreak(ctx, outcome, foe, move, biteDir, r.ball === 'started' ? readBeatMs(carries.get(me)?.move) : 0);");
    expect(one).toMatch(/if \(readMs > 16\) later\(readMs, stumble\); else stumble\(\);/);
    expect(three).toMatch(/if \(readMs > 16\) later\(readMs, stumble\); else stumble\(\);/);
    const brk3 = after(three, '  function reactToBreak(', 2200);
    expect(brk3).toContain('foe.tree.beat(ANKLE_SLIP_CLIP, { settleTo:');
    expect(brk3).not.toContain('SPORT_CLIP.karateKnockdown');
    expect(brk3).not.toMatch(/foe\.tree\.beat\('bball_contact_react'\)/);
  });
  it('plan 4.21: the rival\'s step-back plays his own 0.30 s cut, not the hesitation', () => {
    expect(one).toMatch(/if \(dec\.phase === 'stepback' && !stepbackShown\) \{ stepbackShown = true; foeAnimTree\.beat\('bball_stepback_rival'/);
    for (const src of [one, three]) expect(src).not.toMatch(/beat\('bball_hesi'/);
  });
});
