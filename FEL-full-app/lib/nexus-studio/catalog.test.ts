// The asset catalog is FEL's own: every kit entry is a .glb on disk, every scan is a file meshyProps loads, every item
// instantiates into an object the document accepts, and the snap and budget rules the editor draws with.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { catalog, catalogIdOf, catalogItem, instantiate, kitSize, prettyModel, proxyBox } from './catalog';
import { sanitizeObject, OBJECT_TYPES } from './doc';
import { snapAngle, snapTransform, snapValue, yawOfQuaternion, DEFAULT_SNAP } from './snap';
import { DESKTOP_CEILING, MOBILE_MONITOR, PHONE_CEILING, level, meterRows, modeRow, textureMb, worst } from './budget';
import { Quaternion } from '@babylonjs/core';

const PUBLIC = join(__dirname, '..', '..', 'public');

describe('the catalog', () => {
  const items = catalog();
  it('has every placeable kind, unique ids, and a source line for each', () => {
    expect(new Set(items.map((i) => i.proto.type))).toEqual(new Set(OBJECT_TYPES));
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    for (const i of items) expect(i.source.length, i.id).toBeGreaterThan(0);
  });

  it('every kit prop is a .glb in public/models/props, every scan one in public/models/meshy', () => {
    const kits = items.filter((i) => i.proto.type === 'kitProp');
    expect(kits.length).toBeGreaterThan(60);
    for (const i of kits) if (i.proto.type === 'kitProp') expect(existsSync(join(PUBLIC, 'models/props', i.proto.kit, `${i.proto.model}.glb`)), i.id).toBe(true);
    for (const i of items) if (i.proto.type === 'meshyProp') expect(existsSync(join(PUBLIC, 'models/meshy', `${i.proto.key}.glb`)), i.id).toBe(true);
  });

  it('every item instantiates into an object the document keeps as it is', () => {
    for (const i of items) {
      const o = instantiate(i, [1, 0, 2], 0.5);
      expect(sanitizeObject(JSON.parse(JSON.stringify(o)), new Set()), i.id).toEqual(o);
      expect(catalogIdOf(o), i.id).toBe(i.id);
    }
  });

  it('gameplay props are not on the shelf (a second rim nobody can score on)', () => {
    expect(items.some((i) => i.proto.type === 'specProp' && ['hoop', 'goal', 'net', 'backboardPole', 'tee'].includes(i.proto.kind))).toBe(false);
    expect(items.some((i) => i.proto.type === 'meshyProp' && (i.proto.key as string) === 'hoop')).toBe(false);
  });

  it('a stand\'s proxy climbs back from its front edge; a fixture\'s follows its height', () => {
    const stand = instantiate(catalogItem('crowd:bleacher')!);
    const b = proxyBox(stand);
    expect(b.centre[2]).toBeLessThan(0);
    expect(b.size[0]).toBe(16);
    const flood = instantiate(catalogItem('fixture:flood')!);
    expect(proxyBox(flood).size[1]).toBeGreaterThan(12);
  });

  it('names read like words; sizes read off the model name', () => {
    expect(prettyModel('tree_palmDetailedTall')).toBe('Palm detailed tall');
    expect(prettyModel('fence-low')).toBe('Fence low');
    expect(kitSize('grandStandCovered')[0]).toBeGreaterThan(kitSize('rock_smallG')[0]);
  });
});

describe('snap', () => {
  it('snaps to the step, keeps zero clean and leaves a step of 0 alone', () => {
    expect(snapValue(1.26, 0.5)).toBe(1.5);
    expect(snapValue(-0.2, 0.5)).toBe(0);
    expect(Object.is(snapValue(-0.2, 0.5), -0)).toBe(false);
    expect(snapValue(1.26, 0)).toBe(1.26);
  });
  it('turns snap to degrees and wrap', () => {
    expect(snapAngle(0.27, 15)).toBeCloseTo(Math.PI / 12, 9);
    expect(snapAngle(3.2, 90)).toBeCloseTo(Math.PI, 9);
  });
  it('a transform snaps x and z (not y), its turn and its scale, inside the limits', () => {
    const t = snapTransform({ p: [3.26, 1.13, -1000], ry: 0.27, s: 0.01 }, DEFAULT_SNAP);
    expect(t.p).toEqual([3.5, 1.13, -400]);
    expect(t.ry).toBeCloseTo(Math.PI / 12, 9);
    expect(t.s).toBe(0.1);
    expect(snapTransform({ p: [3.26, 0, 0], ry: 0.27, s: 1.03 }, { ...DEFAULT_SNAP, on: false }).p[0]).toBe(3.26);
  });
  it('reads the yaw back out of the rotation gizmo\'s quaternion', () => {
    for (const a of [0, 0.5, -2, Math.PI - 0.01]) {
      const q = Quaternion.RotationYawPitchRoll(a, 0, 0);
      expect(yawOfQuaternion(q.x, q.y, q.z, q.w)).toBeCloseTo(a, 6);
    }
  });
});

describe('the budget meter', () => {
  it('the phone ceiling is mobileBudget.json\'s, which is PerfMonitor\'s mobile budget; desktop is PerfMonitor\'s', () => {
    expect(PHONE_CEILING).toEqual(MOBILE_MONITOR);
    expect(PHONE_CEILING).toEqual({ drawCalls: 600, activeMeshes: 400, textureMb: 256 });
    expect(DESKTOP_CEILING).toEqual({ drawCalls: 1600, activeMeshes: 900, textureMb: 512 });
  });
  it('a sample is read against its own tier\'s ceiling, and the worst row leads', () => {
    const phone = meterRows({ drawCalls: 590, activeMeshes: 100, textureMb: 300, skinnedBodies: 2, tier: 'mobile' });
    expect(phone.map((r) => r.level)).toEqual(['near', 'ok', 'over']);
    expect(worst(phone)).toBe('over');
    const desk = meterRows({ drawCalls: 590, activeMeshes: 100, textureMb: 300, skinnedBodies: 2, tier: 'desktop' });
    expect(worst(desk)).toBe('ok');
    expect(level(10, 0)).toBe('ok');
  });
  it('the reference row is the mode\'s measured phone row', () => {
    expect(modeRow('tennis')?.measured.drawCalls).toBeGreaterThan(0);
    expect(modeRow('no-such-mode')).toBeNull();
  });
  it('texture memory counts what is loaded, not the render targets', () => {
    expect(textureMb([{ width: 1024, height: 1024 }, { source: 5, width: 4096, height: 4096 }])).toBeCloseTo(4, 6);
    expect(textureMb([{ width: 512, height: 512, isCube: true }])).toBeCloseTo(6, 6);
  });
});
