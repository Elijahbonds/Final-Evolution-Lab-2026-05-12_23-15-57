// TOY PLANE — the Aero Aces aircraft as a chunky cartoon prop plane (2026-09-15, owner: Aero Aces "like diddy Kong
// flyers"; decision: a CARTOONY TOY PLANE with the hero seated in an OPEN COCKPIT, head and scarf visible).
//
// The previous airframe was a scale aircraft — a tapered barrel, swept wings, winglets — which is the right shape for a
// sim and the wrong one here. A kart-racer plane reads as a TOY: everything round, fat and oversized so it reads at a
// glance from a chase camera. The proportions do that work:
//   · a SHORT, FAT fuselage (a stretched sphere), a big round COWLING ring and a two-blade PROP on a fat spinner;
//   · one thick straight WING with rounded tips, a stubby tail with a round-topped fin;
//   · big WHEELS on struts (a plane that could land on a beach);
//   · an OPEN COCKPIT ring the pilot sits in, chest up, with a small windscreen — the rider is the point of the picture;
//   · two-tone paint: body colour + a bright trim (wings, cowling, fin), plus a racing number disc on the flank.
// Rivals get the same build tinted, with a simple toy pilot (head, cap, goggles) instead of a skinned body.
//
// Nose is +Z, up is +Y, right wing is +X. The mode applies heading / pitch / roll to the root.

import { Color3, Mesh, MeshBuilder, TransformNode, Vector3 } from '@babylonjs/core';
import type { PBRMaterial, Scene } from '@babylonjs/core';
import { VenueKit } from '../visual/VenueKit';

export interface ToyPlane {
  root: TransformNode;
  /** Turned by the mode, fast. */
  prop: TransformNode;
  /** Where the pilot's hips go (local to root). */
  seat: TransformNode;
  /** The scarf's anchor at the pilot's neck (local to root). */
  scarfAnchor: TransformNode;
  body: PBRMaterial;
  /** the primitive parts (models pass phase 5: a dressed Meshy body hides them) */
  parts: Mesh[];
  dispose(): void;
}

/** The model's scale (see buildToyPlane). */
export const TOY_SCALE = 0.62;
/** Where the pilot's hips sit, in MODEL units (scaled to the root by TOY_SCALE). */
export const TOY_SEAT = { y: 0.95, z: 0.2 };

const paint = (scene: Scene, name: string, hex: string, e = 0.08, r = 0.45): PBRMaterial => {
  const m = VenueKit.paint(scene, name, hex, e, r);
  m.environmentIntensity = 0.55; m.metallic = 0.05;
  return m;
};

export function buildToyPlane(scene: Scene, name: string, bodyHex: string, trimHex: string, opts: { toyPilot?: boolean } = {}): ToyPlane {
  const root = new TransformNode(`toy_${name}`, scene);
  // THE MODEL IS BUILT BIG AND SHOWN AT TOY_SCALE: authored against a 2 m fuselage for easy numbers, the plane dwarfed its
  // pilot (a hero 1.3 m tall in an 8 m aircraft read as a doll in a jumbo — measured on the first frame). The body parts
  // hang off `model`; the seat and scarf anchors stay on the root so the pilot keeps its own scale.
  const model = new TransformNode(`toy_model_${name}`, scene);
  model.parent = root; model.scaling.setAll(TOY_SCALE);
  const body = paint(scene, `toy_body_${name}`, bodyHex, 0.1, 0.38);
  const trim = paint(scene, `toy_trim_${name}`, trimHex, 0.12, 0.4);
  const dark = paint(scene, `toy_dark_${name}`, '#20232b', 0.03, 0.6);
  const cream = paint(scene, `toy_cream_${name}`, '#f6efdc', 0.12, 0.5);
  const parts: Mesh[] = [];
  const add = <T extends Mesh>(m: T, mat: PBRMaterial, parent: TransformNode = model): T => { m.material = mat; m.parent = parent; m.isPickable = false; parts.push(m); return m; };

  // ── fuselage: a fat stretched sphere, the tail tapering off into a cone ──
  const fuse = add(MeshBuilder.CreateSphere(`toy_fuse_${name}`, { diameterX: 2.1, diameterY: 2.0, diameterZ: 4.2, segments: 20 }, scene), body);
  fuse.position.z = 0.1;
  const tail = add(MeshBuilder.CreateCylinder(`toy_tail_${name}`, { height: 3.0, diameterTop: 1.5, diameterBottom: 0.35, tessellation: 18 }, scene), body);
  tail.rotation.x = Math.PI / 2; tail.position.set(0, 0.25, -2.6);

  // ── cowling ring, spinner and a two-blade prop ──
  const cowl = add(MeshBuilder.CreateTorus(`toy_cowl_${name}`, { diameter: 1.7, thickness: 0.42, tessellation: 24 }, scene), trim);
  cowl.rotation.x = Math.PI / 2; cowl.position.z = 2.1;
  const face = add(MeshBuilder.CreateCylinder(`toy_face_${name}`, { height: 0.2, diameter: 1.5, tessellation: 20 }, scene), dark);
  face.rotation.x = Math.PI / 2; face.position.z = 2.12;
  const prop = new TransformNode(`toy_prop_${name}`, scene); prop.parent = model; prop.position.z = 2.45;
  const spinner = add(MeshBuilder.CreateSphere(`toy_spinner_${name}`, { diameterX: 0.6, diameterY: 0.6, diameterZ: 0.95, segments: 12 }, scene), cream, prop);
  spinner.position.z = 0.15;
  for (const s of [0, 1]) {
    const blade = add(MeshBuilder.CreateCapsule(`toy_blade_${name}_${s}`, { height: 2.6, radius: 0.16, tessellation: 10, subdivisions: 2 }, scene), dark, prop);
    blade.rotation.z = s * Math.PI; blade.position.y = 0; blade.scaling.set(1, 1, 0.35);
  }

  // ── one thick straight wing with round tips, a stripe of trim ──
  const wing = add(MeshBuilder.CreateCapsule(`toy_wing_${name}`, { height: 8.6, radius: 0.55, tessellation: 14, subdivisions: 4 }, scene), trim);
  wing.rotation.z = Math.PI / 2; wing.scaling.set(0.42, 1, 2.2); wing.position.set(0, -0.35, 0.35);
  for (const side of [-1, 1]) {
    const roundel = add(MeshBuilder.CreateCylinder(`toy_roundel_${name}_${side}`, { height: 0.08, diameter: 1.1, tessellation: 20 }, scene), cream);
    roundel.position.set(side * 3.1, -0.1, 0.35);
  }

  // ── the tail: stubby stabiliser and a round-topped fin ──
  const stab = add(MeshBuilder.CreateCapsule(`toy_stab_${name}`, { height: 3.4, radius: 0.35, tessellation: 12, subdivisions: 2 }, scene), trim);
  stab.rotation.z = Math.PI / 2; stab.scaling.set(0.35, 1, 1.7); stab.position.set(0, 0.35, -3.7);
  const fin = add(MeshBuilder.CreateCapsule(`toy_fin_${name}`, { height: 2.0, radius: 0.5, tessellation: 12, subdivisions: 2 }, scene), trim);
  fin.scaling.set(0.3, 1, 1.4); fin.position.set(0, 1.15, -3.55); fin.rotation.x = -0.25;

  // ── wheels on struts ──
  for (const side of [-1, 1]) {
    const strut = add(MeshBuilder.CreateCylinder(`toy_strut_${name}_${side}`, { height: 1.2, diameter: 0.18, tessellation: 8 }, scene), dark);
    strut.position.set(side * 0.75, -1.2, 0.9); strut.rotation.z = side * 0.35;
    const wheel = add(MeshBuilder.CreateCylinder(`toy_wheel_${name}_${side}`, { height: 0.45, diameter: 0.95, tessellation: 18 }, scene), dark);
    wheel.rotation.z = Math.PI / 2; wheel.position.set(side * 1.0, -1.75, 0.9);
    const hub = add(MeshBuilder.CreateCylinder(`toy_hub_${name}_${side}`, { height: 0.5, diameter: 0.38, tessellation: 12 }, scene), cream);
    hub.rotation.z = Math.PI / 2; hub.position.copyFrom(wheel.position);
  }

  // ── the open cockpit: a padded rim and a little windscreen ──
  const rim = add(MeshBuilder.CreateTorus(`toy_rim_${name}`, { diameter: 1.35, thickness: 0.22, tessellation: 20 }, scene), dark);
  rim.position.set(0, 0.92, TOY_SEAT.z); rim.scaling.set(1, 1, 1.25);
  const screen = add(MeshBuilder.CreateCylinder(`toy_screen_${name}`, { height: 0.5, diameter: 1.0, tessellation: 16, arc: 0.5 }, scene), cream);
  screen.position.set(0, 1.15, TOY_SEAT.z + 0.75); screen.rotation.y = Math.PI; screen.rotation.x = -0.35;
  screen.visibility = 0.55;

  // ── racing number disc on each flank ──
  for (const side of [-1, 1]) {
    const disc = add(MeshBuilder.CreateCylinder(`toy_num_${name}_${side}`, { height: 0.05, diameter: 0.9, tessellation: 20 }, scene), cream);
    disc.rotation.z = Math.PI / 2; disc.position.set(side * 1.02, 0.1, -0.7);
  }

  const seat = new TransformNode(`toy_seat_${name}`, scene); seat.parent = root; seat.position.set(0, TOY_SEAT.y * TOY_SCALE, TOY_SEAT.z * TOY_SCALE);
  const scarfAnchor = new TransformNode(`toy_scarf_${name}`, scene); scarfAnchor.parent = root; scarfAnchor.position.set(0, TOY_SEAT.y * TOY_SCALE + 0.5, (TOY_SEAT.z - 0.15) * TOY_SCALE);   // the pilot's neck: hips + ~0.5 m at the mode's pilot scale

  if (opts.toyPilot) {
    // a simple toy pilot for the rivals: head, leather cap, goggles, shoulders
    const skin = paint(scene, `toy_skin_${name}`, '#d9a27a', 0.08, 0.7);
    const shoulders = add(MeshBuilder.CreateSphere(`toy_pshoulders_${name}`, { diameterX: 1.1, diameterY: 0.7, diameterZ: 0.7, segments: 10 }, scene), trim);
    shoulders.position.set(0, 1.25, TOY_SEAT.z);
    const head = add(MeshBuilder.CreateSphere(`toy_phead_${name}`, { diameter: 0.72, segments: 12 }, scene), skin);
    head.position.set(0, 1.85, TOY_SEAT.z);
    const capM = paint(scene, `toy_cap_${name}`, '#6b4a2f', 0.04, 0.8);
    const cap = add(MeshBuilder.CreateSphere(`toy_pcap_${name}`, { diameter: 0.78, segments: 12, slice: 0.55 }, scene), capM);
    cap.position.set(0, 1.9, TOY_SEAT.z);
    const goggles = add(MeshBuilder.CreateTorus(`toy_pgog_${name}`, { diameter: 0.72, thickness: 0.12, tessellation: 16 }, scene), dark);
    goggles.position.set(0, 1.93, TOY_SEAT.z); goggles.rotation.x = 0.1;
  }

  return {
    root, prop, seat, scarfAnchor, body,
    parts,
    dispose() { for (const p of parts) p.dispose(); model.dispose(); root.dispose(); },
  };
}

/** The pilot's scarf: a ribbon that streams back off the neck and ripples with speed. */
export class Scarf {
  readonly mesh: Mesh;
  private pts: Vector3[][];
  private t = 0;
  constructor(scene: Scene, private anchor: TransformNode, hex = '#e63946', private segments = 9, private length = 2.6) {
    this.pts = [this.strip(0), this.strip(0.22)];
    this.mesh = MeshBuilder.CreateRibbon('toy_scarf', { pathArray: this.pts, updatable: true, sideOrientation: Mesh.DOUBLESIDE }, scene);
    const m = VenueKit.paint(scene, 'toy_scarf_mat', hex, 0.18, 0.8);
    m.backFaceCulling = false;
    this.mesh.material = m; this.mesh.isPickable = false;
  }

  private strip(width: number): Vector3[] { return Array.from({ length: this.segments }, (_, i) => new Vector3(width, 0, -i * (this.length / (this.segments - 1)))); }

  /** Streams in the anchor's local frame, so it always trails behind the plane. */
  update(dt: number, speed01: number): void {
    this.t += dt * (6 + 10 * speed01);
    const wm = this.anchor.computeWorldMatrix(true);
    for (let s = 0; s < 2; s++) {
      for (let i = 0; i < this.segments; i++) {
        const k = i / (this.segments - 1);
        const local = new Vector3(
          (s ? 0.22 : 0) + Math.sin(this.t - k * 3.2) * 0.28 * k,
          -0.15 * k + Math.sin(this.t * 1.3 - k * 4) * 0.2 * k * (1 - 0.5 * speed01),
          -k * this.length * (0.75 + 0.25 * speed01),
        );
        this.pts[s][i].copyFrom(Vector3.TransformCoordinates(local, wm));
      }
    }
    MeshBuilder.CreateRibbon('toy_scarf', { pathArray: this.pts, instance: this.mesh });
  }

  dispose(): void { this.mesh.dispose(); }
}

/** A colour a notch brighter, for a plane's trim. */
export function brighter(hex: string, k = 0.35): string {
  const c = Color3.FromHexString(hex);
  return new Color3(c.r + (1 - c.r) * k, c.g + (1 - c.g) * k, c.b + (1 - c.b) * k).toHexString();
}
