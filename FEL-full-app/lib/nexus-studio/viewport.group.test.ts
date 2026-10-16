// The viewport's multi-select (docs/NEXUS-STUDIO.md §11) on a real (Null) scene: a list selection shows every member, the
// gizmo grabs a pivot at the group's centre, the members follow it rigidly while it drags, the release hands up ONE snapped
// change; a box selects what it frames. And Football Rush's stage stands the mode's own field.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../babylon/scene/EnvironmentIBL', () => ({ mountEnvironmentIBL: () => () => {} }));   // a float cube NullEngine cannot build

import { NullEngine, Quaternion, Vector3 } from '@babylonjs/core';
import { installOffscreenShim } from '@/tests/helpers/canvasShim';
import { everyKindVenue } from '@/tests/helpers/nexusStudio';
import { StudioViewport } from './viewport';
import { mountStage } from './stage';
import { exportVenue } from './exportVenue';
import { applyDelta, groupCentre, type GroupDelta } from './group';
import { newVenue, type StudioVenue, type V3 } from './doc';

beforeAll(() => installOffscreenShim());
const made: Array<{ dispose(): void }> = [];
afterEach(() => { for (const m of made.splice(0)) { try { m.dispose(); } catch { /* already gone */ } } });

function engine(): NullEngine {
  const e = new NullEngine();
  (e as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 100;
  return e;
}

type Gizmos = { attachedNode: unknown; gizmos: Record<'positionGizmo' | 'rotationGizmo', { onDragStartObservable: { notifyObservers(e: unknown): void }; onDragObservable: { notifyObservers(e: unknown): void }; onDragEndObservable: { notifyObservers(e: unknown): void } }> };

async function viewport(v: StudioVenue, onGroup: (ids: string[], d: GroupDelta, pivot: V3) => void = () => {}) {
  const vp = new StudioViewport(null, { onSelect: () => {}, onTransform: () => {}, onGroupTransform: onGroup }, engine());
  await vp.load(v, 'mobile');
  made.push(vp);
  return vp;
}
const holderOf = (vp: StudioViewport, id: string) => vp.scene!.getTransformNodeByName(`__studio_obj_${id}`)!;

describe('a list selection', () => {
  it('shows every member and attaches the gizmo to a pivot at the movable members’ centre', async () => {
    const v = everyKindVenue();
    v.objects[2].locked = true;
    const vp = await viewport(v);
    const ids = [v.objects[1].id, v.objects[2].id, v.objects[3].id];
    vp.setSelection(ids);
    expect(vp.selectionIds).toEqual(ids);
    for (const id of ids) expect(vp.scene!.getMeshByName(`__studio_pick_${id}`)!.isVisible).toBe(true);
    expect(vp.scene!.getMeshByName(`__studio_pick_${v.objects[4].id}`)!.isVisible).toBe(false);
    const gm = (vp as unknown as { gizmos: Gizmos }).gizmos;
    const pivot = vp.scene!.getTransformNodeByName('__studio_group_pivot')!;
    expect(gm.attachedNode).toBe(pivot);
    expect(pivot.position.asArray()).toEqual(groupCentre([v.objects[1], v.objects[3]]));   // the locked one is not the group's to move
    // a hidden object has no proxy: it drops out of the viewport's selection
    vp.setSelection([v.objects[8].id, v.objects[1].id]);
    expect(vp.selectionIds).toEqual([v.objects[1].id]);
    expect(gm.attachedNode).toBe(holderOf(vp, v.objects[1].id));   // one object: its own holder, as before
  });

  it('a group drag: the members follow the pivot rigidly, and the release hands up ONE snapped change', async () => {
    const v = everyKindVenue();
    const got: Array<[string[], GroupDelta, V3]> = [];
    const vp = await viewport(v, (ids, d, p) => got.push([ids, d, p]));
    const members = [v.objects[3], v.objects[4], v.objects[5]];   // a flood, a lamp, a bleacher
    vp.setSelection(members.map((o) => o.id));
    const gm = (vp as unknown as { gizmos: Gizmos }).gizmos;
    const pivot = vp.scene!.getTransformNodeByName('__studio_group_pivot')!;
    const c = pivot.position.asArray() as V3;
    const giz = gm.gizmos.positionGizmo;
    giz.onDragStartObservable.notifyObservers({});
    pivot.position.set(c[0] + 2.3, c[1], c[2] - 1.1);
    pivot.rotationQuaternion = Quaternion.RotationYawPitchRoll(0.27, 0, 0);
    giz.onDragObservable.notifyObservers({});
    // mid-drag: every member stands where the rigid change (unsnapped) puts it
    const raw: GroupDelta = { move: [2.3, 0, -1.1], turn: 0.27, scale: 1 };
    for (const o of members) {
      const want = applyDelta(o, c, raw), h = holderOf(vp, o.id);
      expect(h.position.x).toBeCloseTo(want.p[0], 5); expect(h.position.z).toBeCloseTo(want.p[2], 5);
      expect(h.rotation.y).toBeCloseTo(want.ry, 5);
    }
    giz.onDragEndObservable.notifyObservers({});
    expect(got).toHaveLength(1);
    expect(got[0][0]).toEqual(members.map((o) => o.id));
    expect(got[0][1].move).toEqual([2.5, 0, -1]);          // the GROUP's move on the 0.5 m grid
    expect(got[0][1].turn).toBeCloseTo(Math.PI / 12, 6);   // and its turn on 15°
    expect(got[0][2]).toEqual(c);                          // about the centre the drag began from
    // the gizmo re-grabs a fresh, unturned pivot for the next drag
    expect(pivot.rotationQuaternion).toBeNull();
    expect(pivot.rotation.y).toBe(0);
  });

  it('a box selects the proxies whose centre it frames, and nothing behind the camera', async () => {
    const v = everyKindVenue();
    const vp = await viewport(v);
    const st = vp.currentStage!;
    st.scene.activeCamera = st.orbit;
    st.orbit.setPosition(new Vector3(0, 80, 1)); st.orbit.setTarget(Vector3.Zero());
    st.scene.render();
    const w = st.engine.getRenderWidth(), h = st.engine.getRenderHeight();
    const all = vp.idsInRect({ x: 0, y: 0 }, { x: w, y: h });
    expect(all.sort()).toEqual(v.objects.filter((o) => !o.hidden).map((o) => o.id).sort());
    expect(vp.idsInRect({ x: 0, y: 0 }, { x: 1, y: 1 })).toEqual([]);
    // the left half of a top-down view holds the objects at x < 0 (Babylon's camera from +y looking down, +z up the screen)
    const left = new Set(vp.idsInRect({ x: 0, y: 0 }, { x: w / 2 - 1, y: h }));
    const xs = v.objects.filter((o) => left.has(o.id)).map((o) => o.t.p[0]);
    expect(xs.length).toBeGreaterThan(0);
    expect(new Set(xs.map(Math.sign)).size).toBe(1);   // one side of the court only
  });

  it('a box never takes what stands behind the camera (its projection would land on the screen mirrored)', async () => {
    const v = everyKindVenue();
    const vp = await viewport(v);
    const st = vp.currentStage!;
    st.scene.activeCamera = st.orbit;
    st.orbit.setPosition(new Vector3(0, 2, 0)); st.orbit.setTarget(new Vector3(0, 2, -10));   // standing at the origin, looking −z
    st.scene.render();
    const got = new Set(vp.idsInRect({ x: -1e5, y: -1e5 }, { x: 1e5, y: 1e5 }));
    const behind = v.objects.filter((o) => !o.hidden && o.t.p[2] > 3);
    expect(behind.length).toBeGreaterThan(0);
    for (const o of behind) expect(got.has(o.id)).toBe(false);
    expect(v.objects.some((o) => got.has(o.id) && o.t.p[2] < -3)).toBe(true);   // the control: what is in front is taken
  });
});

describe('Football Rush’s stage', () => {
  it('stands the mode’s own field (VenueKit’s gridiron) over the spec, whose ground hides as the mode hides it', async () => {
    const v = newVenue('Rush', { spec: 'football_rush', target: 'football' }, 'indoorArena');
    const s = await mountStage({ canvas: null, engine: engine(), exp: exportVenue(v), tier: 'mobile' });
    made.push({ dispose: () => s.dispose() });
    expect(s.scene.metadata.felModeId).toBe('football');
    expect(s.scene.getMeshByName('venue_apron')).toBeTruthy();        // the gridiron's apron
    const under = s.venue!.built.root.getChildMeshes().find((m) => m.name === 'venue_ground_under');
    expect(under?.visibility).toBe(0);
    expect(s.venue!.built.root.getChildMeshes().some((m) => m.name === 'venue_ground')).toBe(false);
    expect(s.subject().asArray()).toEqual([0, 0, 0]);                  // the runner's spot
    // a venue re-mount (a sky change) hides the new spec ground too
    s.realise(exportVenue({ ...v, backdrop: 'city' }), ['venue']);
    expect(s.venue!.built.root.getChildMeshes().some((m) => m.name === 'venue_ground')).toBe(false);
  });
});
