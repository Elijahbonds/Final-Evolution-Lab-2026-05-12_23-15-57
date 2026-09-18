/**
 * FEL Unified Controller Map (M14-P3)
 * ───────────────────────────────────
 * PURE, framework-free description of the FEL controller topology plus the
 * helpers that both the live input path (PhysicalGamepadPoller, VirtualController)
 * and the headless test suite import. This is the single source of truth for:
 *
 *   • the 2K/Xbox-standard physical button index layout,
 *   • how a mode's shoulder config (single `trigger` OR a `triggers[]` array)
 *     normalizes into explicit L1 / R1 / L2 / R2 slots,
 *   • how a right-stick (look) axis pair converts into directional key presses,
 *   • analog dead-zone + 8-way stick→direction reconciliation.
 *
 * DESIGN RULE (never fork input): every consumer funnels through THIS module so
 * keyboard, on-screen touch pad and physical gamepad stay identical across all
 * 20+ modes. Modes remain thin skins — they only declare a VCScheme.
 *
 * This is an ORIGINAL controller design for FEL. It is NOT an emulator and does
 * not replicate any console/BIOS/system software.
 */

import type { VCScheme, VCTrigger, VCDir } from '@/lib/input-schemes';

/**
 * Standard gamepad button indices (W3C Standard Gamepad / Xbox / 2K layout).
 * Face buttons a/b/x/y map to 0..3 exactly as the existing poller assumed, so
 * this is a strict superset of prior behaviour.
 */
export const PAD_INDEX = {
  a: 0,
  b: 1,
  x: 2,
  y: 3,
  l1: 4,
  r1: 5,
  l2: 6,
  r2: 7,
  select: 8,
  start: 9,
  ls: 10, // left-stick click
  rs: 11, // right-stick click
  dpadUp: 12,
  dpadDown: 13,
  dpadLeft: 14,
  dpadRight: 15,
} as const;

/** Left-stick axis indices (movement) and right-stick axis indices (look/camera). */
export const AXIS_INDEX = {
  leftX: 0,
  leftY: 1,
  rightX: 2,
  rightY: 3,
} as const;

export type ShoulderSlot = 'l1' | 'r1' | 'l2' | 'r2';
export const SHOULDER_SLOTS: ShoulderSlot[] = ['l1', 'r1', 'l2', 'r2'];

/** Physical button index that drives each shoulder slot. */
export const SHOULDER_PAD_INDEX: Record<ShoulderSlot, number> = {
  l1: PAD_INDEX.l1,
  r1: PAD_INDEX.r1,
  l2: PAD_INDEX.l2,
  r2: PAD_INDEX.r2,
};

export type ResolvedShoulders = Partial<Record<ShoulderSlot, VCTrigger>>;

/**
 * Normalize a scheme's `triggers[]` array into explicit L1/R1/L2/R2 slots.
 *
 * Resolution priority:
 *   1. an explicit `trigger.slot` wins,
 *   2. otherwise triggers fill unused slots positionally in L1,R1,L2,R2 order.
 *
 * NOTE: the legacy single `scheme.trigger` (e.g. karate BLOCK) is intentionally
 * NOT folded in here — the poller/VirtualController keep their existing dedicated
 * single-trigger path for exact backward compatibility. This helper only governs
 * the multi-shoulder `triggers[]` array (board spins, tennis lob/topspin, …).
 */
export function resolveShoulders(scheme: Pick<VCScheme, 'triggers'>): ResolvedShoulders {
  const out: ResolvedShoulders = {};
  const list = scheme.triggers;
  if (!list || list.length === 0) return out;

  // Pass 1: honour any explicit slot.
  const positional: VCTrigger[] = [];
  for (const t of list) {
    const slot = (t as VCTrigger & { slot?: ShoulderSlot }).slot;
    if (slot && !out[slot]) out[slot] = t;
    else positional.push(t);
  }
  // Pass 2: fill remaining triggers into the first free slots, L1,R1,L2,R2.
  for (const t of positional) {
    const free = SHOULDER_SLOTS.find((s) => !out[s]);
    if (!free) break; // more than 4 shoulders is unsupported; drop the rest loudly upstream
    out[free] = t;
  }
  return out;
}

/** How many shoulders a scheme declares via the multi-trigger array. */
export function shoulderCount(scheme: Pick<VCScheme, 'triggers'>): number {
  return Object.keys(resolveShoulders(scheme)).length;
}

/** The right-stick (look/camera) key mapping for a mode, or null when it has none. */
export function resolveLook(scheme: Pick<VCScheme, 'look'>): VCDir | null {
  const look = scheme.look;
  if (!look) return null;
  if (!look.up && !look.down && !look.left && !look.right) return null;
  return look;
}

/** Default analog dead-zone for sticks (fraction of full deflection). */
export const STICK_DEADZONE = 0.28; // TUNE(elijah)

/**
 * Rescale a single analog axis through a radial dead-zone so the usable range
 * maps smoothly to [0,1] beyond the dead-zone. Returns 0 inside the dead-zone.
 * Result is clamped to [-1, 1].
 */
export function applyDeadzone(v: number, dz: number = STICK_DEADZONE): number {
  if (!Number.isFinite(v)) return 0;
  const a = Math.abs(v);
  if (a <= dz) return 0;
  const sign = v < 0 ? -1 : 1;
  const scaled = (a - dz) / (1 - dz);
  return sign * Math.max(0, Math.min(1, scaled));
}

export interface StickDirs {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

/**
 * Convert a stick position into 8-way directional booleans (diagonals engage two
 * directions). Uses a raw dead-zone compare so behaviour matches the existing
 * left-stick poller exactly. Screen convention: +Y is down.
 */
export function stickToDirs(x: number, y: number, dz: number = STICK_DEADZONE): StickDirs {
  const sx = Number.isFinite(x) ? x : 0;
  const sy = Number.isFinite(y) ? y : 0;
  return {
    left: sx < -dz,
    right: sx > dz,
    up: sy < -dz,
    down: sy > dz,
  };
}
