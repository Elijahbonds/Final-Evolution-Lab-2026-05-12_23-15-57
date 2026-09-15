// DunkObstacles — the things you dunk OVER (DUNK-CONTROL-JUICE, 2026-09-08). Pure: the table and the clear test.
//
// The prop used to be one CreateBox "chair" (1.1 × 1.35 × 0.5) with a clear test on the ROOT's y across the box's
// middle 0.9 m only. Now three readable objects — the owner's baked sedan (real metres, 4.8 × 1.46 × 2.08), a Kenney
// race barrier and a Kenney arena block — each with a HEIGHT PROFILE sampled off its visible mesh along the runway
// (dunkObstacleProps.ts rays the loaded model), so the hitbox IS the mesh. The clear test reads the dunker's FEET (the
// lowest foot bone), not the root: a tucked jump clears what a stiff one clips, exactly as it reads on screen.
// The car parks sideways under the rim's shadow, so the runway crosses its width; the takeoff line moves back for it
// (a real over-the-car dunk is a long jump) and the flight's forward carry lands the dunker past the far door.

export type ObstacleKind = 'car' | 'barrier' | 'crate';
export const OBSTACLE_KINDS: ObstacleKind[] = ['car', 'barrier', 'crate'];

export interface ObstacleSpec {
  kind: ObstacleKind;
  label: string;
  /** Where the model comes from: the owner's Meshy bakes or a Kenney kit (public/models/props/<kit>/<model>.glb). */
  source: { meshy: 'sedan' } | { kit: string; model: string };
  scale: number;
  /** A vertical scale on top of `scale` (the Kenney block is a 1 × 0.5 × 1 slab — 2.4 makes it a 1.2 m crate). */
  scaleY?: number;
  yaw: number;
  /** The obstacle's centre, metres in FRONT of the rim (+ toward the runway). */
  zFromRim: number;
  /** The takeoff line for this obstacle, metres in front of the rim (the plain runway takes off 2.78 out). */
  takeoffFromRim: number;
  /** Judges' difficulty for clearing it. */
  bonus: number;
  /** A clipped car does not go over — the dunker stumbles onto the hood and the car rocks. The others topple. */
  topples: boolean;
  /** The height the HUD quotes and the prop's fallback when the profile cannot be sampled. */
  nominalHeight: number;
  /** Air the feet must show over the top to count as a clear (a car wants daylight under the shoes; a barrier none). */
  clearance: number;
}

export const OBSTACLE_SPECS: Record<ObstacleKind, ObstacleSpec> = {
  // DUNK-CAR-CLIP: the car parks 2.4 m out, not 2.5 — the swing leg's toe grazed the near door by up to 7 mm for 3 frames at the
  // takeoff (skinned mesh against the car mesh, probed at 4× time density); the run-up and the takeoff line are unchanged
  car: { kind: 'car', label: 'CAR', source: { meshy: 'sedan' }, scale: 1, yaw: 0, zFromRim: 2.4, takeoffFromRim: 4.3, bonus: 3, topples: false, nominalHeight: 1.46, clearance: 0.1 },
  barrier: { kind: 'barrier', label: 'BARRIER', source: { kit: 'racing', model: 'barrierWhite' }, scale: 6, yaw: Math.PI / 2, zFromRim: 1.5, takeoffFromRim: 2.78, bonus: 1, topples: true, nominalHeight: 0.78, clearance: 0 },
  // the Kenney block is a 1 × 0.5 × 1 slab (measured): 1.2 wide × 2.4 tall makes the 1.2 m crate (a 2.4 cube caught the feet on its far face)
  crate: { kind: 'crate', label: 'CRATE', source: { kit: 'mini-arena', model: 'block' }, scale: 1.2, scaleY: 2.4, yaw: 0, zFromRim: 1.55, takeoffFromRim: 3.4, bonus: 2, topples: true, nominalHeight: 1.2, clearance: 0.05 },
};

/** A height profile along the runway: `z` in world metres (descending toward the rim), `h` the mesh's top at that z. */
export interface HeightProfile { z: number[]; h: number[]; halfWidth: number }

/** The obstacle's height under a point on the runway (linear between samples; 0 outside its footprint). */
export function heightAt(profile: HeightProfile, x: number, z: number): number {
  if (Math.abs(x) > profile.halfWidth) return 0;
  const zs = profile.z; if (!zs.length) return 0;
  const zMax = Math.max(zs[0], zs[zs.length - 1]), zMin = Math.min(zs[0], zs[zs.length - 1]);
  if (z > zMax || z < zMin) return 0;
  for (let i = 0; i < zs.length - 1; i++) {
    const a = zs[i], b = zs[i + 1];
    if ((z <= a && z >= b) || (z >= a && z <= b)) {
      const k = a === b ? 0 : (z - a) / (b - a);
      return profile.h[i] + (profile.h[i + 1] - profile.h[i]) * k;
    }
  }
  return 0;
}

/** True when the dunker's feet are INSIDE the obstacle (or short of the air it demands): the lowest foot below the mesh
 *  top under it plus the required clearance. */
export function clipsObstacle(profile: HeightProfile, feetY: number, x: number, z: number, clearance = 0): boolean {
  const h = heightAt(profile, x, z);
  return h > 0 && feetY < h + clearance;
}

/** A box profile — the fallback when the model failed to load (the hitbox still matches what stands in for it). */
export function boxProfile(centerZ: number, halfDepth: number, height: number, halfWidth: number): HeightProfile {
  return { z: [centerZ + halfDepth, centerZ + halfDepth * 0.999, centerZ - halfDepth * 0.999, centerZ - halfDepth], h: [0, height, height, 0], halfWidth };
}

/** DUNK-CAR-CLIP (2026-09-14): the side-on shot of a jump over an obstacle. Metres off the runway (negative = the −x side —
 *  the rival waits at x +3.2, a metre off the car's bumper, and stood in the foreground of a +x shot), the lens height (under
 *  the car's roof line, so the shoes clear it against the sky), where along the obstacle-middle → rim span it stands, the aim's
 *  height over the dunker's root (low, so the car stays in the bottom of the frame as the body rises to the iron), and how far
 *  before the near edge (runway side) it cuts. */
export const PROP_CAM = { side: -8.0, y: 1.25, towardRim: 0.2, aimH: 0.4, lead: 0.6 } as const;

/** Where the prop cam stands for an obstacle spanning `nearZ … farZ` in front of the rim. */
export function propCamSpot(o: { nearZ: number; farZ: number }, rim: { x: number; z: number }, cam: typeof PROP_CAM = PROP_CAM): { x: number; y: number; z: number } {
  const zc = (o.nearZ + o.farZ) / 2;
  return { x: rim.x + cam.side, y: cam.y, z: zc + (rim.z - zc) * cam.towardRim };
}

/** The prop cam cuts in as the body comes within `lead` of the obstacle's near (runway-side) edge — before any of it is over. */
export function propCutDue(rootZ: number, nearZ: number, lead: number = PROP_CAM.lead): boolean {
  return rootZ <= nearZ + lead;
}

/** The next obstacle in the d-pad cycle. */
export function nextObstacle(kind: ObstacleKind | null): ObstacleKind {
  if (!kind) return OBSTACLE_KINDS[0];
  return OBSTACLE_KINDS[(OBSTACLE_KINDS.indexOf(kind) + 1) % OBSTACLE_KINDS.length];
}
