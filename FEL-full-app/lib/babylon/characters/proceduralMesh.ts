// proceduralMesh — skins the rig with cel-shaded primitive geometry. Every
// part is a plain mesh PARENTED to an animated TransformNode (rigid parenting,
// NOT vertex skinning) so limbs follow the rig with zero weight-painting and
// therefore zero skinning artifacts.
//
// M107 QUALITY PASS: the athlete is still 100% primitives (safe, assetless) but
// is now built for a readable, premium toon-athlete silhouette instead of the
// plain capsule-and-sphere stack:
//   • ATHLETIC TAPER — torso is a V-tapered trunk (narrow waist → broad chest),
//     limbs taper toward the joints, so the figure reads as a body not tubes.
//   • SNEAKERS — two-tone shoe (dark upper + accent sole + toe cap) instead of
//     a plain box; white socks at the ankle.
//   • HEAD — cranium + hair cap + accent headband + brow so it reads as a face.
//   • KIT DETAIL — jersey number on the back, accent shoulder trim, wristbands,
//     knee accents; shorts as a distinct hem.
//   • GROUNDING — a soft contact-shadow disc under the feet so the athlete sits
//     ON the court instead of floating (huge cheap perceived-quality win).
// Tint drives the jersey / shorts / accents; skin + shoe tones are fixed for a
// consistent, readable athlete. A neon Fresnel rim on the jersey + head keeps
// the NEXUS look.

import {
  Color3, DynamicTexture, MeshBuilder, Quaternion, StandardMaterial, Vector3,
  FresnelParameters,
} from '@babylonjs/core';
import type { AbstractMesh, Mesh, Scene, TransformNode } from '@babylonjs/core';
import type { ProceduralRig } from './proceduralRig';

const SKIN = '#C68A5E';
const SHOE = '#141414';
const SOCK = '#F2F2F2';
const HAIR = '#1A1712';
const DEFAULT_JERSEY = '#2F6BFF';

// A brighter, slightly hue-shifted accent derived from the jersey tint — used
// for trim, sole, headband, wristbands so the kit reads as a designed uniform.
function accentOf(hex: string): string {
  const c = Color3.FromHexString(hex);
  // push toward white a touch + lift value so it pops against the jersey
  const r = Math.min(1, c.r * 0.5 + 0.5);
  const g = Math.min(1, c.g * 0.5 + 0.5);
  const b = Math.min(1, c.b * 0.5 + 0.5);
  return new Color3(r, g, b).toHexString();
}

function celMat(scene: Scene, name: string, hex: string, rim: boolean): StandardMaterial {
  const c = Color3.FromHexString(hex);
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = c;
  m.specularColor = new Color3(0.05, 0.05, 0.05);   // flat, no plastic highlight
  m.emissiveColor = c.scale(0.15);                  // gentle self-glow (cel base)
  if (rim) {
    const f = new FresnelParameters();
    f.bias = 0.28; f.power = 2.4;
    f.leftColor = c.scale(1.15); f.rightColor = Color3.Black();
    m.emissiveFresnelParameters = f;                // edge rim light
  }
  return m;
}

/** Capsule bone segment, parented to `parent`, spanning parent origin → offset. */
function segment(
  scene: Scene, id: string, parent: TransformNode,
  offset: [number, number, number], radius: number,
): Mesh {
  const dir = new Vector3(offset[0], offset[1], offset[2]);
  const len = Math.max(dir.length(), 0.02);
  const cap = MeshBuilder.CreateCapsule(id, {
    radius, height: len, tessellation: 14, capSubdivisions: 5,
  }, scene);
  orientAlong(cap, dir);
  cap.parent = parent;
  cap.position = dir.scale(0.5);
  return cap;
}

/** Tapered cylinder segment (rounded look via joint spheres at each end). Used
 *  where a real body narrows/widens — torso, thighs, upper arms. */
function taperSeg(
  scene: Scene, id: string, parent: TransformNode,
  offset: [number, number, number], rTop: number, rBottom: number,
): Mesh {
  const dir = new Vector3(offset[0], offset[1], offset[2]);
  const len = Math.max(dir.length(), 0.02);
  // +Y points from parent origin toward the child; "top" is the child end.
  const cyl = MeshBuilder.CreateCylinder(id, {
    height: len, diameterTop: rTop * 2, diameterBottom: rBottom * 2, tessellation: 18,
  }, scene);
  orientAlong(cyl, dir);
  cyl.parent = parent;
  cyl.position = dir.scale(0.5);
  return cyl;
}

/** Orient a +Y-aligned mesh so its local +Y points along `dir`. */
function orientAlong(mesh: Mesh, dir: Vector3): void {
  const up = Vector3.Up();
  const nd = dir.normalizeToNew();
  const dot = Vector3.Dot(up, nd);
  if (dot < 0.9999) {
    if (dot < -0.9999) {
      mesh.rotationQuaternion = Quaternion.RotationAxis(Vector3.Right(), Math.PI);
    } else {
      const axis = Vector3.Cross(up, nd).normalize();
      mesh.rotationQuaternion = Quaternion.RotationAxis(axis, Math.acos(dot));
    }
  } else {
    mesh.rotationQuaternion = Quaternion.Identity();
  }
}

function joint(scene: Scene, id: string, parent: TransformNode, r: number): Mesh {
  const s = MeshBuilder.CreateSphere(id, { diameter: r * 2, segments: 12 }, scene);
  s.parent = parent;
  s.position = Vector3.Zero();
  return s;
}

/** Back-of-jersey number decal on a small plane (transparent background). */
function numberPlane(scene: Scene, id: string, num: number, fg: string): Mesh {
  const dt = new DynamicTexture(`num_${id}`, { width: 256, height: 256 }, scene, false);
  dt.hasAlpha = true;
  const c2d = dt.getContext() as unknown as CanvasRenderingContext2D;
  c2d.clearRect(0, 0, 256, 256);
  c2d.font = 'bold 200px Arial, sans-serif';
  c2d.textAlign = 'center';
  c2d.textBaseline = 'middle';
  c2d.fillStyle = fg;
  c2d.fillText(String(num), 128, 140);
  dt.update();
  const m = new StandardMaterial(`numMat_${id}`, scene);
  m.diffuseTexture = dt;
  m.diffuseTexture.hasAlpha = true;
  m.useAlphaFromDiffuseTexture = true;
  m.emissiveColor = new Color3(0.9, 0.9, 0.9);
  m.specularColor = Color3.Black();
  m.backFaceCulling = false;
  const plane = MeshBuilder.CreatePlane(`num_${id}`, { size: 0.26 }, scene);
  plane.material = m;
  return plane;
}

// M110 — richer "skins". `tint` still drives jersey/shorts/accent as before, so
// every existing caller is unchanged. The optional fields let a caller give a
// character a distinct look (own accent, skin tone, hair, shoe colour) so a
// player and a rival read as different people, not palette swaps of one.
export interface BodyOpts {
  tint?: string;
  accent?: string;
  skinTone?: string;
  hairColor?: string;
  shoeColor?: string;
}

/** Build + parent all body meshes onto the rig. Returns every mesh created. */
export function buildBody(scene: Scene, rig: ProceduralRig, opts: BodyOpts = {}): AbstractMesh[] {
  const { nodes, offsets, root } = rig;
  const id = root.name;
  const jerseyHex = opts.tint ?? DEFAULT_JERSEY;
  const accentHex = opts.accent ?? accentOf(jerseyHex);
  const shortsHex = Color3.FromHexString(jerseyHex).scale(0.5).toHexString();
  const skinHex = opts.skinTone ?? SKIN;
  const hairHex = opts.hairColor ?? HAIR;
  const shoeHex = opts.shoeColor ?? SHOE;

  const jersey = celMat(scene, `jersey_${id}`, jerseyHex, true);
  const accent = celMat(scene, `accent_${id}`, accentHex, true);
  const shorts = celMat(scene, `shorts_${id}`, shortsHex, false);
  const skin = celMat(scene, `skin_${id}`, skinHex, false);
  const skinRim = celMat(scene, `skinR_${id}`, skinHex, true);
  const shoe = celMat(scene, `shoe_${id}`, shoeHex, false);
  const sock = celMat(scene, `sock_${id}`, SOCK, false);
  const hair = celMat(scene, `hair_${id}`, hairHex, false);

  const parts: AbstractMesh[] = [];
  const add = (m: Mesh, mat: StandardMaterial) => { m.material = mat; parts.push(m); return m; };

  // ── Torso: V-tapered trunk (waist → chest) + pecs + shorts hem ──
  add(taperSeg(scene, `waist_${id}`, nodes.Hips, offsets.Spine, 0.135, 0.115), shorts);
  add(taperSeg(scene, `trunk_${id}`, nodes.Spine, offsets.Spine2, 0.17, 0.135), jersey);
  const chest = add(MeshBuilder.CreateSphere(`chest_${id}`, { diameterX: 0.34, diameterY: 0.24, diameterZ: 0.22, segments: 14 }, scene), jersey);
  chest.parent = nodes.Spine2; chest.position = new Vector3(0, 0.015, 0.01);
  // shorts block around the hips
  const pelvis = add(MeshBuilder.CreateSphere(`pelvis_${id}`, { diameterX: 0.30, diameterY: 0.20, diameterZ: 0.24, segments: 12 }, scene), shorts);
  pelvis.parent = nodes.Hips; pelvis.position = new Vector3(0, -0.03, 0);
  // number on the back (faces -Z; the athlete faces +Z into the play). Built
  // with its own DynamicTexture material — do NOT route through add() (which
  // would overwrite the decal material with the jersey).
  const num = 1 + (Math.abs(hashStr(jerseyHex)) % 44);
  const back = numberPlane(scene, `${id}`, num, '#FFFFFF');
  back.parent = nodes.Spine2; back.position = new Vector3(0, 0.02, -0.16); back.rotation = new Vector3(0, Math.PI, 0);
  parts.push(back);

  // ── Neck + head + hair + headband + brow ──
  add(segment(scene, `neck_${id}`, nodes.Neck, offsets.Head, 0.05), skin);
  const head = add(MeshBuilder.CreateSphere(`head_${id}`, { diameterX: 0.20, diameterY: 0.245, diameterZ: 0.215, segments: 18 }, scene), skinRim);
  head.parent = nodes.Head; head.position = new Vector3(0, 0.135, 0);
  const hairCap = add(MeshBuilder.CreateSphere(`hair_${id}`, { diameterX: 0.215, diameterY: 0.20, diameterZ: 0.225, segments: 16, slice: 0.62 }, scene), hair);
  hairCap.parent = nodes.Head; hairCap.position = new Vector3(0, 0.175, -0.01);
  const band = add(MeshBuilder.CreateTorus(`band_${id}`, { diameter: 0.205, thickness: 0.03, tessellation: 20 }, scene), accent);
  band.parent = nodes.Head; band.position = new Vector3(0, 0.185, 0); band.rotation = new Vector3(Math.PI / 2, 0, 0);

  // ── Arms: deltoid, tapered upper arm (jersey), forearm (skin), wristband, hand ──
  for (const side of ['Left', 'Right'] as const) {
    const s = side === 'Left' ? 1 : -1;
    add(joint(scene, `delt_${side}_${id}`, nodes[`${side}Arm`], 0.075), jersey);
    add(taperSeg(scene, `upArm_${side}_${id}`, nodes[`${side}Arm`], offsets[`${side}ForeArm`], 0.045, 0.058), jersey);
    add(joint(scene, `elb_${side}_${id}`, nodes[`${side}ForeArm`], 0.046), skin);
    add(segment(scene, `foreArm_${side}_${id}`, nodes[`${side}ForeArm`], offsets[`${side}Hand`], 0.04), skin);
    // wristband accent just above the hand
    const wb = add(MeshBuilder.CreateCylinder(`wrist_${side}_${id}`, { height: 0.05, diameter: 0.095 }, scene), accent);
    wb.parent = nodes[`${side}Hand`]; wb.position = new Vector3(0, 0.055, 0);
    // hand: flattened sphere
    const hand = add(MeshBuilder.CreateSphere(`hand_${side}_${id}`, { diameterX: 0.075, diameterY: 0.11, diameterZ: 0.05, segments: 10 }, scene), skin);
    hand.parent = nodes[`${side}Hand`]; hand.position = new Vector3(s * 0.005, -0.02, 0);
  }

  // ── Legs: tapered thigh (shorts), knee accent, shin (skin), sock, sneaker ──
  for (const side of ['Left', 'Right'] as const) {
    add(taperSeg(scene, `thigh_${side}_${id}`, nodes[`${side}UpLeg`], offsets[`${side}Leg`], 0.062, 0.088), shorts);
    add(joint(scene, `knee_${side}_${id}`, nodes[`${side}Leg`], 0.062), skin);
    // knee accent pad
    const pad = add(MeshBuilder.CreateSphere(`kneepad_${side}_${id}`, { diameterX: 0.10, diameterY: 0.09, diameterZ: 0.06, segments: 10 }, scene), accent);
    pad.parent = nodes[`${side}Leg`]; pad.position = new Vector3(0, 0.01, 0.045);
    add(taperSeg(scene, `shin_${side}_${id}`, nodes[`${side}Leg`], offsets[`${side}Foot`], 0.042, 0.058), skin);
    // sock at the ankle
    const skm = add(MeshBuilder.CreateCylinder(`sock_${side}_${id}`, { height: 0.11, diameter: 0.095 }, scene), sock);
    skm.parent = nodes[`${side}Foot`]; skm.position = new Vector3(0, 0.06, 0);
    // sneaker: dark upper + toe cap + accent sole
    const upper = add(MeshBuilder.CreateBox(`shoe_${side}_${id}`, { width: 0.105, height: 0.075, depth: 0.235 }, scene), shoe);
    upper.parent = nodes[`${side}Foot`]; upper.position = new Vector3(0, -0.03, 0.075);
    const toe = add(MeshBuilder.CreateSphere(`toe_${side}_${id}`, { diameterX: 0.10, diameterY: 0.07, diameterZ: 0.10, segments: 10 }, scene), shoe);
    toe.parent = nodes[`${side}Foot`]; toe.position = new Vector3(0, -0.03, 0.185);
    const sole = add(MeshBuilder.CreateBox(`sole_${side}_${id}`, { width: 0.115, height: 0.03, depth: 0.30 }, scene), accent);
    sole.parent = nodes[`${side}Foot`]; sole.position = new Vector3(0, -0.062, 0.085);
  }

  // ── Contact shadow: a soft dark disc on the ground, following the athlete ──
  const shadowMat = new StandardMaterial(`shadow_${id}`, scene);
  shadowMat.diffuseColor = Color3.Black();
  shadowMat.emissiveColor = Color3.Black();
  shadowMat.specularColor = Color3.Black();
  shadowMat.disableLighting = true;
  shadowMat.alpha = 0.30;
  const shadow = MeshBuilder.CreateDisc(`contactShadow_${id}`, { radius: 0.42, tessellation: 28 }, scene);
  shadow.material = shadowMat;
  shadow.parent = root;
  shadow.rotation = new Vector3(Math.PI / 2, 0, 0);
  shadow.position = new Vector3(0, 0.02, 0);
  shadow.isPickable = false;
  parts.push(shadow);

  return parts;
}

/** Small stable hash so a given jersey tint yields a consistent jersey number. */
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}
