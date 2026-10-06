import { describe, expect, it } from 'vitest';
import {
  GUEST_SLAM_FACTORS, IDLE_TIP_AFTER_SEC, IDLE_TIP_EVERY_SEC, PROP_CATEGORY_ORDER, RUNWAY_TIPS,
  guestSlamFactor, idleTip, nextPropCategory, stepPropInCategory, trickInput, type PropCategory, type PropRing,
} from './DunkAssist';
import { DUNK_TRICKS } from './DunkSystem';

// a ring shaped like the dunk's: one plain, oops (one of them Orbit-only), lobs, obstacles, a special, the Dubble Up run
const ALL = ['none', 'alleyoop', 'oopglass', 'oopalien', 'selflob', 'offglass', 'car', 'barrier', 'crate', 'kangaroo', 'dubble1', 'dubble2', 'dubble3'] as const;
type P = (typeof ALL)[number];
const cat = (p: P): PropCategory => p === 'none' ? 'plain' : p.startsWith('oop') || p === 'alleyoop' ? 'oop' : p === 'selflob' || p === 'offglass' ? 'lob'
  : p === 'kangaroo' ? 'special' : p.startsWith('dubble') ? 'dubble' : 'obstacle';
const ring: PropRing<P> = { all: ALL, categoryOf: cat };
const all = () => true;

describe('the prop ring by category (X = the family, d-pad = inside it)', () => {
  it('X walks the families in order, one press each, and comes back round', () => {
    let p: P = 'none'; const seen: PropCategory[] = [];
    for (let i = 0; i < PROP_CATEGORY_ORDER.length; i++) { const r = nextPropCategory(p, ring, all); p = r.prop; seen.push(r.category); }
    expect(seen).toEqual(['oop', 'lob', 'obstacle', 'dubble', 'special', 'plain']);
    expect(p).toBe('none');
  });

  it('the crate and the kangaroo are a few presses away, not 10–20', () => {
    // X to OBSTACLES (3 presses from none), d-pad twice to the crate; X x5 from none reaches the specials
    let p: P = 'none'; for (let i = 0; i < 3; i++) p = nextPropCategory(p, ring, all).prop;
    expect(p).toBe('car');
    p = stepPropInCategory(p, ring, all); p = stepPropInCategory(p, ring, all);
    expect(p).toBe('crate');
    let q: P = 'none'; for (let i = 0; i < 5; i++) q = nextPropCategory(q, ring, all).prop;
    expect(q).toBe('kangaroo');
  });

  it('a family comes back on the prop last picked in it', () => {
    expect(nextPropCategory('selflob', ring, all, { obstacle: 'crate' }).prop).toBe('crate');
  });

  it('a locked family is passed over and named; a locked member is skipped inside its family', () => {
    const noSpecials = (p: P) => p !== 'kangaroo';
    const r = nextPropCategory('dubble2', ring, noSpecials);
    expect(r.category).toBe('plain');
    expect(r.passed).toEqual(['kangaroo']);
    const noAliens = (p: P) => p !== 'oopalien';
    expect(stepPropInCategory('oopglass', ring, noAliens)).toBe('alleyoop');   // wraps past the alien lob
    expect(nextPropCategory('none', ring, noAliens, { oop: 'oopalien' }).prop).toBe('alleyoop');   // a remembered locked pick is not reused
  });

  it('the d-pad stays inside the family, both ways, wrapping', () => {
    expect(stepPropInCategory('dubble3', ring, all)).toBe('dubble1');
    expect(stepPropInCategory('dubble1', ring, all, -1)).toBe('dubble3');
    expect(stepPropInCategory('none', ring, all)).toBe('none');
  });
});

describe("a guest's first jumps", () => {
  it('start wide and fade to exactly the tuned window by the third jump', () => {
    expect(guestSlamFactor(0)).toBe(GUEST_SLAM_FACTORS[0]);
    expect(guestSlamFactor(0)).toBeGreaterThan(guestSlamFactor(1));
    expect(guestSlamFactor(1)).toBeGreaterThan(1);
    expect(guestSlamFactor(2)).toBe(1);
    expect(guestSlamFactor(40)).toBe(1);
  });
  it('never widens past the TV-mode scale of help (a conservative first window)', () => {
    for (const f of GUEST_SLAM_FACTORS) { expect(f).toBeGreaterThan(1); expect(f).toBeLessThanOrEqual(1.5); }
  });
});

describe('the runway tips', () => {
  it('nothing until the player has stood a moment, then each tip in turn', () => {
    expect(idleTip(0)).toBeNull();
    expect(idleTip(IDLE_TIP_AFTER_SEC - 0.01)).toBeNull();
    const shown = new Set<string>();
    for (let t = IDLE_TIP_AFTER_SEC; t < IDLE_TIP_AFTER_SEC + IDLE_TIP_EVERY_SEC * RUNWAY_TIPS.length; t += IDLE_TIP_EVERY_SEC) shown.add(idleTip(t)!);
    expect(shown.size).toBe(RUNWAY_TIPS.length);
  });
  it('teach the controls the opening line leaves out: the prop, the call, the self-lob, the practice runway', () => {
    const text = RUNWAY_TIPS.join(' ');
    for (const k of ['X', 'D-PAD', 'L1', 'Y', 'R1']) expect(text).toContain(k);
  });
});

describe('the input for a called dunk', () => {
  it('names the direction and the button the trick table throws it with', () => {
    expect(trickInput({ dir: 'up', btn: 'A' })).toBe('D-PAD UP + A');
    for (const t of DUNK_TRICKS) expect(trickInput(t)).toMatch(new RegExp(`${t.dir.toUpperCase()} \\+ ${t.btn}$`));
  });
});
