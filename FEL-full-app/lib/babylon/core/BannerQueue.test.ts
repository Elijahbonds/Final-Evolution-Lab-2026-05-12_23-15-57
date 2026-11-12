// IMPROVE (2026-10-06, skate item 17) — one banner, by priority, on the mode's own clock.
import { describe, expect, it } from 'vitest';
import { BannerQueue, BANNER_PRIO, BANNER_MAX_WAIT_MS } from './BannerQueue';

const { chatter, beat, news } = BANNER_PRIO;

describe('BannerQueue', () => {
  // READABLE (2026-11-02): a banner is up for max(its life, its read time — words × 0.3 s + 1 s). The lives below were
  // 500–1200 ms; each test now waits out the read time instead (KICKFLIP 500 → 1300 ms, a 4-word GOAL 1200 → 2200 ms).
  it('shows a banner for its life — at least its read time — and then clears it', () => {
    const q = new BannerQueue();
    expect(q.show('KICKFLIP', 500, beat)).toBe(true);
    expect(q.text).toBe('KICKFLIP');
    expect(q.tick(1299)).toBe(false);
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
    q.tick(1749);  // the GOAL's read time: 4 words → 2200 ms (its life was 1200)
    expect(q.text).toBe('GOAL: BANK 5,000 PTS');
    q.tick(2);
    expect(q.text).toBe('');
  });

  it('a newer beat replaces a beat (the newest trick or bank is what you see)', () => {
    const q = new BannerQueue();
    q.show('KICKFLIP', 500, beat);
    q.show('BANKED +300', 700, beat);
    expect(q.text).toBe('BANKED +300');
    q.tick(1600);  // 2 words → 1600 ms (its life was 700)
    expect(q.text).toBe('');   // the replaced beat does not come back
  });

  it('chatter never covers a beat, and is dropped rather than shown late', () => {
    const q = new BannerQueue();
    q.show('BAILED', 900, beat);
    expect(q.show('SWITCH', 700, chatter)).toBe(false);
    expect(q.text).toBe('BAILED');
    q.tick(1300);  // 1 word → 1300 ms (its life was 900)
    expect(q.text).toBe('');
  });

  it('a beat that arrives under the news waits its turn — the news leaves once it has been read', () => {
    const q = new BannerQueue();
    q.show('GOAL: GRIND THE PATROL RAIL', 1200, news);
    q.show('BANKED +500', 700, beat);
    expect(q.text).toBe('GOAL: GRIND THE PATROL RAIL');
    q.tick(2499);  // 5 words → 2500 ms (its life was 1200): the news is read first
    expect(q.text).toBe('GOAL: GRIND THE PATROL RAIL');
    q.tick(1);
    expect(q.text).toBe('BANKED +500');
    // READABLE: a long-lived news banner no longer makes the beat behind it go stale. With something waiting it leaves at
    // its read time (2 words → 1600 ms, though its life was 2000), so the beat is SHOWN SOONER rather than dropped (it
    // was dropped here before, having waited past BANNER_MAX_WAIT_MS)
    const r = new BannerQueue();
    r.show('GOAL: A', BANNER_MAX_WAIT_MS + 500, news);
    r.show('BANKED +1', 700, beat);
    r.tick(1600);
    expect(r.text).toBe('BANKED +1');
    // a pile-up still clears: what waited BANNER_MAX_WAIT_MS past the read time of the one in front is dropped
    const z = new BannerQueue();
    z.show('GOAL: A', 5000, news);
    z.show('BANKED +1', 700, beat);
    z.show('BANKED +2', 700, beat);
    z.tick(1600);                       // GOAL read: the first waiting beat goes up
    expect(z.text).toBe('BANKED +1');
    z.tick(BANNER_MAX_WAIT_MS);         // +2 has now waited 3100 ms, past 1500 + BANKED +1's 1600 read time: stale
    z.tick(1600);
    expect(z.text).toBe('');
  });

  it('the news replaces a beat outright — the beat is not shown again late', () => {
    const q = new BannerQueue();
    q.show('KICKFLIP', 500, beat);
    q.tick(200);
    q.show('GOAL: LAND A 800+ COMBO', 1200, news);
    q.tick(2500);  // 5 words → 2500 ms (its life was 1200)
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
