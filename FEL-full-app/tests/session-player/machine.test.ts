// PLAT-P01 (2026-10-27): every transition of the session player's step machine (lib/session-player/machine.ts).
import { describe, expect, it } from 'vitest';
import { CHANGE_SECONDS, READY_SECONDS, back, pause, primary, resume, setDone, skipRest, startState, tick, type Effect, type PlayerState } from '@/lib/session-player/machine';
import type { Session, Step } from '@/lib/session-player/model';

const step = (o: Partial<Step> & { exId: string }): Step => ({ name: o.exId, sets: 2, reps: '8', workSeconds: null, restSeconds: 30, setup: 'Stand tall.', cue: 'Push the floor away.', clip: 'ex_squat', ...o });
const S: Session = {
  id: 'w1:A', title: 'Test',
  steps: [
    step({ exId: 'squat' }),                                                      // 2 × 8, rest 30
    step({ exId: 'plank', sets: 2, reps: '20 s', workSeconds: 20, restSeconds: 0 }), // timed, no rest
    step({ exId: 'breath', sets: 1, reps: '60 s', workSeconds: 60, restSeconds: 0, clip: null }),
  ],
};
const enters = (fx: Effect[]) => fx.filter((e) => e.kind === 'enter').map((e) => (e.kind === 'enter' ? `${e.phase}:${e.step}.${e.set}${e.fresh ? '*' : ''}` : ''));
const ticks = (fx: Effect[]) => fx.filter((e) => e.kind === 'tick').map((e) => (e.kind === 'tick' ? e.left : 0));
const run = (s: PlayerState, ms: number, by = 250) => { let st = s; const fx: Effect[] = []; for (let t = 0; t < ms; t += by) { const o = tick(S, st, by); st = o.state; fx.push(...o.effects); } return { state: st, effects: fx }; };

describe('the session player machine', () => {
  it('opens on the ready count over the first exercise, and says so', () => {
    const o = startState(S);
    expect(o.state).toMatchObject({ phase: 'ready', step: 0, set: 1, leftMs: READY_SECONDS * 1000, paused: false, setsDone: 0 });
    expect(enters(o.effects)).toEqual(['ready:0.1*']);
  });

  it('opens on a longer count when the first exercise\'s set-up is shown', () => {
    expect(startState(S, 12).state).toMatchObject({ phase: 'ready', leftMs: 12_000, fullMs: 12_000 });
  });

  it('an empty session goes straight to the finish', () => {
    expect(startState({ id: 'x', title: 'x', steps: [] }).state.phase).toBe('finish');
  });

  it('ready counts itself down into the first set: no tap', () => {
    const o = run(startState(S).state, READY_SECONDS * 1000);
    expect(o.state).toMatchObject({ phase: 'work', step: 0, set: 1, leftMs: null });
    expect(enters(o.effects)).toEqual(['work:0.1']);
  });

  it('Start now skips the ready count', () => {
    expect(primary(S, startState(S).state).state).toMatchObject({ phase: 'work', step: 0, set: 1 });
    expect(skipRest(S, startState(S).state).state.phase).toBe('work');
  });

  it('a counted set waits for Set done; Set done starts the rest, which counts itself down into the next set', () => {
    const w = primary(S, startState(S).state).state;
    expect(run(w, 60_000).state).toMatchObject({ phase: 'work', step: 0, set: 1 });   // it waits
    const r = setDone(S, w);
    expect(r.state).toMatchObject({ phase: 'rest', step: 0, set: 2, leftMs: 30_000, setsDone: 1 });
    expect(enters(r.effects)).toEqual(['rest:0.2']);
    const back2 = run(r.state, 30_000);
    expect(back2.state).toMatchObject({ phase: 'work', step: 0, set: 2 });
    expect(ticks(back2.effects)).toEqual([3, 2, 1]);   // the last 3 s tick
  });

  it('the last set of an exercise rests (at least the change time) into the next exercise, fresh', () => {
    let st = primary(S, startState(S).state).state;
    st = setDone(S, st).state; st = skipRest(S, st).state;
    const r = setDone(S, st);
    expect(r.state).toMatchObject({ phase: 'rest', step: 1, set: 1, leftMs: 30_000, setsDone: 2 });
    expect(enters(r.effects)).toEqual(['rest:1.1*']);
  });

  it('a timed set starts and stops by itself; with no rest the next set starts at once', () => {
    let st = primary(S, startState(S).state).state;
    st = setDone(S, st).state; st = skipRest(S, st).state; st = setDone(S, st).state; st = skipRest(S, st).state;
    expect(st).toMatchObject({ phase: 'work', step: 1, set: 1, leftMs: 20_000 });
    const o = run(st, 20_000);
    expect(o.state).toMatchObject({ phase: 'work', step: 1, set: 2, leftMs: 20_000, setsDone: 3 });
    expect(ticks(o.effects)).toEqual([]);   // ticks are the rest's
  });

  it('a change of exercise with no rest still gets the change time', () => {
    let st = primary(S, startState(S).state).state;
    for (let i = 0; i < 3; i++) { st = setDone(S, st).state; if (st.phase === 'rest') st = skipRest(S, st).state; }
    expect(st).toMatchObject({ phase: 'work', step: 1, set: 2 });
    const r = run(st, 20_000).state;
    expect(r).toMatchObject({ phase: 'rest', step: 2, set: 1, leftMs: CHANGE_SECONDS * 1000 });
  });

  it('the last set ends the session: the finish, with every set counted and the time played', () => {
    let st = primary(S, startState(S).state).state;
    let guard = 0;
    while (st.phase !== 'finish' && guard++ < 1000) st = st.phase === 'work' && st.leftMs === null ? setDone(S, st).state : run(st, 1000).state;
    expect(st).toMatchObject({ phase: 'finish', setsDone: 5, leftMs: null });
    expect(st.elapsedMs).toBeGreaterThan(0);
    expect(primary(S, st).state).toBe(st);   // nothing moves after the finish
  });

  it('a whole session of two counted exercises takes exactly one tap per counted set (and none for timed sets)', () => {
    let st = startState(S).state; let taps = 0; let guard = 0;
    while (st.phase !== 'finish' && guard++ < 1000) {
      if (st.phase === 'work' && st.leftMs === null) { st = setDone(S, st).state; taps++; } else st = tick(S, st, 250).state;
    }
    expect(taps).toBe(2);   // squat × 2; the plank and the breathing time themselves; ready and rests count down
  });

  it('pause holds every countdown (ready, rest, a timed set) and the time played; resume carries on', () => {
    const r0 = startState(S).state;
    const p = pause(r0);
    expect(run(p, 10_000).state).toMatchObject({ phase: 'ready', leftMs: r0.leftMs, elapsedMs: 0 });
    expect(run(resume(p), READY_SECONDS * 1000).state.phase).toBe('work');
    const rest = setDone(S, primary(S, r0).state).state;
    expect(run(pause(rest), 60_000).state).toMatchObject({ phase: 'rest', leftMs: 30_000 });
    expect(pause({ ...rest, phase: 'finish' }).paused).toBe(false);
  });

  it('a button tap unpauses', () => {
    const w = pause(primary(S, startState(S).state).state);
    expect(primary(S, w).state.paused).toBe(false);
  });

  it('Back from a rest runs the set just done again, and takes its Set done back', () => {
    const rest = setDone(S, primary(S, startState(S).state).state).state;
    const b = back(S, rest);
    expect(b.state).toMatchObject({ phase: 'work', step: 0, set: 1, setsDone: 0 });
  });

  it('Back in a set goes to the set before it (across exercises); at the very first set it starts the set over', () => {
    let st = primary(S, startState(S).state).state;
    st = setDone(S, st).state; st = skipRest(S, st).state;          // squat set 2
    expect(back(S, st).state).toMatchObject({ phase: 'work', step: 0, set: 1, setsDone: 0 });
    st = setDone(S, st).state; st = skipRest(S, st).state;          // plank set 1
    const b = back(S, st);
    expect(b.state).toMatchObject({ phase: 'work', step: 0, set: 2, setsDone: 1 });
    expect(enters(b.effects)).toEqual(['work:0.2*']);
    const first = primary(S, startState(S).state).state;
    expect(back(S, first).state).toMatchObject({ phase: 'work', step: 0, set: 1, setsDone: 0 });
  });

  it('Back does nothing in the ready count or the finish', () => {
    const r = startState(S).state;
    expect(back(S, r).state).toBe(r);
    const f = { ...r, phase: 'finish' as const };
    expect(back(S, f).state).toBe(f);
  });

  it('Set done outside a set and Skip rest outside a rest do nothing', () => {
    const r = startState(S).state;
    expect(setDone(S, r).state).toBe(r);
    const w = primary(S, r).state;
    expect(skipRest(S, w).state).toBe(w);
  });

  it('time that does not pass moves nothing', () => {
    const r = startState(S).state;
    expect(tick(S, r, 0).state).toBe(r);
    expect(tick(S, r, -5).state).toBe(r);
  });
});
