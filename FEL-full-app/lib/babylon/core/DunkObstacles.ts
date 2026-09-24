// DunkObstacles — the things you dunk OVER (DUNK-CONTROL-JUICE, 2026-09-08). Pure: the table and the clear test.
//
// The prop used to be one CreateBox "chair" (1.1 × 1.35 × 0.5) with a clear test on the ROOT's y across the box's
// middle 0.9 m only. Now three readable objects — the owner's baked sedan (real metres, 4.8 × 1.46 × 2.08), a Kenney
// race barrier and a Kenney arena block — each with a HEIGHT PROFILE sampled off its visible mesh along the runway
// (dunkObstacleProps.ts rays the loaded model), so the hitbox IS the mesh. The clear test reads the dunker's FEET (the
// lowest foot bone), not the root: a tucked jump clears what a stiff one clips, exactly as it reads on screen.
// The car parks sideways under the rim's shadow, so the runway crosses its width; the takeoff line moves back for it
// (a real over-the-car dunk is a long jump) and the flight's forward carry lands the dunker past the far door.

/** DUNK MOTION phase 10: the DUBBLE UP, over 1–10 people (the owner picks the line's length in the prop ring). */
export type DubbleKind = 'dubble1' | 'dubble2' | 'dubble3' | 'dubble4' | 'dubble5' | 'dubble6' | 'dubble7' | 'dubble8' | 'dubble9' | 'dubble10';
export const DUBBLE_KINDS: DubbleKind[] = ['dubble1', 'dubble2', 'dubble3', 'dubble4', 'dubble5', 'dubble6', 'dubble7', 'dubble8', 'dubble9', 'dubble10'];
export type ObstacleKind = 'car' | 'barrier' | 'crate' | 'tetris' | 'ladder' | 'bike' | 'bikeroll' | 'skate' | 'skateroll' | 'row3' | 'row5' | 'wall' | 'kangaroo' | DubbleKind;
export const OBSTACLE_KINDS: ObstacleKind[] = ['car', 'barrier', 'crate', 'tetris', 'ladder', 'bike', 'bikeroll', 'skate', 'skateroll', 'row3', 'row5', 'wall', 'kangaroo', ...DUBBLE_KINDS];

export interface ObstacleSpec {
  kind: ObstacleKind;
  label: string;
  /** Where the model comes from: the owner's Meshy bakes, a Kenney kit (public/models/props/<kit>/<model>.glb), or
   *  BODIES — two of the game's own characters, stacked (the TETRIS). */
  source: { meshy: 'sedan' | 'skateboard' } | { kit: string; model: string } | { bodies: 'stack' | 'row' | 'wall' | 'dubble' } | { built: 'ladder' | 'bike' | 'kangaroo' };
  /** For a BODIES row or wall: how many of them. */
  bodyCount?: number;
  /** Somebody is ON it — a cyclist on the bike, a skater on the board. They ride the prop and duck as you come. */
  rider?: 'bike' | 'skate';
  /** Metres per second ACROSS the runway. A moving prop is a timing problem: it is only in your way some of the time,
   *  and the hitbox travels with it (HeightProfile.centerX). 0 / undefined = it stands still. */
  speed?: number;
  /** How far either side of its parked spot a moving prop runs before it turns around. */
  travel?: number;
  /** Which way it travels: ACROSS the runway ('x', the default) or ALONG it — 'z' is a prop coming straight at you. */
  axis?: 'x' | 'z';
  /** THE HOP (owner, 2026-09-18: "a kangaroo jumping in motion towards the basket"): a moving prop that hops as it goes — its
   *  body (and the hitbox) rises `height` metres on each hop of `period` seconds. */
  hop?: { height: number; period: number };
  /** A moving prop that starts at the RUNNER's end and goes toward the rim first (the default starts near the rim and comes at you). */
  towardRim?: boolean;
  /**
   * Extra apex, metres, for an obstacle that needs a bigger jump than the flat runway does.
   *
   * The owner's correction, and he is right: you CAN go over a row of people standing up. What that takes is a bigger
   * jump, and the mode already accepts that the take-off line moves back for a deep prop — the arc should move with it.
   * A plain flight tops out at 1.84 m, which holds the feet above 1.75 m for only ~0.9 m of floor; two metres of
   * standing people needs ~2.35 m of apex, and that is what this buys. It is the run-up doing it: you do not get this
   * arc by ambling at a line of five people.
   */
  apexLift?: number;
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

// THE DUBBLE UP (owner, 2026-09-23: "look up what a dubble up eastbay is"; "try out a double up eastbay and compare it to a real one by
// dunk chen"; "he jumps over 10 people when he does it, takes off from the elbow off 2"). Dylan Haugen's definition: a helper stands in
// front of the basket holding the ball on his head; the dunker leaps as though his hips would pass over the helper's head, legs either
// side of him, takes the ball just before he clears, and finishes (Chen Dengxing's: through the legs — an eastbay). Chen does it over a
// LINE: the others kneel in a tight column in front of the helper, and he takes off two-footed from about the elbow. Owner decisions
// (2026-09-23): the prop ring places it, 1–10 people (longer = more air, more points); A on the run is the take-off; the runner comes in
// empty-handed. The helper stands nearest the rim with the ball on his head; the kneelers run back up the runway from him.
/** The standing line's spacing (the rows' own, ROW_ALONG_SPACING_M, declared later in the file). */
const ROW_ALONG_SPACING_M_DUBBLE = 0.46;
// THE BALL IS ON THE FIRST MAN'S HEAD (owner, 2026-09-24: "put the ball on the first guys head, not the last lol"): the helper stands at the
// RUNWAY end of the line, the dunker takes the ball off him going up, and carries it over everyone else to the rim.
// THEY STAND TALL (owner, 2026-09-24: "have them stand tall"): the line stands nose to tail like the standing rows, and the first man holds
// the ball UP over his head, arms extended — a ball on a head is under the feet of a jump that has to clear a line of standing heads.
/** The man nearest the rim (metres in front of it), the line's spacing back up the runway, and the heads the feet must clear. */
export const DUBBLE_LINE_NEAR_M = 1.6, DUBBLE_KNEEL_SPACING_M = ROW_ALONG_SPACING_M_DUBBLE, DUBBLE_KNEEL_H = 1.75;
/** The helper stands this far beyond the last kneeler; the take-off is this far before him (the hips rise over his head in that run). */
export const DUBBLE_HELPER_GAP_M = 0.5, DUBBLE_RUN_IN_M = 2.2;
/** The ball's centre, held up over his head; his head's top (the hips must pass over it). */
export const DUBBLE_BALL_Y = 2.34, DUBBLE_HEAD_TOP = 1.84;
/** The helper, metres in front of the rim, for a line of `n` (the single helper stands where the line would start). */
export function dubbleHelperFromRim(n: number): number { return n <= 1 ? DUBBLE_LINE_NEAR_M : DUBBLE_LINE_NEAR_M + (n - 2) * DUBBLE_KNEEL_SPACING_M + DUBBLE_HELPER_GAP_M; }
/** Where a line of `n` takes off (ten standing ≈ 8 m: a very long jump — the contest's own). */
export function dubbleTakeoffFromRim(n: number): number { return dubbleHelperFromRim(n) + DUBBLE_RUN_IN_M; }
/** The kneelers' z centre (metres in front of the rim) and half-depth, between the helper and the rim (none for the single helper). */
export function dubbleKneelSpan(n: number): { center: number; halfDepth: number } | null {
  if (n <= 1) return null;
  const near = DUBBLE_LINE_NEAR_M, far = DUBBLE_LINE_NEAR_M + (n - 2) * DUBBLE_KNEEL_SPACING_M;
  return { center: (near + far) / 2, halfDepth: (far - near) / 2 + 0.28 };
}
/** THE DUBBLE UP'S FLIGHT: explosive off the floor so the hips pass just over his head, an arm's reach above the ball (the hand comes
 *  DOWN onto it going up), then still rising gently over the line to the top at the rim. The apex is the rim's; the hips at the helper
 *  set the curve's shape (1 − (1 − u)^p through the helper, u the carry's fraction). */
export const DUBBLE_APEX_M = 1.7, DUBBLE_HIPS_AT_HELPER = 2.45, DUBBLE_HIPS_REST = 0.96;   // (over standing heads: the tucked feet ~0.55 m under the hips)
export function dubbleArcPower(uHelper: number): number {
  const hA = Math.min(0.95, Math.max(0.3, (DUBBLE_HIPS_AT_HELPER - DUBBLE_HIPS_REST) / DUBBLE_APEX_M));
  const u = Math.min(0.9, Math.max(0.05, uHelper));
  return Math.min(8, Math.max(2, Math.log(1 - hA) / Math.log(1 - u)));
}
export function dubbleArc(u: number, p: number): number { const x = Math.min(1, Math.max(0, u)); return 1 - Math.pow(1 - x, p); }
function dubbleSpec(n: number): ObstacleSpec {
  return {
    kind: `dubble${n}` as DubbleKind, label: n === 1 ? 'DUBBLE UP' : `DUBBLE UP ×${n}`, source: { bodies: 'dubble' }, bodyCount: n,
    scale: 1, yaw: 0, zFromRim: dubbleHelperFromRim(n), takeoffFromRim: dubbleTakeoffFromRim(n),
    bonus: +(4 + 0.7 * n).toFixed(1), topples: false, nominalHeight: n > 1 ? 1.75 : 1.8, clearance: 0.05,
    apexLift: 0.1,   // (the mode flies its own Dubble Up curve — DUBBLE_APEX_M / dubbleArc)
  };
}
export const isDubble = (k: string | null | undefined): k is DubbleKind => !!k && (DUBBLE_KINDS as string[]).includes(k);
export const dubbleCount = (k: DubbleKind): number => Number(k.slice(6));

export const OBSTACLE_SPECS: Record<ObstacleKind, ObstacleSpec> = {
  ...(Object.fromEntries(DUBBLE_KINDS.map((k, i) => [k, dubbleSpec(i + 1)])) as Record<DubbleKind, ObstacleSpec>),
  // DUNK-CAR-CLIP: the car parks 2.4 m out, not 2.5 — the swing leg's toe grazed the near door by up to 7 mm for 3 frames at the
  // takeoff (skinned mesh against the car mesh, probed at 4× time density); the run-up and the takeoff line are unchanged
  car: { kind: 'car', label: 'CAR', source: { meshy: 'sedan' }, scale: 1, yaw: 0, zFromRim: 2.4, takeoffFromRim: 4.3, bonus: 3, topples: false, nominalHeight: 1.46, clearance: 0.1 },
  barrier: { kind: 'barrier', label: 'BARRIER', source: { kit: 'racing', model: 'barrierWhite' }, scale: 6, yaw: Math.PI / 2, zFromRim: 1.5, takeoffFromRim: 2.78, bonus: 1, topples: true, nominalHeight: 0.78, clearance: 0 },
  // the Kenney block is a 1 × 0.5 × 1 slab (measured): 1.2 wide × 2.4 tall makes the 1.2 m crate (a 2.4 cube caught the feet on its far face)
  crate: { kind: 'crate', label: 'CRATE', source: { kit: 'mini-arena', model: 'block' }, scale: 1.2, scaleY: 2.4, yaw: 0, zFromRim: 1.55, takeoffFromRim: 3.4, bonus: 2, topples: true, nominalHeight: 1.2, clearance: 0.05 },
  // THE TETRIS (owner, 2026-09-16: "jumping over 2 people stacked sitting on the others shoulders"). Two of the game's
  // own bodies, the rider seated on the base's shoulders — the pieces stacked, which is where the name comes from.
  //
  // THE HITBOX IS THEIR LAP, NOT THEIR HEADS, and it has to be: the rider's head is 2.3 m up and the dunker's apex is
  // 1.84 off a full charge, so a hitbox at the top of the stack is a dunk nobody in the game can do. A real one goes
  // over the seated man's legs while he leans away from you — so the profile tops out at 1.75 (the highest thing the
  // feet must actually clear) and the rider DUCKS as you come, which is both the truth and the reason it is clearable.
  // The hardest obstacle on the card: the longest take-off and the biggest bonus.
  tetris: { kind: 'tetris', label: 'TETRIS', source: { bodies: 'stack' }, scale: 1, yaw: 0, zFromRim: 2.0, takeoffFromRim: 3.8, bonus: 4, topples: true, nominalHeight: 1.75, clearance: 0.05 },

  // MORE PROPS (owner, 2026-09-16: "add more prop dunks, ladder, bike, over a # of people in a row").
  //
  // There is no ladder and no bicycle in any kit here — the props that exist are the owner's Meshy bakes and the Kenney
  // sets, and neither has one. The rule this file already keeps ("no CreateBox stand-in survives a load") is about not
  // shipping a grey box that is pretending to be a car; a ladder is two rails and five rungs and a bike is two wheels
  // and a frame, so these are BUILT out of the shapes they are actually made of rather than stood in for.
  ladder: { kind: 'ladder', label: 'STEP LADDER', source: { built: 'ladder' }, scale: 1, yaw: 0, zFromRim: 1.7, takeoffFromRim: 3.5, bonus: 3, topples: true, nominalHeight: 1.5, clearance: 0.05 },
  // BROADSIDE, or it is invisible. Built nose-on to the runway the bike is a 10 cm silhouette — caught on the runway
  // frame, where the only thing showing above the dunker's head was the red line of the handlebars. A bike you dunk
  // over is always side on: the length goes ACROSS the runway, so you see the whole thing, and what you clear is the
  // width of the wheels.
  // SOMEBODY IS ON IT, AND IT CAN BE MOVING (owner, 2026-09-16: "have someone on the bike, have the option to have it
  // moving, do the same thing for a skateboard"). A parked bike is an object; a bike with a rider on it is a dare, and
  // one rolling across the runway is a timing problem — it is only in your way some of the time, so the run-up has to
  // be read as well as run. The rider leans over the bars (and the skater crouches) so the hitbox stays under the
  // 1.84 m apex, the same rule the TETRIS and the WALL keep.
  bike: { kind: 'bike', label: 'BIKE', source: { built: 'bike' }, rider: 'bike', scale: 1.1, yaw: Math.PI / 2, zFromRim: 1.9, takeoffFromRim: 3.7, bonus: 3.5, topples: true, nominalHeight: 1.5, clearance: 0.05 },
  bikeroll: { kind: 'bikeroll', label: 'ROLLING BIKE', source: { built: 'bike' }, rider: 'bike', speed: 2.4, travel: 3.0, axis: 'z', scale: 1.1, yaw: 0, zFromRim: 1.9, takeoffFromRim: 3.7, bonus: 5, topples: true, nominalHeight: 1.5, clearance: 0.05 },
  skate: { kind: 'skate', label: 'SKATER', source: { meshy: 'skateboard' }, rider: 'skate', scale: 1, yaw: Math.PI / 2, zFromRim: 1.85, takeoffFromRim: 3.6, bonus: 3, topples: true, nominalHeight: 1.45, clearance: 0.05 },
  skateroll: { kind: 'skateroll', label: 'ROLLING SKATER', source: { meshy: 'skateboard' }, rider: 'skate', speed: 2.8, travel: 3.2, axis: 'x', scale: 1, yaw: Math.PI / 2, zFromRim: 1.85, takeoffFromRim: 3.6, bonus: 4.5, topples: true, nominalHeight: 1.45, clearance: 0.05 },

  // THE ANIMAL (owner, 2026-09-18: "dunking over a kangaroo jumping in motion towards the basket and eastbaying over it hopping";
  // the giraffe was cut the same night — "take the giraffe out"). Built from its own shapes like the ladder and the bike: the
  // kangaroo hops down the lane toward the rim and its hitbox rises with every hop — the read is the beat between hops.
  kangaroo: { kind: 'kangaroo', label: 'HOPPING KANGAROO', source: { built: 'kangaroo' }, speed: 2.6, travel: 2.4, axis: 'z', towardRim: true, hop: { height: 0.5, period: 0.6 }, scale: 1, yaw: 0, zFromRim: 2.1, takeoffFromRim: 4.0, bonus: 6, topples: true, nominalHeight: 1.3, clearance: 0.05, apexLift: 0.3 },

  // OVER A ROW OF PEOPLE — LONGITUDINAL (owner, 2026-09-16: "it's supposed to be 5 in a row longitudinal, straight").
  //
  // The line runs AWAY from you down the runway, so what you clear is its LENGTH, and they STAND UP (owner, 2026-09-16:
  // "the people can stand up").
  //
  // THEY STAND AT FULL HEIGHT AND THEY HIT A POSE (owner: "the people can stand up" / "yes it can, hit a pose").
  //
  // I had this the wrong way round first. The lab blew the dunk twice out of two into a line of standing people, and I
  // lowered the people — which is the coward's fix and not what happens in real life, where the dunker simply jumps
  // higher. A plain flight tops out at 1.84 m and holds the feet above 1.75 for about 0.9 m of floor; two metres of
  // standing people needs ~2.35 m of apex, so that is what the run-up over this prop buys (`apexLift`). The people
  // stand up straight, arms out, and the jump rises to them.
  row3: { kind: 'row3', label: 'THREE IN A ROW', source: { bodies: 'row' }, bodyCount: 3, scale: 1, yaw: 0, zFromRim: 1.8, takeoffFromRim: 3.6, bonus: 4.5, topples: true, nominalHeight: 1.75, clearance: 0.05, apexLift: 0.32 },
  // row5's far edge sat 0.12 m from the flush point, so the dunker never got PAST it before the flight resolved and the
  // clear never registered (measured on rc42: the dunk landed, the bonus did not). The line stands further out.
  row5: { kind: 'row5', label: 'FIVE IN A ROW', source: { bodies: 'row' }, bodyCount: 5, scale: 1, yaw: 0, zFromRim: 2.25, takeoffFromRim: 4.35, bonus: 6, topples: true, nominalHeight: 1.75, clearance: 0.05, apexLift: 0.72 },

  // THE WALL (owner: "keep that too for a set up, that's good for jclark's, Jonathan's wall"). The first row I built was
  // shoulder to shoulder ACROSS the runway, which is the wrong shape for "five in a row" and exactly the right one for
  // this: a wall of people standing at full height, cleared all at once. Jonathan Clark's. They stand — so the hitbox
  // is the 1.75 m the TETRIS proved clearable, and like the tetris rider they duck as the feet come over, because the
  // dunker's apex is 1.84 m and a hitbox at the top of a standing head is a dunk nobody in this game can do.
  wall: { kind: 'wall', label: 'WALL', source: { bodies: 'wall' }, bodyCount: 5, scale: 1, yaw: 0, zFromRim: 1.9, takeoffFromRim: 3.6, bonus: 5.5, topples: true, nominalHeight: 1.75, clearance: 0.05 },
};

/** How far apart the bodies stand (metres) — shoulder to shoulder in the wall, nose to tail down the row. */
export const ROW_SPACING_M = 0.62;
/** The longitudinal row packs tighter than the wall: nose to tail down the line, shoulder to shoulder across it. */
export const ROW_ALONG_SPACING_M = 0.46;

/** A height profile along the runway: `z` in world metres (descending toward the rim), `h` the mesh's top at that z. */
export interface HeightProfile {
  z: number[]; h: number[]; halfWidth: number;
  /** Where the footprint sits across the runway. A MOVING prop rides this — the obstacle's tick writes it every frame,
   *  so the hitbox goes where the thing actually is instead of staying parked on the centreline. Default 0. */
  centerX?: number;
  /** And how far it has slid ALONG the runway, for a prop coming at you rather than across you. Default 0. */
  zShift?: number;
  /** A hopping prop's height off the floor right now — the whole profile rides it. Default 0. */
  lift?: number;
}

/** The obstacle's height under a point on the runway (linear between samples; 0 outside its footprint). */
export function heightAt(profile: HeightProfile, x: number, z: number): number {
  if (Math.abs(x - (profile.centerX ?? 0)) > profile.halfWidth) return 0;
  const zs = profile.z; if (!zs.length) return 0;
  z -= profile.zShift ?? 0;
  const zMax = Math.max(zs[0], zs[zs.length - 1]), zMin = Math.min(zs[0], zs[zs.length - 1]);
  if (z > zMax || z < zMin) return 0;
  for (let i = 0; i < zs.length - 1; i++) {
    const a = zs[i], b = zs[i + 1];
    if ((z <= a && z >= b) || (z >= a && z <= b)) {
      const k = a === b ? 0 : (z - a) / (b - a);
      const hh = profile.h[i] + (profile.h[i + 1] - profile.h[i]) * k;
      return hh > 0 ? hh + (profile.lift ?? 0) : hh;   // a hop lifts the whole body
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
