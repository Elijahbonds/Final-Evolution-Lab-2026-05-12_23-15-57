// MUSIC-SUITE P6 (2026-09-25): PERFORM on screen (ui/PerformLanes.tsx) — the lanes draw a note only where the part hits, the
// pads tap on pointerdown (not the release), the band's dots, the flashes, and the recap's lanes, histogram and timing line.
// Rendered in node as plain functions (tests/helpers/driveRender).
import { describe, expect, it } from 'vitest';
import PerformLanes, { PerformRecap, type PerformLaneView } from './PerformLanes';
import { drive, findAll } from '@/tests/helpers/driveRender';
import {
  PERFORM_LANE_COLORS, PERFORM_LANE_LABELS, PerformSet, performBarCells, type PerformLane,
} from '../performSet';
import { PAD_LANE_LABELS, PERFORM_LANE_KEY_LABELS } from '../performInput';

// a bar of your song: kick on 1 and 3, the snare on 2 and 4, hats on every 16th (charted on the 8ths), a bass note
const rows: Record<string, number[]> = { kick: [0, 8], snare: [4, 12], hat: Array.from({ length: 16 }, (_, i) => i), bass: [3] };
const cells = performBarCells((s) => Object.entries(rows).filter(([, st]) => st.includes(s)).map(([id]) => id));
const view = (o: Partial<PerformLaneView> & { lane: PerformLane }): PerformLaneView => ({
  label: PERFORM_LANE_LABELS[o.lane], color: PERFORM_LANE_COLORS[o.lane], keys: PERFORM_LANE_KEY_LABELS[o.lane], pad: PAD_LANE_LABELS[o.lane],
  cells: cells[o.lane], inBand: o.lane === 0, flash: null, ...o,
});
const lanes = ([0, 1, 2, 3] as const).map((lane) => view({ lane }));

describe('PerformLanes', () => {
  it('four lanes, KICK · SNARE · HATS · FLIP; a note drawn ONLY where the part hits (hats on the 8ths: the cap)', () => {
    const { tree, html } = drive(() => PerformLanes({ lanes, playhead: 4, compact: false, onLane: () => undefined, live: true }));
    const on = (lane: number) => findAll(tree, (el) => el.props['data-qa'] === 'perform-cell' && el.props['data-lane'] === lane && el.props['data-on'] === '1').map((c) => c.props['data-step']);
    expect([on(0), on(1), on(2), on(3)]).toEqual([[0, 8], [4, 12], [0, 2, 4, 6, 8, 10, 12, 14], [3]]);
    expect(findAll(tree, (el) => el.props['data-qa'] === 'perform-cell')).toHaveLength(64);
    for (const l of PERFORM_LANE_LABELS) expect(html).toContain(l);
    expect(html).toContain('H ← · X / ←');                                             // each pad names its keys and pad buttons
    expect(html).toContain('outline:2px solid #fff');                                   // the playhead
  });

  it('the band\'s dot is lit only on the parts that play; a part not in yet draws its notes dimmed', () => {
    const { tree } = drive(() => PerformLanes({ lanes: lanes.map((l) => ({ ...l, inBand: l.lane === 0 || l.lane === 2 })), playhead: -1, compact: true, onLane: () => undefined, live: false }));
    expect(findAll(tree, (el) => el.props['data-qa'] === 'perform-lane-label').map((el) => el.props['data-band'])).toEqual(['1', '0', '1', '0']);
    const snareNote = findAll(tree, (el) => el.props['data-qa'] === 'perform-cell' && el.props['data-lane'] === 1 && el.props['data-on'] === '1')[0];
    expect(snareNote.props.style.opacity).toBe(0.55);
  });

  it('a pad (and a lane row) taps on POINTERDOWN; a keyboard click (detail 0) taps once; a real click after a press does not tap again', () => {
    const got: number[] = [];
    const { tree } = drive(() => PerformLanes({ lanes, playhead: -1, compact: false, onLane: (l) => got.push(l), live: true }));
    const pads = findAll(tree, (el) => el.props['data-qa'] === 'perform-pad');
    expect(pads.map((p) => p.props['data-lane'])).toEqual([0, 1, 2, 3]);
    pads[2].props.onPointerDown({ button: 0 });
    pads[2].props.onClick({ detail: 1 });                                               // the click that follows the press
    pads[1].props.onPointerDown({ button: 2 });                                         // a right button is not a tap
    pads[3].props.onClick({ detail: 0 });                                               // Enter on a focused pad
    findAll(tree, (el) => el.props['data-qa'] === 'perform-lane')[0].props.onPointerDown({ button: 0 });   // the KICK row
    expect(got).toEqual([2, 3, 0]);
    let prevented = 0;
    pads[0].props.onKeyDown({ key: 'Enter', repeat: true, preventDefault: () => { prevented++; } });
    expect(prevented).toBe(1);                                                          // a held Enter's repeats are cancelled
  });

  it('a lane\'s verdict flashes on its pad (a miss-like one in the warning colour)', () => {
    const { html } = drive(() => PerformLanes({ lanes: lanes.map((l) => ({ ...l, flash: l.lane === 1 ? 'WRONG LANE' : l.lane === 0 ? 'PERFECT' : null })), playhead: -1, compact: false, onLane: () => undefined, live: true }));
    expect(html).toContain('WRONG LANE');
    expect(html).toContain('PERFECT');
  });
});

describe('PerformRecap', () => {
  const set = new PerformSet({ arena: false });
  // a short set: kick on time, the snare 60 ms late, one hats note missed, one stray Flip tap
  set.step(0, 1.0, 0.9, [0]); set.tap(1.0, 0);
  set.step(4, 1.5, 1.4, [1]); set.tap(1.56, 1);
  set.step(8, 2.0, 1.9, [2]);
  set.step(12, 2.5, 2.4, []); set.tap(3.4, 3);
  const r = set.result(5);

  it('grade, accuracy, score, bars, best streak; each lane\'s accuracy; the histogram; the timing line', () => {
    const { tree, html } = drive(() => PerformRecap({ result: r, labels: PERFORM_LANE_LABELS, colors: PERFORM_LANE_COLORS }));
    expect(findAll(tree, (el) => el.props['data-qa'] === 'recap-grade').length).toBe(1);
    expect(html).toContain(`${Math.round(r.accuracy * 100)}%`);
    expect(html).toContain(`best streak x${r.maxCombo}`);
    const laneRows = findAll(tree, (el) => el.props['data-qa'] === 'recap-lane').map((el) => [el.props['data-lane'], el.props['data-acc']]);
    expect(laneRows).toEqual([[0, '1.000'], [1, '1.000'], [2, '0.000'], [3, '0.000']]);
    const bins = findAll(tree, (el) => el.props['data-qa'] === 'recap-hist-bin');
    expect(bins).toHaveLength(20);
    expect(bins.filter((b) => b.props['data-count'] > 0).map((b) => b.props['data-from'])).toEqual([0, 50]);   // 0 ms and +60 ms
    expect(html).toContain('you drag — 30 ms late on average');                        // (0 ms + 60 ms) / 2
  });

  it('an Arena recap says what the Arena checks; free play has a CLOSE', () => {
    const arena = drive(() => PerformRecap({ result: r, labels: PERFORM_LANE_LABELS, colors: PERFORM_LANE_COLORS, arenaLine: 'Judged on the house beat: 350 is the score the Arena checks.' }));
    expect(arena.html).toContain('data-qa="recap-arena"');
    expect(arena.html).not.toContain('CLOSE');
    const free = drive(() => PerformRecap({ result: r, labels: PERFORM_LANE_LABELS, colors: PERFORM_LANE_COLORS, onClose: () => undefined }));
    expect(free.html).toContain('CLOSE');
  });
});
