// NexusWebScene — Nexus, rebuilt for the web. Babylon, 3D, zero external assets.
//
// WHY THIS REPLACES THE SWIFT SCENE FORMAT
// The Swift descriptors (M72) describe a 2-D SwiftUI Canvas: positions are
// normalised {x, y} in 0–1 with no depth, and "sprite" means an SF Symbol.
// That format is correct for what it was built for and actively wrong for a
// 3-D Babylon game — force-fitting it would mean inventing a Z for every
// entity and pretending SF Symbols exist in a browser. So this is a
// web-native format that keeps what carried over (the 20-mode taxonomy, the
// venue/actor/prop split, per-mode palettes) and drops what did not.
//
// THE SCHEMA-DRIFT LESSON, APPLIED
// M72's descriptors shipped broken for months because hand-written JSON
// disagreed with what Swift's Codable actually decodes, and nothing checked.
// The fix there was to GENERATE the JSON from the types. On the web there is
// a better answer available: make the spec a TYPESCRIPT VALUE. There is no
// serialisation boundary to drift across — `tsc` is the validator, a typo is
// a compile error, and a renamed field breaks the build instead of a scene.
//
// ART DIRECTION
// Everything is procedural: MeshBuilder primitives, DynamicTexture-painted
// court lines, and a colour grade per venue. This is the same constraint the
// rest of FEL runs under — no downloads, no CDN, nothing to 404 — and it is
// what lets 20 venues cost a few kilobytes instead of a few hundred megabytes.

import {
  ArcRotateCamera, Color3, Color4, DirectionalLight, DynamicTexture, Engine,
  HemisphericLight, Mesh, MeshBuilder, PBRMaterial, Scene, ShadowGenerator,
  StandardMaterial, Texture, TransformNode, Vector3,
} from '@babylonjs/core';
import { PREMIUM_DRESSING } from './dressingFlags';   // M108 broadcast dressing (rollback flag)
import { mountVenueMap } from '../visual/VenueMaps';
import { buildCrowdStand, fieldMaterial } from '../visual/PlacePack';

// ── spec ──────────────────────────────────────────────────────────────────

export type GroundKind =
  | 'court' | 'pitch' | 'clay' | 'hardcourt' | 'sand' | 'mat'
  | 'water' | 'snow' | 'street' | 'stage' | 'diamond' | 'green';

export type PropKind =
  | 'hoop' | 'backboardPole' | 'goal' | 'net' | 'wall' | 'crowdTier'
  | 'palm' | 'lamp' | 'banner' | 'ramp' | 'beam' | 'podium' | 'tee' | 'flag';

export interface Grade {
  /** Camera exposure. >1 lifts the whole image; the anime grade sits ~1.15. */
  exposure: number;
  contrast: number;
  /** 0–1. Colour lift toward the accent, which is what reads as "stylised". */
  vignette: number;
}

/**
 * Where a 'hoop' prop's RIM sits relative to the prop's own position.
 *
 * Exported because a mode has to fly the ball to the same place the player can
 * see the hoop, and those were two independent numbers. DUNK_CONFIG put its rim
 * at z = -0.6 while its venue puts the hoop at z = -11 — the dunker flew to
 * mid-court and slammed into empty air ten metres short of the basket that was
 * on screen. Nothing errored, because both halves were internally consistent.
 *
 * The height is REGULATION: a basketball rim is 10 feet, 3.05m. This hoop was
 * built at 2.70 — about 8'10" — so every basketball mode in the game was
 * shooting at a rim nearly a foot low. The World-Population Protocol's L1 is
 * explicit that markings and dimensions are checked against the real sport
 * rather than eyeballed, and rim height is the single most-known number in
 * basketball.
 */
export const HOOP_RIM_OFFSET = { y: 3.05, z: 0.72 } as const;

/** M110 — the procedural horizon backdrops. Each paints a recognisable place
 *  into the sky-dome texture (buildings, stands, peaks, sea, dojo interior…)
 *  so a venue reads as WHERE it is, not just a colour gradient. */
export type BackdropKind =
  | 'beach' | 'ocean' | 'city' | 'stadium' | 'mountains' | 'dojo' | 'neon' | 'links';

export interface Environment {
  skyTop: string;
  skyBottom: string;
  fogColor: string;
  fogDensity: number;
  /** 0–1 ambient fill. Low values need a stronger key or the scene goes muddy. */
  ambient: number;
  sunDirection: [number, number, number];
  sunColor: string;
  grade: Grade;
  /** M110 — optional procedural horizon backdrop so a venue reads as its actual
   *  place. Painted into the sky-dome texture; gated by PREMIUM_DRESSING for
   *  instant rollback. Venues without it keep the plain 2-stop gradient. */
  backdrop?: BackdropKind;
}

export interface GroundSpec {
  kind: GroundKind;
  size: [number, number];
  color: string;
  lineColor?: string;
  /** Painted into a DynamicTexture — no image files. */
  markings?: 'basketball' | 'halfcourt' | 'tennis' | 'soccer' | 'volleyball' | 'ring' | 'diamond' | 'penalty' | 'none';
  /**
   * [x, z] offset for the playing surface. Grounds are centred on the origin,
   * which assumes a mode plays symmetrically around it — and a HALF-court game
   * does not. 3v3 plays z 0.5..15 with its basket behind z 0, so a centred court
   * put the painted key and arc at the wrong end entirely and left fourteen
   * metres of unused court behind the basket. Omitted, behaviour is unchanged.
   */
  offset?: [number, number];
}

export interface PropSpec {
  kind: PropKind;
  position: [number, number, number];
  rotationY?: number;
  scale?: number;
  color?: string;
}

export interface ActorSpec {
  id: string;
  role: 'player' | 'ally' | 'foe' | 'crowd';
  position: [number, number, number];
  facing?: number;
  color?: string;
}

export interface CameraSpec {
  /** Radians. alpha = orbit, beta = pitch from +Y. */
  alpha: number;
  beta: number;
  radius: number;
  target: [number, number, number];
  fov?: number;
}

export interface NexusWebSpec {
  modeId: string;
  name: string;
  venue: string;
  environment: Environment;
  ground: GroundSpec;
  /** Baked Meshy venue map key (lib/map-data.ts) mounted as the environment;
   *  the procedural ground stays as fallback when no bake exists. */
  mapKey?: string;
  props: PropSpec[];
  actors: ActorSpec[];
  camera: CameraSpec;
}

// ── helpers ───────────────────────────────────────────────────────────────

const c3 = (hex: string): Color3 => Color3.FromHexString(hex);
const v3 = (t: [number, number, number]): Vector3 => new Vector3(t[0], t[1], t[2]);

/** PBR with sane defaults. Metallic 0 / rough 0.7 is the "painted surface"
 *  look this art direction wants; specular highlights on everything read as
 *  plastic and fight the flat anime grade. */
function surface(scene: Scene, name: string, hex: string, rough = 0.7, metal = 0): PBRMaterial {
  const m = new PBRMaterial(name, scene);
  m.albedoColor = c3(hex);
  m.roughness = rough;
  m.metallic = metal;
  m.environmentIntensity = 0.35;
  return m;
}

function emissive(scene: Scene, name: string, hex: string, strength = 0.6): PBRMaterial {
  const m = surface(scene, name, hex, 0.5);
  m.emissiveColor = c3(hex).scale(strength);
  return m;
}

// ── ground ────────────────────────────────────────────────────────────────

/** Paint court markings into a texture instead of shipping one. 1024² is the
 *  sweet spot: lines stay crisp at grazing angles without a 4 MB upload. */
function paintMarkings(
  scene: Scene, kind: NonNullable<GroundSpec['markings']>, base: string, line: string,
  /** Ground size in metres [width, depth] — needed to place lines where the
   *  RULES are rather than where the texture edge happens to be. */
  size?: readonly [number, number],
): DynamicTexture {
  const S = 1024;
  const tex = new DynamicTexture('groundTex', { width: S, height: S }, scene, false);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = line;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';

  const box = (x: number, y: number, w: number, h: number) => ctx.strokeRect(x, y, w, h);
  const arc = (x: number, y: number, r: number, a0 = 0, a1 = Math.PI * 2) => {
    ctx.beginPath(); ctx.arc(x, y, r, a0, a1); ctx.stroke();
  };
  const line2 = (x0: number, y0: number, x1: number, y1: number) => {
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  };

  switch (kind) {
    case 'basketball':
      box(40, 40, S - 80, S - 80);
      line2(S / 2, 40, S / 2, S - 40);
      arc(S / 2, S / 2, 110);
      box(40, S / 2 - 150, 190, 300);
      box(S - 230, S / 2 - 150, 190, 300);
      arc(230, S / 2, 150, -Math.PI / 2, Math.PI / 2);
      arc(S - 230, S / 2, 150, Math.PI / 2, (3 * Math.PI) / 2);
      break;
    case 'halfcourt':
      box(40, 40, S - 80, S - 80);
      box(S / 2 - 150, 40, 300, 190);
      arc(S / 2, 230, 150, 0, Math.PI);
      arc(S / 2, 40, 380, 0.35, Math.PI - 0.35);
      break;
    // Same defect volleyball had, in the same painter: fixed pixel insets from
    // the TEXTURE edge, while the texture spans the whole ground. On a 16x34
    // court that painted the sideline near x = +-7.0 while RallyCore judges
    // anything past +-5.5 wide, so the player was shown a court that was not
    // the court. Derived from the real dimensions now.
    case 'tennis': {
      const [gw, gd] = size ?? [16, 34];
      const COURT_W = 11, COURT_L = 23.77, SERVICE = 6.4;   // doubles width, FIVB/ITF
      const ix = ((1 - COURT_W / gw) / 2) * S;
      const iy = ((1 - COURT_L / gd) / 2) * S;
      const w = S - ix * 2, h = S - iy * 2;
      box(ix, iy, w, h);                                    // the court
      line2(ix, S / 2, ix + w, S / 2);                      // the net line
      const svc = (SERVICE / COURT_L) * h;                  // service boxes
      box(ix, S / 2 - svc, w, svc * 2);
      line2(S / 2, S / 2 - svc, S / 2, S / 2 + svc);        // centre service line
      break;
    }
    case 'soccer':
      box(40, 40, S - 80, S - 80);
      line2(40, S / 2, S - 40, S / 2);
      arc(S / 2, S / 2, 120);
      box(S / 2 - 200, 40, 400, 130);
      box(S / 2 - 200, S - 170, 400, 130);
      break;
    // A DOJO RING. The arena modes clamp the fighter to a play area that the
    // mat does not draw, so the boundary is felt and never seen -- the same
    // invisible-wall defect the skatepark and the surf break both carried. The
    // ring is drawn at the fraction of the mat the mode actually clamps to
    // (ARENA_RADIUS / half the mat), with a fading outer band so the edge reads
    // as a place rather than a hard stop.
    case 'ring': {
      const cx = S / 2, cy = S / 2;
      arc(cx, cy, S * 0.3125);              // the clamp itself: 7.5 of a 24m mat
      ctx.globalAlpha = 0.45; arc(cx, cy, S * 0.3125 - 26); ctx.globalAlpha = 1;
      ctx.globalAlpha = 0.25; arc(cx, cy, S * 0.3125 + 34); ctx.globalAlpha = 1;
      arc(cx, cy, 60);                      // centre mark, for spawn orientation
      break;
    }
    // The court lines have to sit where in/out is actually JUDGED. This drew a
    // box inset a fixed 60px from the texture edge, and the texture spans the
    // whole sand — so on an 18x30 beach the sideline was painted at x = +-8.5
    // while RallyCore calls anything past x = +-4.5 wide. The player was shown
    // a court that was not the court. That is 3PT's ball-rack lesson in its
    // other form: a wrong marking is a wrong game.
    //
    // Derived from the real dimensions instead: an 18m x 9m court inside the
    // sand the venue actually specifies.
    case 'volleyball': {
      const [gw, gd] = size ?? [18, 18];
      const COURT_W = 9, COURT_L = 18, ATTACK_LINE = 3;   // metres, FIVB
      const ix = ((1 - COURT_W / gw) / 2) * S;
      const iy = ((1 - COURT_L / gd) / 2) * S;
      const w = S - ix * 2, h = S - iy * 2;
      box(ix, iy, w, h);                                   // the court
      line2(ix, S / 2, ix + w, S / 2);                     // centre line, under the net
      const atk = (ATTACK_LINE / COURT_L) * h;             // 3m attack lines
      line2(ix, S / 2 - atk, ix + w, S / 2 - atk);
      line2(ix, S / 2 + atk, ix + w, S / 2 + atk);
      break;
    }
    default:
      break;
  }
  tex.update(false);
  return tex;
}

/** Water/snow get a painted swell pattern so a flat plane still reads as a
 *  surface with depth — the M64 ocean court, generalised. */
function paintOrganic(scene: Scene, kind: 'water' | 'snow' | 'sand', base: string): DynamicTexture {
  const S = 1024;
  const tex = new DynamicTexture('organicTex', { width: S, height: S }, scene, false);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  const light = kind === 'water' ? 'rgba(255,255,255,0.16)'
    : kind === 'snow' ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.10)';
  ctx.strokeStyle = light;
  ctx.lineWidth = kind === 'water' ? 5 : 3;
  for (let i = 0; i < 46; i++) {
    const y = (i / 46) * S;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= S; x += 32) {
      ctx.lineTo(x, y + Math.sin((x / S) * Math.PI * 4 + i * 0.7) * (kind === 'water' ? 14 : 6));
    }
    ctx.stroke();
  }
  tex.update(false);
  return tex;
}

// M108 ── premium dressing painters ────────────────────────────────────────
// Deterministic pseudo-random so a crowd looks the same every build (no
// hydration concern — this is Babylon-runtime canvas, never SSR markup).
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

/** A stand full of people: thousands of tiny coloured dabs on a dark tier so a
 *  crowd reads as a CROWD from the field instead of a flat grey block. One
 *  texture is shared by all three rows of a tier. */
/** Mix a hex colour toward another by t (0..1). The crowd's legibility fix. */
function mixHex(a: string, b: string, t: number): string {
  const p = (h: string): [number, number, number] => {
    const v = h.replace('#', '');
    return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
  };
  const [r1, g1, b1] = p(a), [r2, g2, b2] = p(b);
  const m = (x: number, y: number): string =>
    Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  return `#${m(r1, r2)}${m(g1, g2)}${m(b1, b2)}`;
}

/**
 * A crowd in a stand — SEATED IN ROWS, mostly dark, with occasional colour.
 *
 * This was 900 fully-saturated neon dots scattered at uniform random from an
 * 8-colour palette, applied as albedo AND emissive. It did not read as a crowd;
 * it read as confetti static, and on the dunk court a tier of it sits directly
 * behind the hoop — precisely where the player looks on every attempt.
 *
 * That is the same failure the World-Population Protocol was written for after
 * 3PT's graffiti backdrop, and it gets the same remedy: keep the character,
 * stop competing with the thing the player is trying to see.
 *
 *   - people sit in ROWS, because random scatter is the single biggest reason
 *     the old texture read as noise rather than as a stand full of people
 *   - each person is a torso plus a smaller head, so the silhouette is a person
 *   - most of the crowd is mixed heavily toward the background: real stands are
 *     mostly dark clothing, and it is the MINORITY of bright tops that reads as
 *     colour. Everyone being bright is what destroys the read.
 *   - only ~1 in 8 wears the venue accent at strength — those are the pops
 *   - emissive is halved; every spectator glowing like an LED was why the tier
 *     drew the eye harder than the rim did
 */
function paintCrowd(scene: Scene, accent: string): DynamicTexture {
  const W = 512, H = 128;
  // Dusk-lit stand, not a void: at '#0C1020' the tiers rendered as a black
  // wall that hid the painted ocean horizon behind them.
  const BG = '#453252';
  const tex = new DynamicTexture('crowdTex', { width: W, height: H }, scene, false);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  const tops = ['#FF6B00', '#00E5FF', '#FFD700', '#FF3366', '#00FF9D', '#A855F7', '#F2F6FF', accent];
  const skins = ['#8D5524', '#C68642', '#E0AC69', '#F1C27D', '#5C3317'];
  const rnd = seeded(0x5eed01);

  const ROWS = 7;
  const rowGap = H / ROWS;
  for (let row = 0; row < ROWS; row++) {
    // Back rows sit higher in the texture and read darker — cheap depth.
    const depth = 1 - row / (ROWS - 1);            // 1 = back, 0 = front
    const y = rowGap * (row + 0.5);
    const pitch = 9 + rnd() * 2;
    for (let x = pitch * 0.5; x < W; x += pitch) {
      const jx = x + (rnd() - 0.5) * 3;
      const jy = y + (rnd() - 0.5) * 2;
      if (rnd() < 0.06) continue;                  // empty seats — stands are never full

      // The pop: a minority wear the venue accent at real saturation.
      const bright = rnd() < 0.12;
      const base = tops[Math.floor(rnd() * tops.length)];
      // Everyone else is mixed most of the way to the background. Back rows
      // recede further, which is what gives the tier depth instead of flatness.
      const t = bright ? 0.3 : 0.55 + depth * 0.1;
      ctx.fillStyle = mixHex(base, BG, Math.min(0.9, t));
      ctx.beginPath();
      ctx.ellipse(jx, jy + 1.6, 2.6, 3.0, 0, 0, Math.PI * 2);   // torso
      ctx.fill();

      const skin = skins[Math.floor(rnd() * skins.length)];
      ctx.fillStyle = mixHex(skin, BG, 0.45 + depth * 0.15);
      ctx.beginPath();
      ctx.arc(jx, jy - 2.0, 1.7, 0, Math.PI * 2);               // head
      ctx.fill();
    }
  }
  tex.update(false);
  return tex;
}

/** Broadcast signage: a bold wordmark + chevron stripes on the accent colour so
 *  a banner reads as arena signage, not a blank painted bar. */
function paintBanner(scene: Scene, accent: string): DynamicTexture {
  const W = 512, H = 128;
  const tex = new DynamicTexture('bannerTex', { width: W, height: H }, scene, false);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  for (let i = -H; i < W; i += 56) {
    ctx.beginPath();
    ctx.moveTo(i, 0); ctx.lineTo(i + 28, 0); ctx.lineTo(i + 28 - H, H); ctx.lineTo(i - H, H);
    ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 82px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('NEXUS', W / 2, H / 2 + 4);
  tex.update(false);
  return tex;
}

/** An indoor arena floor: a soft centre spotlight and two accent rings so a mat
 *  or stage reads as a lit performance surface instead of one flat colour. */
function paintStudio(scene: Scene, base: string, accent: string): DynamicTexture {
  const S = 1024;
  const tex = new DynamicTexture('studioTex', { width: S, height: S }, scene, false);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 60, S / 2, S / 2, S * 0.62);
  g.addColorStop(0, 'rgba(255,255,255,0.20)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.05)');
  g.addColorStop(1, 'rgba(0,0,0,0.30)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 8;
  ctx.beginPath(); ctx.arc(S / 2, S / 2, S * 0.34, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(S / 2, S / 2, S * 0.20, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;
  tex.update(false);
  return tex;
}

/** ARENA-10PHASE P8 (2026-09-07): a courtyard wall that reads as STONE — coursed blocks with mortar, a darker coping, damp
 *  and moss at the base — instead of one flat colour (the karate_h2h wall was a 14 × 3.6 m pale slab: "giant white
 *  placeholder plane", playtest d3d4a93). 4:1 like the wall box it wraps. */
function paintStoneWall(scene: Scene, base: string): DynamicTexture {
  const W = 1024, H = 256;
  const tex = new DynamicTexture('stoneWallTex', { width: W, height: H }, scene, false);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  const rnd = seeded(7);
  ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);
  const capH = H * 0.14;
  ctx.fillStyle = mixHex(base, '#3A3530', 0.55); ctx.fillRect(0, 0, W, capH);           // coping tiles
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; for (let x = 0; x < W; x += 48) ctx.fillRect(x, 0, 2, capH);
  const rows = 6, rowH = (H - capH) / rows, bw = 128;
  for (let r = 0; r < rows; r++) {
    const y = capH + r * rowH, off = (r % 2) * (bw / 2);
    for (let x = -off; x < W; x += bw) {
      const v = rnd();
      ctx.fillStyle = mixHex(base, v < 0.5 ? '#000000' : '#FFFFFF', 0.04 + rnd() * 0.10);
      ctx.fillRect(x + 3, y + 3, bw - 6, rowH - 6);
    }
  }
  ctx.strokeStyle = 'rgba(40,35,30,0.45)'; ctx.lineWidth = 3;                              // mortar
  for (let r = 0; r <= rows; r++) { const y = capH + r * rowH; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  const damp = ctx.createLinearGradient(0, H * 0.68, 0, H);
  damp.addColorStop(0, 'rgba(60,90,50,0)'); damp.addColorStop(1, 'rgba(60,90,50,0.45)');
  ctx.fillStyle = damp; ctx.fillRect(0, H * 0.68, W, H * 0.32);
  tex.update(false);
  return tex;
}

/** P8: a shrine courtyard is RAKED GRAVEL, not a spotlit stage — fine speckle, rake lines, and the rings the fight reads. */
function paintGravel(scene: Scene, base: string, accent: string): DynamicTexture {
  const S = 1024;
  const tex = new DynamicTexture('gravelTex', { width: S, height: S }, scene, false);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  const rnd = seeded(11);
  ctx.fillStyle = base; ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 16000; i++) { ctx.fillStyle = rnd() < 0.5 ? 'rgba(90,80,70,0.32)' : 'rgba(255,255,255,0.26)'; ctx.fillRect(rnd() * S, rnd() * S, 2, 2); }
  ctx.strokeStyle = 'rgba(90,80,70,0.14)'; ctx.lineWidth = 3;
  for (let y = 0; y < S; y += 14) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y); ctx.stroke(); }
  ctx.strokeStyle = accent; ctx.globalAlpha = 0.5; ctx.lineWidth = 8;
  ctx.beginPath(); ctx.arc(S / 2, S / 2, S * 0.34, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(S / 2, S / 2, S * 0.20, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;
  tex.update(false);
  return tex;
}
const lumaOf = (hex: string): number => { const v = hex.replace('#', ''); return (parseInt(v.slice(0, 2), 16) * 0.3 + parseInt(v.slice(2, 4), 16) * 0.59 + parseInt(v.slice(4, 6), 16) * 0.11) / 255; };

function buildGround(scene: Scene, g: GroundSpec, root: TransformNode): Mesh {
  // NAME MATTERS. M64's CameraDirector occlusion probe recognises venue shell
  // by name — /^(venue_ground|venue_box|wall_|...)/ — because VenueKit builds
  // these without collision flags. A ground called 'nexus_ground' would be
  // invisible to that probe, and the camera would sink through the floor
  // exactly as it did in E26. Keep the prefix.
  const mesh = MeshBuilder.CreateGround(
    'venue_ground', { width: g.size[0], height: g.size[1], subdivisions: 2 }, scene);
  mesh.parent = root;
  if (g.offset) mesh.position.set(g.offset[0], 0, g.offset[1]);
  mesh.receiveShadows = true;
  // Named so the M64 CameraDirector occlusion probe recognises it as venue
  // shell even though it carries no collision flag.
  mesh.isPickable = true;

  // SHARED-PLACE-FLOOR: grass fields (pitch / diamond / green) are painted TURF — mown bands, mottle, wear — with their
  // real markings in world metres. They were one flat colour plus a grain, which is what every greybox field read as.
  const fieldKind = g.kind === 'pitch' || g.kind === 'diamond' || g.kind === 'green';
  if (PREMIUM_DRESSING && fieldKind && (!g.markings || g.markings === 'none' || g.markings === 'diamond' || g.markings === 'penalty')) {
    const fm = fieldMaterial(scene, 'nexus_groundMat', {
      size: g.size, center: g.offset, base: g.color, marks: g.markings === 'diamond' || g.markings === 'penalty' ? g.markings : 'none',
    });
    fm.albedoTexture!.wrapU = Texture.CLAMP_ADDRESSMODE; fm.albedoTexture!.wrapV = Texture.CLAMP_ADDRESSMODE;
    mesh.material = fm;
    return mesh;
  }
  const mat = surface(scene, 'nexus_groundMat', g.color, g.kind === 'water' ? 0.25 : 0.85);
  if (g.markings && g.markings !== 'none') {
    mat.albedoTexture = paintMarkings(scene, g.markings, g.color, g.lineColor ?? '#FFFFFF', g.size);
  } else if (g.kind === 'water' || g.kind === 'snow' || g.kind === 'sand') {
    mat.albedoTexture = paintOrganic(scene, g.kind, g.color);
  } else if (PREMIUM_DRESSING && g.kind === 'mat' && lumaOf(g.color) > 0.62) {
    // P8: a light mat is an outdoor courtyard (the shrine gravel) — raked gravel, not the indoor spotlight floor
    mat.albedoTexture = paintGravel(scene, g.color, g.lineColor ?? '#6B5B4A');
  } else if (PREMIUM_DRESSING && (g.kind === 'mat' || g.kind === 'stage')) {
    // M108: indoor arenas (dojo, gym, dance, quiz stages) get a lit spotlight
    // floor with accent rings instead of one flat colour.
    mat.albedoTexture = paintStudio(scene, g.color, g.lineColor ?? '#FFFFFF');
  }
  if (mat.albedoTexture) {
    (mat.albedoTexture as Texture).wrapU = Texture.CLAMP_ADDRESSMODE;
    (mat.albedoTexture as Texture).wrapV = Texture.CLAMP_ADDRESSMODE;
  }
  if (g.kind === 'water') { mat.metallic = 0.15; mat.roughness = 0.2; }
  mesh.material = mat;
  return mesh;
}

// ── props ─────────────────────────────────────────────────────────────────

function buildProp(scene: Scene, p: PropSpec, root: TransformNode, shadows: ShadowGenerator): void {
  const s = p.scale ?? 1;
  const at = v3(p.position);
  const node = new TransformNode(`prop_${p.kind}_${at.x}_${at.z}`, scene);
  node.parent = root;
  node.position = at;
  node.rotation.y = p.rotationY ?? 0;

  const add = (m: Mesh, castShadow = true) => {
    m.parent = node;
    if (castShadow) shadows.addShadowCaster(m);
    return m;
  };

  switch (p.kind) {
    case 'hoop': {
      // Rim placement comes from HOOP_RIM_OFFSET so a mode can compute where the
      // ball actually has to go. See the constant for why that matters.
      const pole = MeshBuilder.CreateCylinder('pole', { height: 3.30 * s, diameter: 0.16 * s }, scene);
      pole.position.y = (3.30 * s) / 2;
      pole.material = surface(scene, 'poleMat', '#2A2E37', 0.5, 0.4);
      add(pole);
      // Regulation backboard is 1.8m wide x 1.05m tall with its lower edge
      // level with the rim, so its centre sits half a board above rim height.
      const board = MeshBuilder.CreateBox('board', { width: 1.8 * s, height: 1.05 * s, depth: 0.06 * s }, scene);
      board.position.set(0, (HOOP_RIM_OFFSET.y + 0.45) * s, 0.3 * s);
      board.material = surface(scene, 'boardMat', '#F4F1E8', 0.4);
      add(board);
      const rim = MeshBuilder.CreateTorus('rim', { diameter: 0.90 * s, thickness: 0.055 * s, tessellation: 24 }, scene);
      rim.position.set(0, HOOP_RIM_OFFSET.y * s, HOOP_RIM_OFFSET.z * s);
      rim.material = emissive(scene, 'rimMat', p.color ?? '#FF6B00', 0.5);
      add(rim);
      if (PREMIUM_DRESSING) {
        // M108: a hanging net under the rim — the single clearest tell that
        // separates a real hoop from a bare ring. Wireframe tube = net cords.
        const net = MeshBuilder.CreateCylinder('hoopnet',
          { height: 0.42 * s, diameterTop: 0.82 * s, diameterBottom: 0.44 * s, tessellation: 12, cap: Mesh.NO_CAP }, scene);
        net.position.set(0, HOOP_RIM_OFFSET.y * s - 0.21 * s, HOOP_RIM_OFFSET.z * s);
        const nmat = new StandardMaterial('hoopNetMat', scene);
        nmat.emissiveColor = c3('#FFFFFF'); nmat.disableLighting = true;
        nmat.wireframe = true; nmat.alpha = 0.85;
        net.material = nmat; net.isPickable = false;
        add(net, false);
      }
      break;
    }
    case 'backboardPole': {
      const m = MeshBuilder.CreateCylinder('p', { height: 3.2 * s, diameter: 0.14 * s }, scene);
      m.position.y = 1.6 * s;
      m.material = surface(scene, 'bpMat', p.color ?? '#2A2E37', 0.5, 0.3);
      add(m);
      break;
    }
    case 'goal': {
      const w = 3.6 * s, h = 2.0 * s;
      for (const [x, y, hh, dd] of [[-w / 2, h / 2, h, 0.12], [w / 2, h / 2, h, 0.12]] as const) {
        const post = MeshBuilder.CreateCylinder('post', { height: hh, diameter: dd * s }, scene);
        post.position.set(x, y, 0);
        post.material = surface(scene, 'goalMat', '#FFFFFF', 0.5);
        add(post);
      }
      const bar = MeshBuilder.CreateCylinder('bar', { height: w, diameter: 0.12 * s }, scene);
      bar.rotation.z = Math.PI / 2; bar.position.y = h;
      bar.material = surface(scene, 'goalMat2', '#FFFFFF', 0.5);
      add(bar);
      if (PREMIUM_DRESSING) {
        // M108: netting behind the mouth so a goal reads as a goal, not a frame.
        const net = MeshBuilder.CreateBox('goalnet', { width: w * 0.96, height: h * 0.94, depth: 1.2 * s }, scene);
        net.position.set(0, h * 0.47, -0.62 * s);
        const nmat = new StandardMaterial('goalNetMat', scene);
        nmat.emissiveColor = c3('#FFFFFF'); nmat.disableLighting = true;
        nmat.wireframe = true; nmat.alpha = 0.7;
        net.material = nmat; net.isPickable = false;
        add(net, false);
      }
      break;
    }
    case 'net': {
      const m = MeshBuilder.CreateBox('net', { width: 9 * s, height: 1.0 * s, depth: 0.05 }, scene);
      m.position.y = 0.9 * s;
      const mat = surface(scene, 'netMat', p.color ?? '#FFFFFF', 0.9);
      mat.alpha = 0.35;
      m.material = mat;
      add(m, false);
      break;
    }
    case 'wall': {
      // 'wall_' prefix so the CameraDirector occlusion probe sees it (see the
      // note on the ground mesh above).
      const m = MeshBuilder.CreateBox('wall_nexus', { width: 24 * s, height: 6 * s, depth: 0.4 }, scene);
      m.position.y = 3 * s;
      const wmat = surface(scene, 'wallMat', p.color ?? '#12151F', 0.9);
      if (PREMIUM_DRESSING) wmat.albedoTexture = paintStoneWall(scene, p.color ?? '#12151F');   // P8: stone, not a painted slab
      m.material = wmat;
      add(m, false);
      break;
    }
    case 'crowdTier': {
      // SHARED-PLACE-FLOOR (2026-09-14): the shared PlacePack grandstand — one crowd texture across stepped rows of
      // seated silhouettes. The three blocks below each repeated a 7-row dab texture on a 0.9 m face, which is why
      // every spec stand (tennis, golf, derby, penalty, football, dance) read as a strip of static from the field.
      if (PREMIUM_DRESSING) {
        buildCrowdStand(scene, node, `stand_${at.x}_${at.z}`, { width: 22 * s, rows: 5, accent: p.color ?? '#ffd60a', seed: Math.round(at.x * 13 + at.z * 7) });
        break;
      }
      // Three stepped rows of blocks. Cheap, and at distance it reads as a
      // stand full of people far better than a flat painted plane does.
      const crowdTex = PREMIUM_DRESSING ? paintCrowd(scene, p.color ?? '#00E5FF') : null;
      for (let r = 0; r < 3; r++) {
        const row = MeshBuilder.CreateBox('tier', { width: 22 * s, height: 0.9 * s, depth: 1.6 * s }, scene);
        row.position.set(0, 0.45 * s + r * 0.85 * s, r * 1.5 * s);
        const rmat = surface(scene, `tierMat${r}`, r % 2 ? '#2A3048' : '#343C58', 0.95);
        if (crowdTex) {
          // M108: a living crowd texture instead of a flat grey block.
          rmat.albedoTexture = crowdTex;
          rmat.emissiveTexture = crowdTex;
          // Halved: every spectator glowing pulled the eye off the rim.
          // (Raised 0.09→0.16: at dusk-light levels 0.09 read as a black wall
          // that hid the painted ocean horizon behind the stand.)
          rmat.emissiveColor = c3('#FFFFFF').scale(0.5);
        }
        row.material = rmat;
        add(row, false);
      }
      break;
    }
    case 'palm': {
      const trunk = MeshBuilder.CreateCylinder('trunk', { height: 4.2 * s, diameterTop: 0.16 * s, diameterBottom: 0.26 * s }, scene);
      trunk.position.y = 2.1 * s;
      trunk.material = surface(scene, 'trunkMat', '#6B4A2F', 0.9);
      add(trunk);
      const crown = MeshBuilder.CreateCylinder('crown', { height: 1.1 * s, diameterTop: 0, diameterBottom: 2.6 * s, tessellation: 6 }, scene);
      crown.position.y = 4.6 * s;
      crown.material = surface(scene, 'crownMat', '#2FBF5B', 0.85);
      add(crown);
      break;
    }
    case 'lamp': {
      const post = MeshBuilder.CreateCylinder('lpost', { height: 5 * s, diameter: 0.12 * s }, scene);
      post.position.y = 2.5 * s;
      post.material = surface(scene, 'lampPost', '#2A2E37', 0.6, 0.3);
      add(post);
      const head = MeshBuilder.CreateSphere('lhead', { diameter: 0.5 * s }, scene);
      head.position.y = 5.1 * s;
      head.material = emissive(scene, 'lampHead', p.color ?? '#FFE9A8', 1.4);
      add(head, false);
      break;
    }
    case 'banner': {
      const m = MeshBuilder.CreateBox('banner', { width: 6 * s, height: 1.4 * s, depth: 0.08 }, scene);
      m.position.y = 4 * s;
      const bmat = emissive(scene, 'bannerMat', p.color ?? '#FF2D55', 0.35);
      if (PREMIUM_DRESSING) {
        // M108: painted arena signage (wordmark + chevrons) instead of a blank bar.
        const tex = paintBanner(scene, p.color ?? '#FF2D55');
        // Every banner prop sits on the back wall (negative z, no rotation) facing
        // the court at positive z, where the gameplay camera lives. A box's +z
        // face mirrors a texture painted for its -z face by default, so the
        // wordmark reads backwards from the one angle players actually see it
        // from. Flip u once here instead of chasing per-venue rotations.
        tex.uScale = -1;
        bmat.albedoTexture = tex;
        bmat.emissiveTexture = tex;
        bmat.emissiveColor = c3('#FFFFFF').scale(0.5);
      }
      m.material = bmat;
      add(m, false);
      break;
    }
    case 'ramp': {
      const m = MeshBuilder.CreateBox('ramp', { width: 6 * s, height: 0.3, depth: 4 * s }, scene);
      m.rotation.x = -0.42; m.position.y = 0.9 * s;
      m.material = surface(scene, 'rampMat', p.color ?? '#4A4F5C', 0.8);
      add(m);
      break;
    }
    case 'beam': {
      const m = MeshBuilder.CreateBox('beam', { width: 5 * s, height: 0.16 * s, depth: 0.5 * s }, scene);
      m.position.y = 1.25 * s;
      m.material = surface(scene, 'beamMat', p.color ?? '#C8A15A', 0.6);
      add(m);
      break;
    }
    case 'podium': {
      const m = MeshBuilder.CreateCylinder('podium', { height: 0.5 * s, diameter: 3 * s, tessellation: 24 }, scene);
      m.position.y = 0.25 * s;
      m.material = emissive(scene, 'podiumMat', p.color ?? '#5E5CE6', 0.25);
      add(m);
      break;
    }
    case 'tee': {
      const m = MeshBuilder.CreateCylinder('tee', { height: 0.12, diameter: 2.2 * s, tessellation: 20 }, scene);
      m.position.y = 0.06;
      m.material = surface(scene, 'teeMat', p.color ?? '#3FA45B', 0.9);
      add(m, false);
      break;
    }
    case 'flag': {
      const pole = MeshBuilder.CreateCylinder('fpole', { height: 2.2 * s, diameter: 0.05 }, scene);
      pole.position.y = 1.1 * s;
      pole.material = surface(scene, 'fpoleMat', '#EEEEEE', 0.5);
      add(pole);
      const cloth = MeshBuilder.CreateBox('flag', { width: 0.7 * s, height: 0.45 * s, depth: 0.02 }, scene);
      cloth.position.set(0.35 * s, 1.9 * s, 0);
      cloth.material = emissive(scene, 'flagMat', p.color ?? '#FF3B30', 0.4);
      add(cloth);
      break;
    }
  }
}

// ── actors ────────────────────────────────────────────────────────────────

/** A stylised stand-in body. Deliberately NOT a character rig: real avatars
 *  come from CharacterLibrary. This exists so a venue can be composed,
 *  framed and reviewed before any rig is loaded — and so a mode that fails to
 *  spawn characters still shows a readable scene instead of an empty court. */
function buildActor(scene: Scene, a: ActorSpec, root: TransformNode, shadows: ShadowGenerator): TransformNode {
  const node = new TransformNode(`actor_${a.id}`, scene);
  node.parent = root;
  node.position = v3(a.position);
  node.rotation.y = a.facing ?? 0;

  const tint = a.color ?? (a.role === 'player' ? '#FF6B00' : a.role === 'ally' ? '#4FC3F7' : '#E5484D');
  const mat = surface(scene, `actorMat_${a.id}`, tint, 0.65);

  const torso = MeshBuilder.CreateCapsule('torso', { height: 0.95, radius: 0.22 }, scene);
  torso.position.y = 1.12; torso.parent = node; torso.material = mat;
  shadows.addShadowCaster(torso);

  const head = MeshBuilder.CreateSphere('head', { diameter: 0.34 }, scene);
  head.position.y = 1.78; head.parent = node;
  head.material = surface(scene, `headMat_${a.id}`, '#F0C9A0', 0.75);
  shadows.addShadowCaster(head);

  for (const side of [-1, 1]) {
    const leg = MeshBuilder.CreateCapsule('leg', { height: 0.78, radius: 0.11 }, scene);
    leg.position.set(side * 0.13, 0.42, 0); leg.parent = node;
    leg.material = surface(scene, `legMat_${a.id}`, '#23262F', 0.8);
    shadows.addShadowCaster(leg);

    const arm = MeshBuilder.CreateCapsule('arm', { height: 0.7, radius: 0.085 }, scene);
    // Arms DOWN at the sides — the E25 lesson: a default pose that looks like
    // a T-pose is read as a broken rig, even on a placeholder.
    arm.position.set(side * 0.33, 1.15, 0); arm.parent = node;
    arm.material = mat;
    shadows.addShadowCaster(arm);
  }
  return node;
}

// ── build ─────────────────────────────────────────────────────────────────

export interface BuiltScene {
  root: TransformNode;
  camera: ArcRotateCamera;
  ground: Mesh;
  actors: TransformNode[];
  shadows: ShadowGenerator;
  dispose(): void;
}

/**
 * Build a complete venue from a spec. Idempotent and self-contained: every
 * mesh is parented to one root, so `dispose()` removes the whole venue
 * without touching anything else in the scene.
 */
// ── M110 procedural horizon backdrops ───────────────────────────────────────
// Painted into the sky-dome DynamicTexture (1024×512) so each venue reads as an
// actual place. All deterministic (seeded RNG) so a venue looks the same every
// load. Pure 2-D canvas ops — assetless, cheap, and CI-safe like the rest of
// the renderer. Gated by PREMIUM_DRESSING in buildNexusScene for instant
// rollback to the plain 2-stop gradient.

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
/**
 * A palm on the horizon, as a SILHOUETTE rather than a diagram.
 *
 * This drew six stroked curves in near-black at up to 18% of the sky texture's
 * height. Painted into a 1024x512 texture and then wrapped around a 400-unit
 * sky dome, that is enormous: the "palms" came out as huge dark spider shapes
 * hanging over the court, reading as bare winter branches rather than as
 * anything tropical, and they sat in exactly the part of frame the player looks
 * through on a dunk.
 *
 * The World-Population Protocol's rule applies to the sky as much as the
 * ground: atmosphere must not compete with the thing the player is trying to
 * see. So the palms are now small, drawn in the FOG colour rather than black so
 * they sit back in the haze like real distant trees, and their fronds are
 * tapered fills instead of uniform strokes.
 */
function paintPalm(
  ctx: CanvasRenderingContext2D, x: number, baseY: number, h: number, tint: string,
): void {
  ctx.save();
  ctx.fillStyle = tint;
  ctx.strokeStyle = tint;

  // trunk: a tapering curve, thicker at the base
  ctx.lineWidth = Math.max(1, h * 0.035);
  ctx.beginPath();
  ctx.moveTo(x, baseY);
  ctx.quadraticCurveTo(x + h * 0.10, baseY - h * 0.55, x + h * 0.15, baseY - h);
  ctx.stroke();

  const tx = x + h * 0.15, ty = baseY - h;
  for (let f = 0; f < 7; f++) {
    const ang = -Math.PI * 0.5 + (f - 3) * 0.44;
    const len = h * (0.30 + (f % 2) * 0.06);
    // a frond is a thin leaf shape: out along the angle, drooping, and back
    const ex = tx + Math.cos(ang) * len;
    const ey = ty + Math.sin(ang) * len + len * 0.34;      // gravity droop
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.quadraticCurveTo(tx + Math.cos(ang) * len * 0.6, ty + Math.sin(ang) * len * 0.5 - len * 0.10, ex, ey);
    ctx.quadraticCurveTo(tx + Math.cos(ang) * len * 0.55, ty + Math.sin(ang) * len * 0.5 + len * 0.10, tx, ty);
    ctx.fill();
  }
  ctx.restore();
}

/** Multi-stop sky per backdrop kind — the Meshy reference (public/backdrops/
 *  dunk.jpg) is orange-DOMINANT at the horizon with a hot-pink band and an
 *  indigo crown; a two-stop gradient blends that into a flat mauve at the
 *  exact band the camera looks at. Stops run v=0 (zenith) → the painted
 *  horizon at v=0.6. */
const BACKDROP_SKY_STOPS: Partial<Record<BackdropKind, [number, string][]>> = {
  beach: [[0, '#241a4e'], [0.34, '#7a2e7a'], [0.55, '#e85a71'], [0.78, '#ff9440'], [1, '#ffdd96']],
  ocean: [[0, '#1d3a6e'], [0.4, '#3a7cb0'], [0.75, '#7fc4d9'], [1, '#ffe9b0']],
  city: [[0, '#1c1445'], [0.5, '#6e2a6e'], [0.8, '#d85a6e'], [1, '#ff9d5c']],
  stadium: [[0, '#05061c'], [0.5, '#141a4a'], [0.85, '#3a2a6e'], [1, '#6e2a8a']],
  mountains: [[0, '#2a6ed9'], [0.5, '#6ea8e8'], [0.85, '#c4ddf4'], [1, '#f0f6fc']],
  dojo: [[0, '#0c1030'], [0.55, '#232a5c'], [0.85, '#4a3a6e'], [1, '#6e4a6e']],
  neon: [[0, '#060414'], [0.6, '#141031'], [1, '#2a1650']],
  links: [[0, '#3a7bd9'], [0.55, '#8ab8e8'], [1, '#e8f2fc']],
};

function paintBackdrop(ctx: CanvasRenderingContext2D, W: number, H: number, kind: BackdropKind): void {
  const rng = mulberry32(seedOf(kind));
  const horizon = Math.round(H * 0.6);

  switch (kind) {
    case 'beach':
    case 'ocean': {
      const sx = W * (kind === 'beach' ? 0.72 : 0.5), sy = horizon - H * 0.17, sr = H * 0.12;
      const g = ctx.createRadialGradient(sx, sy, 2, sx, sy, sr * 3.2);
      g.addColorStop(0, 'rgba(255,242,205,0.95)');
      g.addColorStop(0.4, 'rgba(255,198,138,0.5)');
      g.addColorStop(1, 'rgba(255,198,138,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, horizon);
      ctx.fillStyle = 'rgba(255,246,222,0.98)';
      ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
      // Sunset water: warm at the horizon line, cooling as it comes forward —
      // the old flat dark-blue wash is why the venue read as night, not dusk.
      const sea = ctx.createLinearGradient(0, horizon, 0, H);
      sea.addColorStop(0, 'rgba(198,95,110,0.85)');
      sea.addColorStop(0.35, 'rgba(120,60,100,0.75)');
      sea.addColorStop(1, 'rgba(40,38,84,0.8)');
      ctx.fillStyle = sea;
      ctx.fillRect(0, horizon, W, H - horizon);
      // sun glitter: a hot path on the water under the sun, wide at the horizon
      const gl = ctx.createLinearGradient(sx - W * 0.06, 0, sx + W * 0.06, 0);
      gl.addColorStop(0, 'rgba(255,190,100,0)');
      gl.addColorStop(0.5, 'rgba(255,224,160,0.85)');
      gl.addColorStop(1, 'rgba(255,190,100,0)');
      ctx.fillStyle = gl;
      ctx.fillRect(sx - W * 0.06, horizon, W * 0.12, H - horizon);
      // wave sparkles, denser + brighter near the glitter path
      for (let i = 0; i < 120; i++) {
        const y = horizon + rng() * (H - horizon);
        const x = rng() * W;
        const d = Math.abs(x - sx) / W;
        ctx.fillStyle = `rgba(255,205,145,${0.15 + (1 - d) * 0.5})`;
        ctx.fillRect(x, y, (1 - d) * (14 + rng() * 30) + 4, 1.5);
      }
      if (kind === 'beach') {
        // A LINE of small palms reads as a beach; five giants read as a problem.
        for (let i = 0; i < 11; i++) {
          paintPalm(ctx, rng() * W, horizon + 3, H * (0.045 + rng() * 0.028), 'rgba(46,22,52,0.75)');
        }
      }
      break;
    }
    case 'city': {
      ctx.fillStyle = 'rgba(255,180,140,0.10)'; ctx.fillRect(0, horizon - H * 0.1, W, H * 0.1);
      let x = 0;
      while (x < W) {
        const bw = 24 + rng() * 58;
        const bh = H * (0.08 + rng() * 0.30);
        const s = 18 + Math.floor(rng() * 26);
        ctx.fillStyle = `rgb(${s},${s + 6},${s + 16})`;
        ctx.fillRect(x, horizon - bh, bw, bh + (H - horizon));
        for (let wy = horizon - bh + 6; wy < horizon - 4; wy += 10)
          for (let wx = x + 4; wx < x + bw - 4; wx += 9)
            if (rng() < 0.5) {
              ctx.fillStyle = rng() < 0.7 ? 'rgba(255,220,150,0.85)' : 'rgba(150,210,255,0.7)';
              ctx.fillRect(wx, wy, 4, 5);
            }
        x += bw + 2;
      }
      break;
    }
    case 'stadium': {
      const standTop = horizon - H * 0.22;
      for (let t = 0; t < 4; t++) {
        const y = standTop + t * (horizon - standTop) / 4;
        ctx.fillStyle = `rgb(${30 + t * 6},${34 + t * 6},${44 + t * 6})`;
        ctx.fillRect(0, y, W, (horizon - standTop) / 4 + 1);
      }
      for (let i = 0; i < 1400; i++) {
        const y = standTop + rng() * (horizon - standTop);
        const c = 180 + Math.floor(rng() * 70);
        ctx.fillStyle = `rgba(${c},${c},${c},${0.5 + rng() * 0.4})`;
        ctx.fillRect(rng() * W, y, 2, 2);
      }
      for (let i = 0; i < 6; i++) {
        const fx = (i + 0.5) * W / 6, fy = standTop - H * 0.14;
        ctx.fillStyle = 'rgb(60,66,80)'; ctx.fillRect(fx - 2, fy, 4, H * 0.14);
        const g = ctx.createRadialGradient(fx, fy, 1, fx, fy, 26);
        g.addColorStop(0, 'rgba(255,255,240,0.95)'); g.addColorStop(1, 'rgba(255,255,240,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(fx, fy, 26, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'mountains': {
      const layers = [
        { base: horizon, amp: H * 0.20, col: 'rgba(96,116,148,0.9)' },
        { base: horizon + H * 0.02, amp: H * 0.28, col: 'rgba(62,80,112,0.95)' },
        { base: horizon + H * 0.05, amp: H * 0.36, col: 'rgb(38,52,78)' },
      ];
      for (const L of layers) {
        ctx.fillStyle = L.col; ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(0, L.base);
        const peaks = 6 + Math.floor(rng() * 4);
        for (let i = 0; i <= peaks; i++) ctx.lineTo((i / peaks) * W, L.base - (0.4 + rng() * 0.6) * L.amp);
        ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = 'rgba(240,246,255,0.9)';
      for (let i = 0; i < 7; i++) {
        const px = rng() * W, py = horizon - H * (0.18 + rng() * 0.14), s = 10 + rng() * 12;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - s, py + s); ctx.lineTo(px + s, py + s); ctx.closePath(); ctx.fill();
      }
      break;
    }
    case 'dojo': {
      ctx.fillStyle = 'rgba(34,22,16,0.96)'; ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 8; i++) {
        const x = (i / 8) * W + 8;
        ctx.fillStyle = 'rgba(255,232,190,0.10)'; ctx.fillRect(x, H * 0.34, W / 8 - 16, H * 0.42);
      }
      for (let i = 0; i <= 8; i++) { ctx.fillStyle = 'rgba(70,44,28,0.92)'; ctx.fillRect((i / 8) * W - 4, 0, 8, H); }
      ctx.fillStyle = 'rgb(58,36,22)'; ctx.fillRect(0, H * 0.30, W, 14);
      ctx.strokeStyle = 'rgba(200,60,40,0.5)'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(W * 0.5, H * 0.52, H * 0.15, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 5; i++) {
        const lx = (i + 0.5) * W / 5, ly = H * 0.2;
        const g = ctx.createRadialGradient(lx, ly, 1, lx, ly, 22);
        g.addColorStop(0, 'rgba(255,150,90,0.95)'); g.addColorStop(1, 'rgba(255,120,60,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(lx, ly, 22, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(220,90,50,0.95)'; ctx.fillRect(lx - 6, ly - 8, 12, 16);
      }
      break;
    }
    case 'neon': {
      ctx.fillStyle = 'rgba(6,4,14,0.85)'; ctx.fillRect(0, 0, W, H);
      const gy = horizon;
      ctx.strokeStyle = 'rgba(0,229,255,0.5)'; ctx.lineWidth = 1;
      for (let i = 0; i <= 24; i++) { const x = (i / 24) * W; ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(W * 0.5 + (x - W * 0.5) * 3, H); ctx.stroke(); }
      for (let i = 1; i <= 6; i++) { const y = gy + (i / 6) * (H - gy); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      const g = ctx.createLinearGradient(0, gy - 30, 0, gy + 10);
      g.addColorStop(0, 'rgba(168,85,247,0)'); g.addColorStop(1, 'rgba(168,85,247,0.6)');
      ctx.fillStyle = g; ctx.fillRect(0, gy - 30, W, 40);
      const cols = ['0,229,255', '255,51,102', '0,255,157', '168,85,247'];
      for (let i = 0; i < 14; i++) {
        const x = rng() * W, h2 = H * (0.1 + rng() * 0.3);
        ctx.fillStyle = `rgba(${cols[Math.floor(rng() * 4)]},0.5)`; ctx.fillRect(x, gy - h2, 3, h2);
      }
      for (let i = 0; i < 120; i++) { ctx.fillStyle = `rgba(255,255,255,${0.3 + rng() * 0.5})`; ctx.fillRect(rng() * W, rng() * gy, 1.5, 1.5); }
      break;
    }
    case 'links': {
      ctx.fillStyle = 'rgba(40,70,45,0.95)'; ctx.beginPath(); ctx.moveTo(0, horizon);
      for (let x = 0; x <= W; x += 12) ctx.lineTo(x, horizon - (6 + rng() * 16));
      ctx.lineTo(W, horizon); ctx.closePath(); ctx.fill();
      const hillCols = ['rgb(70,120,60)', 'rgb(92,152,74)'];
      for (let L = 0; L < 2; L++) {
        ctx.fillStyle = hillCols[L]; ctx.beginPath(); ctx.moveTo(0, H);
        const base = horizon + L * H * 0.06;
        for (let x = 0; x <= W; x += 8) ctx.lineTo(x, base + Math.sin((x / W) * Math.PI * (2 + L) + L * 1.3) * H * 0.04 + L * H * 0.05);
        ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
      }
      break;
    }
  }
}

export function buildNexusScene(scene: Scene, spec: NexusWebSpec, canvas?: HTMLCanvasElement): BuiltScene {
  const env = spec.environment;
  const root = new TransformNode(`nexus_${spec.modeId}`, scene);

  // sky + fog
  scene.clearColor = Color4.FromColor3(c3(env.skyBottom), 1);
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogColor = c3(env.fogColor);
  scene.fogDensity = env.fogDensity;

  // A gradient dome rather than a flat clear colour. It is one extra mesh and
  // it is most of why a scene reads as a place instead of a background.
  const sky = MeshBuilder.CreateSphere('nexus_sky', { diameter: 400, segments: 16, sideOrientation: Mesh.BACKSIDE }, scene);
  sky.parent = root;
  sky.isPickable = false;
  sky.applyFog = false;
  {
    // M110 — when a venue names a backdrop (and PREMIUM_DRESSING is on), paint a
    // recognisable procedural horizon into a WIDE texture so it wraps 360° round
    // the dome; otherwise keep the cheap 4px 2-stop gradient exactly as before.
    const useBackdrop = PREMIUM_DRESSING && !!env.backdrop;
    const W = useBackdrop ? 1024 : 4;
    const S = useBackdrop ? 512 : 256;
    const tex = new DynamicTexture('skyTex', { width: W, height: S }, scene, false);
    const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
    const grad = ctx.createLinearGradient(0, 0, 0, S);
    const stops = useBackdrop ? BACKDROP_SKY_STOPS[env.backdrop!] : undefined;
    if (stops) {
      // The painted horizon sits at v=0.6 — the sky stops span 0..0.6 so the
      // LAST stop lands exactly on the horizon line instead of the nadir.
      for (const [p, c] of stops) grad.addColorStop(p * 0.6, c);
      grad.addColorStop(1, stops[stops.length - 1][1]);
    } else {
      grad.addColorStop(0, env.skyTop);
      grad.addColorStop(1, env.skyBottom);
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, S);
    if (useBackdrop) paintBackdrop(ctx, W, S, env.backdrop!);
    tex.update(false);
    const m = new StandardMaterial('skyMat', scene);
    m.emissiveTexture = tex;
    m.disableLighting = true;
    m.backFaceCulling = false;
    sky.material = m;

    // Backdrop pipeline (scripts/backdrop/pipeline.mts): when a baked dome
    // exists for this venue's backdrop kind, it IS the sky — the painted
    // texture above stays as the instant placeholder + offline fallback.
    // The painted version still paints first so there is no pop-in of empty
    // sky while the jpg streams in.
    if (useBackdrop && env.backdrop === 'dojo' && typeof Image !== 'undefined') {
      // EYE SORES (owner, 2026-09-17: "the brown things are still there in karate endless"): the dojo bake's top third is a
      // cherry-blossom canopy and torii beams; at the fight camera's pitch it fills the top of the frame as brown marbling.
      // The bake is drawn into the painted sky and a warm sky gradient goes over the canopy band (rows 0..38 %); the shrine
      // and the torii keep the horizon. (mountBackdrop's outer dome does the same; this inner sphere is the one the camera sees.)
      const img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = () => {
        ctx.drawImage(img, 0, 0, W, S);
        const band = Math.round(S * 0.38); const g2 = ctx.createLinearGradient(0, 0, 0, band);
        g2.addColorStop(0, 'rgba(214,226,238,1)'); g2.addColorStop(0.55, 'rgba(226,214,208,0.92)'); g2.addColorStop(1, 'rgba(236,206,196,0)');
        ctx.fillStyle = g2; ctx.fillRect(0, 0, W, band);
        tex.update(false);
      };
      img.src = `/backdrops/baked/${env.backdrop}.jpg`;
    } else if (useBackdrop) {
      const baked = new Texture(
        `/backdrops/baked/${env.backdrop}.jpg`, scene, false, false, Texture.BILINEAR_SAMPLINGMODE,
        () => { m.emissiveTexture = baked; },
        () => { /* no baked dome for this kind — painted sky stays */ },
      );
    }
  }

  // lighting: hemispheric fill + directional key with shadows
  const fill = new HemisphericLight('nexus_fill', new Vector3(0, 1, 0), scene);
  fill.intensity = env.ambient;
  fill.diffuse = c3(env.skyTop);
  fill.groundColor = c3(env.fogColor).scale(0.6);

  const sun = new DirectionalLight('nexus_sun', v3(env.sunDirection).normalize(), scene);
  sun.position = v3(env.sunDirection).normalize().scale(-40);
  sun.intensity = 1.5 - env.ambient * 0.4;
  sun.diffuse = c3(env.sunColor);

  const shadows = new ShadowGenerator(1024, sun);
  // EYE SORES (2026-09-17): the exponential map bled every body into a huge soft brown smudge on the mat; PCF keeps a
  // body-shaped shadow with a soft edge (a small bias against acne on the flat mats)
  shadows.usePercentageCloserFiltering = true; shadows.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
  shadows.bias = 0.0006; shadows.normalBias = 0.02;
  shadows.darkness = 0.4;

  const ground = buildGround(scene, spec.ground, root);
  // Baked Meshy venue map (scripts/map/pipeline.mts → visual/VenueMaps.ts):
  // when this venue has one, it becomes the court and the world around it;
  // the procedural ground hides but stays live for bounds/camera logic.
  if (spec.mapKey) {
    void mountVenueMap(scene, root, spec.mapKey).then((ok) => {
      if (ok) ground.visibility = 0;
    });
  }
  for (const p of spec.props) buildProp(scene, p, root, shadows);
  const actors = spec.actors.map((a) => buildActor(scene, a, root, shadows));

  // camera
  const cam = new ArcRotateCamera(
    `nexus_cam_${spec.modeId}`, spec.camera.alpha, spec.camera.beta, spec.camera.radius,
    v3(spec.camera.target), scene);
  cam.fov = spec.camera.fov ?? 0.9;
  cam.minZ = 0.1;
  cam.maxZ = 500;
  cam.lowerBetaLimit = 0.15;
  cam.upperBetaLimit = Math.PI / 2 - 0.05;   // never dip under the floor (E26)
  cam.lowerRadiusLimit = 3;
  cam.upperRadiusLimit = spec.camera.radius * 2.2;
  if (canvas) cam.attachControl(canvas, true);
  scene.activeCamera = cam;

  // FRAMING GUARD — is the camera behind its own scenery?
  //
  // This is E26, the bug that cost three cycles on the live FEL build: the
  // camera resolved to a position on the far side of a venue wall and filled
  // the frame with flat paint. It reproduced immediately here (karate_h2h
  // rendered as a solid maroon rectangle), which is the whole argument for a
  // renderer you can actually run in CI.
  //
  // The check is exact rather than heuristic: a wall is a plane, so compare
  // which SIDE of it the camera and the target are on. Different sides means
  // the wall is between them, and nothing else needs to be guessed.
  cam.position;   // force Babylon to compute it from alpha/beta/radius
  for (const p of spec.props) {
    if (p.kind !== 'wall') continue;
    const ry = p.rotationY ?? 0;
    const normal = new Vector3(Math.sin(ry), 0, Math.cos(ry));
    const wallPos = v3(p.position);
    const dCam = Vector3.Dot(cam.position.subtract(wallPos), normal);
    const dTarget = Vector3.Dot(v3(spec.camera.target).subtract(wallPos), normal);
    if (dCam * dTarget < 0 && Math.abs(dCam) > 0.1) {
      console.warn(
        `[NEXUS] framing: camera for "${spec.modeId}" sits behind the wall at `
        + `[${p.position.join(', ')}] — it will fill the frame with flat colour. `
        + `Reduce camera.radius (${spec.camera.radius}), raise camera.beta, or move the wall out.`);
    }
  }

  // grade — the single biggest quality lever, and it is nearly free
  const ip = scene.imageProcessingConfiguration;
  ip.toneMappingEnabled = true;
  ip.exposure = env.grade.exposure;
  ip.contrast = env.grade.contrast;
  ip.vignetteEnabled = env.grade.vignette > 0;
  ip.vignetteWeight = env.grade.vignette * 4;
  ip.vignetteColor = Color4.FromColor3(c3(env.fogColor), 1);

  return {
    root, camera: cam, ground, actors, shadows,
    dispose() {
      shadows.dispose();
      sun.dispose();
      fill.dispose();
      cam.dispose();
      root.getDescendants().forEach((n) => n.dispose());
      root.dispose();
    },
  };
}

/** Convenience for a standalone page or a render harness. */
export function mountNexus(canvas: HTMLCanvasElement, spec: NexusWebSpec): { engine: Engine; scene: Scene; built: BuiltScene } {
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
  const scene = new Scene(engine);
  const built = buildNexusScene(scene, spec, canvas);
  engine.runRenderLoop(() => scene.render());
  window.addEventListener('resize', () => engine.resize());
  return { engine, scene, built };
}
