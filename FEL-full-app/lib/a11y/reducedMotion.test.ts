// HOTFIX (2026-09-24): the reduced-motion policy — the device decides by default, the app can override either way, and
// "reduced" only ever changes the picture (no flash, no shake, a blink of hit-stop), never a timeline a mode is timed on.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CALM_HITSTOP_MS, CALM_SLOWMO_MS, HITSTOP_MAX_MS, MOTION_KEY, REDUCE_QUERY, SLOWMO_MAX_MS,
  juicePolicy, motionPolicy, motionUrlOverride, onMotionChange, osPrefersReducedMotion, readMotionPref, reducedMotion,
  resolveReducedMotion, storedMotionPref, writeMotionPref, type MotionPref,
} from './reducedMotion';

/** A browser with just what the policy reads: the OS query, one storage key, the URL. */
function fakeBrowser(o: { osReduce?: boolean; stored?: string | null; search?: string; setThrows?: boolean; mediaThrows?: boolean } = {}) {
  const store = new Map<string, string>();
  if (o.stored != null) store.set(MOTION_KEY, o.stored);
  const changeFns = new Set<() => void>();
  const env = {
    osReduce: o.osReduce === true, store, changeFns,
    flipOs(v: boolean) { env.osReduce = v; for (const fn of [...changeFns]) fn(); },
  };
  const mql = {
    get matches() { return env.osReduce; },
    addEventListener: (_: string, fn: () => void) => { changeFns.add(fn); },
    removeEventListener: (_: string, fn: () => void) => { changeFns.delete(fn); },
  };
  vi.stubGlobal('window', {
    location: { search: o.search ?? '' },
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { if (o.setThrows) throw new Error('QuotaExceededError'); store.set(k, String(v)); },
      removeItem: (k: string) => { store.delete(k); },
    },
    matchMedia: (q: string) => {
      if (o.mediaThrows) throw new Error('blocked');
      if (q !== REDUCE_QUERY) throw new Error(`unexpected query ${q}`);
      return mql;
    },
  });
  return env;
}

afterEach(() => {
  // leave the module as a fresh page would find it: a working store, no session-only choice
  fakeBrowser(); writeMotionPref('system');
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('resolveReducedMotion — the override wins, "system" follows the device', () => {
  const cases: [MotionPref, boolean, boolean][] = [
    ['system', false, false], ['system', true, true],
    ['reduce', false, true], ['reduce', true, true],
    ['full', false, false], ['full', true, false],
  ];
  for (const [pref, os, want] of cases) {
    it(`${pref} with the device ${os ? 'asking for reduce' : 'silent'} → ${want ? 'reduced' : 'full'}`, () => {
      expect(resolveReducedMotion(pref, os)).toBe(want);
    });
  }
});

describe('juicePolicy — what each effect does', () => {
  it('full motion is EXACTLY the old JuiceKit numbers (nothing changes for a player who did not ask)', () => {
    const p = juicePolicy(false);
    expect([p.flash, p.shake, p.travel, p.reduced]).toEqual([true, true, true, false]);
    for (const ms of [0, 10, 45, 70, 80, 90, 91, 140, 400, 500, 900]) {
      expect(p.hitStopMs(ms)).toBe(Math.min(ms, 90));
      expect(p.slowMoMs(ms)).toBe(Math.min(ms, 500));
      expect(p.slowMoMs(ms, true)).toBe(Math.min(ms, 500));
    }
  });

  it('reduced: no flash, no shake, pops fade in place', () => {
    const p = juicePolicy(true);
    expect([p.flash, p.shake, p.travel, p.reduced]).toEqual([false, false, false, true]);
  });

  it('reduced: a hit-stop is a two-frame beat, never longer than asked', () => {
    const p = juicePolicy(true);
    expect(p.hitStopMs(70)).toBe(CALM_HITSTOP_MS);
    expect(p.hitStopMs(200)).toBe(CALM_HITSTOP_MS);
    expect(p.hitStopMs(20)).toBe(20);                    // shortened, never lengthened
    expect(CALM_HITSTOP_MS).toBeLessThan(HITSTOP_MAX_MS);
  });

  it('reduced: a presentation slow-mo is a dip — a GAMEPLAY slow-mo keeps its full length', () => {
    const p = juicePolicy(true);
    expect(p.slowMoMs(400)).toBe(CALM_SLOWMO_MS);
    expect(p.slowMoMs(90)).toBe(90);
    // the dunk's hang: the slam window is counted on this clock, so it must not move under any setting
    expect(p.slowMoMs(400, true)).toBe(400);
    expect(p.slowMoMs(400, true)).toBe(juicePolicy(false).slowMoMs(400, true));
    expect(p.slowMoMs(900, true)).toBe(SLOWMO_MAX_MS);
  });

  it('a GAMEPLAY hit-stop (paired with an equal freeze of the mode clock: the dunk contact) is never shortened', () => {
    const calm = juicePolicy(true), full = juicePolicy(false);
    expect(calm.hitStopMs(70, true)).toBe(70);
    expect(calm.hitStopMs(70, true)).toBe(full.hitStopMs(70, true));
    expect(calm.hitStopMs(200, true)).toBe(HITSTOP_MAX_MS);   // the cap still holds
    expect(calm.hitStopMs(70)).toBe(CALM_HITSTOP_MS);         // a plain one is still the blink
  });
});

describe('the live setting', () => {
  it('with no window (SSR, a headless check) it is full motion and never throws', () => {
    expect(typeof window).toBe('undefined');
    expect(readMotionPref()).toBe('system');
    expect(osPrefersReducedMotion()).toBe(false);
    expect(reducedMotion()).toBe(false);
    expect(motionPolicy().flash).toBe(true);
  });

  it('follows the device by default', () => {
    fakeBrowser({ osReduce: true });
    expect(readMotionPref()).toBe('system');
    expect(reducedMotion()).toBe(true);
    fakeBrowser({ osReduce: false });
    expect(reducedMotion()).toBe(false);
  });

  it('the stored choice overrides the device, both ways', () => {
    fakeBrowser({ osReduce: true, stored: 'full' });
    expect(reducedMotion()).toBe(false);
    fakeBrowser({ osReduce: false, stored: 'reduce' });
    expect(reducedMotion()).toBe(true);
  });

  it('a stored value it does not know is ignored (the device decides)', () => {
    fakeBrowser({ osReduce: true, stored: 'yes please' });
    expect(readMotionPref()).toBe('system');
    expect(reducedMotion()).toBe(true);
  });

  it('?motion= wins for a QA run and is never stored', () => {
    const env = fakeBrowser({ osReduce: false, stored: 'full', search: '?mode=dunk&motion=reduce' });
    expect(reducedMotion()).toBe(true);
    expect(env.store.get(MOTION_KEY)).toBe('full');
  });

  it('production: a ?motion= link can only CALM — full/system links are ignored, the player\'s own choice holds', () => {
    vi.stubEnv('NODE_ENV', 'production');
    // a shared /try?motion=full link, opened by a player whose device asks for reduced motion
    fakeBrowser({ osReduce: true, search: '?motion=full' });
    expect(motionUrlOverride()).toBeNull();
    expect(reducedMotion()).toBe(true);
    // …or whose stored choice is REDUCED on a silent device
    fakeBrowser({ osReduce: false, stored: 'reduce', search: '?motion=system' });
    expect(motionUrlOverride()).toBeNull();
    expect(reducedMotion()).toBe(true);
    // reduce still works from a link — it can only make the screen quieter
    fakeBrowser({ osReduce: false, stored: 'full', search: '?motion=reduce' });
    expect(motionUrlOverride()).toBe('reduce');
    expect(reducedMotion()).toBe(true);
  });

  it('dev/test builds honour ?motion= both ways (the QA runs)', () => {
    fakeBrowser({ osReduce: true, stored: 'reduce', search: '?motion=full' });
    expect(motionUrlOverride()).toBe('full');
    expect(reducedMotion()).toBe(false);
  });

  it('storedMotionPref is the player\'s own choice, whatever the link says (the control shows THIS, and says the link is holding)', () => {
    fakeBrowser({ osReduce: false, stored: 'full', search: '?motion=reduce' });
    expect(storedMotionPref()).toBe('full');
    expect(readMotionPref()).toBe('reduce');
    fakeBrowser({ search: '?motion=bogus' });
    expect(motionUrlOverride()).toBeNull();
    expect(readMotionPref()).toBe('system');
  });

  it('writeMotionPref stores under fel-motion and applies at once', () => {
    const env = fakeBrowser({ osReduce: false });
    writeMotionPref('reduce');
    expect(env.store.get(MOTION_KEY)).toBe('reduce');
    expect(reducedMotion()).toBe(true);
    writeMotionPref('system');
    expect(reducedMotion()).toBe(false);
  });

  it('a private window that refuses the write still honours the choice for the session', () => {
    fakeBrowser({ osReduce: false, setThrows: true });
    writeMotionPref('reduce');
    expect(reducedMotion()).toBe(true);
    // a later successful write clears the session-only answer
    fakeBrowser({ osReduce: false });
    writeMotionPref('full');
    expect(readMotionPref()).toBe('full');
  });

  it('a blocked matchMedia reads as no preference', () => {
    fakeBrowser({ mediaThrows: true });
    expect(osPrefersReducedMotion()).toBe(false);
    expect(reducedMotion()).toBe(false);
  });

  it('onMotionChange hears the app choice AND the device flipping, until unsubscribed', () => {
    const env = fakeBrowser({ osReduce: false });
    const heard = vi.fn();
    const off = onMotionChange(heard);
    writeMotionPref('reduce');
    env.flipOs(true);
    expect(heard).toHaveBeenCalledTimes(2);
    off();
    writeMotionPref('full');
    env.flipOs(false);
    expect(heard).toHaveBeenCalledTimes(2);
    expect(env.changeFns.size).toBe(0);
  });
});
