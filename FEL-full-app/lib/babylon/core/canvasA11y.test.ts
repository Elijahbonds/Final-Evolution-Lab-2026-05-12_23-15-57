// SCREEN-FIXES (2026-11-10): every 3D stage's canvas is named and out of the Tab order (lib/babylon/core/canvasA11y.ts).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GAME_CANVAS_LABEL, quietCanvas } from './canvasA11y';

const ROOT = join(__dirname, '../../..');

/** The canvas surface quietCanvas touches, without a DOM. */
function fakeCanvas(attrs: Record<string, string> = {}) {
  const a = { ...attrs };
  return {
    tabIndex: -1,
    getAttribute: (k: string) => a[k] ?? null,
    setAttribute: (k: string, v: string) => { a[k] = v; },
    attrs: a,
  };
}

describe('quietCanvas', () => {
  it('names an unnamed canvas as a picture and takes it (and the engine that rewrites it) out of the Tab order', () => {
    const engine = { canvasTabIndex: 1 };   // Babylon's default
    const c = fakeCanvas();
    quietCanvas(engine, c as unknown as HTMLCanvasElement);
    expect(c.attrs['aria-label']).toBe(GAME_CANVAS_LABEL);
    expect(c.attrs.role).toBe('img');
    expect(engine.canvasTabIndex).toBe(-1);
    expect(c.tabIndex).toBe(-1);
  });

  it('keeps a label and a role the host already gave', () => {
    const c = fakeCanvas({ 'aria-label': 'Your athlete doing this exercise.', role: 'application' });
    quietCanvas({ canvasTabIndex: 1 }, c as unknown as HTMLCanvasElement, 'ignored');
    expect(c.attrs['aria-label']).toBe('Your athlete doing this exercise.');
    expect(c.attrs.role).toBe('application');
  });
});

/**
 * Every place a page mounts a Babylon engine. Babylon gives the canvas tabindex 1 from `engine.canvasTabIndex`, so each
 * must set it (through quietCanvas, or the motion lesson's own two lines with a non-positive index).
 * Not listed: app/dev/** (developer pages), lib/babylon/scenes/RigValidationScene.ts (the dev rig), and the Mirror's
 * overlay compositor (lib/babylon/nexus/neuro-mirror/render/overlay-compositor.ts: the mirror lanes' file; its canvas
 * attaches no input, so Babylon never writes the index there).
 */
const STAGES = [
  'lib/babylon/core/createEngine.ts',            // every game (ModeHarness → lookStack), Nexus Studio
  'lib/babylon/nexus/NexusWebScene.ts',          // the procedural map preview
  'components/library/exercise-stage.tsx',       // the library view, a session's exercise
  'components/profile-v2/athlete-3d.tsx',        // /profile
  'components/closet/avatar-preview.tsx',        // the 3D Studio stage
  'components/creator/editor/creator-preview.tsx',
  'components/create/art-preview-3d.tsx',
  'components/motion-lesson/motion-stage.tsx',   // the platform lane's, already done (index 0)
];

describe('every 3D stage sets the canvas tab index Babylon would otherwise make 1', () => {
  it.each(STAGES)('%s', (file) => {
    const src = readFileSync(join(ROOT, file), 'utf8');
    expect(src, 'mounts an engine').toMatch(/new (WebGPU)?Engine\(/);
    const quiet = /quietCanvas\(/.test(src);
    const own = /canvasTabIndex\s*=\s*(0|-1)\b/.test(src);
    expect(quiet || own, 'calls quietCanvas (or sets engine.canvasTabIndex to 0 or -1)').toBe(true);
  });
});
