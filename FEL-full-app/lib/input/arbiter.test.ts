// MOVEMENT PLAY P3 (2026-09-24): the arbiter — the body and a hand on the same game at once (plan §3).
//
// Pure, so every rule is pinned without a bus: the per-axis stick, the trigger fold and its no-pad twin, the pulse
// rules against the bus's own held set, current() for the resume's resync, and reset(). The first test is Z1's
// foundation: while the body holds nothing the arbiter hands back the very event it was given.
import { describe, it, expect } from 'vitest';
import { BodyArbiter, AXIS_OWN, type HoldKey } from './arbiter';
import type { BodyOut, FelInput } from '@/lib/babylon/core/InputBus';

function arb(held: HoldKey[] = []) {
  const h = new Set<HoldKey>(held);
  return { a: new BodyArbiter((k) => h.has(k)), h };
}
const stickL = (x: number, y: number): FelInput => ({ t: 'stick', side: 'L', x, y });
const bodyL = (x: number, y: number): BodyOut => ({ t: 'stick', side: 'L', x, y, src: 'body' });
const trigR = (value: number): FelInput => ({ t: 'trigger', side: 'R', value });
const bodyR = (value: number): BodyOut => ({ t: 'trigger', side: 'R', value, src: 'body' });
const btn = (b: 'A' | 'B', pressed: boolean): BodyOut => ({ t: 'button', btn: b, pressed, src: 'body' });

describe('BodyArbiter — the body neutral', () => {
  it('hands back the very same event, for every kind, pad seated or not (Z1)', () => {
    const { a } = arb();
    const evs: FelInput[] = [
      stickL(0.3, -0.9), { t: 'stick', side: 'R', x: 1, y: 0 }, trigR(0.7), { t: 'trigger', side: 'L', value: 0 },
      { t: 'button', btn: 'A', pressed: true }, { t: 'button', btn: 'R1', pressed: false, src: 'key' },
      { t: 'dpad', dir: 'up', pressed: true, src: 'key' }, { t: 'dpad', dir: 'left', pressed: false },
    ];
    for (const seated of [false, true]) for (const e of evs) expect(a.external(e, seated)).toBe(e);
    expect(a.foldTrigger('R', 0.37)).toStrictEqual({ t: 'trigger', side: 'R', value: 0.37 });
    expect(Object.is(a.foldTrigger('L', -0).value, -0)).toBe(true);   // the pad's exact value, sign of zero included
  });
});

describe('BodyArbiter — the L stick, per axis', () => {
  it('a pad pushing y and a body leaning x both work; the external event keeps its own (untagged) source', () => {
    const { a } = arb();
    a.external(stickL(0, -1), true);
    expect(a.body(bodyL(0.6, 0), true)).toStrictEqual([{ t: 'stick', side: 'L', x: 0.6, y: -1, src: 'body' }]);
    const out = a.external(stickL(0.05, -0.8), true);
    expect(out).toStrictEqual({ t: 'stick', side: 'L', x: 0.6, y: -0.8 });
    expect('src' in out).toBe(false);
  });
  it(`a thumb past AXIS_OWN (${AXIS_OWN}) owns its axis; at or under it the body shows through`, () => {
    const { a } = arb();
    a.body(bodyL(0.6, 0), false);
    expect(a.external(stickL(0.25, 0), false)).toMatchObject({ x: 0.25 });
    expect(a.external(stickL(-0.21, 0), false)).toMatchObject({ x: -0.21 });
    expect(a.external(stickL(0.2, 0), false)).toMatchObject({ x: 0.6 });
    expect(a.external(stickL(-0.19, 0), false)).toMatchObject({ x: 0.6 });
  });
  it('the body comes back when the thumb leaves, and the thumb\'s own value when the body goes back to 0', () => {
    const { a } = arb();
    a.body(bodyL(0.6, 0), false);
    expect(a.external(stickL(0.9, 0), false)).toStrictEqual({ t: 'stick', side: 'L', x: 0.9, y: 0 });
    // the thumb back at rest delivers the lean: the body's value, so the body's event (never a hand's push to the READY
    // gate or the play evidence)
    expect(a.external(stickL(0, 0), false)).toStrictEqual({ t: 'stick', side: 'L', x: 0.6, y: 0, src: 'body' });
    expect(a.body(bodyL(0, 0), false)).toStrictEqual([{ t: 'stick', side: 'L', x: 0, y: 0, src: 'body' }]);
    const e = stickL(0.1, 0);
    expect(a.external(e, false)).toBe(e);               // neutral again: the very event
  });
  it('whose event: a hand that owns any axis owns its event; a hand that owns none delivers the body\'s', () => {
    const { a } = arb();
    a.body(bodyL(0.6, 0), false);
    expect(a.external(stickL(0.15, -0.2), false)).toStrictEqual({ t: 'stick', side: 'L', x: 0.6, y: -0.2, src: 'body' });
    expect(a.external(stickL(0.1, -0.35), false)).toStrictEqual({ t: 'stick', side: 'L', x: 0.6, y: -0.35 });   // owns y
    expect(a.external(stickL(-0.5, 0), false)).toStrictEqual({ t: 'stick', side: 'L', x: -0.5, y: 0 });        // owns x
  });
  it('a body change that changes nothing on the way out is silent', () => {
    const { a } = arb();
    a.external(stickL(0.9, -0.9), false);                // the thumb owns both axes
    expect(a.body(bodyL(0.6, 0), false)).toEqual([]);
    expect(a.body(bodyL(0.7, 0.1), false)).toEqual([]);
    expect(a.body(bodyL(0.7, 0.1), false)).toEqual([]);
  });
  it('the R stick is never the body\'s', () => {
    const { a } = arb();
    expect(a.body({ t: 'stick', side: 'R', x: 1, y: 0, src: 'body' }, false)).toEqual([]);
    a.body(bodyL(0.5, 0), false);
    const r: FelInput = { t: 'stick', side: 'R', x: 0.1, y: 0 };
    expect(a.external(r, false)).toBe(r);
  });
});

describe('BodyArbiter — triggers', () => {
  it('pad seated: the fold is the pad\'s own event while the body pulls no deeper, the body\'s (tagged) while it does; the body change waits for it', () => {
    const { a } = arb();
    expect(a.body(bodyR(0.6), true)).toEqual([]);
    expect(a.foldTrigger('R', 0)).toStrictEqual({ t: 'trigger', side: 'R', value: 0.6, src: 'body' });
    expect(a.foldTrigger('R', 1)).toStrictEqual({ t: 'trigger', side: 'R', value: 1 });
    expect(a.foldTrigger('R', 0.6)).toStrictEqual({ t: 'trigger', side: 'R', value: 0.6 });   // a tie is the hand's
    expect(a.foldTrigger('R', 0.3)).toStrictEqual({ t: 'trigger', side: 'R', value: 0.6, src: 'body' });
    expect(a.foldTrigger('L', 0.2)).toStrictEqual({ t: 'trigger', side: 'L', value: 0.2 });   // the other side: the pad's own
    a.body(bodyR(0), true);
    expect(a.foldTrigger('R', 0.37)).toStrictEqual({ t: 'trigger', side: 'R', value: 0.37 });
  });
  it('a folded frame is never taken for the external value: after the pad leaves, the body\'s release goes back to 0', () => {
    const { a } = arb();
    a.body(bodyR(0.6), true);
    expect(a.foldTrigger('R', 0).value).toBe(0.6);        // the one frame after the last pad left: 0.6, folded
    expect(a.body(bodyR(0), false)).toStrictEqual([{ t: 'trigger', side: 'R', value: 0, src: 'body' }]);
  });
  it('no pad: a body pull goes out on change as max(last external, body), and an external pull under it reads the deeper — as the body\'s', () => {
    const { a } = arb();
    const space = trigR(0.3);
    expect(a.external(space, false)).toBe(space);
    expect(a.body(bodyR(0.5), false)).toStrictEqual([{ t: 'trigger', side: 'R', value: 0.5, src: 'body' }]);
    expect(a.body(bodyR(0.5), false)).toEqual([]);
    expect(a.body(bodyR(0.2), false)).toStrictEqual([{ t: 'trigger', side: 'R', value: 0.3, src: 'body' }]);
    const deep = trigR(0.7);
    expect(a.external(deep, false)).toBe(deep);          // already the deeper: the hand's own event, unchanged
    // a touch hold of 0.1 under a 0.2 crouch delivers the crouch: the body's value, so the body's event
    expect(a.external(trigR(0.1), false)).toStrictEqual({ t: 'trigger', side: 'R', value: 0.2, src: 'body' });
    expect(a.body(bodyR(0), false)).toStrictEqual([{ t: 'trigger', side: 'R', value: 0.1, src: 'body' }]);
  });
  it('pad seated: a body press first flushes the trigger change it would overtake (the peak before the POP)', () => {
    const { a } = arb();
    a.foldTrigger('R', 0);                               // a pad frame at rest
    expect(a.body(bodyR(0.8), true)).toEqual([]);        // waits for the next pad frame…
    expect(a.body(btn('A', true), true)).toStrictEqual([   // …unless a press comes first
      { t: 'trigger', side: 'R', value: 0.8, src: 'body' }, btn('A', true),
    ]);
    expect(a.body(bodyR(0), true)).toEqual([]);          // the drop after the A rides the next pad frame
    expect(a.foldTrigger('R', 0)).toStrictEqual({ t: 'trigger', side: 'R', value: 0 });
    // nothing pending: a press goes out alone; the release flushes a change still waiting, then goes
    expect(a.body(btn('B', true), true)).toStrictEqual([btn('B', true)]);
    a.body(bodyR(0.4), true);
    expect(a.body(btn('B', false), true)).toStrictEqual([{ t: 'trigger', side: 'R', value: 0.4, src: 'body' }, btn('B', false)]);
    // no pad: nothing ever waits, so nothing is flushed
    const { a: b } = arb();
    b.body(bodyR(0.8), false);
    expect(b.body(btn('A', true), false)).toStrictEqual([btn('A', true)]);
  });
});

describe('BodyArbiter — buttons and the d-pad are pulses', () => {
  it('a pulse is delivered press and release', () => {
    const { a } = arb();
    expect(a.body(btn('A', true), false)).toStrictEqual([btn('A', true)]);
    expect(a.body(btn('A', false), false)).toStrictEqual([btn('A', false)]);
    const right = (pressed: boolean): BodyOut => ({ t: 'dpad', dir: 'right', pressed, src: 'body' });
    expect(a.body(right(true), false)).toStrictEqual([right(true)]);
    expect(a.body(right(false), false)).toStrictEqual([right(false)]);
  });
  it('a pulse is skipped while a pad or a key holds that button or direction — and its release with it', () => {
    const { a, h } = arb(['b:A', 'd:left']);
    expect(a.body(btn('A', true), false)).toEqual([]);
    h.delete('b:A');
    expect(a.body(btn('A', false), false)).toEqual([]);   // its press never went out: nor does its release
    const left = (pressed: boolean): BodyOut => ({ t: 'dpad', dir: 'left', pressed, src: 'body' });
    expect(a.body(left(true), false)).toEqual([]);
    expect(a.body(left(false), false)).toEqual([]);
    expect(a.body(btn('B', true), false)).toStrictEqual([btn('B', true)]);   // other buttons are free
  });
  it('a hold that began during the pulse keeps its release: the body\'s is dropped', () => {
    const { a, h } = arb();
    expect(a.body(btn('B', true), false)).toStrictEqual([btn('B', true)]);
    h.add('b:B');
    expect(a.body(btn('B', false), false)).toEqual([]);
    h.delete('b:B');
    expect(a.body(btn('B', true), false)).toStrictEqual([btn('B', true)]);
    expect(a.body(btn('B', false), false)).toStrictEqual([btn('B', false)]);
  });
});

describe('BodyArbiter — current() and reset()', () => {
  it('current(): the composed sticks and triggers, tagged where the body is part of the value', () => {
    const { a } = arb();
    a.external(stickL(0, -1), false);
    a.body(bodyL(0.5, 0), false);
    a.external({ t: 'stick', side: 'R', x: 0.3, y: 0.1 }, false);
    a.external({ t: 'trigger', side: 'L', value: 0.2 }, false);
    a.body(bodyR(0.6), false);
    expect(a.current()).toStrictEqual([
      { t: 'stick', side: 'L', x: 0.5, y: -1, src: 'body' },
      { t: 'stick', side: 'R', x: 0.3, y: 0.1 },
      { t: 'trigger', side: 'L', value: 0.2 },
      { t: 'trigger', side: 'R', value: 0.6, src: 'body' },
    ]);
    expect(arb().a.current()).toStrictEqual([
      { t: 'stick', side: 'L', x: 0, y: 0 }, { t: 'stick', side: 'R', x: 0, y: 0 },
      { t: 'trigger', side: 'L', value: 0 }, { t: 'trigger', side: 'R', value: 0 },
    ]);
    const { a: b } = arb();
    b.external({ t: 'trigger', side: 'R', value: 0.8 }, false);
    b.body(bodyR(0.6), false);
    expect(b.current()[3]).toStrictEqual({ t: 'trigger', side: 'R', value: 0.8 });   // a hand pulling deeper: the hand's
  });
  it('reset(): a pass-through again, with every pending pulse forgotten', () => {
    const { a } = arb();
    a.body(bodyL(0.6, 0), false);
    a.body(bodyR(0.6), true);
    a.body(btn('A', true), false);
    a.reset();
    const s = stickL(0.1, 0), t = trigR(0.2);
    expect(a.external(s, false)).toBe(s);
    expect(a.external(t, false)).toBe(t);
    expect(a.foldTrigger('R', 0.05)).toStrictEqual({ t: 'trigger', side: 'R', value: 0.05 });
    expect(a.body(btn('A', false), false)).toEqual([]);   // a release for a press from before is not sent
  });
});
