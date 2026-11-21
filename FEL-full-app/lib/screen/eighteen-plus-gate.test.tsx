// SCREEN-18PLUS-GATE: the camera on /screen is for 18 or older only. Under 18, "rather not say"
// and a missing age never reach the camera step and never start the camera; the grown-up tap leads to a camera-free
// result (kidResult) with no camera-derived number; 18 or older still reach the camera.
// Rebuilt against main's KidNoCamera (SCREEN-MINOR-LOCK) and cameraAllowed, not the Oct 20 KidNoCameraResult tip.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AGE_BANDS, isKid, type AgeBand } from './age';
import { PRE_START, backStep, preStep, type PreEvent, type PreState } from './flow';
import { gateRecord } from './store';
import { KidNoCamera } from '@/app/play/mirror/assess/_components/kid-results';

const ROOT = join(__dirname, '../..');
const NOW = new Date('2026-10-20T12:00:00Z');
const run = (events: PreEvent[], from: PreState = PRE_START) => events.reduce((s, e) => preStep(s, e, NOW), from);
const KIDS = ['under-13', '13-17', 'unknown'] as const;
const HALF_KIDS = ['under-13', '13-17'] as const;

/** Every event the flow takes, every variant. */
const EVENTS: PreEvent[] = [
  { type: 'start' }, { type: 'start', kind: 'jump' }, { type: 'start', locked: null },
  ...AGE_BANDS.flatMap((locked): PreEvent[] => [{ type: 'start', locked }, { type: 'start', locked, kind: 'jump' }]),
  ...AGE_BANDS.map((age): PreEvent => ({ type: 'age', age })),
  { type: 'grownUp' }, { type: 'back' }, { type: 'restart' },
  { type: 'pain', hurts: false }, { type: 'pain', hurts: true },
  { type: 'takeoff', side: 'left' }, { type: 'takeoff', side: 'right' }, { type: 'takeoff', side: null },
  { type: 'cameraOn' },
];

/** Every state reachable from the start, by any sequence of events (breadth-first, to a fixed point). */
function reachable(): PreState[] {
  const key = (s: PreState) => JSON.stringify([s.step, s.age, s.kind, s.gate?.ageBand ?? null, s.gate?.grownUp ?? null]);
  const seen = new Map<string, PreState>([[key(PRE_START), PRE_START]]);
  let frontier = [PRE_START];
  while (frontier.length) {
    const next: PreState[] = [];
    for (const s of frontier) for (const e of EVENTS) {
      const t = preStep(s, e, NOW);
      const k = key(t);
      if (!seen.has(k)) { seen.set(k, t); next.push(t); }
    }
    frontier = next;
  }
  return [...seen.values()];
}

describe('under 18 never reaches the camera', () => {
  const all = reachable();

  it('the search covers the flow: 18 or older reach the camera, kids reach the grown-up step and the kid result', () => {
    expect(all.some((s) => s.step === 'camera' && s.age === '18+')).toBe(true);
    for (const age of KIDS) {
      expect(all.some((s) => s.step === 'grownUp' && s.age === age), age).toBe(true);
      expect(all.some((s) => s.step === 'kidResult' && s.age === age), age).toBe(true);
    }
  });

  it('every reachable camera state (and pain, take-off and camera card) is 18 or older', () => {
    for (const s of all) {
      if (['camera', 'cameraInfo', 'takeoff', 'pain'].includes(s.step)) expect(s.age, JSON.stringify(s)).toBe('18+');
    }
  });

  it.each(HALF_KIDS)('%s: the whole old path (grown-up, no pain, take-off, camera card, camera) ends at kidResult', (age) => {
    const s = run([{ type: 'start' }, { type: 'age', age }, { type: 'grownUp' }, { type: 'pain', hurts: false }, { type: 'takeoff', side: 'left' }, { type: 'cameraOn' }]);
    expect(s.step).toBe('kidResult');
    expect(isKid(s.age)).toBe(true);
  });

  it.each(HALF_KIDS)('%s: a locked answer on start goes to the grown-up step, then kidResult, never the camera', (age) => {
    const s = run([{ type: 'start', locked: age }, { type: 'grownUp' }, { type: 'cameraOn' }]);
    expect(s.step).toBe('kidResult');
  });
});

describe('an unknown or missing age never reaches the camera', () => {
  it('"rather not say" goes to the grown-up step, then kidResult', () => {
    expect(run([{ type: 'start' }, { type: 'age', age: 'unknown' }]).step).toBe('grownUp');
    expect(run([{ type: 'start' }, { type: 'age', age: 'unknown' }, { type: 'grownUp' }, { type: 'pain', hurts: false }, { type: 'takeoff', side: null }, { type: 'cameraOn' }]).step).toBe('kidResult');
  });

  it('no answer yet: the camera events do nothing before the age', () => {
    for (const from of [PRE_START, run([{ type: 'start' }])]) {
      const s = run([{ type: 'grownUp' }, { type: 'pain', hurts: false }, { type: 'takeoff', side: 'left' }, { type: 'cameraOn' }], from);
      expect(s.step).not.toBe('camera');
      expect(s.step).not.toBe('kidResult');
    }
  });

  it.each([null, ...KIDS] as (AgeBand | null)[])('a hand-built state with age %s and a gate record is refused at pain, take-off and the camera card', (age) => {
    const gate = gateRecord('18+', false, NOW);   // even a gate record that claims an adult
    for (const [step, e] of [['pain', { type: 'pain', hurts: false }], ['takeoff', { type: 'takeoff', side: 'left' }], ['cameraInfo', { type: 'cameraOn' }]] as const) {
      const s: PreState = { step, age, gate, kind: 'full' };
      const t = preStep(s, e, NOW);
      expect(t, `${age} ${step}`).toBe(s);                        // unchanged: no step forward
      expect(t.step).not.toBe('camera');
    }
  });
});

describe('no override: the grown-up tap is not a way to the camera', () => {
  it.each(KIDS)('%s: from kidResult no event reaches the camera, and back returns to the grown-up step', (age) => {
    const k = run([{ type: 'start' }, { type: 'age', age }, { type: 'grownUp' }]);
    expect(k.step).toBe('kidResult');
    for (const e of EVENTS) expect(preStep(k, e, NOW).step, JSON.stringify(e)).not.toBe('camera');
    for (const e of [{ type: 'grownUp' }, { type: 'pain', hurts: false }, { type: 'takeoff', side: 'right' }, { type: 'cameraOn' }] as PreEvent[]) {
      expect(preStep(k, e, NOW), JSON.stringify(e)).toBe(k);
    }
    expect(backStep(k)).toMatchObject({ step: 'grownUp', age, gate: null });
  });

  it('the page starts the camera for 18 or older only: startCamera itself checks the age', () => {
    const src = readFileSync(join(ROOT, 'app/play/mirror/assess/_components/assess-app.tsx'), 'utf8');
    const start = src.slice(src.indexOf('const startCamera = useCallback'));
    // main already uses cameraAllowed (run, tab, and session must all be 18+); a kid run is sent to noCamera
    expect(start.slice(0, start.indexOf('cleanup(true)'))).toMatch(/cameraAllowed\(/);
    expect(start.slice(0, start.indexOf('cleanup(true)'))).toMatch(/setPhase\('noCamera'\)/);
    // the flow hand-off is the only startCamera call besides "Do the full screen" and the camera-help retry; each runs
    // through startCamera's own age check above
    expect(src).toMatch(/if \(next\.step === 'camera'\) \{ void startCamera\(\); return; \}/);
    expect(src).toMatch(/if \(next\.step === 'kidResult'\) \{ setPhase\('noCamera'\); return; \}/);
    // the grown-up step's button leads to the flow's grownUp event, and the kid result uses existing KidNoCamera
    expect(src).toMatch(/<GrownUpStep onContinue=\{grownUp\} \/>/);
    expect(src).toMatch(/<KidNoCamera onRestart=\{restart\} \/>/);
  });
});

describe('the kid result has no camera-derived number', () => {
  const html = renderToStaticMarkup(createElement(KidNoCamera, { onRestart: () => {} }));
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');

  it('no jump, no change line, no unit; the only number on it is the age line\'s 18', () => {
    expect(html).not.toMatch(/data-kid-jump|data-kid-change|data-kid-number|data-kid-results/);
    expect(text).not.toMatch(/\b(in|cm|inches?|%)\b\s*$|\d+\s*(in|cm|%)\b/);
    expect(text.replace(/18 or older/g, '')).not.toMatch(/\d/);
  });

  it('is not a dead end: a way back to the start, and no link out of the screen', () => {
    expect(html).toMatch(/data-restart/);
    expect(text).toMatch(/Continue without the camera/);
    for (const m of html.matchAll(/href="([^"]+)"/g)) expect(m[1]).toMatch(/^\/screen\//);
  });
});

describe('18 or older still reach the camera', () => {
  it.each(['full', 'jump'] as const)('%s: age, no pain, take-off, the camera card, the camera', (kind) => {
    const s = run([{ type: 'start', kind }, { type: 'age', age: '18+' }, { type: 'pain', hurts: false }, { type: 'takeoff', side: 'left' }, { type: 'cameraOn' }]);
    expect(s).toMatchObject({ step: 'camera', age: '18+', kind });
    expect(s.gate).toMatchObject({ ageBand: '18+', grownUp: false });
  });

  it('a locked 18+ answer goes straight to the pain question, then to the camera', () => {
    expect(run([{ type: 'start', locked: '18+' }, { type: 'pain', hurts: false }, { type: 'takeoff', side: null }, { type: 'cameraOn' }]).step).toBe('camera');
  });
});

describe('Back from kidResult returns to the grown-up step', () => {
  it.each(KIDS)('%s: Back from kidResult returns to grownUp, with the same age and no gate', (age) => {
    const k = run([{ type: 'start' }, { type: 'age', age }, { type: 'grownUp' }]);
    expect(k.step).toBe('kidResult');
    const viaBack = backStep(k);
    const viaEvent = preStep(k, { type: 'back' }, NOW);
    expect(viaBack).toMatchObject({ step: 'grownUp', age, gate: null, kind: k.kind });
    expect(viaEvent).toEqual(viaBack);
  });
});
