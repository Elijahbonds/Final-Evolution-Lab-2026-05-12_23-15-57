// MIRROR replay follow-up: the graders keep each faulted metric's worst rep and best rep as frame clips (lib/assess,
// page memory only); the results page plays them side by side with Play/Pause and a scrub bar. Same rules as the
// still frame: adults only, cleared on leave, nothing stored or sent.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FaultReplay, stepFrame } from '@/app/play/mirror/assess/_components/fault-replay';
import { ResultsView } from '@/app/play/mirror/assess/_components/results-view';
import { gradeSession } from '@/lib/assess/runner';
import { repClip, type FrozenRep } from '@/lib/assess/scoring';
import { cmj, kneeWall, ohsFront, ohsSide, singleLegSquat, syntheticCalibration } from '@/lib/assess/replay';
import { summarize } from './checks';
import { clearReplay, heldReplay, holdReplay, pickReplay } from './rep-memory';
import { AGE_BANDS, isKid } from './age';
import { REPLAY_BEST, REPLAY_PLAY, REPLAY_WORST } from './copy';

const ROOT = join(__dirname, '../..');
const cal = syntheticCalibration();
const R = gradeSession({
  calibration: cal, T1: { front: ohsFront({ kneeInL: 0.06 }).frames, side: ohsSide().frames },
  T2: { left: kneeWall('left').frames, right: kneeWall('right', { tibiaMax: 38.5 }).frames },
  T3: { left: singleLegSquat('left').frames, right: singleLegSquat('right').frames },
  T5: cmj([0, 1, 2].map(() => ({ heightM: 0.42 }))).frames,
});
const S = summarize(R)!;
const frozen = R.tests.flatMap((t) => t.frozen);

afterEach(() => { clearReplay(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('lib/assess keeps the rep clips', () => {
  it('every frozen worst rep carries its whole rep as frames, the still frame among them', () => {
    expect(frozen.length).toBeGreaterThan(0);
    for (const f of frozen) {
      expect(f.worstClip, f.metric).toBeDefined();
      expect(f.worstClip!.rep).toBe(f.rep);
      expect(f.worstClip!.frames.length, f.metric).toBeGreaterThan(1);
      const still = JSON.stringify(f.image);
      expect(f.worstClip!.frames.some((fr) => JSON.stringify(fr) === still), f.metric).toBe(true);
    }
  });

  it('a best clip, when there is one, is a different rep of the same capture', () => {
    for (const f of frozen.filter((x) => x.bestClip)) {
      expect(f.bestClip!.rep, f.metric).not.toBe(f.rep);
      expect(f.bestClip!.frames.length).toBeGreaterThan(0);
    }
  });

  it('clips hold landmarks only (no picture, no world points), copied, never shared with the capture', () => {
    const src = [{ image: [{ x: 0.5, y: 0.5, z: 0, v: 1 }] }, { image: [{ x: 0.4, y: 0.6, z: 0, v: 1 }] }];
    const c = repClip(src, 1, 0, 1)!;
    expect(c.frames).toEqual(src.map((s) => s.image));
    expect(c.frames[0][0]).not.toBe(src[0].image[0]);
    expect(repClip(src, 1, -5, 9)!.frames.length).toBe(2);
    expect(repClip(src, 1, 1, 0)).toBeUndefined();
    for (const f of frozen) for (const fr of f.worstClip!.frames) for (const l of fr) expect(Object.keys(l).sort().join()).toMatch(/^(v,x,y|v,x,y,z)$/);
  });

  it('the clips never reach the summary, the only thing written to the tab', () => {
    expect(JSON.stringify(S)).not.toMatch(/Clip|frames|image/);
  });
});

describe('the replay plays them', () => {
  it('in step: the best clip follows the worst clip\'s point in the rep', () => {
    expect(stepFrame(0, 10, 5)).toBe(0);
    expect(stepFrame(9, 10, 5)).toBe(4);
    expect(stepFrame(5, 1, 5)).toBe(0);
    expect(stepFrame(3, 10, 1)).toBe(0);
  });

  it('worst and best side by side, a Play button (paused at first) and a scrub bar, 48 px targets', () => {
    const f = frozen.find((x) => x.bestClip) ?? frozen[0];
    const h = renderToStaticMarkup(createElement(FaultReplay, { rep: f }));
    expect(h).toContain('data-replay-controls');
    expect(h).toMatch(/<button[^>]*data-replay-play[^>]*class="[^"]*min-h-12/);
    expect(h).toContain(`>${REPLAY_PLAY}<`);
    expect(h).toMatch(/<input[^>]*type="range"[^>]*data-replay-scrub/);
    expect(h).toContain(REPLAY_WORST);
    if (f.bestClip) { expect(h).toContain('data-replay-best="yes"'); expect(h).toContain(REPLAY_BEST); }
  });

  it('a frozen frame with no clip is a still picture with no controls', () => {
    const { worstClip: _w, bestClip: _b, ...still } = frozen[0];
    void _w; void _b;
    const h = renderToStaticMarkup(createElement(FaultReplay, { rep: still as FrozenRep }));
    expect(h).not.toContain('data-replay-controls');
    expect(h).toContain('data-replay-best="no"');
  });

  it('page memory copies the clips and clearing drops them', () => {
    holdReplay(R.tests);
    const h = heldReplay()!;
    const withClip = h.find((x) => x.worstClip)!;
    const orig = frozen.find((x) => x.metric === withClip.metric && x.side === withClip.side)!;
    expect(withClip.worstClip!.frames[0]).not.toBe(orig.worstClip!.frames[0]);
    clearReplay();
    expect(heldReplay()).toBeNull();
  });

  it('nothing is stored or sent while the clips are held, played, scrubbed and cleared', () => {
    const touch = vi.fn();
    const store = { getItem: touch, setItem: touch, removeItem: touch, clear: touch, key: touch, length: 0 };
    vi.stubGlobal('localStorage', store);
    vi.stubGlobal('sessionStorage', store);
    vi.stubGlobal('indexedDB', { open: touch });
    vi.stubGlobal('fetch', touch);
    vi.stubGlobal('navigator', { sendBeacon: touch });
    holdReplay(R.tests);
    const rep = pickReplay(heldReplay(), S.checks.find((c) => c.id === S.priorities[0])!)!;
    renderToStaticMarkup(createElement(FaultReplay, { rep }));
    renderToStaticMarkup(createElement(ResultsView, { summary: S, age: '18+', onClear: () => {}, onRunAgain: () => {}, replay: heldReplay() }));
    clearReplay();
    expect(touch).not.toHaveBeenCalled();
  });

  it('never for a kid or an age not given, clips or not', () => {
    holdReplay(R.tests);
    for (const age of [...AGE_BANDS, null]) if (isKid(age)) {
      const h = renderToStaticMarkup(createElement(ResultsView, { summary: S, age, onClear: () => {}, onRunAgain: () => {}, replay: heldReplay() }));
      expect(h, String(age)).not.toMatch(/data-fault-replay|data-replay-/);
    }
  });

  it('source: the replay and the clip helper name no storage, network or export API', () => {
    const strip = (s: string) => s.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const f of ['app/play/mirror/assess/_components/fault-replay.tsx', 'lib/screen/rep-memory.ts', 'lib/assess/scoring.ts']) {
      expect(strip(readFileSync(join(ROOT, f), 'utf8')), f).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie|fetch\(|sendBeacon|XMLHttpRequest|WebSocket|toDataURL|toBlob|MediaRecorder/);
    }
  });
});
