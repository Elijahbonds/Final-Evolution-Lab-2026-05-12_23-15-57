// SCREEN-FIXES (2026-11-10): a 3D stage's canvas, named and out of the Tab order.
//
// The every-screen scorecard (phase 2) found the Babylon canvas on every game screen with no accessible name (critical)
// and tabindex=1 (serious: a positive tabindex pulls it ahead of the whole page in the Tab order, WCAG 2.4.3). The 1 is
// Babylon's: `engine.canvasTabIndex` defaults to 1, and Babylon writes it onto the canvas when its input attaches and
// again on every pointer move (scene.inputManager), so setting the canvas's own tabIndex alone does not hold. The
// motion-lesson page's two lines (components/motion-lesson/motion-stage.tsx: an aria-label, and the engine's
// canvasTabIndex) are the pattern; here the index is -1, out of the Tab order, as the owner's brief asks for every 3D
// stage. A canvas with tabindex -1 still takes focus from a click or a tap, so a stage whose camera turns on the arrow
// keys keeps that for a pointer user; the games read their keys from the window, not the canvas.
//
// role="img" names it as a picture: a canvas has no role of its own, and a name on an element with no role is not
// announced reliably. A label the caller already set is kept.

/** The engine's one field this touches (AbstractEngine has it; a test passes a plain object). */
export interface TabIndexed { canvasTabIndex: number }

/** What a game canvas is called when its host gave it no name. */
export const GAME_CANVAS_LABEL = '3D game view';

export function quietCanvas(engine: TabIndexed, canvas: HTMLCanvasElement, label: string = GAME_CANVAS_LABEL): void {
  if (!canvas.getAttribute('aria-label')) canvas.setAttribute('aria-label', label);
  if (!canvas.getAttribute('role')) canvas.setAttribute('role', 'img');
  engine.canvasTabIndex = -1;
  canvas.tabIndex = -1;
}
