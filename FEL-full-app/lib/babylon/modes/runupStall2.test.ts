// RUNUP-STALL-2 (2026-10-30), on top of c9e199db. AM's gate (fel-visual-qa-2026-10-30/runup-stall-c9e199db) failed:
// (b) jinx was requested in JUDGING (+30645), started by rivalRound's override; (a) the six bodies and the dunk-3 landing's
// shaders still set up during the night. (a) is behind the feel knob dunk.preloadSet (default off); (b) fixes c9e199db.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { Vector3 } from '@babylonjs/core';

let gates: (() => void)[] = [];
vi.mock('../core/CharacterLibrary', () => ({
  CharacterLibrary: {
    spawn: async (_s: unknown, _u: unknown, o: { position: Vector3 }) => {
      await new Promise<void>((r) => gates.push(r));
      return { root: { position: o.position.clone(), getChildMeshes: () => [] }, animator: { currentGroup: { pause: () => {}, restart: () => {} }, play: () => null }, dispose: () => {} };
    },
  },
}));

import { Onlookers } from '../visual/Onlookers';
import { warmSceneShaders } from '../core/warmShaders';
import { DUNK_PRELOAD_SET_ON, PRELOAD_BURSTS, PRELOAD_CAP_MS, QUIET_DUNK_PHASES, isQuietDunkPhase } from './dunkContestDefer';
import { FEEL_KNOBS } from '../../feel-panel/knobs';

const root = join(__dirname, '../../..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');
const dunk = read('lib/babylon/modes/DunkMode.ts');
const between = (s: string, a: string, b: string) => { const i = s.indexOf(a); expect(i, a).toBeGreaterThan(-1); const j = s.indexOf(b, i); expect(j, b).toBeGreaterThan(i); return s.slice(i, j); };
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

// ── (b) jinx never starts in judging ──────────────────────────────────────────────────────────────────────────────────
describe('RUNUP-STALL-2 (b): his body is asked for on his turn\'s own beat, never in judging', () => {
  const round = between(dunk, 'async function rivalRound(ctx: ModeContext)', 'player.root.position.set(-3.2');
  it('rivalRound is reached from judging (advanceAfterJudging), which is why the override needed its own beat', () => {
    const adv = between(dunk, 'async function advanceAfterJudging(ctx: ModeContext)', '\n  function resetForNextAttempt(');
    expect(adv).toContain("if (phase !== 'judging' || awaitingRival) return;");
    expect(adv).toContain('await rivalRound(ctx);');
  });
  it('rivalTurn is entered after any replay and BEFORE the override starts the set (and so before bringRival)', () => {
    const replay = round.indexOf('await whenQuietBeat(() => !replaying, () => ctx.scene.isDisposed);');
    const beat = round.indexOf("setPhase('rivalTurn');");
    const start = round.indexOf('contestHisTurn = true; try { startContestSet(ctx); }');
    expect(replay).toBeGreaterThan(-1);
    expect(beat).toBeGreaterThan(replay);   // FAILS if the set can start before rivalTurn (in judging)
    expect(start).toBeGreaterThan(beat);
    expect(round.indexOf('await rivalArrival;')).toBeGreaterThan(start);
    expect(isQuietDunkPhase('rivalTurn')).toBe(true);
    expect(isQuietDunkPhase('judging')).toBe(false);
  });
  it('a model of the override: the phase at the moment his body is asked for is always on the allow-list', async () => {
    let phase = 'judging'; let replaying = true; const askedIn: string[] = [];
    const startContestSet = () => askedIn.push(phase);
    const whenNot = async (f: () => boolean) => { while (!f()) await new Promise((r) => setTimeout(r, 1)); };
    const rivalRound = async () => {   // DunkMode's !rival branch, step for step
      await whenNot(() => !replaying);
      phase = 'rivalTurn';
      startContestSet();
    };
    const run = rivalRound();
    await flush(); expect(askedIn).toEqual([]);   // the replay is still running: nothing yet
    replaying = false; await run;
    expect(askedIn).toEqual(['rivalTurn']);
    expect(QUIET_DUNK_PHASES).toContain(askedIn[0] as never);
  });
  it('his turn does not stall on the new beat: the watchdog stands down while he loads, and nothing but it and endRivalTurn advance rivalTurn', () => {
    expect(dunk).toContain('if (phaseSec <= BUDGET_SEC[phase] || finishing || awaitingRival) return;');
    expect(round.indexOf('awaitingRival = true;')).toBeLessThan(round.indexOf("setPhase('rivalTurn');"));
    expect(dunk.match(/advanceAfterRivalTurn\(ctx\)/g)).toHaveLength(2);   // the watchdog's case and endRivalTurn
    // after he lands, his turn proceeds as before: resetForNextAttempt puts the runway (approach) up for him
    expect(dunk.slice(dunk.indexOf('async function rivalRound(ctx: ModeContext)'), dunk.indexOf('/** The rival\'s dunks are done')).trimEnd()).toMatch(/resetForNextAttempt\(ctx\);\n\s*\}$/);
  });
});

// ── (a) the preload, knob dunk.preloadSet ───────────────────────────────────────────────────────────────────────────
describe('RUNUP-STALL-2 (a): the knob', () => {
  it('dunk.preloadSet is a 0/1 knob, OFF by default, sourced from DUNK_PRELOAD_SET_ON', () => {
    const k = FEEL_KNOBS.find((x) => x.id === 'dunk.preloadSet')!;
    expect(k).toBeDefined();
    expect([k.def, k.min, k.max, k.step]).toEqual([0, 0, 1, 1]);
    expect(k.source).toBe('lib/babylon/modes/dunkContestDefer.ts DUNK_PRELOAD_SET_ON');
    expect(DUNK_PRELOAD_SET_ON).toBe(0);
    expect(PRELOAD_CAP_MS).toBe(20000);
  });
  it('knob off: load() never starts the preload (the c9e199db night, unchanged)', () => {
    const load = between(dunk, '    async load(ctx: ModeContext) {', '\n    onInput(ctx: ModeContext');
    expect(load).toContain("if (feel('dunk.preloadSet', DUNK_PRELOAD_SET_ON) >= 0.5) void preloadContestSet(ctx);");
    expect(dunk.match(/preloadContestSet\(ctx\)/g)).toHaveLength(1);   // that line is the only caller
    expect(load).not.toMatch(/spawnRivalBody\(/);
  });
});

describe('RUNUP-STALL-2 (a): the preload loads all six bodies and the shaders before dunk 1', () => {
  const pre = between(dunk, 'async function preloadContestSet(ctx: ModeContext)', '\n  /** The corner props');
  it('order: his body, the dressing (the rail), the five onlookers landed, the burst particles, then every shader', () => {
    const order = ['await bringRival(ctx);', 'await dunkVenue?.mountDressing();', 'await Onlookers.settled(ctx.scene);', 'for (const kind of PRELOAD_BURSTS) EffectsKit.burst(', 'await warmSceneShaders(ctx.scene);'];
    const at = order.map((s) => pre.indexOf(s));
    for (const i of at) expect(i).toBeGreaterThan(-1);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect([...PRELOAD_BURSTS]).toEqual(['dust', 'net', 'sparks', 'confetti']);
    expect(pre).toContain('new Vector3(0, -60, 0)');   // under the court: compiled, never seen
  });
  it('the first run waits for it (beginRun refuses while it holds), capped, and the hold always lifts', () => {
    const run = between(dunk, 'function beginRun(ctx: ModeContext): void {', 'setPhase(\'charge\');');
    expect(run.indexOf('if (preloadHold) {')).toBeGreaterThan(run.indexOf("if (phase !== 'approach') return;"));
    expect(pre).toContain('preloadHold = true;');
    expect(pre).toContain('Promise.race([work, new Promise<void>((r) => setTimeout(r, PRELOAD_CAP_MS))])');
    expect(pre).toMatch(/finally \{ preloadHold = false; \}/);
    expect(dunk).toMatch(/contestDefer\.reset\(\);\n\s+rivalBringing = null; preloadHold = false;/);   // a new mount never inherits a hold
  });
  it('his body is loaded once: the preload and the contest set share one bringRival', async () => {
    const bring = between(dunk, 'async function bringRival(ctx: ModeContext)', '\n  async function bringRivalOnce(');
    expect(bring).toContain('if (rivalBringing) return rivalBringing;');
    // the same shape, run: two callers, one spawn
    let spawns = 0; let land!: () => void; let bringing: Promise<void> | null = null;
    const once = async () => { spawns++; await new Promise<void>((r) => { land = r; }); };
    const bringRival = async () => { if (bringing) return bringing; bringing = once(); try { await bringing; } finally { bringing = null; } };
    const a = bringRival(), b = bringRival(); await flush(); land(); await Promise.all([a, b]);
    expect(spawns).toBe(1);
  });
});

describe('RUNUP-STALL-2 (a): Onlookers.settled', () => {
  const fakeScene = () => { const cbs: (() => void)[] = []; return { scene: { onBeforeRenderObservable: { addOnce: (cb: () => void) => { cbs.push(cb); }, add: () => null, remove: () => {} } } as never, frame: () => { const run = cbs.splice(0); for (const cb of run) cb(); } }; };
  it('resolves only once all five bodies of a one-per-frame rail have landed', async () => {
    gates = []; const { scene, frame } = fakeScene();
    const spots = Array.from({ length: 9 }, (_, i) => new Vector3(i, 0, 0));
    const crowd = new Onlookers(scene, spots, '#2b3550', Vector3.Zero(), { oneBodyPerFrame: true });
    let done = false; void Onlookers.settled(scene).then(() => { done = true; });
    for (let body = 0; body < 5; body++) {
      await flush(); expect(done).toBe(false);
      expect(gates.length).toBe(body + 1);   // one body asked for at a time
      gates[body](); await flush(); frame();
    }
    await flush();
    expect(done).toBe(true);
    crowd.dispose();
  });
  it('a crowd disposed mid-queue settles (the preload never waits on a torn-down rail)', async () => {
    gates = []; const { scene } = fakeScene();
    const crowd = new Onlookers(scene, [new Vector3(1, 0, 0), new Vector3(2, 0, 0)], '#2b3550', Vector3.Zero(), { oneBodyPerFrame: true });
    let done = false; void Onlookers.settled(scene).then(() => { done = true; });
    await flush(); expect(done).toBe(false);
    crowd.dispose(); await flush();
    expect(done).toBe(true);
  });
  it('a scene with no rail settles at once', async () => {
    await expect(Onlookers.settled({} as never)).resolves.toBeUndefined();
  });
});

describe('RUNUP-STALL-2 (a): warmSceneShaders', () => {
  it('compiles every mesh-material pair (hidden ones too), skips disposed and material-less meshes, survives a failure', async () => {
    const calls: string[] = [];
    const mesh = (name: string, o: { mat?: boolean; disposed?: boolean; fail?: boolean } = {}) => ({
      name, isDisposed: () => !!o.disposed,
      material: o.mat === false ? null : { forceCompilationAsync: (m: { name: string }) => { calls.push(m.name); return o.fail ? Promise.reject(new Error('x')) : Promise.resolve(); } },
    });
    const meshes = [mesh('body'), mesh('hidden_crowd_lod'), mesh('gone', { disposed: true }), mesh('helper', { mat: false }), mesh('bad', { fail: true })];
    const n = await warmSceneShaders({ meshes } as never);
    expect(n).toBe(3);
    expect(calls).toEqual(['body', 'hidden_crowd_lod', 'bad']);
  });
});
