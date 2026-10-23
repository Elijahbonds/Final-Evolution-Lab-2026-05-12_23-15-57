// hoops-defense-fx: the handle's feedback listens to the carry and the meter — the plant's squeak, the cross's slap and buzz, and the
// ankle-breaker's big buzz, camera punch (off in reduced motion) and crowd "ooh", landed on the move's catch.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ANKLES_WAIT_SEC, HANDLE_FX, HandleFxWatch, mountHandleFx, padRumble, playOoh, playSlap, type CarryMoveRead } from './handleFx';
import { MomentumBus } from '../../core/MomentumBus';
import { SoundKit } from '../../audio/SoundKit';

// the motion answer, per test (reducedMotion reads the window; this suite runs without one)
const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock('../../../a11y/reducedMotion', async (orig) => {
  const real = await orig<typeof import('../../../a11y/reducedMotion')>();
  return { ...real, motionPolicy: () => real.juicePolicy(motion.reduced) };
});

const DT = 1 / 60;
/** A move's frames as the carry reports them: `contactAt` (k) is where the end hand takes the ball. */
function frames(name: string, start: 'left' | 'right', end: 'left' | 'right', dur = 0.3, contactAt = 0.8): CarryMoveRead[] {
  const out: CarryMoveRead[] = [];
  for (let t = 0; t <= dur + 1e-9; t += DT) {
    const k = Math.min(1, t / dur);
    out.push({ name, t, k, startHand: start, endHand: end, contact: k < 0.25 ? start : k < contactAt ? null : end });
  }
  return out;
}
function play(w: HandleFxWatch, fr: (CarryMoveRead | null)[]) {
  return fr.flatMap((m) => w.step(DT, m).map((c) => c.kind));
}

describe('HandleFxWatch: the plant and the catch', () => {
  it('a crossover: one plant on its first frame, one catch when the other hand takes it', () => {
    const w = new HandleFxWatch();
    const fr = frames('crossover', 'right', 'left');
    const cues = fr.map((m) => w.step(DT, m));
    expect(cues[0]).toEqual([{ kind: 'plant', move: 'crossover', crossing: true }]);
    const catchAt = cues.findIndex((c) => c.some((x) => x.kind === 'catch'));
    expect(fr[catchAt].contact).toBe('left');
    expect(fr[catchAt - 1].contact).not.toBe('left');
    expect(cues.flat().filter((c) => c.kind === 'catch')).toHaveLength(1);
  });
  it('a move that keeps the hand (the hesitation, the in-and-out) plants but never slaps', () => {
    const w = new HandleFxWatch();
    const cues = play(w, [...frames('hesitation', 'right', 'right'), null, null, ...frames('in_and_out', 'right', 'right')]);
    expect(cues.filter((c) => c === 'plant')).toHaveLength(2);
    expect(cues).not.toContain('catch');
  });
  it('a double cross (a queued move starting at the first one\'s catch) is two plants and two catches', () => {
    const w = new HandleFxWatch();
    const cues = play(w, [...frames('crossover', 'right', 'left'), ...frames('crossover', 'left', 'right')]);
    expect(cues.filter((c) => c === 'plant')).toHaveLength(2);
    expect(cues.filter((c) => c === 'catch')).toHaveLength(2);
  });
  it('two plants inside squeakGapSec squeak once', () => {
    const w = new HandleFxWatch();
    const a = frames('jab', 'right', 'right', 0.05);
    const cues = play(w, [...a, ...frames('hesitation', 'right', 'right')]);
    expect(a.length * DT).toBeLessThan(HANDLE_FX.squeakGapSec);
    expect(cues.filter((c) => c === 'plant')).toHaveLength(1);
  });
  it('a cancelled cross (the move ends before the other hand has it) never slaps', () => {
    const w = new HandleFxWatch();
    const cut = frames('crossover', 'right', 'left').slice(0, 10);
    expect(cut.every((m) => m.contact !== 'left')).toBe(true);
    expect(play(w, [...cut, null, null])).not.toContain('catch');
  });
});

describe('HandleFxWatch: the ankle-breaker lands on the catch', () => {
  it('reported on the cross\'s first frame, it fires with that cross\'s catch (the moment he bites), once', () => {
    const w = new HandleFxWatch();
    const fr = frames('crossover', 'right', 'left');
    w.ankles();
    const cues = fr.map((m) => w.step(DT, m).map((c) => c.kind));
    const i = cues.findIndex((c) => c.includes('ankles'));
    expect(cues[i]).toEqual(['catch', 'ankles']);
    expect(cues.flat().filter((c) => c === 'ankles')).toHaveLength(1);
  });
  it('a catch later than the cap does not hold it: it fires at ANKLES_WAIT_SEC', () => {
    const w = new HandleFxWatch();
    const slow = frames('behind_back', 'right', 'left', 0.8, 0.9);
    w.ankles();
    const cues = slow.map((m) => w.step(DT, m).map((c) => c.kind));
    const i = cues.findIndex((c) => c.includes('ankles'));
    expect(i * DT).toBeGreaterThanOrEqual(ANKLES_WAIT_SEC - 2 * DT);
    expect(i * DT).toBeLessThanOrEqual(ANKLES_WAIT_SEC + 2 * DT);
    expect(cues.flat().filter((c) => c === 'ankles')).toHaveLength(1);
  });
  it('with nothing crossing (off the head, a hesitation, no move), it fires on the frame it is reported', () => {
    for (const m of [null, frames('hesitation', 'right', 'right')[3]]) {
      const w = new HandleFxWatch();
      if (m) w.step(DT, { ...m, t: 0 });
      w.ankles();
      expect(w.step(DT, m).map((c) => c.kind)).toContain('ankles');
    }
  });
});

describe('padRumble', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  it('buzzes every pad that has a dual-rumble actuator, and is silent without one', () => {
    const calls: unknown[] = [];
    const act = { playEffect: (k: string, o: object) => { calls.push([k, o]); return Promise.resolve('complete'); } };
    vi.stubGlobal('navigator', { getGamepads: () => [{ vibrationActuator: act }, null, { }] });
    expect(padRumble(0.5, 0.4, 80)).toBe(1);
    expect(calls).toEqual([['dual-rumble', { startDelay: 0, duration: 80, strongMagnitude: 0.5, weakMagnitude: 0.4 }]]);
    vi.stubGlobal('navigator', {});
    expect(padRumble(0.5, 0.4, 80)).toBe(0);
  });
});

describe('mountHandleFx: the outputs', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  function rig(reduced: boolean) {
    motion.reduced = reduced;
    const rumbles: number[] = [];
    vi.stubGlobal('navigator', { getGamepads: () => [{ vibrationActuator: { playEffect: (_k: string, o: { strongMagnitude: number }) => { rumbles.push(o.strongMagnitude); return Promise.resolve(); } } }] });
    const subs: (() => void)[] = [];
    const scene = {
      metadata: null as Record<string, unknown> | null,
      onBeforeRenderObservable: { add: (f: () => void) => { subs.push(f); return f; }, remove: (f: () => void) => { const i = subs.indexOf(f); if (i >= 0) subs.splice(i, 1); } },
      getEngine: () => ({ getDeltaTime: () => 1000 / 60 }),
    };
    const pulses: number[][] = [];
    const momentum = new MomentumBus();
    let move: CarryMoveRead | null = null;
    const squeaks = vi.spyOn(SoundKit, 'play').mockImplementation(() => {});
    const fx = mountHandleFx({ scene: scene as never, momentum, camDirector: { pulse: (s: number, d: number) => pulses.push([s, d]) } as never }, { carry: () => ({ move }) });
    const frame = (m: CarryMoveRead | null) => { move = m; subs.forEach((f) => f()); };
    return { fx, frame, momentum, pulses, rumbles, squeaks, scene, subs };
  }
  it('a cross that broke him: the squeak, the catch buzz, then the big buzz, the punch and the counts', () => {
    const r = rig(false);
    const fr = frames('crossover', 'right', 'left');
    r.frame(fr[0]); r.momentum.report({ kind: 'ankle_break' });
    for (const m of fr.slice(1)) r.frame(m);
    expect(r.squeaks).toHaveBeenCalledWith('squeak', HANDLE_FX.squeak.cross);
    expect(r.rumbles).toEqual([HANDLE_FX.rumbleCatch.strong, HANDLE_FX.rumbleAnkles.strong]);
    expect(r.pulses).toEqual([[HANDLE_FX.punch.strength, HANDLE_FX.punch.sec]]);
    expect(r.fx.counts).toMatchObject({ plant: 1, catch: 1, ankles: 1, punch: 1, rumble: 2 });
    expect((r.scene.metadata as { felHandleFx?: unknown }).felHandleFx).toBe(r.fx);
  });
  it('reduced motion: no camera punch — the buzz and the sounds stay', () => {
    const r = rig(true);
    r.frame(null); r.momentum.report({ kind: 'ankle_break' }); r.frame(null);
    expect(r.pulses).toEqual([]);
    expect(r.rumbles).toEqual([HANDLE_FX.rumbleAnkles.strong]);
    expect(r.fx.counts.ankles).toBe(1);
  });
  it('only the ankle-breaker moves it: other reports are not heard', () => {
    const r = rig(false);
    for (const kind of ['big_make', 'steal', 'block', 'posterize'] as const) { r.momentum.report({ kind }); r.frame(null); }
    expect(r.fx.counts.ankles).toBe(0);
    expect(r.pulses).toEqual([]);
  });
  it('dispose stops listening (the frame and the meter) and clears the probe handle', () => {
    const r = rig(false);
    r.fx.dispose();
    expect(r.subs).toHaveLength(0);
    r.momentum.report({ kind: 'ankle_break' });
    expect(r.fx.counts.ankles).toBe(0);
    expect((r.scene.metadata as { felHandleFx?: unknown }).felHandleFx).toBeUndefined();
  });
});

describe('the slap and the ooh: where they play', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  /** A Web Audio graph that records what connects to what. */
  function fakeGraph() {
    const into: string[] = [];
    const node = (name: string): Record<string, unknown> => {
      const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
      const n: Record<string, unknown> = { name, gain: param(), frequency: param(), Q: param(), type: '', buffer: null, start() {}, stop() {} };
      n.connect = (to: { name: string }) => { into.push(`${name}>${to.name}`); return to; };
      return n;
    };
    const ctx = { currentTime: 0, sampleRate: 8000, createBufferSource: () => node('src'), createBiquadFilter: () => node('filter'), createGain: () => node('gain'),
      createOscillator: () => node('osc'), createBuffer: (_c: number, len: number) => ({ sampleRate: 8000, getChannelData: () => new Float32Array(len) }) };
    return { into, graph: { ctx, sfx: node('SFX'), crowdDuck: node('CROWD'), voice: node('v'), voiceIn: node('vi'), out: node('o'), music: node('m') } };
  }
  it('the slap plays on the SFX bus (the player\'s SFX level, the voice duck); the ooh on the crowd\'s duck', () => {
    vi.stubGlobal('window', {});
    const f = fakeGraph();
    vi.spyOn(SoundKit, 'graph').mockReturnValue(f.graph as never);
    expect(playSlap()).toBe(true);
    expect(f.into.filter((e) => e.endsWith('>SFX')).length).toBeGreaterThan(0);
    expect(f.into.some((e) => e.endsWith('>CROWD'))).toBe(false);
    f.into.length = 0;
    expect(playOoh()).toBe(true);
    expect(f.into.filter((e) => e.endsWith('>CROWD'))).toHaveLength(1);
    expect(f.into.some((e) => e.endsWith('>SFX'))).toBe(false);
  });
  it('muted, or with no Web Audio, they play nothing and never throw', () => {
    expect(playSlap()).toBe(false);   // no window here
    vi.stubGlobal('window', {});
    vi.spyOn(SoundKit, 'muted', 'get').mockReturnValue(true);
    const g = vi.spyOn(SoundKit, 'graph');
    expect(playOoh()).toBe(false);
    expect(g).not.toHaveBeenCalled();
  });
});
