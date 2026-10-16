// phoneTrim: a phone's active list leaves out the loaders' empty roots, and nothing else; no other tier changes.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FreeCamera, Mesh, MeshBuilder, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { LOADER_ROOT, hideEmptyLoaderRoots, installPhoneActiveTrim, isEmptyLoaderRoot, phoneHalf } from './phoneTrim';
import { EffectsKit } from '../visual/EffectsKit';
import { installOffscreenShim } from '../../../tests/helpers/canvasShim';

installOffscreenShim();

function sceneWith(): { scene: Scene; active: () => string[] } {
  const scene = new Scene(new NullEngine());
  const cam = new FreeCamera('c', new Vector3(0, 2, -8), scene); cam.setTarget(Vector3.Zero());
  const active = () => { scene.render(); return scene.getActiveMeshes().data.slice(0, scene.getActiveMeshes().length).map((m) => m.name); };
  return { scene, active };
}
/** A prop the way the glTF loader leaves it: an empty `__root__` Mesh with the drawn part as its child. */
function loaded(scene: Scene, name: string): { root: Mesh; part: Mesh } {
  const root = new Mesh(`${name}___root__`, scene);
  const part = MeshBuilder.CreateBox(`${name}_Mesh`, { size: 1 }, scene);
  part.parent = root;
  return { root, part };
}

describe('the loader root pattern', () => {
  it('matches a root and its clones, and nothing a mode would build on purpose', () => {
    for (const n of ['__root__', '__root___c', '__root___c1', 'vb_palm_2___root__', 'meshy_hoop_0___root__', 'meshy_ball-basketball___root__', 'HairBuilt___root___c']) expect(LOADER_ROOT.test(n), n).toBe(true);
    for (const n of ['__root___c1_contact', 'Body_c', 'wall_arena_dojo_0', 'player_ring', 'fx_ball_trail', 'rooted_prop', '__root__x']) expect(LOADER_ROOT.test(n), n).toBe(false);
  });
});

describe('a phone drops the empty loader roots from the active list', () => {
  it('CONTROL: without the trim an empty root IS an active mesh (the cost this removes)', () => {
    const { scene, active } = sceneWith();
    const { root, part } = loaded(scene, 'hoop');
    expect(active()).toEqual(expect.arrayContaining([root.name, part.name]));
  });

  it('mobile: the root leaves the list, the part that draws stays, and its visibility is the only thing that changed', () => {
    const { scene, active } = sceneWith();
    const { root, part } = loaded(scene, 'hoop');
    const before = active().length;
    installPhoneActiveTrim(scene, 'mobile');
    const after = active();
    expect(after).not.toContain(root.name);
    expect(after).toContain(part.name);
    expect(after.length).toBe(before - 1);
    expect(root.isVisible).toBe(false);
    expect(part.isVisible).toBe(true);
    expect(part.isEnabled()).toBe(true);
  });

  it('desktop and high: nothing is hidden', () => {
    for (const tier of ['desktop', 'high']) {
      const { scene, active } = sceneWith();
      const { root } = loaded(scene, 'hoop');
      installPhoneActiveTrim(scene, tier);
      expect(active(), tier).toContain(root.name);
      expect(root.isVisible).toBe(true);
    }
  });

  it('a root that arrives later (a spawned mook) is hidden by the next frame, after its geometry is in', async () => {
    const { scene, active } = sceneWith();
    installPhoneActiveTrim(scene, 'mobile');
    const late = loaded(scene, 'mook');
    expect(late.root.isVisible).toBe(true);        // Babylon announces a new mesh a tick after its constructor; the frame after that looks
    await new Promise((r) => setTimeout(r, 5));
    expect(active()).not.toContain(late.root.name);
    expect(late.root.isVisible).toBe(false);
    expect(active()).toContain(late.part.name);
  });

  it('never hides a mesh that only looks like a root: one with geometry, a body, a contact disc', () => {
    const { scene } = sceneWith();
    const withGeo = MeshBuilder.CreateBox('HairBuilt___root___c', { size: 1 }, scene);
    const body = MeshBuilder.CreateBox('Body_c', { size: 1 }, scene);
    const contact = MeshBuilder.CreateDisc('__root___c1_contact', { radius: 0.4 }, scene);
    expect(hideEmptyLoaderRoots(scene)).toBe(0);
    expect([withGeo, body, contact].every((m) => m.isVisible)).toBe(true);
    expect(isEmptyLoaderRoot(withGeo)).toBe(false);
  });

  it('the stop function puts the tracking down: a root added afterwards stays active', async () => {
    const { scene, active } = sceneWith();
    const stop = installPhoneActiveTrim(scene, 'mobile');
    stop();
    const late = loaded(scene, 'late');
    await new Promise((r) => setTimeout(r, 5));
    expect(active()).toContain(late.root.name);
  });
});

describe('a phone keeps half the gulls', () => {
  it('phoneHalf: half rounded up on a phone, all on any other tier', () => {
    expect(phoneHalf({ metadata: { felTier: 'mobile' } }, 6)).toBe(3);
    expect(phoneHalf({ metadata: { felTier: 'mobile' } }, 4)).toBe(2);
    expect(phoneHalf({ metadata: { felTier: 'mobile' } }, 5)).toBe(3);
    for (const tier of ['desktop', 'high']) expect(phoneHalf({ metadata: { felTier: tier } }, 6), tier).toBe(6);
    expect(phoneHalf({ metadata: null }, 6)).toBe(6);
  });
  it('the ambient gulls: 4 planes on desktop, 2 on a phone', () => {
    for (const [tier, n] of [['desktop', 4], ['mobile', 2]] as const) {
      const scene = new Scene(new NullEngine()); (scene.metadata ??= {}).felTier = tier;
      new FreeCamera('c', new Vector3(0, 2, -8), scene);
      EffectsKit.ambient(scene, 'venice');
      expect(scene.meshes.filter((m) => /^gull_\d$/.test(m.name)).length, tier).toBe(n);
    }
  });
});

describe('the look stack installs it', () => {
  it('lookStack mounts the trim with the tier it chose, before any mode loads', () => {
    const src = readFileSync(join(__dirname, '..', 'core', 'lookStack.ts'), 'utf8');
    expect(src).toMatch(/import \{ installPhoneActiveTrim \} from '\.\.\/scene\/phoneTrim'/);
    expect(src.indexOf('installPhoneActiveTrim(scene, tier)')).toBeGreaterThan(src.indexOf('const scene = new Scene(engine)'));
    expect(src.indexOf('installPhoneActiveTrim(scene, tier)')).toBeLessThan(src.indexOf('o.onScene?.('));
  });
});
