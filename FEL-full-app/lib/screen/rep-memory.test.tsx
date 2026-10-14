// MIRROR step 2 (plan #6, FAULT REPLAY): the top priority's worst rep as a skeleton, adults only, page memory only.
// MIRROR-PLAN-REVIEW §4: no landmark sequence saved or sent, cleared on leave, and a test that the replay writes to
// no storage and no network. This file is that test, plus where the frames may and may not come from.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ResultsView } from '@/app/play/mirror/assess/_components/results-view';
import { FaultReplay } from '@/app/play/mirror/assess/_components/fault-replay';
import { gradeSession } from '@/lib/assess/runner';
import { cmj, kneeWall, ohsFront, ohsSide, singleLegSquat, syntheticCalibration } from '@/lib/assess/replay';
import { summarize } from './checks';
import { clearReplay, heldReplay, holdReplay, pickReplay } from './rep-memory';
import { REPLAY_NOTE, REPLAY_TITLE } from './copy';
import { AGE_BANDS, isKid, type AgeBand } from './age';

const ROOT = join(__dirname, '../..');
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8');
const cal = syntheticCalibration();
const graded = (kneeInL = 0) => gradeSession({
  calibration: cal, T1: { front: ohsFront({ kneeInL }).frames, side: ohsSide().frames },
  T2: { left: kneeWall('left').frames, right: kneeWall('right', { tibiaMax: 38.5 }).frames },
  T3: { left: singleLegSquat('left').frames, right: singleLegSquat('right').frames },
  T5: cmj([0, 1, 2].map(() => ({ heightM: 0.42 }))).frames,
});
const FLAGGED = graded(0.06);
const S = summarize(FLAGGED)!;
const view = (age: AgeBand | null, replay: ReturnType<typeof heldReplay>) =>
  renderToStaticMarkup(createElement(ResultsView, { summary: S, age, onClear: () => {}, onRunAgain: () => {}, replay }));

afterEach(() => { clearReplay(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('MIRROR step 2: the worst-rep skeleton', () => {
  it('the flagged screen has a priority and frozen frames to draw (so the rest is not vacuous)', () => {
    expect(S.priorities.length).toBeGreaterThan(0);
    expect(FLAGGED.tests.flatMap((t) => t.frozen).length).toBeGreaterThan(0);
  });

  it('holds a copy in page memory, and clears it', () => {
    holdReplay(FLAGGED.tests);
    const held = heldReplay()!;
    expect(held.length).toBe(FLAGGED.tests.flatMap((t) => t.frozen).length);
    expect(held[0].image).not.toBe(FLAGGED.tests.flatMap((t) => t.frozen)[0].image);
    clearReplay();
    expect(heldReplay()).toBeNull();
    holdReplay([]);
    expect(heldReplay()).toBeNull();
  });

  it('picks a frame of a metric the row reads, and nothing for a Green or unread row', () => {
    holdReplay(FLAGGED.tests);
    const row = S.checks.find((c) => c.id === S.priorities[0])!;
    const rep = pickReplay(heldReplay(), row);
    expect(rep).not.toBeNull();
    expect(['valgusLeft', 'valgusRight', 'trunkTibia', 'shoulderFlex', 'heelRise', 'depthKneeFlex', 'lateralShift', 'tibia', 'fppa', 'pelvicDrop', 'trunkLean', 'landingValgusLeft', 'landingValgusRight', 'landingFlex']).toContain(rep!.metric);
    expect(pickReplay(heldReplay(), { ...row, band: 'green' })).toBeNull();
    expect(pickReplay(heldReplay(), { ...row, band: null })).toBeNull();
    expect(pickReplay(null, row)).toBeNull();
    expect(pickReplay(heldReplay(), null)).toBeNull();
  });

  it('a sided row draws its worse side', () => {
    const frames = [
      { metric: 'tibia', side: 'left' as const, rep: 0, image: [], aspect: 1 },
      { metric: 'tibia', side: 'right' as const, rep: 1, image: [], aspect: 1 },
    ];
    expect(pickReplay(frames, { id: 'ktw.shinAngle', band: 'red', sides: { left: 'green', right: 'red' } })!.side).toBe('right');
    expect(pickReplay(frames, { id: 'ktw.shinAngle', band: 'yellow', sides: { left: 'yellow', right: 'green' } })!.side).toBe('left');
  });

  it('an adult sees it inside the top priority card only, with the caption', () => {
    holdReplay(FLAGGED.tests);
    const h = view('18+', heldReplay());
    const n = h.match(/data-fault-replay=/g)?.length ?? 0;
    expect(n).toBe(1);
    const card = h.split('<li').find((x) => x.includes('data-fault-replay'))!;
    expect(card).toContain('data-top-priority');
    expect(h).toContain(REPLAY_TITLE);
    expect(h).toContain(REPLAY_NOTE.replace(/'/g, '&#x27;'));
    expect(h).not.toMatch(/<img|<video|data:image/);
  });

  it('no frames, no replay; and never for a kid or an age not given', () => {
    expect(view('18+', null)).not.toContain('data-fault-replay');
    holdReplay(FLAGGED.tests);
    for (const a of [...AGE_BANDS, null]) if (isKid(a)) expect(view(a, heldReplay()), String(a)).not.toContain('data-fault-replay');
  });

  it('writes to no storage and no network while held, picked, drawn and cleared', () => {
    const touch = vi.fn();
    const store = { getItem: touch, setItem: touch, removeItem: touch, clear: touch, key: touch, length: 0 };
    vi.stubGlobal('localStorage', store);
    vi.stubGlobal('sessionStorage', store);
    vi.stubGlobal('fetch', touch);
    vi.stubGlobal('navigator', { sendBeacon: touch });
    holdReplay(FLAGGED.tests);
    const row = S.checks.find((c) => c.id === S.priorities[0])!;
    const rep = pickReplay(heldReplay(), row)!;
    renderToStaticMarkup(createElement(FaultReplay, { rep }));
    view('18+', heldReplay());
    clearReplay();
    expect(touch).not.toHaveBeenCalled();
  });

  it('source: the replay files name no storage, network or upload API', () => {
    for (const f of ['lib/screen/rep-memory.ts', 'app/play/mirror/assess/_components/fault-replay.tsx']) {
      const code = read(f).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(code, f).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie|fetch\(|sendBeacon|XMLHttpRequest|WebSocket|toDataURL|toBlob|postMessage|tabStorage|keepResult/);
    }
  });

  it('source: never in the summary; held only on the adult branch, after the kid and jump returns; cleared on leave', () => {
    expect(JSON.stringify(S)).not.toMatch(/image|aspect|frozen/);
    const app = read('app/play/mirror/assess/_components/assess-app.tsx');
    const hold = app.indexOf('holdReplay(');
    expect(hold).toBeGreaterThan(app.indexOf("setPhase('jumpResult')"));
    expect(hold).toBeGreaterThan(app.indexOf("setPhase('kidResults')"));
    expect(hold).toBeLessThan(app.indexOf('router.replace(RESULTS_PATH)'));
    expect(app.indexOf('clearReplay();')).toBeLessThan(app.indexOf("setPhase('jumpResult')"));
    const page = read('app/play/mirror/assess/_components/results-page.tsx');
    expect(page).toMatch(/return \(\) => \{ clearReplay\(\); \}/);
    expect(page).toMatch(/const clear = \(\) => \{\s*clearReplay\(\);/);
  });
});
