import { describe, it, expect } from 'vitest';
import {
  trickFromFlick, trickWindow, judgeFlick, trickPct, STICK_TRICK, FLICK_MIN,
  CLEAN_WINDOW, CONTACT_HALF_WIDTH, type StickTrick,
} from './DunkTrickStick';

describe('trickFromFlick', () => {
  it('a stick at rest asks for nothing — the camera keeps it until you shove it', () => {
    expect(trickFromFlick(0, 0)).toBeNull();
    expect(trickFromFlick(0.4, 0.4)).toBeNull();                  // a brush, not a flick
    expect(trickFromFlick(0, -(FLICK_MIN - 0.01))).toBeNull();
  });

  it('UP is the tomahawk — and up is NEGATIVE y, which is the convention every input source here agrees on', () => {
    expect(trickFromFlick(0, -1)).toBe('tomahawk');
    expect(trickFromFlick(0, 1)).toBe('betweenLegs');             // …and down is the hard one
  });

  it('left and right are the two you swing across the body', () => {
    expect(trickFromFlick(1, 0)).toBe('windmill');
    expect(trickFromFlick(-1, 0)).toBe('cradle');
  });

  it('the dominant axis decides, so a diagonal shove still means something', () => {
    expect(trickFromFlick(0.9, -0.6)).toBe('windmill');           // mostly right
    expect(trickFromFlick(0.6, -0.9)).toBe('tomahawk');           // mostly up
  });
});

describe('trickWindow', () => {
  it('a clean dunk uses the fixed window — after the rise, before the flush', () => {
    expect(trickWindow(null)).toEqual(CLEAN_WINDOW);
    expect(trickWindow(Number.NaN)).toEqual(CLEAN_WINDOW);
  });

  it('a CONTACT dunk centres the window on the bump — the moment to commit is when you feel him', () => {
    const w = trickWindow(0.4);
    expect(w.from).toBeCloseTo(0.4 - CONTACT_HALF_WIDTH, 6);
    expect(w.to).toBeCloseTo(0.4 + CONTACT_HALF_WIDTH, 6);
    expect(judgeFlick(0.4, w)).toBe('green');                     // on the bump
  });

  it('…and it is TIGHTER than the clean one, which is what makes it worth more', () => {
    const contact = trickWindow(0.4);
    expect(contact.to - contact.from).toBeLessThan(CLEAN_WINDOW.to - CLEAN_WINDOW.from);
  });

  it('a bump at either extreme still leaves a reachable window rather than one off the end of the flight', () => {
    expect(trickWindow(0).from).toBeGreaterThanOrEqual(0.12);
    expect(trickWindow(1).to).toBeLessThanOrEqual(0.92);
    for (const b of [0, 0.5, 1]) { const w = trickWindow(b); expect(w.to).toBeGreaterThan(w.from); }
  });
});

describe('judgeFlick', () => {
  it('early, green and late are exactly the three answers', () => {
    const w = CLEAN_WINDOW;
    expect(judgeFlick(0.1, w)).toBe('early');
    expect(judgeFlick(0.4, w)).toBe('green');
    expect(judgeFlick(0.9, w)).toBe('late');
  });

  it('the edges are IN — a flick on the boundary is a flick that made it', () => {
    expect(judgeFlick(CLEAN_WINDOW.from, CLEAN_WINDOW)).toBe('green');
    expect(judgeFlick(CLEAN_WINDOW.to, CLEAN_WINDOW)).toBe('green');
  });
});

describe('trickPct', () => {
  const ALL = Object.keys(STICK_TRICK) as StickTrick[];

  it('a green trick pays and a mistimed one costs', () => {
    for (const t of ALL) {
      expect(trickPct(0.6, t, 'green')).toBeGreaterThan(0.6);
      expect(trickPct(0.6, t, 'early')).toBeLessThan(0.6);
      expect(trickPct(0.6, t, 'late')).toBeLessThan(0.6);
    }
  });

  it('THE PENALTY IS BIGGER THAN THE BONUS on every trick — or mashing the stick every dunk would be correct play', () => {
    for (const t of ALL) {
      expect(STICK_TRICK[t].pctPenalty).toBeGreaterThan(STICK_TRICK[t].pctBonus);
    }
  });

  it('the harder the trick, the more it pays and the more it costs', () => {
    expect(STICK_TRICK.betweenLegs.pctBonus).toBeGreaterThan(STICK_TRICK.tomahawk.pctBonus);
    expect(STICK_TRICK.betweenLegs.pctPenalty).toBeGreaterThan(STICK_TRICK.tomahawk.pctPenalty);
  });

  it('never certain and never hopeless, whatever it is handed', () => {
    for (const t of ALL) {
      expect(trickPct(1, t, 'green')).toBeLessThanOrEqual(0.98);
      expect(trickPct(0, t, 'early')).toBeGreaterThanOrEqual(0.05);
    }
  });

  it('every trick names a clip already on the rig and something to call it', () => {
    for (const t of ALL) {
      expect(STICK_TRICK[t].clip).toMatch(/^dunk_/);
      expect(STICK_TRICK[t].label.length).toBeGreaterThan(0);
    }
  });
});
