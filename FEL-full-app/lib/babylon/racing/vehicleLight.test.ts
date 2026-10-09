// 10-phase pass, phase 7: the vehicle light table is complete, bounded, and only the flat moods fill.
import { describe, it, expect } from 'vitest';
import { MOODS, type VenueMood } from '../scene/moods';
import {
  VEHICLE_ENV_BASE, PLANE_ENV_BASE, VEHICLE_ENV_SCALE, SUN_FILL,
  vehicleEnvFor, sunFillFor, fitVehicleLight,
} from './vehicleLight';

const MOOD_LIST = Object.keys(MOODS) as VenueMood[];

describe('phase 7: the vehicle env table covers every mood and stays in range', () => {
  it('every mood has a scale, and the scale is a lift — never a cut below the signed-off base', () => {
    for (const m of MOOD_LIST) {
      expect(VEHICLE_ENV_SCALE[m], m).toBeGreaterThanOrEqual(1);
      expect(VEHICLE_ENV_SCALE[m], m).toBeLessThanOrEqual(1.5);
    }
  });
  it('the flat-light moods lean hardest on the environment; the hard-sun moods keep the base', () => {
    expect(VEHICLE_ENV_SCALE.overcast).toBeGreaterThan(VEHICLE_ENV_SCALE.alpine);
    expect(VEHICLE_ENV_SCALE.alpine).toBeGreaterThan(VEHICLE_ENV_SCALE.goldenHour);
    expect(VEHICLE_ENV_SCALE.goldenHour).toBe(1);
    expect(VEHICLE_ENV_SCALE.daylight).toBe(1);
  });
  it('vehicleEnvFor multiplies the base by the mood scale, rounded to cents', () => {
    expect(vehicleEnvFor(VEHICLE_ENV_BASE.paint, 'goldenHour')).toBe(0.4);   // the signed-off kart paint value
    expect(vehicleEnvFor(VEHICLE_ENV_BASE.paint, 'overcast')).toBe(0.52);
    expect(vehicleEnvFor(VEHICLE_ENV_BASE.dark, 'nightGame')).toBe(0.33);
    expect(vehicleEnvFor(PLANE_ENV_BASE, 'goldenHour')).toBe(PLANE_ENV_BASE);   // the plane's 0.55 is its base
    for (const m of MOOD_LIST) {
      const v = vehicleEnvFor(VEHICLE_ENV_BASE.chrome, m);
      expect(v).toBeGreaterThan(0.2);
      expect(v).toBeLessThan(0.9);   // past this the IBL washes the metal out (the pink-kart lesson)
    }
  });
});

describe('phase 7: the sun fill is vehicle-local and only where the mood is flat', () => {
  it('the hard-sun moods get no fill at all; the flat moods do, bounded', () => {
    for (const m of MOOD_LIST) {
      expect(SUN_FILL[m], m).toBeGreaterThanOrEqual(0);
      expect(SUN_FILL[m], m).toBeLessThan(1);   // a fill, never a second key
    }
    expect(sunFillFor('goldenHour')).toBe(0);
    expect(sunFillFor('daylight')).toBe(0);
    expect(sunFillFor('overcast')).toBeGreaterThan(0);
    expect(sunFillFor('alpine')).toBeGreaterThan(0);
    expect(sunFillFor('overcast')).toBeGreaterThan(sunFillFor('alpine'));   // overcast is the flattest
  });
  it('a zero fill mounts no light: fitVehicleLight still marks the vehicle a shadow receiver', () => {
    const meshes = [{ receiveShadows: false }, { receiveShadows: false }];
    const root = { getChildMeshes: () => meshes } as unknown as import('@babylonjs/core').TransformNode;
    const scene = {} as import('@babylonjs/core').Scene;
    const h = fitVehicleLight(scene, 'goldenHour', [root], 'test');   // goldenHour: fill 0
    expect(meshes.every((m) => m.receiveShadows)).toBe(true);
    const extra = [{ receiveShadows: false }];
    h.include(extra as unknown as import('@babylonjs/core').AbstractMesh[]);
    expect(extra[0].receiveShadows).toBe(true);
    h.dispose();   // nothing mounted, nothing to throw
  });
});
