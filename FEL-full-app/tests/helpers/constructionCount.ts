// Counts Babylon math-object constructions while `fn` runs (dunk-garbage, 2026-10-16). Babylon 9's Quaternion and Vector3
// constructors each begin with a plain `this._isDirty = true` (no class-field declarations), so an accessor on the prototype sees
// every construction, including the ones made inside Babylon itself (`Quaternion.Identity()`, `.multiply()`, `Vector3.Forward()`).
// The setter then gives the new object its own data property, so later writes behave exactly as before. Removed afterwards.
import { Quaternion, Vector3 } from '@babylonjs/core';

export interface ConstructionCount { quaternions: number; vector3s: number }

function install(proto: object, bump: () => void): () => void {
  Object.defineProperty(proto, '_isDirty', {
    configurable: true,
    get() { return undefined; },
    set(v: boolean) { bump(); Object.defineProperty(this, '_isDirty', { value: v, writable: true, enumerable: true, configurable: true }); },
  });
  return () => { delete (proto as { _isDirty?: unknown })._isDirty; };
}

export function countConstructions(fn: () => void): ConstructionCount {
  const c: ConstructionCount = { quaternions: 0, vector3s: 0 };
  const undoQ = install(Quaternion.prototype, () => { c.quaternions++; });
  const undoV = install(Vector3.prototype, () => { c.vector3s++; });
  try { fn(); } finally { undoQ(); undoV(); }
  return c;
}
