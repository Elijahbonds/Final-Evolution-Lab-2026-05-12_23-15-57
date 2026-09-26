// MUSIC-SUITE P4 (2026-09-25), grid-ui: the pocket studio's components, driven with the repo's no-DOM helpers
// (tests/helpers/driveRender.ts) — the real components, their real handlers. What a browser adds (pointer capture, the
// meters' animation frames, layout) is measured by scripts/probes/_music-p4-grid.mts.
import { describe, expect, it } from 'vitest';
import type React from 'react';
import StepGrid, { type StepGridProps, type StepGridRow } from './StepGrid';
import NoteRow, { type NoteRowProps } from './NoteRow';
import MixerPanel, { type MixerPanelProps } from './MixerStrip';
import { gridLayout } from './gridMath';
import { cellNoteLabel } from './noteMath';
import { button, drive, findAll } from '@/tests/helpers/driveRender';
import { emptyKitTracks, withStep } from '../StudioProject';
import { DEFAULT_KEY } from '../scales';
import type { TrackState } from '../AudioEngine';
import type { ChannelMix } from '../mixGraph';

const Am = DEFAULT_KEY;
const kit = emptyKitTracks(Am);
const lit = (t: TrackState, steps: number[]): TrackState => steps.reduce((x, s) => withStep(x, s, { on: true }, Am), t);
const row = (t: TrackState, o: Partial<StepGridRow> = {}): StepGridRow => ({
  id: t.sampleId, label: t.sampleId.toUpperCase(), track: t, pitched: t.sampleId === 'bass' || t.sampleId === 'lead',
  notes: t.pattern.map((_, i) => cellNoteLabel(t, i, Am)), ...o,
});
const cellsOf = (tree: React.ReactNode) => findAll(tree, (el) => el.props['data-qa'] === 'cell');

function gridProps(o: Partial<StepGridProps> & { painted?: unknown[]; toggled?: unknown[]; opened?: unknown[]; locked?: StepGridProps['locked']; lockedSaid?: number[] } = {}): StepGridProps {
  return {
    kit: [row(lit(kit[0], [0, 4, 9])), row(lit(kit.find((t) => t.sampleId === 'bass')!, [2]))], flip: [],
    layout: gridLayout(375), page: 0, onPage: () => undefined, playhead: -1, cursor: null, locked: null,
    onPaint: (cells, value, stroke) => o.painted?.push({ cells, value, stroke }), onLocked: () => o.lockedSaid?.push(1),
    onToggle: (r, s) => o.toggled?.push([r, s]), openNote: null, onOpenNote: (r) => o.opened?.push(r),
    ...o,
  };
}

describe('StepGrid', () => {
  it('the phone grid draws ONE page of 8 steps per row, with page buttons and the 16-step strip', () => {
    const { html, tree } = drive(() => StepGrid(gridProps()));
    const cells = cellsOf(tree);
    expect(cells).toHaveLength(2 * 8);
    expect(new Set(cells.map((c) => c.props['data-step']))).toEqual(new Set([0, 1, 2, 3, 4, 5, 6, 7]));
    expect(html).toContain('data-qa="grid-pager"');
    expect(findAll(tree, (el) => el.props['data-qa'] === 'grid-page').map((b) => b.props['data-page'])).toEqual([0, 1]);
    expect(html).toContain('data-qa="step-overview"');
  });

  it('page 2 draws steps 9–16; the page the playhead is on says ▶', () => {
    const { html, tree } = drive(() => StepGrid(gridProps({ page: 1, playhead: 3 })));
    expect(new Set(cellsOf(tree).map((c) => c.props['data-step']))).toEqual(new Set([8, 9, 10, 11, 12, 13, 14, 15]));
    expect(html).toContain('▶ 1–8');
    expect(findAll(tree, (el) => el.props['data-qa'] === 'cell' && el.props['data-on'] === '1').map((c) => c.props['data-step'])).toEqual([9]);
  });

  it('desktop draws all 16 steps and no pager', () => {
    const { html, tree } = drive(() => StepGrid(gridProps({ layout: gridLayout(1280) })));
    expect(cellsOf(tree)).toHaveLength(2 * 16);
    expect(html).not.toContain('data-qa="grid-pager"');
  });

  it('a lit pitched cell shows its note; a drum cell does not; beats are shaded', () => {
    const { tree } = drive(() => StepGrid(gridProps()));
    const bassOn = cellsOf(tree).find((c) => c.props['data-row'] === 'bass' && c.props['data-step'] === 2)!;
    expect(bassOn.props['aria-label']).toBe('BASS step 3 on A1');
    const kick0 = cellsOf(tree).find((c) => c.props['data-row'] === 'kick' && c.props['data-step'] === 0)!;
    expect(kick0.props['aria-label']).toBe('KICK step 1 on');
    expect(cellsOf(tree).filter((c) => c.props['data-row'] === 'kick').map((c) => c.props['data-beat']).join('')).toBe('00001111');
  });

  it('a MOUSE down on an off cell paints it ON at once (one stroke); the click that follows is not a second toggle', () => {
    const painted: { cells: unknown[]; value: boolean; stroke: number }[] = []; const toggled: unknown[] = [];
    const { tree } = drive(() => StepGrid(gridProps({ painted, toggled })));
    const c = cellsOf(tree).find((x) => x.props['data-row'] === 'kick' && x.props['data-step'] === 1)!;
    c.props.onPointerDown({ button: 0, pointerId: 1, pointerType: 'mouse' });
    expect(painted).toHaveLength(1);
    expect(painted[0]).toMatchObject({ cells: [{ row: 'kick', step: 1 }], value: true });
    c.props.onClick({ detail: 1 });                                    // the mouse's own click (detail ≥ 1)
    expect(toggled).toHaveLength(0);
  });

  it('P4 FIX PASS: a TOUCH tap\'s click (detail ≥ 1) never toggles — whenever it arrives (no timer races it now)', () => {
    const painted: unknown[] = []; const toggled: unknown[] = [];
    const { tree } = drive(() => StepGrid(gridProps({ painted, toggled })));
    const c = cellsOf(tree).find((x) => x.props['data-row'] === 'kick' && x.props['data-step'] === 6)!;
    c.props.onPointerDown({ button: 0, pointerId: 9, pointerType: 'touch' });
    expect(painted).toHaveLength(0);                                   // it may still be a scroll (the lift paints it)
    c.props.onClick({ detail: 1 });                                    // the tap's click — before or after the lift
    c.props.onClick({ detail: 1 });
    expect(toggled).toHaveLength(0);                                   // it lit and unlit the cell when a 0 ms timer won
  });

  it('P4 FIX PASS: a click with no pointer (detail 0: a script, Enter on an AT) is one toggle — on a locked grid it says why', () => {
    const toggled: unknown[] = []; const lockedSaid: number[] = [];
    const { tree } = drive(() => StepGrid(gridProps({ toggled })));
    cellsOf(tree).find((x) => x.props['data-row'] === 'kick' && x.props['data-step'] === 3)!.props.onClick({ detail: 0 });
    expect(toggled).toEqual([['kick', 3]]);
    const locked = drive(() => StepGrid(gridProps({ toggled, lockedSaid, locked: 'preview' })));
    cellsOf(locked.tree)[0].props.onClick({ detail: 0 });
    expect(toggled).toHaveLength(1);
    expect(lockedSaid).toHaveLength(1);
  });

  it('P4 FIX PASS: the grid shows keyboard focus (a ring and the room\'s cursor), not pointer focus', () => {
    let keyFocus = 0;
    const { tree } = drive(() => StepGrid(gridProps({ onKeyFocus: () => { keyFocus++; } })));
    const root = findAll(tree, (el) => el.props['data-qa'] === 'step-grid')[0];
    expect(root.props.tabIndex).toBe(0);
    const el = (visible: boolean) => ({ matches: (q: string) => q === ':focus-visible' && visible });
    const t1 = el(true);
    root.props.onFocus({ target: t1, currentTarget: t1 });
    expect(keyFocus).toBe(1);
    const t2 = el(false);
    root.props.onFocus({ target: t2, currentTarget: t2 });            // not focus-visible: no ring, no cursor
    expect(keyFocus).toBe(1);
    // a PRESS focuses it — even where the browser calls that focus visible (the last input was a key): no cursor
    root.props.onBlur({ target: t1, currentTarget: t1 });
    root.props.onPointerDownCapture();
    root.props.onFocus({ target: t1, currentTarget: t1 });
    expect(keyFocus).toBe(1);
    root.props.onBlur({ target: t1, currentTarget: t1 });              // blurred: the next Tab in is the keyboard's again
    root.props.onFocus({ target: t1, currentTarget: t1 });
    expect(keyFocus).toBe(2);
  });

  it('a down on an ON cell paints OFF', () => {
    const painted: { value: boolean }[] = [];
    const { tree } = drive(() => StepGrid(gridProps({ painted })));
    cellsOf(tree).find((x) => x.props['data-row'] === 'kick' && x.props['data-step'] === 4)!.props.onPointerDown({ button: 0, pointerId: 1, pointerType: 'mouse' });
    expect(painted[0].value).toBe(false);
  });

  it('a TOUCH down paints nothing yet (it may be a scroll); a click with no stroke toggles by row id', () => {
    const painted: unknown[] = []; const toggled: unknown[] = [];
    const { tree } = drive(() => StepGrid(gridProps({ painted, toggled })));
    cellsOf(tree).find((x) => x.props['data-row'] === 'kick' && x.props['data-step'] === 6)!.props.onPointerDown({ button: 0, pointerId: 7, pointerType: 'touch' });
    expect(painted).toHaveLength(0);
    // a script's element.click() on another cell (no pointer, detail 0): one toggle, by row id
    cellsOf(tree).find((x) => x.props['data-row'] === 'bass' && x.props['data-step'] === 5)!.props.onClick({ detail: 0 });
    expect(toggled).toEqual([['bass', 5]]);
  });

  it('a locked grid says why instead of painting', () => {
    const painted: unknown[] = []; const lockedSaid: number[] = [];
    const { tree } = drive(() => StepGrid(gridProps({ painted, lockedSaid, locked: 'song' })));
    cellsOf(tree)[0].props.onPointerDown({ button: 0, pointerId: 1, pointerType: 'mouse' });
    expect(painted).toHaveLength(0);
    expect(lockedSaid).toHaveLength(1);
  });

  it('a pitched row has ♪ (it opens its NoteRow); a silent row shows its M / S badge', () => {
    const opened: unknown[] = [];
    const { html, tree } = drive(() => StepGrid(gridProps({ opened, kit: [row(kit[0], { silent: 'mute' }), row(kit.find((t) => t.sampleId === 'bass')!)] })));
    expect(findAll(tree, (el) => el.props['data-qa'] === 'note-open').map((b) => b.props['data-row'])).toEqual(['bass']);
    button(tree, /NOTES/).props.onClick();
    expect(opened).toEqual(['bass']);
    expect(html).toContain('data-qa="row-silent"');
    expect(html).toMatch(/data-row="kick" data-silent="mute"/);
  });

  it('the open NoteRow is drawn under its row', () => {
    const { html } = drive(() => StepGrid(gridProps({ openNote: 'bass', renderNoteRow: (r) => <div data-qa="stub-note-row">{r.id}</div> })));
    expect(html).toContain('data-qa="note-row-slot"');
    expect(html).toContain('<div data-qa="stub-note-row">bass</div>');
  });
});

function noteProps(o: Partial<NoteRowProps> & { picks?: unknown[] } = {}): NoteRowProps {
  const bass = lit(kit.find((t) => t.sampleId === 'bass')!, [0]);
  return {
    row: { id: 'bass', label: 'Bass', track: bass }, songKey: Am, layout: gridLayout(375), steps: [0, 1, 2, 3, 4, 5, 6, 7], playhead: -1,
    locked: false, onPick: (s, m) => o.picks?.push([s, m]), onLocked: () => undefined, onClose: () => undefined, ...o,
  };
}

describe('NoteRow', () => {
  it('shows one octave of the key (A1–G2 on an A minor bass), the lit step on its note, and the octave switch', () => {
    const { html, tree } = drive(() => NoteRow(noteProps()));
    const notes = [...new Set(findAll(tree, (el) => el.props['data-qa'] === 'note-cell').map((c) => c.props['data-note']))];
    expect(notes).toEqual([43, 41, 40, 38, 36, 35, 33]);                    // G2 … A1, high → low
    expect(findAll(tree, (el) => el.props['data-qa'] === 'note-cell' && el.props['data-on'] === '1').map((c) => [c.props['data-step'], c.props['data-note']])).toEqual([[0, 33]]);
    expect(html).toContain('A minor · A1 – G2');
    expect(html).toContain('data-qa="note-oct-down"');
  });
  it('a tap picks the note for that step; ▼ OCT shows the window below', () => {
    const picks: unknown[] = [];
    const { tree } = drive(() => NoteRow(noteProps({ picks })));
    findAll(tree, (el) => el.props['data-qa'] === 'note-cell' && el.props['data-step'] === 3 && el.props['data-note'] === 36)[0].props.onPointerDown({ button: 0 });
    expect(picks).toEqual([[3, 36]]);
    const down = drive(() => NoteRow(noteProps()), [(t) => button(t, /▼ OCT/).props.onClick()]);
    expect([...new Set(findAll(down.tree, (el) => el.props['data-qa'] === 'note-cell').map((c) => c.props['data-note']))]).toEqual([31, 29, 28]);
  });
  it('P4 FIX PASS: a TOUCH picks on the lift, on the same cell — a scroll (pointercancel) or a drag picks nothing', () => {
    const picks: unknown[] = [];
    const { tree } = drive(() => NoteRow(noteProps({ picks })));
    const cell = findAll(tree, (el) => el.props['data-qa'] === 'note-cell' && el.props['data-step'] === 4 && el.props['data-note'] === 40)[0];
    const at = (x: number, y: number, id = 3) => ({ button: 0, pointerId: id, pointerType: 'touch', clientX: x, clientY: y });
    // the review's case: a finger scroll that starts on the note — the browser takes it (pan-y) and cancels the pointer
    cell.props.onPointerDown(at(100, 400));
    expect(picks).toHaveLength(0);
    cell.props.onPointerCancel(at(100, 160));
    cell.props.onPointerUp(at(100, 160));
    expect(picks).toHaveLength(0);
    // a drag that is not a tap (30 px sideways) picks nothing either
    cell.props.onPointerDown(at(100, 400));
    cell.props.onPointerUp(at(130, 400));
    expect(picks).toHaveLength(0);
    // a tap: one pick, on the lift
    cell.props.onPointerDown(at(100, 400));
    cell.props.onPointerUp(at(103, 402));
    expect(picks).toEqual([[4, 40]]);
    expect(cell.props.style.touchAction).toBe('pan-y');
    expect(cell.props.style.height).toBeGreaterThanOrEqual(40);         // the phone target (it was 30 px)
  });

  it('a Flip row shows the song’s scale on its chop (0 = as sliced)', () => {
    const flip: TrackState = { sampleId: 'flip_2', pattern: new Array(16).fill(false), volume: 0.9, muted: false, pan: 0 };
    const { html } = drive(() => NoteRow(noteProps({ row: { id: 'flip_2', label: 'FLIP 3', track: flip } })));
    expect(html).toContain('0 = as sliced');
    expect(html).toContain('+10');
  });
});

function mixerProps(o: Partial<MixerPanelProps> & { strips?: unknown[]; masters?: unknown[] } = {}): MixerPanelProps {
  return {
    rows: [{ id: 'kick', label: 'Kick' }, { id: 'bass', label: 'Bass' }], mixer: { master: 1, channels: { bass: { mute: true } as Partial<ChannelMix> } },
    engine: null, open: true, onOpen: () => undefined,
    onStrip: (id, patch, group) => o.strips?.push([id, patch, group]), onMaster: (v, g) => o.masters?.push([v, g]),
    compact: true, S: { btnAlt: {} }, ...o,
  };
}

describe('MixerPanel', () => {
  it('collapsed: only the MIXER toggle', () => {
    const { html } = drive(() => MixerPanel(mixerProps({ open: false })));
    expect(html).toContain('▸ MIXER');
    expect(html).not.toContain('data-qa="mixer-strip"');
  });
  it('open: the MASTER (meters, clip light, fader) and a strip per row with M / S and a meter', () => {
    const { html, tree } = drive(() => MixerPanel(mixerProps()));
    expect(html).toContain('data-qa="master-strip"');
    expect(findAll(tree, (el) => el.props['data-qa'] === 'mixer-strip').map((s) => [s.props['data-row'], s.props['data-mute']])).toEqual([['kick', '0'], ['bass', '1']]);
    // the meters are a child component: read the markup
    expect([...html.matchAll(/data-qa="clip-light" data-meter="([^"]+)"/g)].map((m) => m[1])).toEqual(['master:l', 'master:r', 'kick', 'bass']);
  });
  it('M and S patch the strip; a slider drag is grouped (one undo step)', () => {
    const strips: unknown[] = []; const masters: unknown[] = [];
    const { tree } = drive(() => MixerPanel(mixerProps({ strips, masters })));
    const mutes = findAll(tree, (el) => el.props['data-qa'] === 'strip-mute');
    mutes[1].props.onClick();                                            // bass is muted → unmute
    findAll(tree, (el) => el.props['data-qa'] === 'strip-solo')[0].props.onClick();
    findAll(tree, (el) => el.props['data-qa'] === 'master-fader')[0].props.onChange({ target: { value: '0.5' } });
    expect(strips).toEqual([['bass', { mute: false }, undefined], ['kick', { solo: true }, undefined]]);
    expect(masters).toEqual([[0.5, 'mix:master']]);
    // a strip's sliders open with its ▸ (VOL / PAN / ROOM / DELAY)
    const opened = drive(() => MixerPanel(mixerProps({ strips })), [(t) => findAll(t, (el) => el.props['data-qa'] === 'strip-expand')[0].props.onClick()]);
    for (const qa of ['strip-gain', 'strip-pan', 'strip-room', 'strip-delay']) expect(opened.html).toContain(`data-qa="${qa}"`);
    findAll(opened.tree, (el) => el.props['data-qa'] === 'strip-room')[0].props.onChange({ target: { value: '0.3' } });
    findAll(opened.tree, (el) => el.props['data-qa'] === 'strip-pan')[0].props.onChange({ target: { value: '0.02' } });   // snaps to centre
    expect(strips.slice(-2)).toEqual([['kick', { sendA: 0.3 }, 'mix:kick:sendA'], ['kick', { pan: 0 }, 'mix:kick:pan']]);
  });

  it('P4 FIX PASS: on the phone a vertical finger SCROLL over a fader moves nothing; a sideways drag moves it', () => {
    const masters: unknown[] = [];
    const { tree } = drive(() => MixerPanel(mixerProps({ masters })));
    const track = findAll(tree, (el) => el.props['data-qa'] === 'master-fader-track')[0];
    expect(track.props.style.touchAction).toBe('pan-y');
    expect(findAll(tree, (el) => el.props['data-qa'] === 'master-fader')[0].props.style.pointerEvents).toBe('none');
    const target = { getBoundingClientRect: () => ({ left: 100, width: 300 }), setPointerCapture: () => undefined };
    const ev = (x: number, y: number, pointerType = 'touch') => ({ button: 0, pointerId: 5, pointerType, clientX: x, clientY: y, currentTarget: target });
    // the review's gesture: down on the track, 200 px up — a scroll
    track.props.onPointerDown(ev(160, 600));
    track.props.onPointerMove(ev(161, 590));
    track.props.onPointerMove(ev(162, 400));
    track.props.onPointerCancel(ev(162, 400));
    expect(masters).toEqual([]);
    // a sideways drag: it follows the finger along the track (0 … 1.5 over 300 px)
    track.props.onPointerDown(ev(160, 600));
    track.props.onPointerMove(ev(250, 602));
    track.props.onPointerUp(ev(250, 602));
    expect(masters).toEqual([[0.75, 'mix:master']]);
    // a mouse drags at once (the input's own pointer events are off on the phone layout)
    track.props.onPointerDown(ev(400, 600, 'mouse'));
    expect(masters.at(-1)).toEqual([1.5, 'mix:master']);
  });

  it('P4 FIX PASS: M / S are 40 × 40 on the phone', () => {
    const { tree } = drive(() => MixerPanel(mixerProps()));
    const m = findAll(tree, (el) => el.props['data-qa'] === 'strip-mute')[0];
    expect(m.props.style.minHeight).toBeGreaterThanOrEqual(40);
    expect(m.props.style.minWidth).toBeGreaterThanOrEqual(40);
  });

  it('P4 FIX PASS (decision #4): below THE STUDIO the desk is mute / solo and the meters — no faders, and it says where they open', () => {
    const strips: unknown[] = [];
    const { html, tree } = drive(() => MixerPanel(mixerProps({ strips, full: false, fullNeeds: 'save 2 sections and chain them' })));
    expect(html).toContain('▾ MIXER · mute / solo');
    expect(html).toContain('open at THE STUDIO — save 2 sections and chain them');
    expect(html).not.toContain('data-qa="master-fader"');
    expect(findAll(tree, (el) => el.props['data-qa'] === 'strip-expand')).toHaveLength(0);
    findAll(tree, (el) => el.props['data-qa'] === 'strip-solo')[0].props.onClick();
    expect(strips).toEqual([['kick', { solo: true }, undefined]]);
    expect([...html.matchAll(/data-qa="clip-light" data-meter="([^"]+)"/g)].map((x) => x[1])).toEqual(['master:l', 'master:r', 'kick', 'bass']);
  });
});
