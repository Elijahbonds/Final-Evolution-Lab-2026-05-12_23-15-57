// DancePad.test.tsx — the component, pressed with no DOM (tests/helpers/driveRender: the component is called as a function inside
// a host render, so a handler runs for real). What this holds:
//   · TOUCH ≡ PAD. A touch on a button hands the bus the event a gamepad's face button hands it, and the same stream through the
//     room's input chain (tests/helpers/dancePressChain) yields the same judgements, score, combo and STYLE as the pad stream —
//     for the same timings, MATCH on and off, wrong buttons and held freezes included.
//   · one press, one release, once: a finger that slides off, a cancelled touch and a second lift never leave a verb down or
//     send it twice; the two thumbs are independent (multi-touch).
//   · what is drawn: four live buttons in MATCH, two in a song with MATCH off, the pick keys only on the pick screen.
import { describe, expect, it } from 'vitest';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { FelInput, InputBus } from '../../core/InputBus';
import { MISS_AFTER } from '../../core/DanceCore';
import { DancePad, PadKey, PickKey } from './DancePad';
import { DEFAULT_PAD_STATE, PAD_SLOTS, PICK_KEYS, padButtons, type DancePadMode, type DancePadState, type PadSlot } from './padModel';
import { drive, findAll } from '../../../../tests/helpers/driveRender';
import { runChain, sampleSteps, type TimedInput } from '../../../../tests/helpers/dancePressChain';

const state = (mode: DancePadMode, extra: Partial<DancePadState> = {}): DancePadState => ({ ...DEFAULT_PAD_STATE, mode, ...extra });
const fakeBus = () => { const events: FelInput[] = []; return { events, bus: { emit: (e: FelInput) => { events.push(e); } } as unknown as InputBus }; };
const down = (id = 1) => ({ pointerId: id, currentTarget: {} } as never);

/** A touch on one pad button, as the browser would deliver it: the element's own handlers, called for real. */
function keyHandlers(bus: InputBus, slot: PadSlot, mode: DancePadMode = 'match') {
  const btn = padButtons(state(mode)).find((b) => b.slot === slot)!;
  const { tree } = drive(() => PadKey({ bus, btn, w: 76, h: 56 }) as ReactElement);
  return tree.props as { onPointerDown: (e: never) => void; onPointerUp: () => void; onPointerCancel: () => void };
}

describe('DancePad: a touch is the event a pad sends', () => {
  it('press then lift on each button emits the face button down, then up, once each', () => {
    for (const slot of PAD_SLOTS) {
      const { events, bus } = fakeBus();
      const h = keyHandlers(bus, slot);
      h.onPointerDown(down());
      expect(events).toEqual([{ t: 'button', btn: slot, pressed: true }]);
      h.onPointerUp();
      expect(events).toEqual([{ t: 'button', btn: slot, pressed: true }, { t: 'button', btn: slot, pressed: false }]);
      h.onPointerUp();                                   // a second lift sends nothing
      expect(events).toHaveLength(2);
    }
  });

  it('a cancelled touch (the finger left the screen, the OS took the gesture) releases the verb, once', () => {
    const { events, bus } = fakeBus();
    const h = keyHandlers(bus, 'Y');
    h.onPointerDown(down());
    h.onPointerCancel();
    h.onPointerUp();
    expect(events.map((e) => (e as { pressed: boolean }).pressed)).toEqual([true, false]);
  });

  it('a second touch on a held button does not press it again (a freeze is one hold)', () => {
    const { events, bus } = fakeBus();
    const h = keyHandlers(bus, 'Y');
    h.onPointerDown(down(1));
    h.onPointerDown(down(2));
    expect(events).toHaveLength(1);
  });

  it('two thumbs are independent: holding one button never blocks or releases the other', () => {
    const { events, bus } = fakeBus();
    const a = keyHandlers(bus, 'A'), y = keyHandlers(bus, 'Y');
    a.onPointerDown(down(1));
    y.onPointerDown(down(2));
    a.onPointerUp();
    y.onPointerUp();
    expect(events).toEqual([
      { t: 'button', btn: 'A', pressed: true }, { t: 'button', btn: 'Y', pressed: true },
      { t: 'button', btn: 'A', pressed: false }, { t: 'button', btn: 'Y', pressed: false },
    ]);
  });

  it('the pick keys are the d-pad, pressed and released', () => {
    for (const k of PICK_KEYS) {
      const { events, bus } = fakeBus();
      const { tree } = drive(() => PickKey({ bus, k }) as ReactElement);
      const h = tree.props as { onPointerDown: (e: never) => void; onPointerUp: () => void };
      h.onPointerDown(down());
      h.onPointerUp();
      expect(events).toEqual([{ t: 'dpad', dir: k.dir, pressed: true }, { t: 'dpad', dir: k.dir, pressed: false }]);
    }
  });
});

describe('DancePad: what is drawn', () => {
  const html = (s: DancePadState) => renderToStaticMarkup(createElement(DancePad, {
    bus: fakeBus().bus, state: s, deck: 'portrait', fit: { lift: 0, left: 1, right: 1 },
    leftRef: { current: null }, rightRef: { current: null },
  }));
  const count = (m: string, re: RegExp) => (m.match(re) ?? []).length;

  it('MATCH: four live buttons, each named for its families, no pick keys', () => {
    const m = html(state('match'));
    expect(count(m, /data-pad-key="/g)).toBe(4);
    expect(count(m, /data-pick-key="/g)).toBe(0);
    expect(m).toContain('TOP ROCK'); expect(m).toContain('FOOTWORK'); expect(m).toContain('WAVE'); expect(m).toContain('FREEZE'); expect(m).toContain('HOLD');
    expect(m).toContain('data-dance-pad="match"');
  });
  it('a song with MATCH off: A and B are live, X and Y are empty sockets that cannot be pressed', () => {
    const m = html(state('any'));
    expect(count(m, /data-pad-key="/g)).toBe(2);
    expect(count(m, /data-pad-socket="/g)).toBe(2);
    expect(m).not.toMatch(/data-pad-socket="[A-Z]"[^>]*onPointerDown/);
  });
  it('the pick screen adds the song and level keys above the thumbs', () => {
    const m = html(state('pick', { matchOn: true }));
    expect(count(m, /data-pick-key="/g)).toBe(4);
    expect(m).toContain('MATCH ON');
    expect(m).toContain('START');
  });
  it('it is the touch deck: one overlay, marked so the shell and the probes find it where they always did', () => {
    expect(html(state('any'))).toContain('data-touch-deck');
  });
  it('the pairs sit in the bottom corners and the middle holds no control', () => {
    const { tree } = drive(() => DancePad({ bus: fakeBus().bus, state: state('match'), deck: 'portrait', fit: { lift: 0, left: 1, right: 1 }, leftRef: { current: null }, rightRef: { current: null } }) as ReactElement);
    const pairs = findAll(tree, (el) => el.props['data-pad-pair'] !== undefined);
    expect(pairs.map((p) => p.props['data-pad-pair']).sort()).toEqual(['left', 'right']);
    expect(findAll(tree, (el) => el.props['data-pad-pair'] === undefined && /pointer-events-auto/.test(String(el.props.className ?? '')))).toHaveLength(0);
  });
});

// ── the same stream through the room's judge ─────────────────────────────────────────────────────────────────────────

/** The events a touch makes for a list of (second, slot, hold seconds): through the component's own handlers. */
function touchStream(taps: { at: number; slot: PadSlot; hold?: number }[]): TimedInput[] {
  const out: TimedInput[] = [];
  for (const t of taps) {
    const events: FelInput[] = [];
    const bus = { emit: (e: FelInput) => events.push(e) } as unknown as InputBus;
    const h = keyHandlers(bus, t.slot);
    h.onPointerDown(down());
    out.push({ at: t.at, ev: events[0] });
    h.onPointerUp();
    out.push({ at: t.at + (t.hold ?? 0.08), ev: events[1] });
  }
  return out;
}
/** The same taps as a gamepad sends them: the literal canonical events (InputBus.ts pad poll and the keyboard's J K L I). */
function padStream(taps: { at: number; slot: PadSlot; hold?: number }[]): TimedInput[] {
  return taps.flatMap((t) => [
    { at: t.at, ev: { t: 'button', btn: t.slot, pressed: true } as FelInput },
    { at: t.at + (t.hold ?? 0.08), ev: { t: 'button', btn: t.slot, pressed: false } as FelInput },
  ]);
}

describe('touch and pad yield the same judgements for the same timings', () => {
  const steps = sampleSteps();               // 120 BPM: a beat is 0.5 s; A B X Y A X B at beats 0 4 12 16 20 24 28
  const bpm = 120;
  const T = (beat: number) => beat * 0.5;
  // right buttons at assorted offsets: PERFECT, GREAT, GOOD, and two that are too far (wild taps)
  const rightButtons: { at: number; slot: PadSlot }[] = [
    { at: T(0) + 0.0, slot: 'A' }, { at: T(4) + 0.06, slot: 'B' }, { at: T(12) - 0.15, slot: 'X' }, { at: T(16) + 0.02, slot: 'Y' },
    { at: T(20) + 0.35, slot: 'A' }, { at: T(24) - 0.01, slot: 'X' }, { at: T(28) + 0.03, slot: 'B' },
  ];
  // wrong buttons in MATCH (fumbles), and a spread of timings
  const wrongButtons: { at: number; slot: PadSlot }[] = [
    { at: T(0) + 0.01, slot: 'B' }, { at: T(4) + 0.0, slot: 'B' }, { at: T(12) + 0.02, slot: 'A' }, { at: T(16) - 0.03, slot: 'X' },
    { at: T(20) + 0.01, slot: 'A' }, { at: T(24) + 0.1, slot: 'Y' }, { at: T(28) + 0.0, slot: 'B' },
  ];
  const spam: { at: number; slot: PadSlot }[] = Array.from({ length: 24 }, (_, i) => ({ at: 0.1 + i * 0.37, slot: PAD_SLOTS[i % 4] }));
  const held: { at: number; slot: PadSlot; hold: number }[] = [
    { at: T(0), slot: 'A', hold: 1.9 }, { at: T(4) + 0.03, slot: 'B', hold: 0.2 }, { at: T(16) + 0.01, slot: 'Y', hold: 0.97 }, { at: T(28), slot: 'B', hold: 0.3 },
  ];

  const CASES: { name: string; taps: { at: number; slot: PadSlot; hold?: number }[] }[] = [
    { name: 'the right button on each step', taps: rightButtons },
    { name: 'wrong buttons (MATCH fumbles them)', taps: wrongButtons },
    { name: 'mashing all four', taps: spam },
    { name: 'held presses (a freeze held through its beats)', taps: held },
  ];
  for (const match of [false, true]) {
    for (const c of CASES) {
      it(`${c.name} · MATCH ${match ? 'on' : 'off'}`, () => {
        const run = (inputs: TimedInput[]) => runChain({ steps, bpm, match, inputs, endAt: T(40), styleBeats: [2, 10, 14, 18, 22] });
        const pad = run(padStream(c.taps)), touch = run(touchStream(c.taps));
        expect(touch).toEqual(pad);
      });
    }
  }

  it('the streams themselves are identical event for event (not only the verdicts)', () => {
    for (const c of CASES) expect(touchStream(c.taps)).toEqual(padStream(c.taps));
  });

  it('the equivalence is not vacuous: the cases judge PERFECT, GREAT, GOOD and MISS, fumble, and bank STYLE', () => {
    const on = runChain({ steps, bpm, match: true, inputs: padStream(rightButtons), endAt: T(40), styleBeats: [2, 10, 14, 18, 22] });
    expect(on.counts.PERFECT).toBeGreaterThan(0); expect(on.counts.GREAT).toBeGreaterThan(0); expect(on.counts.GOOD).toBeGreaterThan(0); expect(on.counts.MISS).toBeGreaterThan(0);
    const wrong = runChain({ steps, bpm, match: true, inputs: padStream(wrongButtons), endAt: T(40) });
    expect(wrong.wrongButton).toBeGreaterThan(0);
    const style = runChain({ steps, bpm, match: false, inputs: [{ at: T(2), ev: { t: 'button', btn: 'A', pressed: true } }], endAt: T(40), styleBeats: [2] });
    expect(style.style).toBeGreaterThan(0);
    expect(style.score).toBe(0);                     // STYLE never touches the score
    // MATCH is what X and Y are for: off, they are not taps at all
    const xy = runChain({ steps, bpm, match: false, inputs: padStream([{ at: T(12), slot: 'X' }, { at: T(16), slot: 'Y' }]), endAt: T(40) });
    expect(xy.ignored).toBeGreaterThan(0);
    expect(xy.labels.filter((l) => l !== 'MISS')).toHaveLength(0);
  });

  it('no timing the pad adds: the same press a hair inside and outside the old window judges the same for touch and pad', () => {
    for (const d of [-MISS_AFTER - 0.001, -MISS_AFTER + 0.001, -0.04, -0.0401, 0.09, 0.0901, MISS_AFTER - 0.001, MISS_AFTER + 0.001]) {
      const taps = [{ at: T(4) + d, slot: 'B' as PadSlot }];
      const a = runChain({ steps, bpm, match: true, inputs: padStream(taps), endAt: T(40) });
      const b = runChain({ steps, bpm, match: true, inputs: touchStream(taps), endAt: T(40) });
      expect(b, `offset ${d}`).toEqual(a);
    }
  });
});
