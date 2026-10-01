// MUSIC-SUITE P10 (2026-09-29): the chop editor's waveform in words (P5's open item: "the waveform is a canvas: arrow keys
// work, and a screen reader gets only its label"). The words are chopEdit.waveformSpeech (pure); the component wires them
// to the canvas (aria-describedby) and announces the selected pad politely. Rendered with the repo's no-DOM helper.
import { describe, expect, it } from 'vitest';
import { drive, findAll } from '@/tests/helpers/driveRender';
import Waveform, { type WaveformProps } from './Waveform';
import { waveformLiveLine, waveformSpeech, type Region } from '../chopEdit';

const RATE = 44100;
const regions: Region[] = [
  { pad: 1, start: 6615, end: 13230 },   // listed out of order on purpose: the words go in pad order
  { pad: 0, start: 0, end: 6615 },
  { pad: 4, start: 54428, end: 69120 },
];
const noop = (): void => undefined;
function props(o: Partial<WaveformProps> = {}): WaveformProps {
  return { mono: new Float32Array(RATE * 2), regions, selected: null, cursor: null, onSelect: noop, onCursor: noop, onEdge: noop, rate: RATE, ...o };
}

describe('waveformSpeech (pure)', () => {
  it('names every slice in pad order, with where it sits in seconds', () => {
    const s = waveformSpeech(regions, null, RATE, RATE * 2);
    expect(s.all).toBe('3 slices on 2.00 s of sound. Pad 1: 0.000 to 0.150 s. Pad 2: 0.150 to 0.300 s. Pad 5: 1.234 to 1.567 s.');
    expect(s.selected).toBe('No pad selected — tap a slice or a pad to select it.');
  });
  it('the selected pad: its start, end and length — what a nudge changes', () => {
    expect(waveformSpeech(regions, 4, RATE, RATE * 2).selected).toBe('Pad 5 selected: 1.234 s to 1.567 s, 333 ms.');
    const nudged = regions.map((r) => (r.pad === 4 ? { ...r, start: r.start + 221 } : r));   // → 5 ms later
    expect(waveformSpeech(nudged, 4, RATE, RATE * 2).selected).toBe('Pad 5 selected: 1.239 s to 1.567 s, 328 ms.');
  });
  it('nothing loaded says so; one slice is singular; a junk rate falls back to 44.1 kHz', () => {
    expect(waveformSpeech([], null, RATE, 0)).toEqual({ selected: 'No sound loaded.', all: 'No sound loaded.' });
    expect(waveformSpeech([{ pad: 0, start: 0, end: 4410 }], 0, Number.NaN, 44100).all).toBe('1 slice on 1.00 s of sound. Pad 1: 0.000 to 0.100 s.');
  });
});

describe('the Waveform describes its canvas', () => {
  it('the canvas is described by the two lines, the selected line is a polite live region, and both are rendered', () => {
    const { tree, html } = drive(() => Waveform(props({ selected: 1 })));
    const canvas = findAll(tree, (el) => el.props['data-qa'] === 'flip-waveform')[0];
    expect(canvas.props.role).toBe('application');
    const ids = String(canvas.props['aria-describedby']).split(' ');
    expect(ids).toHaveLength(2);
    const sel = findAll(tree, (el) => el.props['data-qa'] === 'flip-waveform-selected')[0];
    const all = findAll(tree, (el) => el.props['data-qa'] === 'flip-waveform-slices')[0];
    expect([sel.props.id, all.props.id]).toEqual(ids);
    expect(sel.props['aria-live']).toBe('polite');
    expect(html).toContain('Pad 2 selected: 0.150 s to 0.300 s, 150 ms.');
    expect(html).toContain('3 slices on 2.00 s of sound.');
  });
});

// MUSIC-SUITE P10 FIX (2026-09-29): the polite live region announced on EVERY pointermove of a drag (FlipPad rebuilds
// `regions` per move, so the selected pad's "… s to … s" changed each frame). It now speaks once, at the drag's end.
describe('a drag is announced once, at its end (waveformLiveLine)', () => {
  it('pure: held while dragging, the current line otherwise', () => {
    expect(waveformLiveLine('before', 'during', true)).toBe('before');
    expect(waveformLiveLine('before', 'after', false)).toBe('after');
  });
  it('a mouse drag of pad 2\'s start across four moves: the live text changes exactly once, after the release', () => {
    let cur: Region[] = regions.map((r) => ({ ...r }));
    const onEdge: WaveformProps['onEdge'] = (pad, edge, at) => { cur = cur.map((r) => (r.pad === pad ? { ...r, [edge]: at } : r)); };
    const seen: string[] = [];
    const target = { getBoundingClientRect: () => ({ left: 0, width: 600 }), setPointerCapture: noop, releasePointerCapture: noop };
    const ev = (x: number) => ({ pointerId: 7, pointerType: 'mouse', clientX: x, clientY: 10, currentTarget: target });
    const canvas = (t: unknown) => findAll(t as never, (el) => el.props['data-qa'] === 'flip-waveform')[0];
    // fullView at 600 px of 2.00 s: 147 samples a px, pad 2's start (6615) sits at x = 45
    drive(() => {
      const t = Waveform(props({ regions: cur, selected: 1, onEdge }));
      seen.push(String(findAll(t, (el) => el.props['data-qa'] === 'flip-waveform-selected')[0].props.children));
      return t;
    }, [
      (t) => { canvas(t).props.onPointerDown(ev(45)); canvas(t).props.onPointerMove(ev(55)); },          // the drag starts
      (t) => { for (const x of [60, 65, 75]) canvas(t).props.onPointerMove(ev(x)); canvas(t).props.onPointerUp(ev(75)); },
    ]);
    expect(cur.find((r) => r.pad === 1)!.start).toBe(6615 + 30 * 147);                                   // the cut did move
    expect(seen[0]).toBe('Pad 2 selected: 0.150 s to 0.300 s, 150 ms.');
    expect(seen[1]).toBe(seen[0]);                                                                         // mid-drag: held
    expect(seen[seen.length - 1]).toBe('Pad 2 selected: 0.250 s to 0.300 s, 50 ms.');                      // released: spoken
    expect(new Set(seen).size).toBe(2);
  });
});
