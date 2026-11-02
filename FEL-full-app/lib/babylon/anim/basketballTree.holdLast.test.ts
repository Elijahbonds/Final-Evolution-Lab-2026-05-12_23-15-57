// AF-11 (ANIM-FEEL-SPEC 2026-10-28): with the anim.holdLast knob ON the shot plays once and holds its last frame for as long as
// the state lasts (no wrap); it still leaves on the frame the state changes, and a priority state still cuts in. With the knob OFF
// (the default) the tree plays exactly what it played before.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ANIM_HOLD_LAST_ON, BasketballAnimTree, HOLD_LAST_STATES, basketballClipTable, holdLastOn, type AnimTreeInput,
} from './basketballTree';
import { FEEL_STORAGE_KEY, resetFeelForTests, setFeelSession, setFeelUser } from '../../feel-panel/feel';
import { feelSessionBlock } from '../../feel-panel/sessionGate';

const idle: AnimTreeInput = {
  speed01: 0, crossover: false, hasBall: true, shooting: false, dunking: false,
  driving: false, defending: false, bracing: false, staggered: false, nearestDefender: 9,
};
const shoot: AnimTreeInput = { ...idle, shooting: true };

interface PlayCall { clip: string; loop?: boolean; fadeSec?: number; onEnd?: () => void }
/** A tree on a fake animator that records every play and freeze (and keeps each play's onEnd so a test can end the clip). */
function rig() {
  const plays: PlayCall[] = [];
  const freezes: string[] = [];
  const tree = new BasketballAnimTree({
    play: (clip: string, opts: { loop?: boolean; fadeSec?: number; onEnd?: () => void } = {}) => { plays.push({ clip, ...opts }); return null; },
    setPlaybackScale: () => {},
    freezeAtEnd: (clip: string) => { freezes.push(clip); },
  } as never);
  return { tree, plays, freezes };
}
const frames = (tree: BasketballAnimTree, input: AnimTreeInput, n: number) => { for (let i = 0; i < n; i++) tree.update({ ...input, dtSec: 1 / 60 }); };
/** The call log, minus the callbacks (functions don't compare). */
const log = (r: ReturnType<typeof rig>) => ({ plays: r.plays.map(({ onEnd, ...p }) => ({ ...p, onEnd: !!onEnd })), freezes: [...r.freezes] });

class FakeStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}
const g = globalThis as { window?: unknown };
let ls: FakeStorage;
beforeEach(() => { resetFeelForTests(); ls = new FakeStorage(); g.window = { localStorage: ls }; });
afterEach(() => { resetFeelForTests(); delete g.window; });
const knobOn = () => {
  ls.m.set(FEEL_STORAGE_KEY, JSON.stringify({ 'anim.holdLast': 1 }));
  setFeelUser(true); setFeelSession(feelSessionBlock('/play/threevthree', '?playtest=1'));
};

describe('AF-11, knob OFF (the default): the tree plays exactly what it played before', () => {
  it('AF11-OFF-1: the knob defaults off and the clip table is unchanged (both rows still loops)', () => {
    expect(ANIM_HOLD_LAST_ON).toBe(0);
    expect(holdLastOn()).toBe(false);
    const t = basketballClipTable();
    expect(t.shot_release).toEqual({ clip: 'bball_shoot_jumper', loop: true, fadeSec: 0.06 });
    expect(t.gather).toEqual({ clip: 'dunk_charge_gather', loop: true, fadeSec: 0.08 });
    expect([...HOLD_LAST_STATES]).toEqual(['shot_release']);   // gather deferred to AF-11b (the tree never chooses it)
    expect(HOLD_LAST_STATES.has('gather')).toBe(false);
  });
  it('AF11-OFF-2: a 3 s shot plays its clip once as a loop — no freeze, no end callback', () => {
    const r = rig();
    frames(r.tree, idle, 5); frames(r.tree, shoot, 180);
    const shots = r.plays.filter((p) => p.clip === 'bball_shoot_jumper');
    expect(shots).toHaveLength(1);
    expect(shots[0].loop).toBe(true); expect(shots[0].fadeSec).toBe(0.06); expect(shots[0].onEnd).toBeUndefined();
    expect(r.freezes).toEqual([]);
    expect(r.tree.state).toBe('shot_release');
  });
  it('AF11-OFF-3: idle → shot → idle logs the same calls as a tree with the knob explicitly at its default', () => {
    const script = (r: ReturnType<typeof rig>) => { frames(r.tree, idle, 5); frames(r.tree, shoot, 180); frames(r.tree, idle, 30); };
    const a = rig(); script(a);
    ls.m.set(FEEL_STORAGE_KEY, JSON.stringify({ 'anim.holdLast': 0 }));
    setFeelUser(true); setFeelSession(feelSessionBlock('/play/threevthree', '?playtest=1'));
    expect(holdLastOn()).toBe(false);
    const b = rig(); script(b);
    expect(log(b)).toEqual(log(a));
    expect(a.plays.map((p) => p.clip)).toEqual(['bball_dribble_idle', 'bball_shoot_jumper', 'bball_dribble_idle']);
    expect(a.plays.every((p) => p.loop === true)).toBe(true);
  });
});

describe('AF-11, knob ON: the shot holds its last frame', () => {
  it('AF11-ON-1: the shot plays ONCE (not a loop), freezes at its end, and nothing plays again while the state lasts', () => {
    knobOn(); expect(holdLastOn()).toBe(true);
    const r = rig();
    frames(r.tree, idle, 5); frames(r.tree, shoot, 54);   // 0.90 s: the jumpshot's length
    const shot = r.plays[r.plays.length - 1];
    expect(shot.clip).toBe('bball_shoot_jumper'); expect(shot.loop).toBe(false); expect(shot.fadeSec).toBe(0.06);
    const before = r.plays.length;
    shot.onEnd!();                                        // the clip runs out
    expect(r.freezes).toEqual(['bball_shoot_jumper']);
    frames(r.tree, shoot, 126);                           // the rest of 3 s
    expect(r.plays).toHaveLength(before);                 // no second play, no settle play
    expect(r.tree.state).toBe('shot_release');
    expect(r.tree.busy).toBe(false);
  });
  it('AF11-ON-2: after the hold, the next state plays its clip once with its own fade', () => {
    knobOn();
    const r = rig();
    frames(r.tree, idle, 5); frames(r.tree, shoot, 54);
    r.plays[r.plays.length - 1].onEnd!();
    frames(r.tree, shoot, 30);
    const before = r.plays.length;
    frames(r.tree, idle, 30);
    expect(r.plays.slice(before).map((p) => [p.clip, p.fadeSec])).toEqual([['bball_dribble_idle', basketballClipTable().idle_dribble.fadeSec]]);
    expect(r.tree.state).toBe('idle_dribble');
  });
  it('AF11-ON-3 (the exit exception): the shot leaves on the frame the state changes, mid-clip; its late end does nothing', () => {
    knobOn();
    const r = rig();
    frames(r.tree, idle, 5); frames(r.tree, shoot, 20);   // 0.33 s into a 0.90 s clip
    const shot = r.plays[r.plays.length - 1];
    expect(shot.clip).toBe('bball_shoot_jumper');
    const before = r.plays.length;
    frames(r.tree, idle, 1);
    expect(r.plays.slice(before).map((p) => p.clip)).toEqual(['bball_dribble_idle']);   // on that same update
    shot.onEnd!();                                                                      // Babylon raises the cut clip's end
    frames(r.tree, idle, 30);
    expect(r.freezes).toEqual([]);
    expect(r.plays.slice(before)).toHaveLength(1);
    expect(r.tree.state).toBe('idle_dribble');
  });
  it('AF11-ON-4: a priority state (contact stagger) still cuts in mid-shot on that update', () => {
    knobOn();
    const r = rig();
    frames(r.tree, idle, 5); frames(r.tree, shoot, 20);
    const before = r.plays.length;
    frames(r.tree, { ...shoot, staggered: true }, 1);
    expect(r.plays.slice(before).map((p) => p.clip)).toEqual([basketballClipTable().contact_stagger.clip]);
    expect(r.tree.state).toBe('contact_stagger');
  });
  it('AF11-ON-5: a mode beat with holdEnd and a mode hold() behave exactly as before', () => {
    knobOn();
    const a = rig();
    frames(a.tree, idle, 5);
    a.tree.beat('dunk_charge_gather', { fadeSec: 0.12, holdEnd: true });
    const beat = a.plays[a.plays.length - 1];
    frames(a.tree, shoot, 10);                            // a non-priority state change: a beat does not yield
    expect(a.plays[a.plays.length - 1]).toBe(beat);
    beat.onEnd!();
    expect(a.freezes).toEqual(['dunk_charge_gather']);
    frames(a.tree, idle, 10);
    expect(a.tree.busy).toBe(true); expect(a.tree.held).toBe('dunk_charge_gather');   // the override stands until release()
    const b = rig();
    frames(b.tree, idle, 5);
    b.tree.hold('bball_hand_up', { fadeSec: 0.14 });
    const n = b.plays.length;
    frames(b.tree, shoot, 10); frames(b.tree, { ...idle, staggered: true }, 5);   // never interrupted
    expect(b.plays).toHaveLength(n); expect(b.tree.held).toBe('bball_hand_up');
  });
});
