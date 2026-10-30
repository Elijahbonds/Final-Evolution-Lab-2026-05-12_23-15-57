// RUNUP-STALL-1: the contest set (the rivals, the props, the voice banks, the walk-out) loads only on a quiet beat:
// rivalTurn, fieldCut or contestOver, with no replay running. Never in approach (the run-up starts there), never in judging
// (the replay and the reveal), never during the run, the flight or the landing, never during a replay (DunkMode has no replay
// phase; it is the `replaying` flag). And its rival bodies set up at most one per frame (v3).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { QUIET_DUNK_PHASES, createContestDefer, isQuietDunkPhase, whenQuietBeat } from './dunkContestDefer';
import { onePerFrame } from '../core/onePerFrame';

const read = (rel: string) => readFileSync(join(__dirname, rel), 'utf8');
const dunk = read('DunkMode.ts');
const between = (s: string, a: string, b: string) => { const i = s.indexOf(a); expect(i).toBeGreaterThan(-1); return s.slice(i, s.indexOf(b, i)); };
const ALL_PHASES = (dunk.match(/^type Phase = ([^;]+);/m)?.[1] ?? '').match(/'([a-zA-Z]+)'/g)!.map((q) => q.slice(1, -1));
const LANDING = ['resolve'];   // finishAttempt fires from here (the landing)
const NOT_QUIET = ALL_PHASES.filter((p) => !isQuietDunkPhase(p));

/** A model of DunkMode's wiring (dunkQuiet = isQuietDunkPhase(phase) && !replaying): finishAttempt asks, update() ticks. */
function night(phase = 'approach', replaying = false) {
  const gate = createContestDefer();
  let started = false; const loads: string[] = [];
  const quiet = () => isQuietDunkPhase(phase) && !replaying;
  const startContestSet = () => { if (started) return; if (!gate.ask(quiet())) return; started = true; loads.push(replaying ? `${phase}+replay` : phase); };
  return {
    set phase(p: string) { phase = p; }, set replaying(r: boolean) { replaying = r; },
    finishAttempt: () => startContestSet(),
    update: () => { if (gate.tick(quiet())) startContestSet(); },
    loads,
  };
}

describe('RUNUP-STALL-1: the contest set loads only on a quiet beat', () => {
  it('the allow-list is rivalTurn, fieldCut, contestOver, and every one is a real DunkMode phase', () => {
    expect([...QUIET_DUNK_PHASES]).toEqual(['rivalTurn', 'fieldCut', 'contestOver']);
    expect(ALL_PHASES).toEqual(['approach', 'charge', 'cinematic', 'resolve', 'judging', 'rivalTurn', 'fieldCut', 'contestOver']);
    expect(NOT_QUIET).toEqual(['approach', 'charge', 'cinematic', 'resolve', 'judging']);
  });

  it('NEVER loads in approach (the run-up starts there), asked there or queued into it', () => {
    const n = night('approach'); n.finishAttempt();
    for (let f = 0; f < 120; f++) n.update();
    expect(n.loads).toEqual([]);   // FAILS if the set ever loads in approach
    const m = night('resolve'); m.finishAttempt(); m.phase = 'approach';
    for (let f = 0; f < 120; f++) m.update();
    expect(m.loads).toEqual([]);
  });

  it('NEVER loads in judging, asked there or queued into it', () => {
    const n = night('judging'); n.finishAttempt();
    for (let f = 0; f < 120; f++) n.update();
    expect(n.loads).toEqual([]);   // FAILS if the set loads in judging
    const m = night('resolve'); m.finishAttempt(); m.phase = 'judging';
    for (let f = 0; f < 120; f++) m.update();
    expect(m.loads).toEqual([]);
    m.phase = 'rivalTurn'; m.update();
    expect(m.loads).toEqual(['rivalTurn']);
  });

  it('NEVER loads during the landing or a replay', () => {
    for (const p of LANDING) {
      const n = night(p); n.finishAttempt(); for (let f = 0; f < 60; f++) n.update();
      expect(n.loads).toEqual([]);   // FAILS if the set loads during the landing
    }
    for (const p of QUIET_DUNK_PHASES) {   // a replay can run inside an otherwise quiet phase
      const n = night(p, true); n.finishAttempt(); for (let f = 0; f < 60; f++) n.update();
      expect(n.loads).toEqual([]);   // FAILS if the set loads while a replay runs
      n.replaying = false; n.update();
      expect(n.loads).toEqual([p]);
    }
  });

  it('never loads in any phase off the allow-list, however the frames cycle', () => {
    const n = night(NOT_QUIET[0]); n.finishAttempt();
    for (let f = 0; f < 200; f++) { n.phase = NOT_QUIET[f % NOT_QUIET.length]; n.update(); }
    expect(n.loads).toEqual([]);
  });

  it('each quiet phase starts a queued set, once', () => {
    for (const p of QUIET_DUNK_PHASES) {
      const n = night('resolve'); n.finishAttempt(); n.phase = p; n.update(); n.update(); n.finishAttempt();
      expect(n.loads).toEqual([p]);
    }
  });

  it('reset() drops a queued set (a new mount is a new night)', () => {
    const g = createContestDefer(); g.ask(false); expect(g.queued).toBe(true); g.reset(); expect(g.tick(true)).toBe(false);
  });

  it('whenQuietBeat holds the props, voice banks and walk-out through approach, judging and the run, then lets them go', async () => {
    vi.useFakeTimers();
    try {
      let phase = 'resolve'; let done = false;
      void whenQuietBeat(() => isQuietDunkPhase(phase), () => false, 100).then(() => { done = true; });
      for (const p of NOT_QUIET) { phase = p; await vi.advanceTimersByTimeAsync(500); expect(done).toBe(false); }
      phase = 'rivalTurn'; await vi.advanceTimersByTimeAsync(100); expect(done).toBe(true);
    } finally { vi.useRealTimers(); }
  });
});

describe('RUNUP-STALL-1 v3: at most one rival body per frame', () => {
  /** A frame clock: nextFrame callbacks run on step(); `log` records which frame each rival's setup ran in. */
  function frames() {
    let frame = 0; let pending: Array<() => void> = [];
    return {
      nextFrame: (cb: () => void) => { pending.push(cb); },
      async step() { frame++; const run = pending; pending = []; for (const cb of run) cb(); await Promise.resolve(); await Promise.resolve(); },
      get frame() { return frame; },
    };
  }
  const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

  it('five rivals set up in five different frames, never two in one', async () => {
    const clock = frames(); const setupFrame: number[] = [];
    const jobs = Array.from({ length: 5 }, () => async () => { setupFrame.push(clock.frame); });
    const done = onePerFrame(jobs, clock.nextFrame);
    for (let f = 0; f < 10; f++) { await flush(); await clock.step(); }
    await done;
    expect(setupFrame).toHaveLength(5);
    const perFrame = new Map<number, number>(); for (const f of setupFrame) perFrame.set(f, (perFrame.get(f) ?? 0) + 1);
    expect(Math.max(...perFrame.values())).toBe(1);   // FAILS if more than one rival is processed in a frame
    expect(new Set(setupFrame).size).toBe(5);
  });

  it('a rival still loading holds the next one back (none start until it lands), and a failure does not stop the queue', async () => {
    const clock = frames(); let land!: () => void; const started: number[] = [];
    const jobs = [
      () => { started.push(0); return new Promise<void>((r) => { land = r; }); },
      () => { started.push(1); return Promise.reject(new Error('404')); },
      () => { started.push(2); return Promise.resolve(); },
    ];
    void onePerFrame(jobs, clock.nextFrame);
    for (let f = 0; f < 5; f++) { await flush(); await clock.step(); }
    expect(started).toEqual([0]);
    land();
    for (let f = 0; f < 5; f++) { await flush(); await clock.step(); }
    expect(started).toEqual([0, 1, 2]);
  });

  it('stop() ends the queue (a disposed crowd asks for nothing more)', async () => {
    const clock = frames(); let stopped = false; const started: number[] = [];
    void onePerFrame([0, 1, 2].map((i) => async () => { started.push(i); stopped = true; }), clock.nextFrame, () => stopped);
    for (let f = 0; f < 5; f++) { await flush(); await clock.step(); }
    expect(started).toEqual([0]);
  });

  it("the dunk's deferred onlooker rail opts in, and Onlookers runs its spawns through onePerFrame on the scene's frames", () => {
    const walk = read('../nexus/veniceBoardwalk.ts'), look = read('../visual/Onlookers.ts');
    expect(walk).toContain("new Vector3(0, 0, SCAN_MID), dressing ? { oneBodyPerFrame: true } : {});");
    expect(look).toContain('if (opts.oneBodyPerFrame) void onePerFrame(chosen.map((p, i) => () => spawnOne(p, i)), (cb) => { scene.onBeforeRenderObservable.addOnce(cb); }, () => this.disposed);');
    expect(look).toContain('else chosen.forEach((p, i) => { void spawnOne(p, i); });');   // every other crowd: unchanged
  });
});

describe('RUNUP-STALL-1: DunkMode is wired to the allow-list', () => {
  const set = between(dunk, 'function startContestSet(ctx: ModeContext)', '\n  /** His body,');
  it('quiet means an allow-listed phase AND no replay running', () => {
    expect(dunk).toContain('const dunkQuiet = (): boolean => isQuietDunkPhase(phase) && !replaying;');
  });
  it('startContestSet defers off a quiet beat (unless his turn is up) before anything loads', () => {
    const defer = set.indexOf('if (!contestHisTurn && !contestDefer.ask(dunkQuiet()))');
    expect(defer).toBeGreaterThan(-1);
    for (const load of ["performance.mark('fel:dunk1-in')", 'soundtrackFirstDunkIn();', 'rivalArrival = bringRival(ctx);', 'mountDressing();', 'parkCornerProps(ctx);', 'mic?.loadAudio();', 'startWalkOut();'])
      expect(set.indexOf(load)).toBeGreaterThan(defer);
  });
  it('the props, voice banks and walk-out after his body wait for a quiet beat too', () => {
    expect(set).toContain('rivalArrival.finally(() => whenQuietBeat(dunkQuiet, () => ctx.scene.isDisposed)).then(');
    expect(set.indexOf('whenQuietBeat(')).toBeLessThan(set.indexOf('mountDressing();'));
  });
  it('update() starts a queued set on a quiet beat, and a new mount clears it', () => {
    expect(dunk).toMatch(/update\(ctx: ModeContext, dt: number\) \{\n\s+if \(contestDefer\.tick\(dunkQuiet\(\)\)\) startContestSet\(ctx\);/);
    expect(dunk).toMatch(/contestSetStarted = false; rivalArrival = null; awaitingRival = false;\n\s+contestDefer\.reset\(\);/);
  });
  it('his turn (rivalRound, still in judging) cannot deadlock: it waits out a replay, then starts the set itself', () => {
    const round = between(dunk, 'async function rivalRound(ctx: ModeContext)', 'player.root.position.set(-3.2');
    expect(round).toContain('await whenQuietBeat(() => !replaying, () => ctx.scene.isDisposed);');
    expect(round).toContain('contestHisTurn = true; try { startContestSet(ctx); } finally { contestHisTurn = false; }');
    expect(round.indexOf('contestHisTurn = true')).toBeLessThan(round.indexOf('await rivalArrival;'));
    expect(round).not.toContain("await whenQuietBeat(dunkQuiet");   // judging is off the list: waiting on it here would never end
    expect(dunk.indexOf('await rivalRound(ctx);')).toBeLessThan(dunk.indexOf("setPhase('rivalTurn');"));   // rivalTurn comes after the wait
  });
  it('the his-turn bypass is set only inside rivalRound', () => {
    expect(dunk.match(/contestHisTurn = true/g)).toHaveLength(1);
  });
});
