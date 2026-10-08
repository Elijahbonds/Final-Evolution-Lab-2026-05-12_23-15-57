// dunk-next phase 2 — originality (docs/DUNK-NEXT.md). The night remembers who showed each element of a dunk first; a dunk is
// paid for what nobody has seen, copying the other dunker pays nothing (and a wholly copied dunk is SEEN IT), and only a made
// dunk shows the building anything.
import { describe, it, expect } from 'vitest';
import {
  NightMemory, dunkElements, originalityLine, freshTip, ELEMENT_WEIGHT, SHOWPIECE,
  FRESH_SHOW_STYLE, FRESH_TOUCH_STYLE, FRESH_STYLE_MAX, type DunkFacts,
} from './DunkOriginality';
import { DUNK_TRICKS } from './DunkSystem';

const tr = (id: string) => { const t = DUNK_TRICKS.find((x) => x.id === id)!; return { id: t.id, label: t.label }; };
const plain: DunkFacts = { tricks: [], runway: [], prop: null, foot: 'two', range: 'IN THE PAINT', side: 'HEAD-ON', hang: false };
const facts = (f: Partial<DunkFacts>): DunkFacts => ({ ...plain, ...f });

describe('a dunk, as the judges remember it', () => {
  it('its tricks, the chain they make, the runway, the prop, the launch, and the touches', () => {
    const els = dunkElements(facts({
      tricks: [tr('spin360'), tr('eastbay')], runway: ['KICK-UP'], prop: { id: 'car', label: 'THE CAR' }, launch: 'CORNER REBOUND → SPEED LAUNCH',
      foot: 'one', range: 'FROM THE STRIPE', side: 'BASELINE', hang: true,
    }));
    expect(els.map((e) => e.key)).toEqual([
      'trick:spin360', 'trick:eastbay', 'chain:spin360>eastbay', 'runway:kick-up', 'prop:car', 'launch:corner-rebound-speed-launch',
      'foot:one', 'range:from-the-stripe', 'side:baseline', 'hang',
    ]);
    expect(els.find((e) => e.kind === 'chain')!.label).toBe('360 → EASTBAY');
  });
  it('a chain is an ORDER: the same two the other way round is a different idea', () => {
    const a = dunkElements(facts({ tricks: [tr('spin360'), tr('eastbay')] })).find((e) => e.kind === 'chain')!.key;
    const b = dunkElements(facts({ tricks: [tr('eastbay'), tr('spin360')] })).find((e) => e.kind === 'chain')!.key;
    expect(a).not.toBe(b);
  });
  it('no prop is not a prop, and the same runway move twice is one idea', () => {
    expect(dunkElements(facts({ prop: { id: 'none', label: 'NO PROP' } })).some((e) => e.kind === 'prop')).toBe(false);
    expect(dunkElements(facts({ runway: ['KICK-UP', 'KICK-UP'] })).filter((e) => e.kind === 'runway')).toHaveLength(1);
  });
  it('the idea outweighs the detail', () => {
    for (const k of SHOWPIECE) for (const t of ['foot', 'range', 'side', 'hang'] as const) expect(ELEMENT_WEIGHT[k]).toBeGreaterThan(ELEMENT_WEIGHT[t]);
  });
});

describe('reading a dunk against the night', () => {
  it('the first dunk of the night is all fresh; the same dunk again is none', () => {
    const m = new NightMemory();
    const els = dunkElements(facts({ tricks: [tr('windmill')], prop: { id: 'car', label: 'THE CAR' } }));
    const first = m.read(els, 'player');
    expect(first.freshness01).toBe(1);
    expect(first.fresh).toHaveLength(els.length);
    m.show(els, 'player');
    const again = m.read(els, 'player');
    expect(again.freshness01).toBe(0); expect(again.style).toBe(0); expect(again.own).toHaveLength(els.length);
    expect(again.copiedWhole).toBe(false);   // your own repeat is the exact-repeat rule's business, not a copy
  });
  it('style: a fresh showpiece pays by its weight, a fresh touch a little, capped', () => {
    const m = new NightMemory();
    expect(m.read(dunkElements(plain), 'player').style).toBeCloseTo(3 * FRESH_TOUCH_STYLE);          // a plain dunk: three touches
    expect(m.read(dunkElements(facts({ tricks: [tr('windmill')] })), 'player').style)
      .toBeCloseTo(ELEMENT_WEIGHT.trick * FRESH_SHOW_STYLE + 3 * FRESH_TOUCH_STYLE);
    const big = dunkElements(facts({ tricks: [tr('spin360'), tr('eastbay'), tr('scorpion')], runway: ['KICK-UP'], prop: { id: 'car', label: 'THE CAR' }, hang: true }));
    expect(m.read(big, 'player').style).toBe(FRESH_STYLE_MAX);
  });
  it('a plain dunk is never worth more freshness than a dunk with an idea in it', () => {
    const m = new NightMemory();
    const p = m.read(dunkElements(plain), 'player').style;
    for (const t of DUNK_TRICKS) expect(m.read(dunkElements(facts({ tricks: [tr(t.id)] })), 'player').style).toBeGreaterThan(p);
  });
  it('the other dunker\'s idea is COPIED: no pay, and a dunk that is nothing but his is SEEN', () => {
    const m = new NightMemory();
    const his = dunkElements(facts({ tricks: [tr('windmill')], prop: { id: 'car', label: 'THE CAR' } }));
    m.show(his, 'rival');
    const mine = m.read(dunkElements(facts({ tricks: [tr('windmill')], prop: { id: 'car', label: 'THE CAR' }, foot: 'one', side: 'BASELINE' })), 'player');
    expect(mine.copied.map((e) => e.key)).toEqual(expect.arrayContaining(['trick:windmill', 'prop:car']));
    expect(mine.copiedWhole).toBe(true);
    expect(mine.style).toBeCloseTo(2 * FRESH_TOUCH_STYLE);   // only the new foot and side
    const mixed = m.read(dunkElements(facts({ tricks: [tr('windmill')], prop: { id: 'crate', label: 'THE CRATE' } })), 'player');
    expect(mixed.copiedWhole).toBe(false);                    // a new prop under his trick is a new idea
  });
  it('a plain dunk is never a copy (it has no showpiece to copy)', () => {
    const m = new NightMemory();
    m.show(dunkElements(plain), 'rival');
    expect(m.read(dunkElements(plain), 'player').copiedWhole).toBe(false);
  });
  it('reading remembers nothing; showing remembers who was FIRST and never hands it over', () => {
    const m = new NightMemory();
    const els = dunkElements(facts({ tricks: [tr('tap')] }));
    m.read(els, 'player'); m.read(els, 'rival');
    expect(m.size).toBe(0);
    m.show(els, 'rival'); m.show(els, 'player');
    expect(m.firstBy('trick:tap')).toBe('rival');
  });
  it('a new night forgets everything', () => {
    const m = new NightMemory();
    m.show(dunkElements(facts({ tricks: [tr('tap')] })), 'player');
    m.reset();
    expect(m.size).toBe(0);
    expect(m.read(dunkElements(facts({ tricks: [tr('tap')] })), 'player').freshness01).toBe(1);
  });
});

describe('the words', () => {
  it('names the fresh showpieces, or whose idea it was', () => {
    const m = new NightMemory();
    const els = dunkElements(facts({ tricks: [tr('spin360'), tr('eastbay')], prop: { id: 'car', label: 'THE CAR' } }));
    expect(originalityLine(m.read(els, 'player'), 'ZO')).toBe('FIRST TIME TONIGHT: 360 · EASTBAY');
    m.show(els, 'rival');
    expect(originalityLine(m.read(els, 'player'), 'ZO')).toBe('ZO DID THAT FIRST');
    const partly = dunkElements(facts({ tricks: [tr('spin360')], prop: { id: 'crate', label: 'THE CRATE' } }));
    expect(originalityLine(m.read(partly, 'player'), 'ZO')).toBe('FIRST TIME TONIGHT: THE CRATE');
    expect(originalityLine(m.read(dunkElements(plain), 'player'), 'ZO')).toBe('');
  });
  it('the standing tip counts the vocabulary the night has not seen', () => {
    const m = new NightMemory();
    expect(freshTip(m, DUNK_TRICKS)).toContain(`${DUNK_TRICKS.length} of ${DUNK_TRICKS.length}`);
    m.show(dunkElements(facts({ tricks: [tr(DUNK_TRICKS[0].id)] })), 'player');
    const tip = freshTip(m, DUNK_TRICKS);
    expect(tip).toContain(`${DUNK_TRICKS.length - 1} of ${DUNK_TRICKS.length}`);
    expect(tip).not.toContain(DUNK_TRICKS[0].label + ' ·');
    for (const t of DUNK_TRICKS) m.show(dunkElements(facts({ tricks: [tr(t.id)] })), 'rival');
    expect(freshTip(m, DUNK_TRICKS)).toMatch(/^EVERY TRICK HAS BEEN SHOWN/);
  });
});
