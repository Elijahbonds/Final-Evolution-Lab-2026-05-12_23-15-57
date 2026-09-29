// lib/babylon/music/ui/gridMath.ts — THE POCKET GRID'S RULES, pure: pages, cells, the drag-to-paint stroke, the step
// cursor, and where a transient line may float. StepGrid.tsx draws them; StudioMode applies them; the tests read them.
//
// MUSIC-SUITE P4 (2026-09-25), "Pocket studio + melody". What P1 measured (outbox musicsuite/BASELINE.md "Grid cell size"):
// the grid was one CSS grid of `90px repeat(16, 1fr)` at every width (StudioMode.tsx ~:866 then), so at 375 px a step cell
// was 16.5 × 16.5 px and the page was 418 px wide — 43 px of sideways scroll — while desktop cells were 69.4 px. A step
// was a click on a div (one cell per tap; no stroke), there was no cursor, and the room's 2.2 s toast was `position:
// sticky; bottom: 8` (StudioMode.tsx ~:876 then): on a phone it sat over the grid and the transport and took the taps
// meant for them (P3 REPORT "Not done").
//
// Now:
//   * PAGES. Under PHONE_MAX_PX (640) the grid shows ONE PAGE of 8 steps (two pages: 1–8, 9–16) with the row's name on
//     its own line above its cells, so eight cells share the width: ≥ 40 px at 375 px (gridLayout / cellSizePx — the
//     tests pin the arithmetic at 375 inside GameShell's 8 px gutter). Desktop keeps 16 columns and a name column.
//   * BEATS. Every 4 steps is a beat: its cells are shaded alternately and its first cell has a brighter left edge (beatShade, isBeatStart).
//   * THE STROKE. A pointer down on a cell decides the stroke's VALUE — an off cell paints ON, an on cell paints OFF — and
//     every cell the pointer enters after that gets that value (a cell already that value is left alone, and a cell is
//     painted once per stroke). A fast drag that skips cells fills the ones in between on the line it drew (strokeCells).
//     One stroke is one undo step (the room groups it).
//   * THE CURSOR. The arrow keys move a cursor over the drawn rows × 16 steps (clamped at the edges); the phone grid turns
//     to the cursor's page.
//   * THE LINE'S SPOT. A transient line floats at the top or the bottom of the screen, whichever band covers LESS of the
//     grid and the transport right now (toastSpot); it never takes a tap (pointer-events: none, StudioMode).

/** Below this viewport width (px) the grid is the phone grid: pages of 8. */
export const PHONE_MAX_PX = 640;
/** Steps on one phone page. */
export const PAGE_STEPS = 8;
/** The smallest step cell the phone grid is designed for (P4 target: ≥ 40 px at 375 px). */
export const MIN_CELL_PX = 40;
/**
 * The phone grid's gap between cells (px) and the room's side padding on a phone (px).
 * MUSIC-SUITE P4 FIX PASS (2026-09-25): PHONE_PAD_PX 8 → 4. At 360 px — the most common Android width — inside GameShell's
 * 8 px gutter (px-2, game-shell.tsx:517) the cells were (360 − 16 − 16 − 14) / 8 = 39.25 px, under the phase's ≥ 40 px (the
 * lane measured 43.1 px on /dev/music, which has no shell). With 4 px: 40.25 px at 360, 42.1 px at 375 (the tests pin both).
 */
export const PHONE_GAP_PX = 2;
export const PHONE_PAD_PX = 4;
/** Desktop: the name column (px) and the gap. */
export const DESKTOP_LABEL_PX = 112;
export const DESKTOP_GAP_PX = 3;

export interface GridLayout {
  /** The phone grid: pages of 8, the row name above its cells. */
  compact: boolean;
  /** Steps drawn at once. */
  pageSteps: number;
  pages: number;
  steps: number;
}

/** How the grid is laid out at this viewport width. */
export function gridLayout(viewportPx: number, steps = 16): GridLayout {
  const compact = Number.isFinite(viewportPx) && viewportPx > 0 && viewportPx < PHONE_MAX_PX;
  const pageSteps = compact ? Math.min(PAGE_STEPS, steps) : steps;
  return { compact, pageSteps, pages: Math.max(1, Math.ceil(steps / pageSteps)), steps };
}

/** A page number kept inside the layout. */
export function clampPage(page: number, layout: GridLayout): number {
  if (!Number.isFinite(page)) return 0;
  return Math.max(0, Math.min(layout.pages - 1, Math.floor(page)));
}

/** The page a step is on. */
export function pageOfStep(step: number, layout: GridLayout): number {
  return clampPage(Math.floor(Math.max(0, step) / layout.pageSteps), layout);
}

/** The steps a page draws, in order. */
export function stepsOnPage(page: number, layout: GridLayout): number[] {
  const p = clampPage(page, layout);
  const first = p * layout.pageSteps;
  const out: number[] = [];
  for (let s = first; s < Math.min(layout.steps, first + layout.pageSteps); s++) out.push(s);
  return out;
}

/** "1–8", "9–16", "1–16". */
export function pageLabel(page: number, layout: GridLayout): string {
  const s = stepsOnPage(page, layout);
  return s.length ? `${s[0] + 1}–${s[s.length - 1] + 1}` : '';
}

/**
 * A swipe on the step bar: far enough (≥ minPx) and mostly sideways (|dx| ≥ 1.5 |dy|) turns the page — right-to-left
 * (dx < 0) is the NEXT page, as on every phone. Anything else keeps the page.
 */
export function swipePage(page: number, dx: number, dy: number, layout: GridLayout, minPx = 40): number {
  if (!layout.compact || !Number.isFinite(dx) || !Number.isFinite(dy)) return clampPage(page, layout);
  if (Math.abs(dx) < minPx || Math.abs(dx) < 1.5 * Math.abs(dy)) return clampPage(page, layout);
  return clampPage(page + (dx < 0 ? 1 : -1), layout);
}

/**
 * A step cell's width (px) in a container this wide, as StepGrid lays it out: phone = `repeat(8, 1fr)` with a 2 px gap
 * (the name is on its own line); desktop = a 112 px name column then `repeat(16, 1fr)` with a 3 px gap.
 */
export function cellSizePx(containerPx: number, layout: GridLayout): number {
  const cols = layout.pageSteps;
  if (layout.compact) return (containerPx - PHONE_GAP_PX * (cols - 1)) / cols;
  return (containerPx - DESKTOP_LABEL_PX - DESKTOP_GAP_PX * cols) / cols;
}
/** The CSS grid template StepGrid uses for a row of cells (and the NoteRow under it, so their columns line up). */
export function gridTemplate(layout: GridLayout): { columns: string; gap: number } {
  return layout.compact
    ? { columns: `repeat(${layout.pageSteps}, minmax(0, 1fr))`, gap: PHONE_GAP_PX }
    : { columns: `${DESKTOP_LABEL_PX}px repeat(${layout.pageSteps}, minmax(0, 1fr))`, gap: DESKTOP_GAP_PX };
}

/** The phone grid's container at a viewport width, inside GameShell (px-2: 8 px a side) and the room's own padding. */
export function phoneContainerPx(viewportPx: number, shellGutterPx = 8): number {
  return viewportPx - 2 * shellGutterPx - 2 * PHONE_PAD_PX;
}

/**
 * MUSIC-SUITE P4 FIX PASS (2026-09-25): how far a finger may drift between down and up and still be a TAP (px) — the
 * NoteRow's touch rule (a scroll that starts on a note cell writes nothing).
 */
export const TAP_SLOP_PX = 10;
export function isTap(dx: number, dy: number, slop = TAP_SLOP_PX): boolean {
  return Number.isFinite(dx) && Number.isFinite(dy) && Math.hypot(dx, dy) <= slop;
}

/** 0 or 1: beats alternate their shade (steps 1–4 light, 5–8 dark, …). */
export function beatShade(step: number): 0 | 1 {
  return (Math.floor(step / 4) % 2) as 0 | 1;
}
/** The first step of a beat (drawn with a brighter left edge). */
export function isBeatStart(step: number): boolean { return step % 4 === 0; }

// ── the stroke ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** A cell by the row's index among the DRAWN rows and its step. */
export interface GridCell { row: number; step: number }
const cellKey = (c: GridCell): string => `${c.row}:${c.step}`;

export interface Stroke {
  /** What every cell of this stroke is set to: ON when it started on an off cell, OFF when it started on an on cell. */
  value: boolean;
  /** The cell the pointer is on. */
  at: GridCell;
  /** Cells already painted (each is painted once per stroke). */
  painted: ReadonlySet<string>;
  /** MUSIC-SUITE P4 FIX PASS: the pointer left the cells since `at` — the next cell entered starts a new line. */
  broken?: boolean;
}

/** MUSIC-SUITE P4 FIX PASS: the pointer is over no cell — the stroke goes on, but its line is broken (strokeEnter). */
export function strokeBreak(stroke: Stroke): Stroke {
  return stroke.broken ? stroke : { ...stroke, broken: true };
}

/** A pointer down on a cell: the stroke's value is the cell's opposite, and the cell itself is the first painted. */
export function strokeStart(cell: GridCell, cellOn: boolean): { stroke: Stroke; paint: GridCell[] } {
  return { stroke: { value: !cellOn, at: cell, painted: new Set([cellKey(cell)]) }, paint: [cell] };
}

/**
 * The cells on the line from `a` to `b` (both ends included), one per step of the longer axis — so a drag that jumped
 * from step 2 to step 6 in one pointer event still paints 3, 4 and 5 (a mouse moved fast; a phone sampling at 60 Hz).
 */
export function strokeCells(a: GridCell, b: GridCell): GridCell[] {
  const dr = b.row - a.row, ds = b.step - a.step;
  const n = Math.max(Math.abs(dr), Math.abs(ds));
  if (n === 0) return [{ ...a }];
  const out: GridCell[] = [];
  for (let i = 0; i <= n; i++) out.push({ row: Math.round(a.row + (dr * i) / n), step: Math.round(a.step + (ds * i) / n) });
  return out;
}

/**
 * The pointer entered `cell`: the cells to paint now (the line from where it was, minus any painted already).
 * MUSIC-SUITE P4 FIX PASS (2026-09-25): after a BREAK (strokeBreak: the pointer was over no cell — an open NoteRow, the
 * row names, outside the grid) the line is not filled back to where the stroke was: only the cell entered is painted, and
 * the line starts again from it. It filled the gap: bass step 3 → down over the NoteRow → lead step 11 painted bass 4–6 and
 * lead 7–11, cells the pointer never crossed.
 */
export function strokeEnter(stroke: Stroke, cell: GridCell): { stroke: Stroke; paint: GridCell[] } {
  if (cell.row === stroke.at.row && cell.step === stroke.at.step && !stroke.broken) return { stroke, paint: [] };
  const painted = new Set(stroke.painted);
  const paint: GridCell[] = [];
  for (const c of stroke.broken ? [cell] : strokeCells(stroke.at, cell)) {
    const k = cellKey(c);
    if (painted.has(k)) continue;
    painted.add(k);
    paint.push(c);
  }
  return { stroke: { value: stroke.value, at: cell, painted }, paint };
}

/**
 * A stroke over a grid of on/off rows, from start to finish: what the rows are afterwards. The pure model of what the
 * room does cell by cell (it writes each painted cell through StudioProject.withTrackStep) — the tests drive it. A null in
 * the path is the pointer over no cell (P4 FIX PASS: the line breaks there — strokeBreak).
 */
export function paintRows(rows: readonly (readonly boolean[])[], path: readonly (GridCell | null)[]): boolean[][] {
  const out = rows.map((r) => r.slice());
  const first = path[0];
  if (!first) return out;
  const at = (c: GridCell): boolean => out[c.row]?.[c.step] === true;
  const set = (cs: GridCell[], v: boolean): void => { for (const c of cs) if (out[c.row] && c.step >= 0 && c.step < out[c.row].length) out[c.row][c.step] = v; };
  let { stroke, paint } = strokeStart(first, at(first));
  set(paint, stroke.value);
  for (const c of path.slice(1)) {
    if (!c) { stroke = strokeBreak(stroke); continue; }
    ({ stroke, paint } = strokeEnter(stroke, c)); set(paint, stroke.value);
  }
  return out;
}

// ── the cursor ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** Move the cursor by rows / steps over `rows` drawn rows × `steps` steps, clamped at the edges (it does not wrap). */
export function moveCursor(at: GridCell | null, dRow: number, dStep: number, rows: number, steps: number, startStep = 0): GridCell | null {
  if (rows <= 0 || steps <= 0) return null;
  const from = at ?? { row: 0, step: Math.max(0, Math.min(steps - 1, startStep)) };
  if (!at) return from;   // the first arrow shows the cursor where it starts (the top row, the page's first step)
  return {
    row: Math.max(0, Math.min(rows - 1, from.row + dRow)),
    step: Math.max(0, Math.min(steps - 1, from.step + dStep)),
  };
}

// ── the transient line ─────────────────────────────────────────────────────────────────────────────────────────────

export interface Band { top: number; bottom: number }

/** How many px of `rects` a band covers (sum of vertical overlaps). */
export function bandOverlap(band: Band, rects: readonly Band[]): number {
  let n = 0;
  for (const r of rects) n += Math.max(0, Math.min(band.bottom, r.bottom) - Math.max(band.top, r.top));
  return n;
}

/**
 * Where a transient line goes: the top or the bottom band of a `viewportH` tall screen, whichever covers less of the
 * rects to keep clear (the grid, the transport — their getBoundingClientRect). A tie goes to the bottom (where it was).
 */
export function toastSpot(viewportH: number, keepClear: readonly Band[], toastH = 72, margin = 8): 'top' | 'bottom' {
  const top: Band = { top: 0, bottom: toastH + margin };
  const bottom: Band = { top: viewportH - toastH - margin, bottom: viewportH };
  return bandOverlap(top, keepClear) < bandOverlap(bottom, keepClear) ? 'top' : 'bottom';
}
