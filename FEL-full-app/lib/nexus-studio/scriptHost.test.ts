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

describe('studio-4b: the rally the HUD posts, and the mode\'s own replay', () => {
  it('"Rally length 3" fires as the posted rally count reaches 3; the mode\'s HUD passes through unchanged', () => {
    const r = rig();
    const ev = newNode('onRally', 0, 0, { length: 3 }), b = newNode('banner', 0, 0, { text: 'RALLY!' });
    const host = mountScriptHost(r.ctx, [{ id: 'sc', enabled: true, nodes: [ev, b], edges: [newEdge(ev.id, b.id)] }], {});
    r.setPhase('playing'); r.frames(1);
    const posts = [{ rally: 0, myPts: 0 }, { rally: 1 }, { rally: 2 }, { rally: 3 }, { rally: 4 }, { rally: 0, myPts: 1 }, { rally: 3 }];
    for (const u of posts) r.ctx.setHud(u);
    expect(r.hud.filter((u) => !(STUDIO_HUD.banner in u))).toEqual(posts);   // every mode update, unchanged, in order
    expect(host.fired.map((a) => a.kind)).toEqual(['banner', 'banner']);    // 2 → 3, and again in the next rally
    host.dispose();
    expect(r.ctx.setHud).toBe(r.harnessSetHud);
  });
  it('a target that names its own rally key is read there', () => {
    const r = rig();
    const ev = newNode('onRally', 0, 0, { length: 2 }), b = newNode('sound', 0, 0);
    vi.spyOn(SoundKit, 'play').mockImplementation(() => {});
    const host = mountScriptHost(r.ctx, [{ id: 'sc', enabled: true, nodes: [ev, b], edges: [newEdge(ev.id, b.id)] }], { rallyKey: 'volley' });
    r.ctx.setHud({ rally: 5 });
    expect(host.fired).toHaveLength(0);   // the default key is not this target's
    r.ctx.setHud({ volley: 2 });
    expect(host.fired).toHaveLength(1);
    host.dispose();
  });
  it('"Replay starts / ends": a replay on screen (a frame drawn while the mode\'s call is pending), then its end; the harness gets the call', async () => {
    const r = rig();
    let finish: () => void = () => {};
    const harnessHighlight = vi.fn((_o?: unknown) => new Promise<void>((res) => { finish = res; }));
    r.ctx.highlight = harnessHighlight as unknown as typeof r.ctx.highlight;
    const starts = newNode('onReplay', 0, 0, { when: 'starts' }), ends = newNode('onReplay', 0, 0, { when: 'ends' });
    const a = newNode('sound', 0, 0, { cue: 'whistle' }), b = newNode('banner', 0, 0, { text: 'WHAT A RUN' });
    vi.spyOn(SoundKit, 'play').mockImplementation(() => {});
    const host = mountScriptHost(r.ctx, [{ id: 'sc', enabled: true, nodes: [starts, ends, a, b], edges: [newEdge(starts.id, a.id), newEdge(ends.id, b.id)] }], {});
    r.setPhase('playing'); r.frames(1);
    const opts = { lastSeconds: 2.6 };
    const done = (r.ctx.highlight as (o: unknown) => Promise<void>)(opts);   // the MODE asks for its replay
    expect(harnessHighlight).toHaveBeenCalledWith(opts);                      // the harness's own call, with the mode's options
    expect(host.fired).toHaveLength(0);                                       // not on screen yet
    r.frames(3);
    expect(host.fired.map((x) => x.kind)).toEqual(['sound']);                 // starts, once
    finish(); await done;
    expect(host.fired.map((x) => x.kind)).toEqual(['sound', 'banner']);       // ends
    host.dispose();
    expect(r.ctx.highlight).toBe(harnessHighlight);                           // the harness's own back
  });
  it('a replay the harness refuses (it settles before a frame) is no event', async () => {
    const r = rig();
    const harnessHighlight = vi.fn(async () => {});
    r.ctx.highlight = harnessHighlight;
    const ends = newNode('onReplay', 0, 0, { when: 'ends' }), starts = newNode('onReplay', 0, 0, { when: 'starts' }), a = newNode('crowd', 0, 0), b = newNode('crowd', 0, 0);
    const host = mountScriptHost(r.ctx, [{ id: 'sc', enabled: true, nodes: [ends, starts, a, b], edges: [newEdge(ends.id, a.id), newEdge(starts.id, b.id)] }], { crowd: { react: vi.fn() } });
    r.setPhase('playing');
    await (r.ctx.highlight as () => Promise<void>)();
    r.frames(2);
    expect(harnessHighlight).toHaveBeenCalledTimes(1);
    expect(host.fired).toHaveLength(0);
    host.dispose();
  });
  it('a script\'s OWN replay (a camera shot) calls the harness directly and never feeds the script\'s replay events', () => {
    const r = rig();
    const harnessHighlight = vi.fn(() => new Promise<void>(() => {}));   // stays on screen
    r.ctx.highlight = harnessHighlight;
    const t = newNode('onTimer', 0, 0, { seconds: 0.5, repeat: 'once' }), cam = newNode('camera', 0, 0, { shot: 'replay' });
    const st = newNode('onReplay', 0, 0, { when: 'starts' }), snd = newNode('crowd', 0, 0);
    const host = mountScriptHost(r.ctx, [{ id: 'sc', enabled: true, nodes: [t, cam, st, snd], edges: [newEdge(t.id, cam.id), newEdge(st.id, snd.id)] }], { crowd: { react: vi.fn() } });
    r.setPhase('playing'); r.frames(10);
    expect(harnessHighlight).toHaveBeenCalledTimes(1);           // the script's replay ran…
    expect(host.fired.map((x) => x.kind)).toEqual(['camera']);   // …and was not heard as "replay starts"
    host.dispose();
  });
  it('no script listens: neither the rally nor the replay is tapped', () => {
    const r = rig();
    const own = r.ctx.highlight;
    const t = newNode('onTimer', 0, 0), s = newNode('sound', 0, 0);
    const host = mountScriptHost(r.ctx, [{ id: 'sc', enabled: true, nodes: [t, s], edges: [newEdge(t.id, s.id)] }], {});
    expect(r.ctx.setHud).toBe(r.harnessSetHud);
    expect(r.ctx.highlight).toBe(own);
    host.dispose();
  });
});
