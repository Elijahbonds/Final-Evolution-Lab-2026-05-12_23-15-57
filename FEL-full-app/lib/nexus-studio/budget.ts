// THE BUDGET METER (docs/NEXUS-STUDIO.md §4.4): what the venue costs, live, against the phone and desktop ceilings
// (docs/VISUAL-PASS-PLAN.md A8) and the target mode's own measured row. Pure: the viewport hands it a sample read off the
// engine; this decides what the meter says.

import mobileBudget from '../babylon/config/mobileBudget.json';
import { DESKTOP_BUDGET, MOBILE_BUDGET } from '../babylon/core/PerfMonitor';

export interface BudgetSample {
  drawCalls: number;
  activeMeshes: number;
  textureMb: number;
  skinnedBodies: number;
  tier: 'mobile' | 'desktop' | 'high';
}

export type BudgetKey = 'drawCalls' | 'activeMeshes' | 'textureMb';
export const BUDGET_KEYS: readonly BudgetKey[] = ['drawCalls', 'activeMeshes', 'textureMb'];
export const BUDGET_LABEL: Record<BudgetKey, string> = { drawCalls: 'Draws', activeMeshes: 'Meshes', textureMb: 'Texture MB' };

export interface Ceilings { drawCalls: number; activeMeshes: number; textureMb: number }

type BudgetJson = { ceiling: Ceilings & { skinnedBodies: number }; modes: Record<string, { measured: Ceilings; budget: Ceilings }> };
const MB = mobileBudget as unknown as BudgetJson;

/** The phone ceiling (mobileBudget.json `ceiling`, which is PerfMonitor's MOBILE_BUDGET) and the desktop one. */
export const PHONE_CEILING: Ceilings = { drawCalls: MB.ceiling.drawCalls, activeMeshes: MB.ceiling.activeMeshes, textureMb: MB.ceiling.textureMb };
export const DESKTOP_CEILING: Ceilings = { drawCalls: DESKTOP_BUDGET.drawCalls, activeMeshes: DESKTOP_BUDGET.activeMeshes, textureMb: DESKTOP_BUDGET.textureMb };
export const PHONE_BODIES = MB.ceiling.skinnedBodies;
/** Held equal by budget.test.ts: the JSON's ceiling and PerfMonitor's mobile budget are one number. */
export const MOBILE_MONITOR: Ceilings = { drawCalls: MOBILE_BUDGET.drawCalls, activeMeshes: MOBILE_BUDGET.activeMeshes, textureMb: MOBILE_BUDGET.textureMb };

/** The target mode's phone row (its per-mode budget), when mobileBudget.json measured one. */
export function modeRow(key: string): { measured: Ceilings; budget: Ceilings } | null {
  return MB.modes[key] ?? null;
}

export type Level = 'ok' | 'near' | 'over';
/** Over the line is over; within 15 % of it is near. */
export function level(value: number, ceiling: number): Level {
  if (!(ceiling > 0)) return 'ok';
  if (value > ceiling) return 'over';
  return value >= ceiling * 0.85 ? 'near' : 'ok';
}

export interface MeterRow { key: BudgetKey; label: string; value: number; ceiling: number; share: number; level: Level }

/**
 * The rows the meter draws for a sample: measured on the sample's tier, against that tier's ceiling — a desktop sample
 * is not compared with the phone's ceiling (the phone draws a different scene: no fixtures, cards for a crowd, one shadow
 * map); the meter's Phone switch measures the phone scene instead.
 */
export function meterRows(s: BudgetSample): MeterRow[] {
  const c = s.tier === 'mobile' ? PHONE_CEILING : DESKTOP_CEILING;
  return BUDGET_KEYS.map((key) => {
    const value = Math.round(s[key]);
    return { key, label: BUDGET_LABEL[key], value, ceiling: c[key], share: c[key] > 0 ? value / c[key] : 0, level: level(value, c[key]) };
  });
}

/** The worst row's level: the meter's headline colour. */
export function worst(rows: readonly MeterRow[]): Level {
  return rows.some((r) => r.level === 'over') ? 'over' : rows.some((r) => r.level === 'near') ? 'near' : 'ok';
}

/** Texture memory as the capture rigs measure it: every texture in the engine's cache but the render targets, ×1.33 with mips. */
export function textureMb(cache: ReadonlyArray<{ source?: number; width: number; height: number; generateMipMaps?: boolean; isCube?: boolean; is3D?: boolean; depth?: number }>): number {
  const RT = new Set([5, 6, 12, 14]);   // InternalTextureSource: RenderTarget, MultiRenderTarget, Depth, DepthStencil
  let bytes = 0;
  for (const t of cache) {
    if (t.source !== undefined && RT.has(t.source)) continue;
    bytes += t.width * t.height * 4 * (t.generateMipMaps ? 1.33 : 1) * (t.isCube ? 6 : 1) * (t.is3D ? Math.max(1, t.depth ?? 1) : 1);
  }
  return bytes / 1048576;
}
