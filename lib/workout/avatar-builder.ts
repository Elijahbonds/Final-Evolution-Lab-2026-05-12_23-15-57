/**
 * lib/workout/avatar-builder.ts
 * =============================
 * PURE mini-avatar spec builder. From movement metrics we derive body
 * proportions + a palette so the rendered mini-avatar reads as "you". This is a
 * deterministic spec; the R3F renderer applies it to the canonical rig (or a
 * preset fallback if the model lacks blendshapes).
 */

import type { MovementMetrics } from './movement-screen';

export interface AvatarSpec {
  heightScale: number;   // 0.9 .. 1.12
  buildScale: number;    // torso/limb thickness 0.9 .. 1.15
  reachScale: number;    // arm length 0.95 .. 1.1
  palette: { skin: string; primary: string; accent: string };
  stance: 'athletic' | 'tall' | 'compact';
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.max(0, Math.min(1, t));

export function buildAvatarSpec(
  m: MovementMetrics,
  opts?: { skin?: string; primary?: string; accent?: string }
): AvatarSpec {
  // Taller jumpers/longer cadence bias toward a taller stance; deeper squat
  // depth biases toward a more athletic/compact build. Purely cosmetic.
  const heightScale = lerp(0.94, 1.1, (m.jumpHeightCm - 30) / 45);
  const buildScale = lerp(1.12, 0.94, (m.depthDeg - 70) / 50);
  const reachScale = lerp(0.97, 1.08, (m.cadenceSpm - 150) / 50);
  const stance: AvatarSpec['stance'] = heightScale > 1.05 ? 'tall' : buildScale > 1.05 ? 'compact' : 'athletic';
  return {
    heightScale: Number(heightScale.toFixed(3)),
    buildScale: Number(buildScale.toFixed(3)),
    reachScale: Number(reachScale.toFixed(3)),
    palette: {
      skin: opts?.skin ?? '#C68642',
      primary: opts?.primary ?? '#00E5FF',
      accent: opts?.accent ?? '#A855F7',
    },
    stance,
  };
}
