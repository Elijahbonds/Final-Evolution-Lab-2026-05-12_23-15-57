import { describe, it, expect } from 'vitest';
import { fieldLeaderDone, stepFinishGrace, FINISH_GRACE_SEC, type Rival, type RaceLine } from './RaceField';

const line = { pts: [], cum: [], lapLength: 500, loop: true } as unknown as RaceLine;
const rival = (name: string, dist: number) => ({ name, dist } as unknown as Rival);

describe('the race ends for everyone — a leader home starts a visible clock to the line', () => {
  it('the leader is the furthest rival past every lap; nobody is done before that', () => {
    expect(fieldLeaderDone([rival('A', 900), rival('B', 990)], line, 2)).toBeNull();
    expect(fieldLeaderDone([rival('A', 1001), rival('B', 1040)], line, 2)?.name).toBe('B');
  });

  it('the clock starts once, counts whole seconds, and runs out exactly once', () => {
    let g = stepFinishGrace(null, 1 / 60, false);
    expect(g.left).toBeNull();
    g = stepFinishGrace(null, 1 / 60, true);
    expect(g).toMatchObject({ left: FINISH_GRACE_SEC, started: true });
    let left = g.left, ticks = 0, expired = 0;
    for (let i = 0; i < 60 * (FINISH_GRACE_SEC + 2); i++) {
      const s = stepFinishGrace(left, 1 / 60, true);
      if (s.tick !== null) ticks++;
      if (s.expired) expired++;
      left = s.left;
      if (s.expired) break;
    }
    expect(expired).toBe(1); expect(left).toBe(0); expect(ticks).toBe(FINISH_GRACE_SEC);
  });
});
