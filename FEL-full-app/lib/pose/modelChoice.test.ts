import { describe, it, expect } from 'vitest';
import {
  BUDGET_SAMPLES, BUDGET_WARMUP, CAMERA_FPS, DetectBudget, FULL_BUDGET_MS, MIN_DETECT_GAP_MS, REMEMBER_FALLBACK_MS,
  askedModel, cameraConstraints, deviceClass, initialModel, parseRemembered, rememberFallback,
} from './modelChoice';

const UA = {
  macChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  winEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0',
  chromebook: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  // iPadOS asks for the desktop site by default: a Mac user agent.
  ipadDesktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  androidPhone: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  androidTablet: 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
};

describe('device class', () => {
  it('laptops and desktops (touch screens included) are desktop', () => {
    expect(deviceClass({ userAgent: UA.macChrome, maxTouchPoints: 0 })).toBe('desktop');
    expect(deviceClass({ userAgent: UA.winEdge, maxTouchPoints: 10 })).toBe('desktop');
    expect(deviceClass({ userAgent: UA.chromebook, maxTouchPoints: 10 })).toBe('desktop');
  });
  it('phones and tablets are mobile, including an iPad sending a Mac user agent', () => {
    expect(deviceClass({ userAgent: UA.iphone, maxTouchPoints: 5 })).toBe('mobile');
    expect(deviceClass({ userAgent: UA.ipadDesktop, maxTouchPoints: 5 })).toBe('mobile');
    expect(deviceClass({ userAgent: UA.androidPhone })).toBe('mobile');
    expect(deviceClass({ userAgent: UA.androidTablet, uaMobile: false })).toBe('mobile');
    expect(deviceClass({ userAgent: 'SomeNewBrowser', uaMobile: true })).toBe('mobile');
  });
});

describe('the camera request', () => {
  it('desktop: 1280×720 at 30, all ideal (never a constraint the camera can refuse)', () => {
    const c = cameraConstraints('desktop', false);
    expect(c).toEqual({ facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: CAMERA_FPS } });
    expect(cameraConstraints('desktop', true)).toEqual(c);   // a portrait monitor still has a landscape webcam
  });
  it('phone: 4:3 VGA, tall when held upright', () => {
    expect(cameraConstraints('mobile', true)).toMatchObject({ width: { ideal: 480 }, height: { ideal: 640 } });
    expect(cameraConstraints('mobile', false)).toMatchObject({ width: { ideal: 640 }, height: { ideal: 480 } });
    expect(cameraConstraints('mobile', true, 'environment').facingMode).toBe('environment');
  });
});

describe('which model starts', () => {
  const now = Date.UTC(2026, 8, 24);
  it('full on a desktop (measured), lite on a phone or tablet (not measured)', () => {
    expect(initialModel('desktop')).toMatchObject({ model: 'full', measure: true });
    expect(initialModel('mobile')).toMatchObject({ model: 'lite', measure: false });
  });
  it('?pose= wins everywhere and is not measured', () => {
    expect(askedModel('?mode=x&pose=full')).toBe('full');
    expect(askedModel('?pose=heavy')).toBeNull();
    expect(initialModel('mobile', { asked: 'full' })).toMatchObject({ model: 'full', measure: false });
    expect(initialModel('desktop', { asked: 'lite' })).toMatchObject({ model: 'lite', measure: false });
  });
  it('a desktop that measured full over budget starts on lite, for a week', () => {
    const stored = rememberFallback(23.45, now);
    const fresh = parseRemembered(stored, now + 3600_000);
    expect(fresh).toEqual({ model: 'lite', detectMs: 23.5, at: now });
    expect(initialModel('desktop', { remembered: fresh })).toMatchObject({ model: 'lite', measure: false });
    expect(parseRemembered(stored, now + REMEMBER_FALLBACK_MS + 1)).toBeNull();
    expect(parseRemembered(stored, now - 1)).toBeNull();   // written in the future: a clock change, not trusted
  });
  it('anything else in storage is ignored', () => {
    for (const raw of [null, '', 'lite', '{"model":"full","detectMs":1,"at":0}', '{"model":"lite"}', '{bad json']) {
      expect(parseRemembered(raw, now)).toBeNull();
    }
  });
});

describe('the full-model budget', () => {
  it('is half the 30 fps camera period', () => {
    expect(FULL_BUDGET_MS).toBeCloseTo(16.67, 2);
    expect(MIN_DETECT_GAP_MS).toBeCloseTo(25, 5);
  });

  /** Feed n frames of `ms`, returning the verdict after each. */
  const run = (b: DetectBudget, n: number, ms: number, body = true) => Array.from({ length: n }, () => b.add(ms, body));

  it('decides after the warm-up plus the samples, on body frames only', () => {
    const b = new DetectBudget();
    // an empty room first: only the shared detector runs, so none of it counts
    expect(run(b, 200, 40, false).every((v) => v === 'measuring')).toBe(true);
    expect(b.medianMs).toBeNull();
    // warm-up frames are slow and ignored
    expect(run(b, BUDGET_WARMUP, 90).every((v) => v === 'measuring')).toBe(true);
    const v = run(b, BUDGET_SAMPLES, 12);
    expect(v.slice(0, -1).every((x) => x === 'measuring')).toBe(true);
    expect(v[v.length - 1]).toBe('keep');
    expect(b.medianMs).toBe(12);
  });

  it('falls back when the median is over budget, and says so once for good', () => {
    const b = new DetectBudget();
    run(b, BUDGET_WARMUP, 20);
    const v = run(b, BUDGET_SAMPLES, 21);
    expect(v[v.length - 1]).toBe('fallback');
    expect(b.add(1, true)).toBe('fallback');   // decided: later fast frames change nothing
  });

  it('a few garbage-collection pauses do not send a fast laptop to lite', () => {
    const b = new DetectBudget();
    run(b, BUDGET_WARMUP, 10);
    const times = Array.from({ length: BUDGET_SAMPLES }, (_, i) => (i % 5 === 0 ? 80 : 11));
    let last = 'measuring';
    for (const ms of times) last = b.add(ms, true);
    expect(last).toBe('keep');
  });
});
