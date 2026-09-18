// Physics — single Havok bootstrap for every FEL scene. Modes never touch
// Havok directly: they call initPhysics(scene) once and use the returned
// handle for body helpers (PhysicsBodyBinding in CourtMovement, contact in
// the Phase 4 contact system).
//
// WASM resolution: in the browser the .wasm ships at /vendor/havok/ (see
// scripts/postinstall note in package.json); headless tests override
// `wasmBinary` with a disk read. initPhysics is idempotent per scene.

import { PhysicsAggregate, PhysicsMotionType, PhysicsShapeType, HavokPlugin, Vector3 } from '@babylonjs/core';
import type { Scene } from '@babylonjs/core';
import HavokPhysics from '@babylonjs/havok';

export interface PhysicsHandle {
  plugin: HavokPlugin;
  /** Static court floor at y=0 that player capsules collide with. */
  ground: PhysicsAggregate;
}

const perScene = new WeakMap<Scene, Promise<PhysicsHandle>>();

let havokModulePromise: Promise<unknown> | null = null;
/** Test/headless hook: provide the wasm bytes directly (Node can't fetch). */
export function __setHavokWasmBinary(bytes: ArrayBuffer | Uint8Array): void {
  havokModulePromise = HavokPhysics({ wasmBinary: bytes });
}

function loadHavok(): Promise<unknown> {
  if (!havokModulePromise) {
    havokModulePromise = HavokPhysics({
      locateFile: (p: string) => (p.endsWith('.wasm') ? '/vendor/havok/HavokPhysics.wasm' : p),
    } as Parameters<typeof HavokPhysics>[0]);
  }
  return havokModulePromise;
}

export async function initPhysics(scene: Scene, gravityY = -9.81): Promise<PhysicsHandle> {
  let p = perScene.get(scene);
  if (!p) {
    p = (async () => {
      const havok = await loadHavok();
      const plugin = new HavokPlugin(true, havok as never);
      scene.enablePhysics(new Vector3(0, gravityY, 0), plugin);
      // Invisible static floor — capsules rest on the court, never sink.
      const groundMesh = scene.getMeshByName('venue_ground')
        ?? (await import('@babylonjs/core')).MeshBuilder.CreateGround(
          'physics_ground', { width: 60, height: 60 }, scene);
      groundMesh.isVisible = groundMesh.name === 'venue_ground' ? groundMesh.isVisible : false;
      const ground = new PhysicsAggregate(groundMesh, PhysicsShapeType.BOX, { mass: 0 }, scene);
      return { plugin, ground };
    })();
    perScene.set(scene, p);
  }
  return p;
}

export function disposePhysics(scene: Scene): void {
  perScene.delete(scene);
  scene.disablePhysicsEngine();
}
