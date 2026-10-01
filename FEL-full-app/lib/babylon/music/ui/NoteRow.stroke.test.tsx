// MUSIC-SUITE P10 (2026-09-29): painting notes by dragging in the note row (P4's open item). The rule is pure
// (noteMath.noteStrokeEdits over gridMath's stroke); the component's press path is driven here with the repo's no-DOM
// helper; the drag itself (elementFromPoint across real cells, mouse and touch) is measured live on :3121 in
// musicsuite/p10/parked (scripts/probes/_music-p10-parked.mts).
import { afterEach, describe, expect, it } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import NoteRow, { type NoteRowProps } from './NoteRow';
import { gridLayout, strokeEnter, strokeStart } from './gridMath';
import { noteChoices, noteEditPatch, noteOfStep, noteStrokeEdits, noteStrokeEnter, noteWindows, windowOf, type NoteEdit } from './noteMath';
import { drive, findAll } from '@/tests/helpers/driveRender';
import { emptyKitTracks, withStep } from '../StudioProject';
import { DEFAULT_KEY } from '../scales';
import type { TrackState } from '../AudioEngine';

const Am = DEFAULT_KEY;
const bass0 = emptyKitTracks(Am).find((t) => t.sampleId === 'bass')!;
const withNote = (t: TrackState, step: number, midi: number): TrackState => withStep(t, step, { on: true, note: midi }, Am);
const win = (t: TrackState) => { const ws = noteWindows(t.sampleId, Am); return ws[windowOf(noteOfStep(t, -1, Am), ws)]; };
const choices = noteChoices('bass', Am, win(bass0));             // G2 … A1, high → low: [43, 41, 40, 38, 36, 35, 33]

describe('noteStrokeEdits (pure)', () => {
  it('the window is A1–G2 high to low (the fixture the strokes below use)', () => {
    expect(choices.map((c) => c.midi)).toEqual([43, 41, 40, 38, 36, 35, 33]);
  });
  it('PAINT: a diagonal drag writes a run down the scale, one note a step — the fast drag\'s skipped steps filled in', () => {
    // press on A1 (row 6) at step 0, then the pointer jumps to G2 (row 0) at step 6 in one event
    const s0 = strokeStart({ row: 6, step: 0 }, false);
    const s1 = strokeEnter(s0.stroke, { row: 0, step: 6 });
    const edits = noteStrokeEdits([...s0.paint, ...s1.paint], true, choices, bass0, Am);
    expect(edits).toEqual([
      { step: 0, midi: 33 }, { step: 1, midi: 35 }, { step: 2, midi: 36 }, { step: 3, midi: 38 },
      { step: 4, midi: 40 }, { step: 5, midi: 41 }, { step: 6, midi: 43 },
    ]);
    // applied the way the room applies them (withTrackStep → withStep): the row plays that line
    const after = edits.reduce((t, e) => withStep(t, e.step, noteEditPatch(e), Am), bass0);
    expect([0, 1, 2, 3, 4, 5, 6].map((s) => [after.pattern[s], noteOfStep(after, s, Am)])).toEqual(
      [[true, 33], [true, 35], [true, 36], [true, 38], [true, 40], [true, 41], [true, 43]]);
  });
  it('PAINT on a step that plays another note moves it to the note under the pointer (one note a step)', () => {
    const t = withNote(bass0, 2, 40);
    expect(noteStrokeEdits([{ row: 4, step: 2 }], true, choices, t, Am)).toEqual([{ step: 2, midi: 36 }]);
  });
  it('ERASE (the stroke began on a lit cell): a step goes off only where it plays the note under the pointer', () => {
    let t = bass0;
    for (const [s, m] of [[0, 36], [1, 36], [2, 40], [3, 36]] as const) t = withNote(t, s, m);
    // a flat drag along C2 (row 4) from step 0 to 3: steps 0, 1, 3 play C2 → off; step 2 plays E2 → untouched
    const edits = noteStrokeEdits([0, 1, 2, 3].map((step) => ({ row: 4, step })), false, choices, t, Am);
    expect(edits).toEqual([{ step: 0, midi: null }, { step: 1, midi: null }, { step: 3, midi: null }]);
    const after = edits.reduce((x, e) => withStep(x, e.step, noteEditPatch(e), Am), t);
    expect([0, 1, 2, 3].map((s) => after.pattern[s])).toEqual([false, false, true, false]);
  });
  it('a cell outside the window\'s choices, or a junk step, writes nothing', () => {
    expect(noteStrokeEdits([{ row: 9, step: 1 }, { row: 1, step: -1 }, { row: 1, step: 1.5 }], true, choices, bass0, Am)).toEqual([]);
  });
});

describe('NoteRow press path with onStroke', () => {
  function props(o: Partial<NoteRowProps> & { strokes?: [NoteEdit[], number][]; picks?: unknown[] } = {}): NoteRowProps {
    return {
      row: { id: 'bass', label: 'Bass', track: withNote(bass0, 0, 33) }, songKey: Am, layout: gridLayout(375), steps: [0, 1, 2, 3, 4, 5, 6, 7], playhead: -1,
      locked: false, onPick: (s, m) => o.picks?.push([s, m]), onStroke: (e, id) => o.strokes?.push([e, id]), onLocked: () => undefined, onClose: () => undefined, ...o,
    };
  }
  const cellOf = (tree: unknown, step: number, midi: number) => findAll(tree as never, (el) => el.props['data-qa'] === 'note-cell' && el.props['data-step'] === step && el.props['data-note'] === midi)[0];

  it('a mouse press on an unlit cell paints it at once (a stroke of one cell) — never through onPick', () => {
    const strokes: [NoteEdit[], number][] = [];
    const picks: unknown[] = [];
    const { tree } = drive(() => NoteRow(props({ strokes, picks })));
    cellOf(tree, 3, 36).props.onPointerDown({ button: 0, pointerId: 1, pointerType: 'mouse', clientX: 10, clientY: 10 });
    expect(strokes).toHaveLength(1);
    expect(strokes[0][0]).toEqual([{ step: 3, midi: 36 }]);
    expect(picks).toEqual([]);
  });
  it('a mouse press on the lit cell (step 0 plays A1) starts an ERASE stroke: it goes off', () => {
    const strokes: [NoteEdit[], number][] = [];
    const { tree } = drive(() => NoteRow(props({ strokes })));
    cellOf(tree, 0, 33).props.onPointerDown({ button: 0, pointerId: 2, pointerType: 'mouse', clientX: 10, clientY: 10 });
    expect(strokes[0][0]).toEqual([{ step: 0, midi: null }]);
  });
  it('two strokes get two numbers (two undo steps); a touch still writes only on a tap-lift, and a scroll writes nothing', () => {
    const strokes: [NoteEdit[], number][] = [];
    const { tree } = drive(() => NoteRow(props({ strokes })));
    const at = (x: number, y: number, id: number, type = 'touch') => ({ button: 0, pointerId: id, pointerType: type, clientX: x, clientY: y });
    cellOf(tree, 1, 38).props.onPointerDown(at(0, 0, 5, 'mouse'));
    cellOf(tree, 2, 38).props.onPointerDown(at(0, 0, 6, 'mouse'));
    expect(strokes).toHaveLength(2);
    expect(strokes[0][1]).not.toBe(strokes[1][1]);
    const c = cellOf(tree, 4, 40);
    c.props.onPointerDown(at(100, 400, 7));
    c.props.onPointerCancel(at(100, 160, 7));          // the browser took it as a scroll
    c.props.onPointerUp(at(100, 160, 7));
    expect(strokes).toHaveLength(2);
    c.props.onPointerDown(at(100, 400, 8));
    c.props.onPointerUp(at(103, 402, 8));              // a tap
    expect(strokes).toHaveLength(3);
    expect(strokes[2][0]).toEqual([{ step: 4, midi: 40 }]);
  });
  it('a locked row says why on a mouse press and writes nothing', () => {
    const strokes: [NoteEdit[], number][] = [];
    let said = 0;
    const { tree } = drive(() => NoteRow(props({ strokes, locked: true, onLocked: () => { said++; } })));
    cellOf(tree, 3, 36).props.onPointerDown({ button: 0, pointerId: 9, pointerType: 'mouse', clientX: 0, clientY: 0 });
    expect([strokes.length, said]).toEqual([0, 1]);
  });
});

// ── MUSIC-SUITE P10 FIX (2026-09-29): the drag paths, and "the last cell wins" on a return ──────────────────────────────
// The review: noteMath's header promised a vertical move inside one column moves that step's note (the last cell wins),
// but a stroke that came BACK to a cell it had visited emitted nothing (gridMath never re-paints a painted cell), and the
// drag itself (moveStroke, cellAt through document.elementFromPoint, a touch turning into a stroke) had no unit test —
// only the live probe frame. Below: the pure rule, then the component's pointermove path with elementFromPoint stubbed.
describe('noteStrokeEnter (pure): the last cell wins', () => {
  // choices high → low: row 0 = G2 (43) … row 6 = A1 (33), row 5 = B1 (35); "G1" in the review is the row below A1's
  // window, so here: press A1 (row 6), drag UP to B1 (row 5), then back DOWN to A1 — the same return, one window.
  const apply = (edits: NoteEdit[], t: TrackState) => edits.reduce((x, e) => withStep(x, e.step, noteEditPatch(e), Am), t);
  it('a return to a visited cell re-paints it: step 3 ends on the note under the pointer', () => {
    const s0 = strokeStart({ row: 6, step: 3 }, false);
    let rows = new Map([[3, 6]]);
    let t = apply(noteStrokeEdits(s0.paint, true, choices, bass0, Am), bass0);
    const up = noteStrokeEnter(s0.stroke, { row: 5, step: 3 }, rows);
    rows = up.rowOfStep;
    t = apply(noteStrokeEdits(up.paint, true, choices, t, Am), t);
    expect(noteOfStep(t, 3, Am)).toBe(35);
    const back = noteStrokeEnter(up.stroke, { row: 6, step: 3 }, rows);
    expect(back.paint).toEqual([{ row: 6, step: 3 }]);               // gridMath's strokeEnter alone gave []
    expect(strokeEnter(up.stroke, { row: 6, step: 3 }).paint).toEqual([]);
    t = apply(noteStrokeEdits(back.paint, true, choices, t, Am), t);
    expect([t.pattern[3], noteOfStep(t, 3, Am)]).toEqual([true, 33]);
  });
  it('resting on the cell the step already plays in this stroke re-paints nothing (no duplicate edits)', () => {
    const s0 = strokeStart({ row: 6, step: 3 }, false);
    const a = noteStrokeEnter(s0.stroke, { row: 6, step: 4 }, new Map([[3, 6]]));
    expect(a.paint).toEqual([{ row: 6, step: 4 }]);
    const b = noteStrokeEnter(a.stroke, { row: 6, step: 3 }, a.rowOfStep);   // back onto step 3, same note
    expect(b.paint).toEqual([]);
  });
  it('an ERASE stroke never re-paints (it only turns off the notes it is over)', () => {
    const s0 = strokeStart({ row: 6, step: 3 }, true);                        // began on a lit cell
    const a = noteStrokeEnter(s0.stroke, { row: 5, step: 3 }, new Map([[3, 6]]));
    const b = noteStrokeEnter(a.stroke, { row: 6, step: 3 }, a.rowOfStep);
    expect(b.paint).toEqual([]);
  });
});

describe('NoteRow drag (pointermove, elementFromPoint stubbed)', () => {
  type Cell = { step: number; midi: number } | null;
  let at: Cell = null;
  const g = globalThis as { document?: unknown };
  const hadDoc = 'document' in g;
  const prevDoc = g.document;
  afterEach(() => { if (hadDoc) g.document = prevDoc; else delete g.document; });
  /** document.elementFromPoint answers the note cell `at` names (whatever the point) — the test moves `at`. */
  function stubDom(): void {
    g.document = {
      elementFromPoint: () => (at ? { closest: () => ({ dataset: { note: String(at!.midi), step: String(at!.step) } }) } : null),
    };
  }
  /** The row's note-grid element (its ref is attached by hand: there is no DOM to mount it). */
  function gridOf(tree: ReactNode): ReactElement | null {
    if (Array.isArray(tree)) { for (const n of tree) { const f = gridOf(n); if (f) return f; } return null; }
    if (!isValidElement(tree)) return null;
    const p = tree.props as { 'data-qa'?: string; children?: ReactNode };
    if (p['data-qa'] === 'note-grid') return tree;
    return gridOf(p.children);
  }
  function mount(strokes: [NoteEdit[], number][], track = bass0) {
    stubDom();
    const { tree } = drive(() => NoteRow({
      row: { id: 'bass', label: 'Bass', track }, songKey: Am, layout: gridLayout(375), steps: [0, 1, 2, 3, 4, 5, 6, 7], playhead: -1,
      locked: false, onPick: () => undefined, onStroke: (e, id) => strokes.push([e, id]), onLocked: () => undefined, onClose: () => undefined,
    }));
    const grid = gridOf(tree)!;
    (grid as unknown as { ref: { current: unknown } }).ref.current = { contains: () => true };
    const move = (step: number, midi: number | null, pointerId: number, x = 0, y = 0) => {
      at = midi === null ? null : { step, midi };
      (grid.props as { onPointerMove: (e: unknown) => void }).onPointerMove({ pointerId, clientX: x, clientY: y });
    };
    return { tree, move };
  }
  const flat = (strokes: [NoteEdit[], number][]) => strokes.flatMap(([e]) => e);
  const cellOf = (tree: unknown, step: number, midi: number) => findAll(tree as never, (el) => el.props['data-qa'] === 'note-cell' && el.props['data-step'] === step && el.props['data-note'] === midi)[0];

  it('a mouse diagonal run: one stroke number, the skipped steps filled, one note a step', () => {
    const strokes: [NoteEdit[], number][] = [];
    const { tree, move } = mount(strokes);
    cellOf(tree, 0, 33).props.onPointerDown({ button: 0, pointerId: 21, pointerType: 'mouse', clientX: 0, clientY: 0 });
    move(1, 35, 21);
    move(4, 40, 21);                                                          // a fast jump: 2 and 3 filled in
    expect(flat(strokes)).toEqual([{ step: 0, midi: 33 }, { step: 1, midi: 35 }, { step: 2, midi: 36 }, { step: 3, midi: 38 }, { step: 4, midi: 40 }]);
    expect(new Set(strokes.map(([, id]) => id)).size).toBe(1);               // one undo step
  });
  it('a return to a visited cell re-paints it (the last cell wins), inside the same stroke', () => {
    const strokes: [NoteEdit[], number][] = [];
    const { tree, move } = mount(strokes);
    cellOf(tree, 3, 33).props.onPointerDown({ button: 0, pointerId: 22, pointerType: 'mouse', clientX: 0, clientY: 0 });
    move(3, 35, 22);                                                          // up to B1 in the same column
    move(3, 33, 22);                                                          // back down to A1
    const edits = flat(strokes);
    expect(edits).toEqual([{ step: 3, midi: 33 }, { step: 3, midi: 35 }, { step: 3, midi: 33 }]);
    const after = edits.reduce((t, e) => withStep(t, e.step, noteEditPatch(e), Am), bass0);
    expect(noteOfStep(after, 3, Am)).toBe(33);
    expect(new Set(strokes.map(([, id]) => id)).size).toBe(1);
  });
  it('a touch is pending until it moves SIDEWAYS into the next cell — then it is a stroke from its first cell', () => {
    const strokes: [NoteEdit[], number][] = [];
    const { tree, move } = mount(strokes);
    cellOf(tree, 2, 36).props.onPointerDown({ button: 0, pointerId: 23, pointerType: 'touch', clientX: 100, clientY: 100 });
    expect(strokes).toHaveLength(0);                                          // nothing yet: it may be a scroll or a tap
    move(2, 36, 23, 103, 101);                                                // still on its first cell: nothing
    expect(strokes).toHaveLength(0);
    move(3, 36, 23, 150, 101);                                                // sideways into step 3: a stroke
    expect(flat(strokes)).toEqual([{ step: 2, midi: 36 }, { step: 3, midi: 36 }]);
  });
  it('off the cells the line breaks: re-entering does not fill back to where the stroke was', () => {
    const strokes: [NoteEdit[], number][] = [];
    const { tree, move } = mount(strokes);
    cellOf(tree, 0, 36).props.onPointerDown({ button: 0, pointerId: 24, pointerType: 'mouse', clientX: 0, clientY: 0 });
    move(0, null, 24);                                                        // over no cell
    move(5, 36, 24);
    expect(flat(strokes)).toEqual([{ step: 0, midi: 36 }, { step: 5, midi: 36 }]);
  });
});
