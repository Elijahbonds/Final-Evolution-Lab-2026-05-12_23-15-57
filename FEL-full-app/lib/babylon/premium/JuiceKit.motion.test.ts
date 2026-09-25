// HOTFIX (2026-09-24): JuiceKit ASKS. Its hitStop, slowMo, flash and shake never read prefers-reduced-motion; these
// drive a real JuiceKit (fake DOM, fake scene) through the LIVE setting — the device's media query and the app's stored
// override — and measure what it does: the overlay it paints, where the camera ends up, when the animation clock comes
// back. Full motion must be exactly the old behaviour; reduced must change the picture and nothing else.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Matrix, Vector3, Viewport } from '@babylonjs/core';
import type { Scene, TargetCamera } from '@babylonjs/core';
import { FREEZE_SCALE, JuiceKit } from './JuiceKit';
import { MOTION_KEY, REDUCE_QUERY, writeMotionPref, juicePolicy } from '../../a11y/reducedMotion';

class FakeEl {
  style: Record<string, string> = { cssText: '' };
  children: FakeEl[] = [];
  parent: FakeEl | null = null;
  textContent = '';
  appendChild(c: FakeEl): FakeEl { c.parent = this; this.children.push(c); return c; }
  remove(): void { if (this.parent) { this.parent.children = this.parent.children.filter((x) => x !== this); this.parent = null; } }
}

function browser(o: { osReduce?: boolean; stored?: string } = {}) {
  const store = new Map<string, string>();
  if (o.stored) store.set(MOTION_KEY, o.stored);
  vi.stubGlobal('window', {
    location: { search: '' },
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } },
    matchMedia: (q: string) => ({ matches: q === REDUCE_QUERY && o.osReduce === true, addEventListener() {}, removeEventListener() {} }),
  });
  vi.stubGlobal('document', { createElement: () => new FakeEl() });
  vi.stubGlobal('requestAnimationFrame', (fn: (t: number) => void) => { fn(0); return 0; });
}

function rig(motion?: ConstructorParameters<typeof JuiceKit>[3]) {
  const ticks: (() => void)[] = [];
  const scene = {
    animationTimeScale: 1,
    onBeforeRenderObservable: { add: (fn: () => void) => { ticks.push(fn); return {}; } },
    getEngine: () => ({ getDeltaTime: () => 16, getRenderingCanvas: () => null, getRenderWidth: () => 800, getRenderHeight: () => 450 }),
    getTransformMatrix: () => Matrix.Identity(),
  };
  const camera = { position: new Vector3(0, 2, -5), viewport: new Viewport(0, 0, 1, 1) };
  const mount = new FakeEl();
  const kit = new JuiceKit(scene as unknown as Scene, camera as unknown as TargetCamera, mount as unknown as HTMLElement, motion);
  const overlay = mount.children[0];
  return { kit, scene, camera, overlay, frames: (n: number) => { for (let i = 0; i < n; i++) ticks.forEach((t) => t()); } };
}

/** When the scene's animation clock comes back to 1 after an effect, in ms (fake timers). */
function restoredAfter(scene: { animationTimeScale: number }, fire: () => void): number {
  fire();
  expect(scene.animationTimeScale).toBeLessThan(1);
  for (let ms = 1; ms <= 1000; ms++) {
    vi.advanceTimersByTime(1);
    if (scene.animationTimeScale === 1) return ms;
  }
  return Infinity;
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => {
  vi.useRealTimers();
  browser(); writeMotionPref('system');
  vi.unstubAllGlobals();
});

describe('full motion (the device has no preference): exactly the old JuiceKit', () => {
  beforeEach(() => browser({ osReduce: false }));

  it('flash paints the vignette', () => {
    const { kit, overlay } = rig();
    kit.flash();
    expect(overlay.children).toHaveLength(1);
    expect(overlay.children[0].style.cssText).toContain('radial-gradient');
  });

  it('shake moves the camera', () => {
    const { kit, camera, frames } = rig();
    const at = camera.position.clone();
    kit.shake(0.2, 200);
    frames(3);
    expect(Vector3.Distance(at, camera.position)).toBeGreaterThan(0.01);
  });

  it('hit-stop holds 70 ms (capped at 90), slow-mo 400 ms (capped at 500)', () => {
    const { kit, scene } = rig();
    expect(restoredAfter(scene, () => kit.hitStop(70))).toBe(70);
    expect(restoredAfter(scene, () => kit.hitStop(200))).toBe(90);
    expect(restoredAfter(scene, () => kit.slowMo(0.4, 400))).toBe(400);
    expect(restoredAfter(scene, () => kit.slowMo(0.4, 900))).toBe(500);
    expect(restoredAfter(scene, () => kit.slowMo(0.4, 400, { gameplay: true }))).toBe(400);
  });

  it('the banner pops in from .7', () => {
    const { kit, overlay } = rig();
    kit.banner('WAVE CLEAR');
    expect(overlay.children[0].style.cssText).toContain('scale(.7)');
  });
});

describe('reduced motion (the device asks): the picture calms, the clock the mode is timed on does not move', () => {
  beforeEach(() => browser({ osReduce: true }));

  it('flash paints nothing at all', () => {
    const { kit, overlay } = rig();
    kit.flash('#ffffff', 140, 2);
    expect(overlay.children).toHaveLength(0);
  });

  it('shake leaves the camera exactly where it was', () => {
    const { kit, camera, frames } = rig();
    const at = camera.position.clone();
    kit.shake(0.22, 300);
    frames(20);
    expect(camera.position.equals(at)).toBe(true);
  });

  it('hit-stop is a two-frame beat (30 ms), not a 70 ms freeze', () => {
    const { kit, scene } = rig();
    expect(restoredAfter(scene, () => kit.hitStop(70))).toBe(30);
    expect(restoredAfter(scene, () => kit.hitStop(20))).toBe(20);
  });

  it('a presentation slow-mo is a 120 ms dip', () => {
    const { kit, scene } = rig();
    expect(restoredAfter(scene, () => kit.slowMo(0.45, 400))).toBe(120);
  });

  it('a GAMEPLAY slow-mo (the dunk hang, the skate spectacle) keeps its full length', () => {
    const { kit, scene } = rig();
    expect(restoredAfter(scene, () => kit.slowMo(0.4, 400, { gameplay: true }))).toBe(400);
  });

  it('the banner fades in at size, with no pop', () => {
    const { kit, overlay } = rig();
    kit.banner('WAVE CLEAR');
    const el = overlay.children[0];
    expect(el.style.cssText).toContain('scale(1)');
    expect(el.style.cssText).not.toContain('scale(.7)');
    expect(el.textContent).toBe('WAVE CLEAR');                  // the words are all still there
  });

  it('impact: the score still pops (in place), no flash, no shake, a blink of hit-stop', () => {
    const { kit, scene, camera, overlay, frames } = rig();
    const at = camera.position.clone();
    kit.impact(new Vector3(0, 0, 0), '+3');
    expect(overlay.children).toHaveLength(1);                   // the pop — and no flash layer
    expect(overlay.children[0].textContent).toBe('+3');
    expect(overlay.children[0].style.transform ?? '').not.toContain('-150%');
    frames(10);
    expect(camera.position.equals(at)).toBe(true);
    vi.advanceTimersByTime(29); expect(scene.animationTimeScale).toBeLessThan(1);
    vi.advanceTimersByTime(1); expect(scene.animationTimeScale).toBe(1);
  });
});

describe('a hit-stop inside a slow-mo never leaves the scene stuck in slow motion', () => {
  it('reduced: a counter 100 ms into a perfect-dodge slow-mo (now a 120 ms dip) hands back full speed', () => {
    browser({ osReduce: true });
    const { kit, scene } = rig();
    kit.slowMo(0.45, 400);
    vi.advanceTimersByTime(100);
    kit.hitStop(70);                                            // restores at 130, after the dip ended at 120
    vi.advanceTimersByTime(1000);
    expect(scene.animationTimeScale).toBe(1);                   // it used to restore the captured 0.45 — for good
  });

  it('full motion: the same bug at the tail of a 400 ms slow-mo is gone too', () => {
    browser({ osReduce: false });
    const { kit, scene } = rig();
    kit.slowMo(0.4, 400);
    vi.advanceTimersByTime(350);
    kit.hitStop(90);                                            // restores at 440, after the slow-mo ended at 400
    vi.advanceTimersByTime(1000);
    expect(scene.animationTimeScale).toBe(1);
  });

  it('a freeze inside a slow-mo that is still running goes back to the slow-mo, as before', () => {
    browser({ osReduce: false });
    const { kit, scene } = rig();
    kit.slowMo(0.4, 400);
    vi.advanceTimersByTime(100);
    kit.hitStop(70);
    vi.advanceTimersByTime(70);
    expect(scene.animationTimeScale).toBe(0.4);
    vi.advanceTimersByTime(230);
    expect(scene.animationTimeScale).toBe(1);
  });

  it('a freeze over a scale that is not ours (the Hundred\'s Matrix latch) restores exactly that scale', () => {
    browser({ osReduce: true });
    const { kit, scene } = rig();
    scene.animationTimeScale = 0.35;
    kit.hitStop(70);
    vi.advanceTimersByTime(30);
    expect(scene.animationTimeScale).toBe(0.35);
  });
});

// HOTFIX (2026-09-24): the animation clock is COUNTED, not captured. Every freeze used to read the clock when it started
// and write that back when it ended, so a freeze that began inside another captured the frozen 0.001 and, ending last,
// left every body a statue for the rest of the session. Reduced motion caps every hit-stop at 30 ms, which turned "a pair
// started in the same frame" into "always ends in call order" — the stuck case every time. Each case below runs under
// BOTH settings: the clock holds while any freeze is in force and comes back to where it started, never to 0.001.
const SETTINGS = [
  { name: 'full motion', osReduce: false, hold: (ms: number) => Math.min(ms, 90), dip: (ms: number) => Math.min(ms, 500) },
  { name: 'reduced motion', osReduce: true, hold: (ms: number) => Math.min(ms, 30), dip: (ms: number) => Math.min(ms, 120) },
] as const;

/** The scene's animation clock, one sample per ms from now: out[i] = the clock after i + 1 ms. */
function sample(scene: { animationTimeScale: number }, ms: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < ms; i++) { vi.advanceTimersByTime(1); out.push(scene.animationTimeScale); }
  return out;
}
/** How many ms (from the first sample) the clock read FREEZE_SCALE, counted from the start without a gap. */
const frozenFor = (trace: number[]) => { const i = trace.findIndex((v) => v !== FREEZE_SCALE); return i < 0 ? trace.length : i; };

for (const S of SETTINGS) {
  describe(`overlapping and nested hit-stops (${S.name}) — the freeze lasts as long as the LONGEST, then the clock comes back`, () => {
    beforeEach(() => browser({ osReduce: S.osReduce }));

    it('two in the same frame (a heavy punch and a kick connecting together: 45 + 40)', () => {
      const { kit, scene } = rig();
      kit.hitStop(45); kit.hitStop(40);
      const t = sample(scene, 400);
      expect(frozenFor(t)).toBe(Math.max(S.hold(45), S.hold(40)) - 1);
      expect(t.at(-1)).toBe(1);
      expect(t.slice(Math.max(S.hold(45), S.hold(40)))).toEqual(t.slice(Math.max(S.hold(45), S.hold(40))).map(() => 1));
    });

    it('two equal ones in the same frame (70 + 70, the case that failed in full motion too)', () => {
      const { kit, scene } = rig();
      kit.hitStop(70); kit.hitStop(70);
      const t = sample(scene, 400);
      expect(frozenFor(t)).toBe(S.hold(70) - 1);
      expect(t.at(-1)).toBe(1);
    });

    it('staggered: the Hundred\'s wall kick (70), then a connect (45) one frame later', () => {
      const { kit, scene } = rig();
      kit.hitStop(70);
      vi.advanceTimersByTime(16);
      kit.hitStop(45);
      const t = sample(scene, 400);
      expect(frozenFor(t)).toBe(Math.max(S.hold(70) - 16, S.hold(45)) - 1);
      expect(t.at(-1)).toBe(1);
    });

    it('nested: a short freeze that starts AND ends inside a long one does not cut it short', () => {
      const { kit, scene } = rig();
      kit.hitStop(90);
      vi.advanceTimersByTime(5);
      kit.hitStop(20);
      const t = sample(scene, 400);
      expect(frozenFor(t)).toBe(Math.max(S.hold(90) - 5, S.hold(20)) - 1);
      expect(t.at(-1)).toBe(1);
    });

    it('a chain: connect 28, route payoff 90 in the same block, a trade 45 a frame later', () => {
      const { kit, scene } = rig();
      kit.hitStop(28); kit.hitStop(90);
      vi.advanceTimersByTime(16);
      kit.hitStop(45);
      const t = sample(scene, 400);
      expect(frozenFor(t)).toBe(Math.max(S.hold(28), S.hold(90), 16 + S.hold(45)) - 16 - 1);
      expect(t.at(-1)).toBe(1);
    });

    it('over a scale that is not ours (the Hundred\'s Matrix latch): two freezes hand back the latch\'s scale', () => {
      const { kit, scene } = rig();
      scene.animationTimeScale = 0.35;
      kit.hitStop(45); kit.hitStop(40);
      vi.advanceTimersByTime(200);
      expect(scene.animationTimeScale).toBe(0.35);
    });

    it('the latch ENDS during the freeze (the mode writes 1): the freeze hands back 1, never the stale 0.35', () => {
      const { kit, scene } = rig();
      scene.animationTimeScale = 0.35;
      kit.hitStop(70);
      vi.advanceTimersByTime(10);
      scene.animationTimeScale = 1;                  // KarateEndless: `if (wasSlow && !slowmo.active) scene.animationTimeScale = 1`
      kit.hitStop(45);
      vi.advanceTimersByTime(200);
      expect(scene.animationTimeScale).toBe(1);
    });

    it('the latch STARTS during the freeze: the freeze hands back the latch, not the 1 it began over', () => {
      const { kit, scene } = rig();
      kit.hitStop(70);
      vi.advanceTimersByTime(10);
      scene.animationTimeScale = 0.35;               // KarateEndless matrix(): `scene.animationTimeScale = slowmo.scale`
      vi.advanceTimersByTime(200);
      expect(scene.animationTimeScale).toBe(0.35);
    });

    it('impact({ slow }) — the freeze, THEN the slow-mo for the rest of its length (the freeze used to cut it off)', () => {
      const { kit, scene } = rig();
      kit.impact(new Vector3(0, 0, 0), 'TOUCHDOWN!', { slow: true });
      const t = sample(scene, 700);
      const hold = S.hold(80), dip = S.dip(400);
      expect(frozenFor(t)).toBe(hold - 1);
      expect(t.slice(hold, dip - 1).every((v) => v === 0.4)).toBe(true);
      expect(t.slice(dip - 1).every((v) => v === 1)).toBe(true);
    });

    it('two slow-mos: the newer sets the speed, the older resumes if it is still running, then 1', () => {
      const { kit, scene } = rig();
      kit.slowMo(0.5, 400);
      vi.advanceTimersByTime(50);
      kit.slowMo(0.3, 200);
      const t = sample(scene, 700);
      const newerEnd = S.dip(200), olderEnd = S.dip(400) - 50;   // in samples from the second call
      expect(t.slice(0, newerEnd - 1).every((v) => v === 0.3)).toBe(true);
      if (olderEnd > newerEnd) expect(t.slice(newerEnd, olderEnd - 1).every((v) => v === 0.5)).toBe(true);
      expect(t.slice(Math.max(newerEnd, olderEnd) - 1).every((v) => v === 1)).toBe(true);
    });

    it('a freeze inside a slow-mo that outlives it, overlapped by a second freeze: back to 1', () => {
      const { kit, scene } = rig();
      kit.slowMo(0.45, 400);
      vi.advanceTimersByTime(S.dip(400) - 10);
      kit.hitStop(70);
      vi.advanceTimersByTime(5);
      kit.hitStop(70);
      vi.advanceTimersByTime(1000);
      expect(scene.animationTimeScale).toBe(1);
    });

    it('a seeded storm of 60 overlapping hit-stops and slow-mos: frozen while any freeze holds, and it ends at 1', () => {
      let seed = S.osReduce ? 7 : 11;
      const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
      const { kit, scene } = rig();
      const freezes: [number, number][] = [];   // [start, end) in ms
      let now = 0, last = 0;
      for (let i = 0; i < 60; i++) {
        const gap = Math.floor(rnd() * 40);
        vi.advanceTimersByTime(gap); now += gap;
        if (rnd() < 0.7) {
          const ms = 10 + Math.floor(rnd() * 110), gameplay = rnd() < 0.2;
          kit.hitStop(ms, { gameplay });
          const end = now + (gameplay ? Math.min(ms, 90) : S.hold(ms));
          freezes.push([now, end]); last = Math.max(last, end);
        } else {
          const ms = 100 + Math.floor(rnd() * 500), gameplay = rnd() < 0.3;
          kit.slowMo(0.2 + rnd() * 0.4, ms, { gameplay });
          last = Math.max(last, now + (gameplay ? Math.min(ms, 500) : S.dip(ms)));
        }
        // at the moment of each call: frozen exactly when some freeze is in force
        const held = freezes.some(([a, b]) => a <= now && now < b);
        expect(scene.animationTimeScale === FREEZE_SCALE).toBe(held);
      }
      vi.advanceTimersByTime(Math.max(0, last - now) + 1);
      expect(scene.animationTimeScale).toBe(1);
    });
  });
}

describe('a kit torn down mid-freeze (the harness teardown, a GO AGAIN remount)', () => {
  it('hands the clock back at once, and a timer that fires later never writes it again', () => {
    browser({ osReduce: false });
    const { kit, scene } = rig();
    scene.animationTimeScale = 0.35;                 // somebody else's scale under ours
    kit.hitStop(90); kit.slowMo(0.4, 400);
    expect(scene.animationTimeScale).toBe(FREEZE_SCALE);
    kit.dispose();
    expect(scene.animationTimeScale).toBe(0.35);
    scene.animationTimeScale = 0.8;                  // the next owner of this scene sets its own
    vi.advanceTimersByTime(1000);
    expect(scene.animationTimeScale).toBe(0.8);
  });
});

describe('a gameplay hit-stop (paired with the mode\'s own freeze: the dunk contact) keeps its length', () => {
  it('reduced: hitStop(70, { gameplay }) holds 70 ms, like feelHitStop(70) beside it; a plain one is 30', () => {
    browser({ osReduce: true });
    const { kit, scene } = rig();
    expect(restoredAfter(scene, () => kit.hitStop(70, { gameplay: true }))).toBe(70);
    expect(restoredAfter(scene, () => kit.hitStop(70))).toBe(30);
    expect(restoredAfter(scene, () => kit.hitStop(200, { gameplay: true }))).toBe(90);   // the cap still holds
  });
  it('full: exactly the same as a plain one', () => {
    browser({ osReduce: false });
    const { kit, scene } = rig();
    expect(restoredAfter(scene, () => kit.hitStop(70, { gameplay: true }))).toBe(70);
  });
});

describe('the app override and live changes', () => {
  it('stored FULL beats a device asking for reduce', () => {
    browser({ osReduce: true, stored: 'full' });
    const { kit, overlay } = rig();
    kit.flash();
    expect(overlay.children).toHaveLength(1);
  });

  it('stored REDUCE beats a device with no preference', () => {
    browser({ osReduce: false, stored: 'reduce' });
    const { kit, overlay } = rig();
    kit.flash();
    expect(overlay.children).toHaveLength(0);
  });

  it('a change in settings applies to the very next effect — no remount', () => {
    browser({ osReduce: false });
    const { kit, overlay, scene } = rig();
    writeMotionPref('reduce');
    kit.flash();
    expect(overlay.children).toHaveLength(0);
    expect(restoredAfter(scene, () => kit.hitStop(70))).toBe(30);
    writeMotionPref('full');
    kit.flash();
    expect(overlay.children).toHaveLength(1);
  });

  it('a kit handed its own policy uses it (the seam the tests above do NOT use)', () => {
    browser({ osReduce: false });
    const { kit, overlay } = rig(() => juicePolicy(true));
    kit.flash();
    expect(overlay.children).toHaveLength(0);
  });
});
