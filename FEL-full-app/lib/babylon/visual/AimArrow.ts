// AimArrow — the Wii Sports golf aim on the ground (owner, 2026-09-17: "i need a directional arrow"). A flat arrow from
// the ball along the aim, its length the club's carry, a ring where the ball would come down, and a dotted run-out to
// where it would stop. The numbers come from GolfAim (the same sim the shot flies); this only draws them.
import { Color3, MeshBuilder, TransformNode, Vector3, type Mesh, type Scene } from '@babylonjs/core';
import { VenueKit } from './VenueKit';

export interface AimArrowHandle {
  /** Draw from `from` along `yaw` for `carryM`, the ring at `landing`, the run-out dots to `rest` (both flat). */
  set(from: Vector3, yaw: number, carryM: number, landing: { x: number; z: number } | null, rest?: { x: number; z: number } | null): void;
  show(on: boolean): void;
  dispose(): void;
}

const Y = 0.035;   // just over the turf (the player ring sits at 0.025)

export function mountAimArrow(scene: Scene, hex = '#22d3ee'): AimArrowHandle {
  const root = new TransformNode('aim_arrow', scene);
  const m = VenueKit.paint(scene, 'aim_arrow_m', hex, 0.6, 0.9);
  m.unlit = true; m.emissiveColor = Color3.FromHexString(hex).scale(0.9); m.alpha = 0.85;
  const dim = VenueKit.paint(scene, 'aim_arrow_dim_m', hex, 0.4, 0.9);
  dim.unlit = true; dim.emissiveColor = Color3.FromHexString(hex).scale(0.6); dim.alpha = 0.45;
  // the shaft: a unit-length box scaled on z; the head: a flat triangle
  const shaft = MeshBuilder.CreateBox('aim_shaft', { width: 0.16, height: 0.012, depth: 1 }, scene);
  shaft.material = m; shaft.parent = root; shaft.isPickable = false;
  const head = MeshBuilder.CreateDisc('aim_head', { radius: 0.42, tessellation: 3 }, scene);
  head.rotation.x = Math.PI / 2; head.material = m; head.parent = root; head.isPickable = false;
  const ring = MeshBuilder.CreateTorus('aim_landing', { diameter: 2.4, thickness: 0.12, tessellation: 40 }, scene);
  ring.material = m; ring.isPickable = false;
  const DOTS = 12; const dots: Mesh[] = [];
  for (let i = 0; i < DOTS; i++) { const d = MeshBuilder.CreateDisc(`aim_dot_${i}`, { radius: 0.09 }, scene); d.rotation.x = Math.PI / 2; d.material = dim; d.isPickable = false; dots.push(d); }
  const all = [shaft, head, ring, ...dots];
  let shown = true;
  return {
    set(from, yaw, carryM, landing, rest) {
      const len = Math.max(0.6, carryM);
      root.position.set(from.x, Y, from.z); root.rotation.y = yaw;
      shaft.scaling.z = len - 0.4; shaft.position.z = (len - 0.4) / 2;
      head.position.z = len - 0.3; head.rotation.y = 0; head.rotation.z = -Math.PI / 2;   // a triangle disc's first vertex points +x; turned to point down +z
      if (landing) { ring.position.set(landing.x, Y, landing.z); ring.isVisible = shown; } else ring.isVisible = false;
      if (landing && rest) {
        for (let i = 0; i < DOTS; i++) { const t = (i + 1) / (DOTS + 1); dots[i].position.set(landing.x + (rest.x - landing.x) * t, Y, landing.z + (rest.z - landing.z) * t); dots[i].isVisible = shown && Math.hypot(rest.x - landing.x, rest.z - landing.z) > 1.5; }
      } else for (const d of dots) d.isVisible = false;
    },
    show(on) { shown = on; for (const x of all) x.isVisible = on; if (!on) return; },
    dispose() { for (const x of all) x.dispose(); root.dispose(); m.dispose(); dim.dispose(); },
  };
}
