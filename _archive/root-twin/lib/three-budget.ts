// Central performance budget for all 3D modes in Final Evolution Lab.
// HARD REQUIREMENT: target 60fps, acceptable floor 30fps on mid-tier mobile.
// These numbers gate what a scene is allowed to spend; the PerfHud flags violations live.

export const PERF_BUDGET = {
  targetFps: 60,
  floorFps: 30,
  // Per-frame GPU budget (whole scene)
  maxDrawCalls: 120,
  maxTriangles: 180_000,
  maxTextureMB: 48, // approximate GPU texture memory
  // Per skinned character
  maxCharTriangles: 30_000,
  maxCharBones: 60,
  // Device pixel ratio clamp — never render above 2x, scale down under load
  dprMin: 1,
  dprMax: 1.5,
} as const;

export type PerfSample = {
  fps: number;
  calls: number;
  triangles: number;
  textures: number;
  geometries: number;
  programs: number;
  frameMs: number;  // measured wall-clock frame period (ms)
  renderMs: number; // measured CPU cost of gl.render submit (ms); 0 if unmeasured
};

// HUD snapshot cadence: how often a 3D mode is allowed to push its HUD state
// into React (setState). useFrame runs at ~60Hz but re-rendering the DOM HUD
// every frame is wasteful; snapshot at 30Hz keeps bars/scores smooth while
// cutting React reconciliations of the overlay in half.
export const HUD_SNAPSHOT_INTERVAL = 1 / 30; // TUNE(elijah) — seconds between HUD setState pushes

// One frame's slice of the 60fps budget, in ms. Used to express render/logic
// cost as a % of the frame budget in the perf HUD.
export const FRAME_BUDGET_MS = 1000 / PERF_BUDGET.targetFps;

// Grade a live sample against the budget. Returns a status + human-readable notes.
export function gradePerf(s: PerfSample): { status: 'ok' | 'warn' | 'over'; notes: string[] } {
  const notes: string[] = [];
  let status: 'ok' | 'warn' | 'over' = 'ok';
  if (s.fps < PERF_BUDGET.floorFps) { status = 'over'; notes.push(`fps ${s.fps} < floor ${PERF_BUDGET.floorFps}`); }
  else if (s.fps < PERF_BUDGET.targetFps - 8) { status = 'warn'; notes.push(`fps ${s.fps} below target`); }
  if (s.calls > PERF_BUDGET.maxDrawCalls) { status = 'over'; notes.push(`draw calls ${s.calls} > ${PERF_BUDGET.maxDrawCalls}`); }
  if (s.triangles > PERF_BUDGET.maxTriangles) { status = 'over'; notes.push(`tris ${s.triangles} > ${PERF_BUDGET.maxTriangles}`); }
  // CPU render submit eating most of the frame budget is a red flag even if fps
  // is still holding (thanks to vsync headroom shrinking).
  if (s.renderMs > 0 && s.renderMs > FRAME_BUDGET_MS * 0.8) {
    if (status === 'ok') status = 'warn';
    notes.push(`render ${s.renderMs.toFixed(1)}ms of ${FRAME_BUDGET_MS.toFixed(1)}ms budget`);
  }
  return { status, notes };
}
