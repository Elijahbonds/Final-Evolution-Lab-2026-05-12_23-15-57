// hoops-p04 (1v1/3v3 phase 4 "feet and transitions"): ONE blend + minimum-hold rule over every hoops clip pair — the table, and the tree
// that plays through it (every play the tree makes is floored, every sibling loop held, a priority cut and a press never held).
import { describe, expect, it, vi } from 'vitest';
import {
  transitionFor, GAIT_STATES, DEFENSE_STATES, PRIORITY_STATES, GAIT_FADE_SEC, DEFENSE_FADE_SEC, CROSS_FADE_SEC, BEAT_FADE_FLOOR_SEC,
  PRIORITY_FADE_SEC, MIN_HOLD_SEC, TRANSITION_RULE_ON,
} from './hoopsTransitions';
import { BasketballAnimTree, basketballClipTable, type AnimTreeInput } from './basketballTree';

const TABLE = basketballClipTable();
const STATES = Object.keys(TABLE) as (keyof typeof TABLE)[];

describe('anim/hoopsTransitions — the rule, over every hoops clip pair', () => {
  it('ships on', () => { expect(TRANSITION_RULE_ON).toBe(true); });
  it('every pair has a fade at or above its floor; only sibling loops are held, and by one number', () => {
    let pairs = 0;
    for (const from of [null, ...STATES]) for (const to of STATES) {
      const t = TABLE[to]; const tr = transitionFor(from, to, t.loop, t.fadeSec); pairs++;
      expect(tr.fadeSec, `${from}→${to}`).toBeGreaterThanOrEqual(t.fadeSec);
      const floor = tr.kind === 'gait' ? GAIT_FADE_SEC : tr.kind === 'defense' ? DEFENSE_FADE_SEC : tr.kind === 'priority' ? PRIORITY_FADE_SEC : tr.kind === 'beat' ? BEAT_FADE_FLOOR_SEC : CROSS_FADE_SEC;
      expect(tr.fadeSec, `${from}→${to} (${tr.kind})`).toBeGreaterThanOrEqual(floor);
      const siblings = !!from && from !== to && t.loop && !PRIORITY_STATES.has(to) && ((GAIT_STATES.has(from) && GAIT_STATES.has(to)) || (DEFENSE_STATES.has(from) && DEFENSE_STATES.has(to)));
      expect(tr.holdSec, `${from}→${to}`).toBe(siblings ? MIN_HOLD_SEC : 0);
    }
    expect(pairs).toBe((STATES.length + 1) * STATES.length);
  });
  it('a mode beat (a press) is floored, never held', () => {
    for (const from of [null, ...STATES]) { const tr = transitionFor(from, null, false, 0.05); expect(tr.holdSec).toBe(0); expect(tr.fadeSec).toBe(BEAT_FADE_FLOOR_SEC); }
    expect(transitionFor('idle_dribble', null, false, 0.3).fadeSec).toBe(0.3);   // a longer ask is kept
  });
  it('a priority cut is never held and fades no slower than asked', () => {
    for (const to of PRIORITY_STATES) for (const from of STATES) { const tr = transitionFor(from, to, TABLE[to as keyof typeof TABLE].loop, 0.06); expect(tr.holdSec).toBe(0); expect(tr.fadeSec).toBe(PRIORITY_FADE_SEC); }
  });
});

describe('anim/hoopsTransitions — the tree plays through the rule', () => {
  type Play = { clip: string; loop: boolean; fadeSec: number };
  const BASE: AnimTreeInput = { speed01: 0, crossover: false, nearestDefender: 5, hasBall: true, shooting: false, dunking: false, driving: false, defending: false, bracing: false, staggered: false };
  it('a speed that flickers across the gait thresholds never changes the loop faster than the hold, and every change fades long', () => {
    const plays: Play[] = [];
    const tree = new BasketballAnimTree({ play: (clip: string, o: { loop?: boolean; fadeSec?: number }) => { plays.push({ clip, loop: !!o.loop, fadeSec: o.fadeSec ?? 0 }); return null; }, setPlaybackScale: () => {} } as never);
    let now = 0; const spy = vi.spyOn(performance, 'now').mockImplementation(() => now);
    try {
      const at: number[] = [];
      for (let f = 0; f < 120; f++) {   // 2 s, the speed hopping walk ↔ jog ↔ sprint every few frames
        now = f * (1000 / 60);
        const speed01 = [0.3, 0.5, 0.8, 0.45, 0.3, 0.9][Math.floor(f / 4) % 6];
        const n = plays.length;
        tree.update({ ...BASE, speed01, speedMps: speed01 * 6.4 });
        if (plays.length > n) at.push(now / 1000);
      }
      for (let i = 1; i < at.length; i++) expect(at[i] - at[i - 1]).toBeGreaterThanOrEqual(MIN_HOLD_SEC - 1e-6);
      for (const p of plays.slice(1)) expect(p.fadeSec).toBeGreaterThanOrEqual(GAIT_FADE_SEC);
    } finally { spy.mockRestore(); }
  });
  it('a mode beat starts on the frame it is asked for (a press is not delayed), with the floor\'s fade', () => {
    const plays: Play[] = [];
    const tree = new BasketballAnimTree({ play: (clip: string, o: { loop?: boolean; fadeSec?: number }) => { plays.push({ clip, loop: !!o.loop, fadeSec: o.fadeSec ?? 0 }); return null; }, setPlaybackScale: () => {} } as never);
    tree.update({ ...BASE, speed01: 0.5, speedMps: 3 });
    const n = plays.length;
    tree.beat('bball_steal_reach', { fadeSec: 0.05 });
    expect(plays.length).toBe(n + 1);
    expect(plays[n].clip).toBe('bball_steal_reach');
    expect(plays[n].fadeSec).toBe(BEAT_FADE_FLOOR_SEC);
  });
});
