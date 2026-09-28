// MUSIC-SUITE P5 (2026-09-25), phone-mpc — FlipPad's pad-input bridge: the bank on the pads and ARM REC can be held by the
// ROOM (a paired phone's BANK A–D and REC work on every tab, so FLIP must show what the phone picked), and the two rules
// the room reuses for a phone hit on another tab — the row a hit goes to (padRowFor, pulled out of chopRow unchanged) and
// the step it lands on (tapStep, with the phone's own tap time). Driven with the repo's no-DOM helper, like
// FlipPad.p5.test.tsx; the live half (a real phone page over WebRTC) is scripts/probes/_music-p5-phone-mpc.mts.
import { describe, expect, it } from 'vitest';
import FlipPad, { padRowFor, tapStep, type FlipPadProps, type StepClock } from './FlipPad';
import { padsFromSlices, quantizeTap } from './Flip';
import { bankOf, emptyFlip, flipSampleId, withBank, type ProjectFlip, type ProjectFlipBank, type ProjectFlipSource } from './StudioProject';
import { rowLabel } from './chopEdit';
import { drive, findAll, textOf, type Found } from '@/tests/helpers/driveRender';

const fel = (id: string): ProjectFlipSource => ({ id, label: id, kind: 'fel', note: 'FEL', url: `/audio/flip/audio/${id}.mp3` });
const bank = (source: ProjectFlipSource, n = 4, rate?: number): ProjectFlipBank => ({
  source, slicing: 'grid', gridN: n, chops: padsFromSlices(Array.from({ length: n }, (_, i) => ({ start: i * 100, end: (i + 1) * 100 }))), ...(rate ? { rate } : {}),
});
const qa = (tree: unknown, id: string): Found[] => findAll(tree as never, (el) => el.props['data-qa'] === id);
const btn = (tree: unknown, re: RegExp): Found => {
  const hits = findAll(tree as never, (el) => el.type === 'button' && re.test(textOf(el.props.children)));
  if (hits.length !== 1) throw new Error(`expected one button ${re}, found ${hits.length}`);
  return hits[0];
};
function harness(flip0: ProjectFlip, extra: Partial<FlipPadProps> = {}) {
  const box = { flip: flip0, said: [] as string[], changes: 0 };
  const props = (): FlipPadProps => ({
    engine: null, playing: false, playhead: -1, steps: 16, flip: box.flip, projectId: 'prj_phone',
    onFlipChange: (fn) => { box.flip = fn(box.flip); box.changes++; },
    loadSource: () => new Promise(() => undefined), saveAudio: () => Promise.reject(new Error('no')),
    onAssign: () => undefined, onRecordHit: () => undefined, say: (m) => { box.said.push(m); },
    ...extra,
  });
  return { box, render: () => FlipPad(props()) as React.ReactElement };
}
const two = (): ProjectFlip => withBank(withBank(emptyFlip(), 0, bank(fel('theme_a_sunday_tape'))), 1, bank(fel('loop_bass_riff'), 6));

describe('the room holds the bank on the pads (a phone\'s BANK A–D, from any tab)', () => {
  it('FLIP opens on the bank the room says — the phone picked B on the STUDIO tab, FLIP shows B', () => {
    const h = harness(two(), { bank: 1, onBank: () => undefined });
    const { html, tree } = drive(h.render);
    expect(html).toContain('bank B · loop_bass_riff · 6 slices');
    expect(qa(tree, 'flip-bank-B')[0].props['aria-pressed']).toBe(true);
  });

  it('a bank chip on screen asks the room (onBank) — the room is the one place the bank lives', () => {
    const asked: number[] = [];
    const h = harness(two(), { bank: 0, onBank: (b) => { asked.push(b); } });
    const { tree } = drive(h.render);
    qa(tree, 'flip-bank-C')[0].props.onClick();
    qa(tree, 'flip-bank-A')[0].props.onClick();          // the bank already on the pads: nothing to ask
    expect(asked).toEqual([2]);
    expect(h.box.changes).toBe(0);                        // a view, not an edit — as before
  });

  it('without a room holding it FlipPad keeps its own bank, as the chop editor did', () => {
    const h = harness(two());
    const c = drive(h.render, [(t) => qa(t, 'flip-bank-B')[0].props.onClick()]);
    expect(c.html).toContain('bank B · loop_bass_riff');
  });
});

describe('the room holds ARM REC (a phone\'s REC, from any tab)', () => {
  it('shows the room\'s state, and the button asks the room to flip it', () => {
    const asked: boolean[] = [];
    const h = harness(two(), { recArm: true, onRecArm: (on) => { asked.push(on); } });
    const { tree } = drive(h.render);
    const b = btn(tree, /REC ARMED/);
    b.props.onClick();
    expect(asked).toEqual([false]);
    const off = drive(harness(two(), { recArm: false, onRecArm: (on) => { asked.push(on); } }).render);
    btn(off.tree, /^ARM REC$/).props.onClick();
    expect(asked).toEqual([false, true]);
  });
  it('without a room holding it the panel keeps its own ARM REC (off, then on)', () => {
    const h = harness(two());
    const on = drive(h.render, [(t) => btn(t, /^ARM REC$/).props.onClick()]);
    expect(btn(on.tree, /REC ARMED/)).toBeTruthy();
  });
});

describe('padRowFor: the row a hit goes to (chopRow, pulled out so the room builds the same one)', () => {
  // chopRow as it was before phone-mpc, verbatim, as the reference
  const before = (b: ProjectFlipBank, bk: number, i: number, slot: { slot: number } | null, liveRate?: number) => {
    const p = b.chops[i];
    if (!b.source || !p?.slice || !slot) return null;
    const rate = b.rate ?? liveRate;
    return {
      sampleId: flipSampleId(slot.slot), pad: slot.slot, label: rowLabel(slot.slot, bk, i), source: b.source, slice: p.slice, reverse: p.reverse, pitch: p.pitch, gate: p.gate,
      ...(rate ? { rate } : {}), ...(bk !== 0 || slot.slot !== i ? { origin: { bank: bk, pad: i } } : {}),
    };
  };
  it('matches the old rule for bank A on its own row, bank B on another row, rate from the bank or the decode, no slot', () => {
    const a = bank(fel('a'), 4, 44100), b = bank(fel('b'), 4);
    const cases: [ProjectFlipBank, number, number, { slot: number } | null, number | undefined][] = [
      [a, 0, 2, { slot: 2 }, undefined], [a, 0, 2, { slot: 5 }, 48000], [b, 1, 3, { slot: 3 }, 48000], [b, 1, 3, { slot: 9 }, undefined],
      [b, 0, 3, null, 48000], [b, 0, 12, { slot: 12 }, 48000], [{ ...b, source: null }, 0, 0, { slot: 0 }, 48000],
    ];
    for (const [bk, n, i, slot, live] of cases) expect(padRowFor(bk, n, i, slot, live), JSON.stringify([n, i, slot, live])).toEqual(before(bk, n, i, slot, live));
    expect(padRowFor(b, 1, 3, { slot: 9 }, 48000)).toMatchObject({ sampleId: 'flip_9', label: 'FLIP 10 · B4', origin: { bank: 1, pad: 3 }, rate: 48000 });
  });
});

describe('tapStep: the step ARM REC writes, at the tap\'s own time', () => {
  const clock: StepClock = { now: 2.0, latencySec: 0.03, stepSec: 0.125, startSec: 1, marks: Array.from({ length: 16 }, (_, i) => ({ step: i, time: 1 + i * 0.125 })) };
  it('a screen tap is placed at now − the player\'s delay (as FLIP\'s ARM REC did)', () => {
    expect(tapStep(clock, 16, false, -1)).toBe(7);                  // 1.970 → step 7 (1.875..2.000)
  });
  it('a phone tap is placed at ITS time (the arrival moved back by the network) − the player\'s delay', () => {
    expect(tapStep(clock, 16, false, -1, 2.04)).toBe(8);            // 2.010 → step 8
    expect(tapStep(clock, 16, true, -1, 1.93)).toBe(7);             // 1.900: nearest 1.875
  });
  it('no audio clock: the old playhead rule', () => {
    expect(tapStep(null, 16, true, 5)).toBe(quantizeTap(5, 16));
  });
});

describe('the bank a phone plays is the project\'s bank', () => {
  it('bankOf(flip, 1) is what FLIP shows on bank B (the room plays the same pads on another tab)', () => {
    const f = two();
    expect(bankOf(f, 1).source?.id).toBe('loop_bass_riff');
    expect(bankOf(f, 1).chops.filter((c) => c.slice)).toHaveLength(6);
  });
});
