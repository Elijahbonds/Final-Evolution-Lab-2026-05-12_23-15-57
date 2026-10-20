// studio-5 (§13.1): the cast fans cheer WITH the crowd — the crowd's plans, clips, seconds, stagger and priority, every cast fan
// taking part. Held three ways: the director's timeline against the crowd's own CrowdDirector; the clips built on the REAL kit body
// (fel-kit-female.glb in a NullEngine); and the wiring through the real crowd (mountModeCrowd's momentum listener → the wrapped
// react → the cast layer → a clip played on the body), in the editor's stage path and the mode's mountStudioExtras.
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../babylon/scene/EnvironmentIBL', () => ({ mountEnvironmentIBL: () => () => {} }));

import { FreeCamera, NullEngine, Quaternion, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { AnimationGroup, Skeleton, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { boneNode } from '../babylon/anim/boneLookup';
import { buildPoseClip } from '../babylon/anim/poseClip';
import { CrowdDirector, delayFor, shareFor, hash01, type FanSeat, type ReactionKind } from '../babylon/visual/crowd/crowdReact';
import { CROWD_CLIPS, type CrowdClipName } from '../babylon/visual/crowd/crowdVat';
import { crowdClipKeys } from '../babylon/visual/crowd/crowdClips';
import { CAST_CLIP_SECONDS, CAST_FAN_HANDS, CastFanDirector, castFanClipKeys, castFanClipName, fanHands, seatedness } from './castCheer';
import { castFanKeys, mountCrowdCastLayer, type CrowdCastLayer } from './castLayer';
import { crowdCastSeats, resolveCast, type CastMember } from './cast';
import { mountCrowdLayer, mountStudioExtras } from './runtime';
import { mountStage } from './stage';
import { installOffscreenShim } from '@/tests/helpers/canvasShim';
import { exportVenue, type ExportCrowd } from './exportVenue';
import { CharacterLibrary, type SpawnedCharacter } from '../babylon/core/CharacterLibrary';
import { everyKindProject } from '@/tests/helpers/nexusStudio';
import { castCode } from '@/tests/helpers/studioCast';
import { standInBody } from '@/tests/helpers/tiebreakRally';

afterEach(() => vi.restoreAllMocks());

const crowdOf = (): ExportCrowd => exportVenue(everyKindProject().venues[0]).crowd!;
const seats = (n: number, home: 'seated' | 'standing' = 'seated'): FanSeat[] => Array.from({ length: n }, (_, i) => ({ home, along: (i % 7) / 6 }));

/** Every clip change of a director over [from, to), sampled at 60 Hz, per fan. */
function timeline(d: { tick(now: number): { fan: number; clip: CrowdClipName; since: number }[] }, from: number, to: number): Map<number, string[]> {
  const out = new Map<number, string[]>();
  for (let t = from; t < to; t += 1 / 60) for (const c of d.tick(t)) (out.get(c.fan) ?? out.set(c.fan, []).get(c.fan)!).push(`${c.clip}@${c.since.toFixed(4)}`);
  return out;
}

describe('the director: the crowd\'s own rules, every cast fan joining', () => {
  // a mixed sequence: a small cheer, a groan under it, a tier's stand, a cheer while standing, the finish
  const FULL: Array<[at: number, kind: ReactionKind, strength: number]> = [[1, 'cheer', 0.35], [1.5, 'groan', 0.6], [4, 'stand', 0.8], [5.2, 'cheer', 1], [12, 'groan', 1], [12.6, 'groan', 1], [15, 'cheer', 0.5], [15.5, 'cheer', 1], [19, 'finish', 1]];
  // reduced motion moves a third of the crowd, so few crowd fans join six reactions running: a shorter sequence for it
  const CALM: Array<[at: number, kind: ReactionKind, strength: number]> = [[1, 'cheer', 1], [1.4, 'groan', 1], [3, 'stand', 0.8], [9, 'finish', 1]];

  for (const reduced of [false, true]) {
    for (const home of ['seated', 'standing'] as const) {
      it(`${home}${reduced ? ', reduced motion' : ''}: a cast fan's timeline is the crowd fan's, for every crowd fan that took part in every reaction`, () => {
        const SEQ = reduced ? CALM : FULL;
        const S = seats(reduced ? 1200 : 300, home);
        const crowd = new CrowdDirector(S);
        const cast = new CastFanDirector(S);
        const run = (d: CrowdDirector | CastFanDirector) => {
          const all = new Map<number, string[]>();
          let t = 0;
          for (const [at, kind, strength] of SEQ) {
            for (const [f, l] of timeline(d, t, at)) (all.get(f) ?? all.set(f, []).get(f)!).push(...l);
            d.react(kind, strength, at, reduced); t = at;
          }
          for (const [f, l] of timeline(d, t, t + 8)) (all.get(f) ?? all.set(f, []).get(f)!).push(...l);
          return all;
        };
        const a = run(crowd), b = run(cast);
        // the crowd fans that the share rule let into EVERY reaction (the finish takes everyone)
        const everyTime = S.map((_, i) => i).filter((i) => SEQ.every(([, kind, s], n) => kind === 'finish' || hash01(i, n + 1) < shareFor(kind, s, reduced)));
        expect(everyTime.length).toBeGreaterThan(5);
        for (const i of everyTime) expect(b.get(i), `fan ${i}`).toEqual(a.get(i));
        // and the cast fans ALL took part: every one of them left its idle for the first reaction
        for (let i = 0; i < S.length; i++) expect(b.get(i)?.length ?? 0, `fan ${i}`).toBeGreaterThan(0);
      });
    }
  }

  it('a small cheer moves only part of the crowd, and every cast fan', () => {
    const S = seats(40);
    const crowd = new CrowdDirector(S), cast = new CastFanDirector(S);
    expect(crowd.react('cheer', 0.2, 0, false)).toBeLessThan(40);
    expect(cast.react('cheer', 0.2, 0, false)).toBe(40);
  });

  it('a seated fan cheers off its seat and settles back to its idle at the clip\'s own length', () => {
    const d = new CastFanDirector([{ home: 'seated', along: 0 }]);
    d.react('cheer', 1, 10, false);
    const l = timeline(d, 10, 14).get(0)!;
    expect(l.map((s) => s.split('@')[0])).toEqual(['sit_cheer', 'sit_idle']);
    const [start, end] = l.map((s) => +s.split('@')[1]);
    expect(start).toBeGreaterThan(10);                                   // the stagger
    expect(start).toBeLessThan(10 + 0.04 + 0.3 + 0.35 + 1e-9);           // inside the crowd's delayFor bound
    expect(end - start).toBeCloseTo(CAST_CLIP_SECONDS.sit_cheer, 9);
  });

  it('the stand: up, three jumping cheers, back down; the finish: up and holding it; nothing after the finish', () => {
    const d = new CastFanDirector([{ home: 'seated', along: 0.5 }]);
    d.react('stand', 0.8, 0, false);
    expect(timeline(d, 0, 6).get(0)!.map((s) => s.split('@')[0])).toEqual(['rise', 'stand_cheer', 'sit_down', 'sit_idle']);
    d.react('finish', 1, 6, false);
    expect(timeline(d, 6, 30).get(0)!.map((s) => s.split('@')[0])).toEqual(['rise', 'stand_cheer']);
    expect(d.done).toBe(true);
    expect(d.react('cheer', 1, 30, false)).toBe(0);
  });

  it('a reaction that starts while the fan is past the middle of its rise starts from standing (no second rise)', () => {
    const d = new CastFanDirector([{ home: 'seated', along: 0.3 }]);
    d.react('stand', 0.8, 0, false);
    let riseAt = NaN;
    for (let t = 0; t < 2 && Number.isNaN(riseAt); t += 1 / 120) for (const c of d.tick(t)) if (c.clip === 'rise') riseAt = c.since;
    // the finish (reaction 2) is asked for so that its own stagger lands it 0.45 s into the 0.6 s rise
    const now = riseAt + 0.45 - delayFor(0, 2, 0.3, false);
    for (let t = riseAt; t < now; t += 1 / 120) d.tick(t);
    d.react('finish', 1, now, false);
    const after = timeline(d, now, now + 3).get(0)!.map((x) => x.split('@')[0]);
    expect(after).toEqual(['stand_cheer']);
  });

  it('reduced motion: claps in the seat, nobody stands', () => {
    const d = new CastFanDirector(seats(6));
    for (const k of ['cheer', 'stand', 'finish'] as const) d.react(k, 1, 0, true);
    const clips = new Set([...timeline(d, 0, 10).values()].flat().map((s) => s.split('@')[0]));
    expect([...clips].sort()).toEqual(['sit_clap']);
  });
});

describe('the clips: the crowd\'s keys, plus the hands', () => {
  it('every key of every clip is the crowd\'s own key (legs, hips, spine, head, the timing) with both hands placed', () => {
    for (const c of CROWD_CLIPS) {
      const keys = castFanClipKeys(c.name), crowd = crowdClipKeys(c.name);
      expect(keys).toHaveLength(crowd.length);
      keys.forEach((k, i) => {
        const { handsRel, ...rest } = k;
        expect(rest, c.name).toEqual(crowd[i]);
        for (const side of ['Left', 'Right'] as const) {
          const h = handsRel![side]!;
          expect(h[1], `${c.name} ${side}`).toBeLessThan(-0.3);
          expect(Math.sign(h[0])).toBe(side === 'Left' ? -1 : 1);
        }
      });
    }
  });
  it('the hands rest on the lap seated, at the sides standing, between the two up off the seat', () => {
    expect(fanHands(-0.42)).toBe(CAST_FAN_HANDS.seated);
    expect(fanHands(-0.416)).toBe(CAST_FAN_HANDS.seated);     // sit_idle's breath is still a rest
    expect(fanHands(0)).toBe(CAST_FAN_HANDS.standing);
    expect(fanHands(-0.006)).toBe(CAST_FAN_HANDS.standing);   // stand_idle's sway
    const perch = fanHands(-0.15);
    expect(seatedness(-0.15)).toBeGreaterThan(0.2);
    expect(seatedness(-0.15)).toBeLessThan(0.8);
    expect(perch.Left![2]).toBeGreaterThan(CAST_FAN_HANDS.standing.Left![2]);
    expect(perch.Left![2]).toBeLessThan(CAST_FAN_HANDS.seated.Left![2]);
  });
  it('the resting clip is unchanged from studio-4b\'s (the idle keys and its hands)', () => {
    expect(castFanKeys('seated')).toEqual(crowdClipKeys('sit_idle').map((k) => ({ ...k, handsRel: CAST_FAN_HANDS.seated })));
    expect(castFanKeys('standing')).toEqual(crowdClipKeys('stand_idle').map((k) => ({ ...k, handsRel: CAST_FAN_HANDS.standing })));
  });
});

describe('on the real kit body (fel-kit-female.glb)', () => {
  let scene: Scene; let sk: Skeleton;
  const bind = new Map<TransformNode, { p: Vector3; q: Quaternion }>();
  const clips = new Map<CrowdClipName, AnimationGroup | null>();
  beforeAll(async () => {
    scene = new Scene(new NullEngine());
    new FreeCamera('c', new Vector3(0, 1, -3), scene);
    const b64 = readFileSync('public/models/candidates/fel-kit-female.glb').toString('base64');
    const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + b64, scene, undefined, '.glb');
    for (const g of r.animationGroups) g.stop();
    sk = r.skeletons[0];
    for (const b of sk.bones) { const n = b.getTransformNode(); if (n) bind.set(n, { p: n.position.clone(), q: (n.rotationQuaternion ?? Quaternion.Identity()).clone() }); }
    for (const c of CROWD_CLIPS) clips.set(c.name, buildPoseClip(scene, sk, castFanClipName(c.name), c.seconds, castFanClipKeys(c.name), { smooth: true }));
  }, 120_000);
  const at = (name: CrowdClipName, sec: number) => {
    for (const x of scene.animationGroups) x.stop();
    for (const [n, t] of bind) { n.position.copyFrom(t.p); n.rotationQuaternion = t.q.clone(); }
    const g = clips.get(name)!;
    g.start(false, 1, g.from, g.to, false); g.goToFrame(Math.min(g.to, sec * 30)); scene.render();
    return (bone: string) => { const n = boneNode(sk, bone)!; n.computeWorldMatrix(true); return n.getAbsolutePosition().clone(); };
  };

  it('all ten crowd clips build on the kit body; at every sample both hands hang below the shoulders, in reach, never NaN', () => {
    expect([...clips.entries()].filter(([, g]) => !g).map(([n]) => n)).toEqual([]);
    for (const c of CROWD_CLIPS) {
      for (const u of [0, 0.25, 0.5, 0.75, 1]) {
        const p = at(c.name, u * c.seconds);
        for (const side of ['Left', 'Right'] as const) {
          const hand = p(`${side}Hand`), shoulder = p(`${side}Arm`);
          expect(Number.isFinite(hand.x + hand.y + hand.z), `${c.name} ${side} @${u}`).toBe(true);
          expect(hand.y, `${c.name} ${side} @${u}: below the shoulder (not the bind pose's T)`).toBeLessThan(shoulder.y - 0.2);
          expect(Vector3.Distance(hand, shoulder), `${c.name} ${side} @${u}`).toBeLessThan(0.7);
        }
      }
    }
  });
  it('the cheer reads: a seated fan comes up off the seat (hips over 15 cm higher at the leap), then sits back', () => {
    const rest = at('sit_cheer', 0)('Hips').y;
    const leap = at('sit_cheer', 0.34)('Hips').y;
    const back = at('sit_cheer', CAST_CLIP_SECONDS.sit_cheer)('Hips').y;
    expect(leap - rest).toBeGreaterThan(0.15);
    expect(Math.abs(back - rest)).toBeLessThan(0.02);
    // and the standing jump leaves the ground's height pattern: down into the knees, then up
    const s0 = at('stand_cheer', 0)('Hips').y, dip = at('stand_cheer', 0.15)('Hips').y, top = at('stand_cheer', 0.33)('Hips').y;
    expect(dip).toBeLessThan(s0 - 0.05);
    expect(top).toBeGreaterThan(s0 + 0.05);
  });
});

describe('the wiring: the crowd reacts, the cast fans cheer', () => {
  const member = async (): Promise<CastMember> => {
    const r = await resolveCast({ characters: [{ id: 'c1', name: 'Nova', lookCode: await castCode() }] }, { cast: { crowd: ['c1'] } });
    return r!.crowd![0];
  };
  /** CharacterLibrary.spawn → a stand-in body whose animator records what it is told to play. */
  function recordSpawns() {
    const played: Array<{ seat: number; clip: string; loop?: boolean }> = [];
    const registered: string[] = [];
    const frames: Record<string, number> = {};
    let n = 0;
    vi.spyOn(CharacterLibrary, 'spawn').mockImplementation(async (scene: Scene, _url: string, o: { position?: Vector3; yawRad?: number } = {}) => {
      const seat = n++;
      const b = standInBody(scene, o);
      const animator = { register: (g: AnimationGroup) => { registered.push(g.name); frames[g.name] = g.to - g.from; }, play: (clip: string, p: { loop?: boolean } = {}) => { played.push({ seat, clip, loop: p.loop }); return null; } };
      return { ...b, animator } as unknown as SpawnedCharacter;
    });
    return { played, registered, frames };
  }
  function sceneAt(tier: string) {
    const engine = new NullEngine();
    (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 30;
    const scene = new Scene(engine);
    new FreeCamera('c', new Vector3(0, 4, 15), scene);
    scene.metadata = { felTier: tier };
    return { engine, scene, frames: (k: number) => { for (let i = 0; i < k; i++) scene.render(); } };
  }
  /** A momentum bus as mountModeCrowd hears it. */
  function bus() {
    const reports = new Set<(e: { kind: string; weight?: number }) => void>();
    return { onReport: (fn: (e: { kind: string; weight?: number }) => void) => { reports.add(fn); return () => reports.delete(fn); }, onTierChange: () => () => {}, report: (e: { kind: string }) => { for (const f of reports) f(e); } };
  }

  it('the mode\'s path (mountStudioExtras): a play reported to the meter → the crowd cheers → the cast fan plays the crowd\'s cheer, then its idle', async () => {
    const { engine, scene, frames } = sceneAt('desktop');
    const rec = recordSpawns();
    const momentum = bus();
    const exp = { ...exportVenue(everyKindProject().venues[0]), cast: { crowd: [await member()] } };
    const extras = mountStudioExtras({ scene, momentum }, exp);
    const cast = (extras.layers as unknown as { crowdCast: CrowdCastLayer }).crowdCast;
    expect(cast.seats).toHaveLength(1);
    expect(await cast.ready).toHaveLength(1);
    expect(rec.played.at(-1)).toEqual({ seat: 0, clip: 'studio_fan_sit_idle', loop: true });   // seated in its idle, as before
    frames(10);
    momentum.report({ kind: 'clean_run' });   // weight 18 → a cheer the crowd answers (modeCrowd.reactionFor)
    expect(cast.director!.busy(0)).toBe(true);
    frames(30);   // one second: past the crowd's longest stagger
    expect(rec.played.map((p) => p.clip)).toContain('studio_fan_sit_cheer');
    frames(60);
    expect(rec.played.at(-1)).toEqual({ seat: 0, clip: 'studio_fan_sit_idle', loop: true });
    expect(rec.registered).toEqual(expect.arrayContaining(['studio_fan_sit_idle', 'studio_fan_sit_cheer']));
    // each clip at the crowd's own length (crowdVat.CROWD_CLIPS: the idle 3.0 s, the cheer 1.6 s)
    expect(rec.frames.studio_fan_sit_cheer / rec.frames.studio_fan_sit_idle).toBeCloseTo(CAST_CLIP_SECONDS.sit_cheer / CAST_CLIP_SECONDS.sit_idle, 2);
    // a small play the crowd lets pass (weight under 6) moves nobody, cast or crowd
    const before = rec.played.length;
    momentum.report({ kind: 'big_make', weight: 3 } as never);
    frames(60);
    expect(rec.played.length).toBe(before);
    // torn down: the crowd's reactions no longer reach it
    extras.dispose();
    momentum.report({ kind: 'clean_run' });
    frames(60);
    expect(rec.played.length).toBe(before);
    scene.dispose(); engine.dispose();
  });

  it('every caller of the crowd\'s react reaches the cast: a script\'s crowd action and the dev rig\'s handle', async () => {
    const { engine, scene, frames } = sceneAt('desktop');
    recordSpawns();
    vi.stubEnv('NODE_ENV', 'development');   // mountModeCrowd hands the capture rig its handle in a development build only
    const crowd = mountCrowdLayer({ scene }, crowdOf());
    vi.unstubAllEnvs();
    const cast = mountCrowdCastLayer(scene, [await member()], crowdOf(), { tier: 'desktop', hears: crowd.crowd, reduced: () => false });
    await cast.ready;
    crowd.crowd!.react('groan', 1);                                   // the layer's handle (the script host's crowd action)
    expect(cast.director!.busy(0)).toBe(true);
    frames(120);
    expect(cast.director!.busy(0)).toBe(false);
    const dev = (scene.metadata as { felCrowd?: { react(k: string, s?: number): void } }).felCrowd;
    dev!.react('cheer', 1);                                           // the dev rig's handle: the crowd's own object
    expect(cast.director!.busy(0)).toBe(true);
    cast.dispose(); crowd.dispose(); scene.dispose(); engine.dispose();
  });

  it('a listener that throws never takes the crowd down; the other listeners still hear it', async () => {
    const { engine, scene } = sceneAt('desktop');
    const crowd = mountCrowdLayer({ scene }, crowdOf());
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const order: string[] = [];
    crowd.crowd!.onReact(() => { order.push('listener'); throw new Error('boom'); });
    const off = crowd.crowd!.onReact(() => order.push('second'));
    crowd.crowd!.react('cheer', 1);
    expect(order).toEqual(['listener', 'second']);
    expect(warn).toHaveBeenCalled();
    off();
    crowd.crowd!.react('cheer', 1);
    expect(order).toEqual(['listener', 'second', 'listener']);
    crowd.dispose(); scene.dispose(); engine.dispose();
  });

  it('the editor\'s stage: the cast fans hear the stage\'s crowd, and a crowd re-mount hands them the new one', async () => {
    installOffscreenShim();
    const rec = recordSpawns();
    const engine = new NullEngine();
    (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 30;
    const v = { ...everyKindProject().venues[0], mood: 'indoorArena' as const };   // indoor: NullEngine refuses an outdoor desktop shadow map
    vi.stubEnv('NODE_ENV', 'development');   // the crowd's dev handle is how this test (and the capture rig) makes it react
    const stage = await mountStage({ canvas: null, engine, exp: exportVenue(v, { crowd: [await member()] }), tier: 'desktop' });
    const crowdNow = () => (stage.scene.metadata as { felCrowd: { react(k: string, s?: number): void } }).felCrowd;
    const cheers = () => rec.played.filter((p) => p.clip === 'studio_fan_sit_cheer').length;
    try {
      await new Promise((r) => setTimeout(r, 0));
      expect(rec.played.length).toBeGreaterThan(0);   // seated, idling
      crowdNow().react('cheer', 1);
      for (let i = 0; i < 30; i++) stage.scene.render();
      expect(cheers()).toBe(1);
      // a stand edit re-mounts the crowd, and the cast layer with it: the new crowd's cheers reach the new fans
      const first = crowdNow();
      stage.realise(exportVenue(v, { crowd: [await member()] }), ['crowd']);
      await new Promise((r) => setTimeout(r, 0));
      expect(crowdNow()).not.toBe(first);
      for (let i = 0; i < 60; i++) stage.scene.render();
      crowdNow().react('cheer', 1);
      for (let i = 0; i < 30; i++) stage.scene.render();
      expect(cheers()).toBe(2);
      first.react('cheer', 1);                         // the old crowd is gone: nobody hears it
      for (let i = 0; i < 30; i++) stage.scene.render();
      expect(cheers()).toBe(2);
    } finally {
      vi.unstubAllEnvs();
      stage.dispose();
    }
  });

  it('a cast layer torn down on its own (a cast edit) stops listening to the crowd that stays', async () => {
    const { engine, scene } = sceneAt('desktop');
    recordSpawns();
    let subs = 0;
    const hears = { onReact: () => { subs++; return () => { subs--; }; } };
    const cast = mountCrowdCastLayer(scene, [await member()], crowdOf(), { tier: 'desktop', hears });
    expect(subs).toBe(1);
    cast.dispose();
    expect(subs).toBe(0);
    scene.dispose(); engine.dispose();
  });

  it('a phone keeps its card crowd: no cast fan, nothing to cheer', async () => {
    const { engine, scene } = sceneAt('mobile');
    const spawn = vi.spyOn(CharacterLibrary, 'spawn');
    const crowd = mountCrowdLayer({ scene }, crowdOf());
    const cast = mountCrowdCastLayer(scene, [await member()], crowdOf(), { hears: crowd.crowd });
    expect(cast.seats).toEqual([]);
    expect(cast.director).toBeNull();
    crowd.crowd!.react('cheer', 1);
    expect(spawn).not.toHaveBeenCalled();
    crowd.dispose(); scene.dispose(); engine.dispose();
  });

  it('the seats carry where along the row they are (the ripple), from the crowd\'s own layout', () => {
    const s = crowdCastSeats(crowdOf(), 4);
    expect(s.length).toBeGreaterThan(0);
    for (const seat of s) { expect(seat.along).toBeGreaterThanOrEqual(0); expect(seat.along).toBeLessThanOrEqual(1); }
  });
});
