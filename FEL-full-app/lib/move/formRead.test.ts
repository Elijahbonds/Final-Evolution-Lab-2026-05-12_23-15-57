// HOOPS BODY (2026-10-07, Mirror & coaching Phase 7) — P10's FORM block: the reads a body run leaves on the 3PT, Dunk and
// fight end cards (lib/move/formRead), on the recorded takes (the jump shots, the owner's dunks, a CMU boxing take) and
// synthesized streams (a set shot: no jump to read). Unread reads stay "unread", never 0; the server's own bound keeps
// every attempt the reader makes; nothing is sent for a minor or an age the page cannot show is 18+.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { BODY_PROFILES } from '@/lib/input/bodyProfiles';
import { standFrame, STAND_SEC, SPLICE_MS } from '@/lib/pose/grade';
import type { PoseFrame } from '@/lib/pose/landmarks';
import { bodyPackets } from '@/lib/pose/seamReplay';
import { hold, holdStill, script } from '@/lib/pose/streamKit';
import { synthesize, type PoseFixture } from '@/lib/pose/synth';
import { takeOfFixture, type FightFixture } from '@/lib/pose/fightTakes';
import { lockAge, forgetAgeForTests, type StorageLike } from '@/lib/screen/store';
import { setBodyPlayDobYear } from './bodyPlayGrownUp';
import { boundFormSummary, jumpConsistent, type FormSummary } from './formSummary';
import { FormReader, FORM_KIND_BY_MODE, UNREAD, formForPost, formLines, formReadStore, inSpec, type FormView } from './formRead';
import { REST, setShotBeat, shotBeat } from './hoopsStreams';
import { FormBlockView } from '@/components/games/form-block';

const ROOT = join(__dirname, '..', '..');
const FX = join(ROOT, 'lib/pose/__fixtures__');
const load = (n: string) => JSON.parse(readFileSync(join(FX, `${n}.json`), 'utf8')) as PoseFixture;
const OWNER_STAND = load('stand_still').frames[70];
function take(name: string): PoseFrame[] {
  const fx = load(name);
  const st = standFrame(fx, fx.source.kind === 'deepmotion' ? OWNER_STAND : undefined);
  const lead = holdStill(st.frame, { sec: STAND_SEC, fps: fx.settings.synth.fps, beforeT: fx.frames[0].t });
  return [...lead, ...fx.frames.filter((f) => f.t >= fx.frames[0].t + SPLICE_MS)];
}
const shoot = (beats: Parameters<typeof script>[0]): PoseFrame[] => synthesize(script(beats), { seed: 17, fps: 30 }).frames;

function readAll(mode: string, frames: readonly PoseFrame[]): FormSummary {
  const r = new FormReader(mode, FORM_KIND_BY_MODE[mode]);
  for (const p of bodyPackets(frames)) r.feed(p.read, p.events);
  r.finish();
  return r.summary();
}
const mem = (): StorageLike => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); }, key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } };
};

describe('the 3PT: a shot\'s reads', () => {
  it('the recorded jump shot: one attempt, its jump and release read, every number one the server keeps', () => {
    const s = readAll('threepoint', take('jumpshot'));
    expect(s.attemptCount).toBe(1);
    const a = s.attempts[0];
    expect(a.kind).toBe('shot');
    expect(a.label).toBe('JUMP SHOT');
    expect(a.takeoff).toBe('two');
    const r = a.reads as Record<string, number | null>;
    expect(r.heightCm).toBeGreaterThan(30);
    expect(jumpConsistent(r.heightCm!, r.flightMs!)).toBe(true);   // one measurement: the server keeps the pair
    expect(r.releaseVsApexMs).toBeLessThan(-100);                   // released on the way up (the reader: −170 ms)
    expect(r.dipCm).toBeGreaterThan(5);
    const bound = boundFormSummary(s, { mode: 'threepoint' });
    expect(bound.issues).toEqual([]);
    expect(bound.form?.attempts).toHaveLength(1);
  });

  it('a set shot: no jump to read, so the jump, the flight and the release-vs-top are UNREAD — null, never 0', () => {
    const s = readAll('threepoint', shoot([hold(REST, 1.2), setShotBeat('Right').beat, hold(REST, 0.8)]));
    expect(s.attemptCount).toBe(1);
    const r = s.attempts[0].reads as Record<string, number | null>;
    expect(s.attempts[0].label).toBe('SET SHOT');
    expect(r.heightCm).toBeNull();
    expect(r.flightMs).toBeNull();
    expect(r.releaseVsApexMs).toBeNull();
    expect(r.dipCm).toBeNull();
    const lines = formLines(s, 'shot');
    for (const label of ['Release vs the top of the jump', 'Jump', 'Dip']) {
      const l = lines.find((x) => x.label === label)!;
      expect(l.value, label).toBe(UNREAD);
      expect(l.read, label).toBe(false);
    }
    expect(lines.every((l) => !/^0 (cm|ms)$/.test(l.value))).toBe(true);
    expect(boundFormSummary(s, { mode: 'threepoint' }).issues).toEqual([]);
  });

  it('synthesized shots: the block says when they let go against the top', () => {
    const s = readAll('threepoint', shoot([hold(REST, 1.2), shotBeat({ releaseVsApexSec: -0.12 }).beat, hold(REST, 0.4), shotBeat({ releaseVsApexSec: 0.1 }).beat, hold(REST, 0.8)]));
    expect(s.attemptCount).toBe(2);
    const rel = s.attempts.map((a) => (a.reads as Record<string, number | null>).releaseVsApexMs!);
    expect(rel[0]).toBeLessThan(-80);
    expect(rel[1]).toBeGreaterThan(50);
    const l = formLines(s, 'shot').find((x) => x.label === 'Release vs the top of the jump')!;
    expect(l.read).toBe(true);
    expect(l.value).toMatch(/ms (before|after) the top|on the top/);
  });
});

describe('the Dunk: the book\'s reads', () => {
  it('the owner\'s two-foot dunk: one jump, ~0.9 m measured off its flight, kept by the server; the approach dunk reads its penultimate', () => {
    const s = readAll('dunk', take('dunk_elijah_two_foot'));
    expect(s.attemptCount).toBe(1);
    const r = s.attempts[0].reads as Record<string, number | null>;
    expect(r.heightCm).toBeGreaterThan(80);
    expect(r.heightCm).toBeLessThan(110);
    expect(jumpConsistent(r.heightCm!, r.flightMs!)).toBe(true);
    expect(boundFormSummary(s, { mode: 'dunkContest' }).issues).toEqual([]);
    const lines = formLines(s, 'jump');
    expect(lines.find((x) => x.label === 'Best jump')!.value).toMatch(/^\d+ cm$/);
    const approach = readAll('dunk', take('dunk_approach_two_foot'));
    expect((approach.attempts[0].reads as Record<string, number | null>).penultimateDropCm).toBeGreaterThan(5);
  });

  it('a stand reads nothing: no attempt, and the store shows no block', () => {
    expect(readAll('dunk', take('stand_still')).attemptCount).toBe(0);
  });
});

describe('the fights: a strike\'s reads', () => {
  it('a recorded boxing take (CMU 80_10, jabs and crosses): an attempt per blow, its hand speed read', () => {
    const fx = JSON.parse(readFileSync(join(FX, 'fight', 'boxing_80_10.json'), 'utf8')) as FightFixture;
    const frames = synthesize(takeOfFixture(fx).clip, { fps: 30, seed: 4, latencyMs: 140 }).frames;
    const s = readAll('karate-vs', frames);
    expect(s.attemptCount).toBeGreaterThanOrEqual(8);
    expect(s.attempts.every((a) => a.kind === 'strike')).toBe(true);
    expect(s.attempts.map((a) => a.label)).toContain('JAB');
    const speeds = s.attempts.map((a) => (a.reads as Record<string, number | null>).handSpeedMps).filter((v): v is number => v !== null);
    expect(speeds.length).toBeGreaterThan(4);
    expect(boundFormSummary(s, { mode: 'karate_vs' }).issues).toEqual([]);
    const line = formLines(s, 'strike').find((x) => x.label === 'Hand speed')!;
    expect(line.value).toMatch(/m\/s$/);
    // no kick in the take: its chamber is unread, never 0
    expect(formLines(s, 'strike').find((x) => x.label.startsWith('Kick chamber'))!.value).toBe(UNREAD);
  });

  it('every fight and the 3PT and Dunk are keyed by the mode ids the harness knows', () => {
    const ids = new Set(Object.values(BODY_PROFILES).map((p) => p.modeId));
    for (const k of Object.keys(FORM_KIND_BY_MODE)) expect(ids.has(k), k).toBe(true);
    expect(FORM_KIND_BY_MODE.onevone).toBeUndefined();   // the block is the plan's three: 3PT, Dunk, the fights
  });
});

describe('a read outside what a body produces is unread, not clamped', () => {
  it('inSpec', () => {
    expect(inSpec('heightCm', 300)).toBeNull();
    expect(inSpec('heightCm', 2)).toBeNull();
    expect(inSpec('heightCm', 45.678)).toBe(45.68);
    expect(inSpec('releaseVsApexMs', -5000)).toBeNull();
    expect(inSpec('dipCm', null)).toBeNull();
    expect(inSpec('dipCm', Number.NaN)).toBeNull();
  });
});

describe('the run\'s store and the block', () => {
  afterEach(() => { formReadStore.reset(); setBodyPlayDobYear(undefined); forgetAgeForTests(); });

  function tapAll(mode: string, runId: number, frames: readonly PoseFrame[]): void {
    for (const p of bodyPackets(frames)) formReadStore.tap(mode, runId, p.read, p.events);
  }

  it('reads this run only: another run\'s card shows nothing; a game with no block is not read', () => {
    tapAll('threepoint', 7, take('jumpshot'));
    expect(formReadStore.finishRun(8)).toBeNull();
    const v = formReadStore.finishRun(7)!;
    expect(v.kind).toBe('shot');
    expect(v.head).toBe('1 shot read');
    formReadStore.reset();
    tapAll('onevone', 9, take('jumpshot'));
    expect(formReadStore.finishRun(9)).toBeNull();
  });

  it('nothing leaves the page for a minor or an unknown age; a known adult\'s read goes to the server\'s own gate', () => {
    tapAll('threepoint', 3, take('jumpshot'));
    const v = formReadStore.finishRun(3)!;
    const now = new Date('2026-10-07T00:00:00Z');
    expect(formForPost(v, null, now)).toBeNull();                          // no age at all
    const minor = mem(); lockAge(minor, '13-17');
    expect(formForPost(v, minor, now)).toBeNull();
    forgetAgeForTests();
    const adult = mem(); lockAge(adult, '18+');
    setBodyPlayDobYear(2012);                                               // an account year that still reads as a minor wins
    expect(formForPost(v, adult, now)).toBeNull();
    setBodyPlayDobYear(undefined);
    expect(formForPost(v, adult, now)?.attempts).toHaveLength(1);
    // a read with no number in it is not sent at all
    const empty: FormView = { ...v, summary: { ...v.summary, attempts: v.summary.attempts.map((a) => ({ ...a, reads: Object.fromEntries(Object.keys(a.reads).map((k) => [k, null])) })) as FormSummary['attempts'] } };
    expect(formForPost(empty, adult, now)).toBeNull();
  });

  it('the block shows every line, "unread" where the camera could not read, and says when it stays on the device', () => {
    tapAll('threepoint', 4, shoot([hold(REST, 1.2), setShotBeat('Right').beat, hold(REST, 0.8)]));
    const v = formReadStore.finishRun(4)!;
    const html = renderToStaticMarkup(createElement(FormBlockView, { view: v, onDevice: true }));
    expect(html).toContain('data-form-block="shot"');
    expect(html).toContain('data-form-line="unread"');
    expect(html).toContain(UNREAD);
    expect(html).not.toMatch(/>0 cm</);
    expect(html).toContain('Kept on this device only');
    expect(renderToStaticMarkup(createElement(FormBlockView, { view: v, onDevice: false }))).not.toContain('Kept on this device only');
  });

  it('is wired: the harness taps a driven mode in play past the START latch, and the end screen mounts the block', () => {
    const harness = readFileSync(join(ROOT, 'lib/babylon/core/ModeHarness.ts'), 'utf8');
    expect(harness).toContain('if (seam.drives && !s.latched) formReadStore.tap(def.modeId, sessionStore.record()?.runId ?? 0, p.read, p.events);');
    const end = readFileSync(join(ROOT, 'components/games/end-screen/end-screen.tsx'), 'utf8');
    expect(end).toContain('<FormBlock />');
    const block = readFileSync(join(ROOT, 'components/games/form-block.tsx'), 'utf8');
    expect(block).not.toMatch(/localStorage|fetch\(/);   // the block keeps nothing and sends nothing
  });
});
