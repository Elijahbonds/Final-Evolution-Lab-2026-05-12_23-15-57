// Track 4's host on a real (Null) scene with the real momentum meter: "on a point won → crowd cheer + banner" end to end at
// the host's seam — the HUD the mode posts in, presentation calls out, and the mode's own HUD and meter untouched.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FreeCamera, MeshBuilder, NullEngine, Scene, StandardMaterial, Color3, TransformNode, Vector3 } from '@babylonjs/core';
import { MomentumBus } from '../babylon/core/MomentumBus';
import { EffectsKit } from '../babylon/visual/EffectsKit';
import { SoundKit } from '../babylon/audio/SoundKit';
import { mountScriptHost, STUDIO_HUD } from './scriptHost';
import { newEdge, newNode, pointWonGraph } from './scripts';

afterEach(() => vi.restoreAllMocks());

function rig() {
  const engine = new NullEngine();
  (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 100;
  const scene = new Scene(engine);
  new FreeCamera('c', new Vector3(0, 2, -5), scene);
  const hero = new TransformNode('hero', scene); hero.position.set(0, 0, 10);
  const hud: Array<Record<string, unknown>> = [];
  const harnessSetHud = vi.fn((u: Record<string, unknown>) => { hud.push(u); });
  let phase = 'ready';
  const momentum = new MomentumBus();
  const ctx = { scene, momentum, phase: () => phase, heroRef: { current: hero }, setHud: harnessSetHud, camDirector: { establish: vi.fn(() => true) }, highlight: vi.fn(async () => {}) };
  return { scene, ctx, hud, harnessSetHud, momentum, setPhase: (p: string) => { phase = p; }, frames: (n: number) => { for (let i = 0; i < n; i++) scene.render(); } };
}

describe('on a point won → the crowd cheers and a banner shows', () => {
  it('end to end at the host: the HUD the mode posts → the crowd, the banner, a burst; the mode\'s HUD passes through unchanged', () => {
    const r = rig();
    const crowd = { react: vi.fn() };
    const burst = vi.spyOn(EffectsKit, 'burst').mockImplementation(() => {});
    const host = mountScriptHost(r.ctx, [{ id: 'sc', ...pointWonGraph() }], { crowd, scoreKeys: { me: 'myPts', them: 'aiPts' } });
    r.setPhase('playing'); r.frames(2);
    r.ctx.setHud({ myPts: 0, aiPts: 0, banner: '' });   // the mode's first post: a baseline, not a point
    expect(crowd.react).not.toHaveBeenCalled();
    r.ctx.setHud({ myPts: 0, aiPts: 1 });               // their point
    expect(crowd.react).not.toHaveBeenCalled();
    r.ctx.setHud({ myPts: 1, aiPts: 1, banner: 'AI NETS IT' });   // our point
    expect(crowd.react).toHaveBeenCalledWith('cheer', 1);
    expect(burst).toHaveBeenCalledTimes(1);
    // the harness got every update the mode sent, unchanged and in order, then the banner on the studio keys only
    expect(r.hud.slice(0, 3)).toEqual([{ myPts: 0, aiPts: 0, banner: '' }, { myPts: 0, aiPts: 1 }, { myPts: 1, aiPts: 1, banner: 'AI NETS IT' }]);
    expect(r.hud[3]).toEqual({ [STUDIO_HUD.banner]: 'POINT!', [STUDIO_HUD.tone]: 'score' });
    expect(host.fired.map((a) => a.kind)).toEqual(['crowd', 'banner', 'burst']);
    r.frames(25);   // 2.5 s: the banner clears itself
    expect(r.hud.at(-1)).toEqual({ [STUDIO_HUD.banner]: '' });
    host.dispose();
    expect(r.ctx.setHud).toBe(r.harnessSetHud);   // the harness's own setHud is back
  });

  it('listens to the meter and never moves it; start, timer, end; sound and the camera shot', () => {
    const r = rig();
    const report = vi.spyOn(r.momentum, 'report');
    const play = vi.spyOn(SoundKit, 'play').mockImplementation(() => {});
    const start = newNode('onModeStart', 0, 0), cam = newNode('camera', 0, 0, { shot: 'establish' });
    const chain = newNode('onMomentum', 0, 0, { kind: 'chain' }), snd = newNode('sound', 0, 0, { cue: 'crowdCheer', volume: 0.5 });
    const end = newNode('onModeEnd', 0, 0), cheer = newNode('crowd', 0, 0, { reaction: 'finish' });
    const crowd = { react: vi.fn() };
    const host = mountScriptHost(r.ctx, [{ id: 'sc', enabled: true, nodes: [start, cam, chain, snd, end, cheer], edges: [newEdge(start.id, cam.id), newEdge(chain.id, snd.id), newEdge(end.id, cheer.id)] }], { crowd });
    r.frames(2);
    expect(r.ctx.camDirector.establish).not.toHaveBeenCalled();   // not before play
    r.setPhase('playing'); r.frames(1);
    expect(r.ctx.camDirector.establish).toHaveBeenCalledWith('establish');
    const before = r.momentum.score01;
    r.momentum.report({ kind: 'chain' });   // the MODE reports; the script hears it
    expect(play).toHaveBeenCalledWith('crowdCheer', { volume: 0.5 });
    expect(report).toHaveBeenCalledTimes(1);   // only the mode's own report: the host never reports
    expect(r.momentum.score01).toBeGreaterThan(before);
    r.setPhase('ended'); r.frames(2);
    expect(crowd.react).toHaveBeenCalledWith('finish', 1);
    host.dispose();
  });

  it('a light pulse flares the Studio fixture heads and puts their colour back', () => {
    const r = rig();
    const head = MeshBuilder.CreateSphere('lhead_studio_a', {}, r.scene);
    const mat = new StandardMaterial('m', r.scene); mat.emissiveColor = new Color3(0.5, 0.4, 0.3); head.material = mat;
    const t = newNode('onTimer', 0, 0, { seconds: 0.5, repeat: 'once' }), l = newNode('lights', 0, 0, { color: '#ffffff', seconds: 0.6 });
    const host = mountScriptHost(r.ctx, [{ id: 'sc', enabled: true, nodes: [t, l], edges: [newEdge(t.id, l.id)] }], { fixtureHeads: [head] });
    r.setPhase('playing'); r.frames(6);
    expect(mat.emissiveColor.r).toBeGreaterThan(0.5);
    r.frames(10);
    expect(mat.emissiveColor.asArray()).toEqual([0.5, 0.4, 0.3]);
    host.dispose();
  });

  it('no scripts: nothing is tapped', () => {
    const r = rig();
    const host = mountScriptHost(r.ctx, [], { scoreKeys: { me: 'myPts', them: 'aiPts' } });
    expect(r.ctx.setHud).toBe(r.harnessSetHud);
    host.dispose();
  });
});
