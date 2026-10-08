// IMPROVE (2026-10-06, skate item 17) — one banner, by priority, on the mode's own clock.
import { describe, expect, it } from 'vitest';
import { BannerQueue, BANNER_PRIO, BANNER_MAX_WAIT_MS } from './BannerQueue';

const { chatter, beat, news } = BANNER_PRIO;

describe('BannerQueue', () => {
  it('shows a banner for its life and then clears it', () => {
    const q = new BannerQueue();
    expect(q.show('KICKFLIP', 500, beat)).toBe(true);
    expect(q.text).toBe('KICKFLIP');
    expect(q.tick(499)).toBe(false);
    expect(q.text).toBe('KICKFLIP');
    expect(q.tick(2)).toBe(true);
    expect(q.text).toBe('');
  });

  it('THE RACE: a trick\'s clear can no longer wipe a GOAL that went up after it', () => {
    // the old code: KICKFLIP up with a 500 ms timer, GOAL up 100 ms later, the KICKFLIP timer clears the GOAL at 500 ms
    const q = new BannerQueue();
    q.show('KICKFLIP', 500, beat);
    q.tick(100);
    q.show('GOAL: BANK 5,000 PTS', 1200, news);
    q.tick(450);   // past the trick's own end
    expect(q.text).toBe('GOAL: BANK 5,000 PTS');
    q.tick(749);
    expect(q.text).toBe('GOAL: BANK 5,000 PTS');
    q.tick(2);
    expect(q.text).toBe('');
  });

  it('a newer beat replaces a beat (the newest trick or bank is what you see)', () => {
    const q = new BannerQueue();
    q.show('KICKFLIP', 500, beat);
    q.show('BANKED +300', 700, beat);
    expect(q.text).toBe('BANKED +300');
    q.tick(700);
    expect(q.text).toBe('');   // the replaced beat does not come back
  });

  it('chatter never covers a beat, and is dropped rather than shown late', () => {
    const q = new BannerQueue();
    q.show('BAILED', 900, beat);
    expect(q.show('SWITCH', 700, chatter)).toBe(false);
    expect(q.text).toBe('BAILED');
    q.tick(900);
    expect(q.text).toBe('');
  });

  it('a beat that arrives under the news waits its turn — but not forever', () => {
    const q = new BannerQueue();
    q.show('GOAL: GRIND THE PATROL RAIL', 1200, news);
    q.show('BANKED +500', 700, beat);
    expect(q.text).toBe('GOAL: GRIND THE PATROL RAIL');
    q.tick(1200);
    expect(q.text).toBe('BANKED +500');
    // and one that waited past BANNER_MAX_WAIT_MS is stale: dropped
    const r = new BannerQueue();
    r.show('GOAL: A', BANNER_MAX_WAIT_MS + 500, news);
    r.show('BANKED +1', 700, beat);
    r.tick(BANNER_MAX_WAIT_MS + 500);
    expect(r.text).toBe('');
  });

  it('the news replaces a beat outright — the beat is not shown again late', () => {
    const q = new BannerQueue();
    q.show('KICKFLIP', 500, beat);
    q.tick(200);
    q.show('GOAL: LAND A 800+ COMBO', 1200, news);
    q.tick(1200);
    expect(q.text).toBe('');
  });

  it('runs on the clock it is given and nothing else — clear() leaves nothing behind', () => {
    const q = new BannerQueue();
    q.show('GOAL: X', 1200, news);
    q.show('BANKED', 700, beat);
    q.clear();
    expect(q.text).toBe('');
    expect(q.tick(5000)).toBe(false);
    expect(q.show('', 500)).toBe(false);
    expect(q.show('X', 0)).toBe(false);
  });
});
