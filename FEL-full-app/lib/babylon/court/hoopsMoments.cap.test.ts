// hoops-p06 (1v1/3v3 phase 6 "flow and pace": "big plays add ≤ 2.5 s for the replay cut"): the replay holds the game at most
// `hoops.replayCapSec` on screen — the window around the moment; 0 is the plan's own length exactly.
import { describe, expect, it } from 'vitest';
import { REPLAY_SPEED } from '../scene/ReplayDirector';
import { capReplay, HoopsReplayPlanner, REPLAY_CAP_SEC, REPLAY_CAP_LEAD_K, REPLAY_PLAYBACK_SPEED, REPLAY_MIN_S, replayLength } from './hoopsMoments';
import { FEEL_KNOB_BY_ID } from '../../feel-panel/knobs';

describe('the big-play replay cap', () => {
  it('ships at 2.5 s on screen; the playback speed it assumes is the director\'s', () => {
    expect(REPLAY_CAP_SEC).toBe(2.5);
    expect(FEEL_KNOB_BY_ID.get('hoops.replayCapSec')?.def).toBe(REPLAY_CAP_SEC);
    expect(REPLAY_PLAYBACK_SPEED).toBe(REPLAY_SPEED);
  });
  it('the plan alone holds the game 4.8–10 s (the gap it closes)', () => {
    expect(REPLAY_MIN_S / REPLAY_SPEED).toBeGreaterThan(REPLAY_CAP_SEC);
  });
  it('a capped plan is at most the cap on screen, around the moment, never past now', () => {
    const plan = { kind: 'dunk' as const, lastSeconds: replayLength(10, 12.5), endAt: 12.5 };
    const c = capReplay(plan, 10, REPLAY_CAP_SEC);
    expect(c.lastSeconds / REPLAY_SPEED).toBeCloseTo(REPLAY_CAP_SEC, 9);
    expect(c.endAt).toBeCloseTo(10 + c.lastSeconds * (1 - REPLAY_CAP_LEAD_K), 9);
    expect(c.endAt - c.lastSeconds).toBeLessThan(10);   // the moment is inside the window
    const late = capReplay({ kind: 'block', lastSeconds: REPLAY_MIN_S, endAt: 10.2 }, 10, REPLAY_CAP_SEC);
    expect(late.endAt).toBeLessThanOrEqual(10.2);
  });
  it('0 (or no moment) gives the plan back unchanged', () => {
    const plan = { kind: 'poster' as const, lastSeconds: 3.4, endAt: 20 };
    expect(capReplay(plan, 18, 0)).toBe(plan);
    expect(capReplay(plan, null, REPLAY_CAP_SEC)).toBe(plan);
  });
  it('the planner names the moment it planned', () => {
    const p = new HoopsReplayPlanner();
    p.log.note('ankles', 10);
    const r = p.atDeadBall(12);
    expect(r).not.toBeNull();
    expect(p.lastAt).toBe(10);
    p.reset(); expect(p.lastAt).toBeNull();
  });
});
