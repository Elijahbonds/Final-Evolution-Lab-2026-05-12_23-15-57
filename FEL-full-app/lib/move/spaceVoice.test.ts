import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SpaceVoice, SAY_GAP_MS, SAY_REPEAT_MS, SAY_STABLE_MS } from './spaceVoice';
import { SpaceCheck, SPACE_COACH_IDS, type SpaceInstruction, type SpaceStage, type SpaceState } from './spaceCheck';
import { synthesize } from '../pose/synth';
import { spaceSession } from '../pose/streamKit';

// MOVEMENT PLAY P4 (2026-09-25): when the Coach says the space check's lines. The bank is the real one's clip ids
// (public/audio/voice/v1/coach/coach.json), so a line renamed there without its takes goes quiet here first.

const BANK_FILE = join(__dirname, '..', '..', 'public', 'audio', 'voice', 'v1', 'coach', 'coach.json');
const BANK: ReadonlySet<string> = new Set(
  (JSON.parse(readFileSync(BANK_FILE, 'utf8')) as { lines: { id: string }[] }).lines.map((l) => `coach/${l.id}`),
);

const ins = (id: string, rule: SpaceInstruction['rule'] = 'tooClose'): SpaceInstruction =>
  ({ id: id as SpaceInstruction['id'], rule, text: id, short: id, voiced: id.startsWith('coach.') });
const st = (t: number, id: string, stage: SpaceStage = 'frame', rule?: SpaceInstruction['rule']): Pick<SpaceState, 't' | 'instruction' | 'stage'> =>
  ({ t, instruction: ins(id, rule), stage });
/** Feed a script of [from ms, id, stage, rule] at 30 Hz up to `end`; the clips said, with their times. */
function speak(v: SpaceVoice, script: [number, string, SpaceStage?, SpaceInstruction['rule']?][], end: number, bank = BANK) {
  const out: [number, string][] = [];
  for (let t = 0; t <= end; t += 1000 / 30) {
    const cur = [...script].reverse().find(([from]) => t >= from)!;
    const c = v.next(st(t, cur[1], cur[2] ?? 'frame', cur[3]), bank);
    if (c) out.push([Math.round(t), c]);
  }
  return out;
}

describe('the Coach says the space check', () => {
  it('every voiced instruction has rendered takes in the bank', () => {
    for (const id of SPACE_COACH_IDS) expect([...BANK].some((c) => c.startsWith(`coach/${id}.`)), id).toBe(true);
  });

  it('a line is said only once it has held SAY_STABLE_MS', () => {
    const v = new SpaceVoice();
    // a verdict that flickers every 300 ms is never said
    const flicker = speak(v, [[0, 'coach.space.back'], [300, 'coach.space.closer'], [600, 'coach.space.back'], [900, 'coach.space.closer'], [1200, 'coach.space.back']], 1400);
    expect(flicker).toEqual([]);
    const said = speak(new SpaceVoice(), [[0, 'coach.space.back']], 2000);
    expect(said).toHaveLength(1);
    expect(said[0][0]).toBeGreaterThanOrEqual(SAY_STABLE_MS);
    expect(said[0][0]).toBeLessThan(SAY_STABLE_MS + 34);
  });

  it('never two lines closer than SAY_GAP_MS', () => {
    const said = speak(new SpaceVoice(), [[0, 'coach.space.back'], [700, 'coach.space.left'], [1400, 'coach.space.feet']], 8000);
    expect(said.map((s) => s[1].replace(/\.\d+$/, ''))).toEqual(['coach/coach.space.back', 'coach/coach.space.feet']);
    expect(said[1][0] - said[0][0]).toBeGreaterThanOrEqual(SAY_GAP_MS);
  });

  it('a line that holds is said once; again only after it changed, came back, and SAY_REPEAT_MS has passed', () => {
    expect(speak(new SpaceVoice(), [[0, 'coach.space.back']], 30000)).toHaveLength(1);
    const v = new SpaceVoice();
    const said = speak(v, [[0, 'coach.space.back'], [3000, 'coach.space.closer'], [6000, 'coach.space.back'], [12000, 'coach.space.closer'], [13000, 'coach.space.back']], 16000)
      .map(([t, c]) => [t, c.replace(/\.\d+$/, '')] as const);
    // back at 0.6 s; closer at 3.6 s; back again from 6 s, but not before 8 s after the first (8.6 s); closer again at
    // 12.6 s (9 s after its first); back at 13 s is only 4.4 s after it was last said: not again
    expect(said.map((s) => s[1])).toEqual(['coach/coach.space.back', 'coach/coach.space.closer', 'coach/coach.space.back', 'coach/coach.space.closer']);
    expect(said[2][0] - said[0][0]).toBeGreaterThanOrEqual(SAY_REPEAT_MS);
    expect(said[2][0] - said[0][0]).toBeLessThan(SAY_REPEAT_MS + 34);
    expect(said[3][0]).toBeGreaterThanOrEqual(12000 + SAY_STABLE_MS);
  });

  it('the opening line once per run, "all set" once each time the check gets there', () => {
    const v = new SpaceVoice();
    const said = speak(v, [
      [0, 'coach.space.intro', 'frame', 'intro'], [3000, 'coach.space.arms', 'arms', 'arms'], [6000, 'coach.space.intro', 'frame', 'intro'],
      [16000, 'coach.space.ready', 'ready', 'ready'], [20000, 'coach.space.still', 'still', 'still'], [23000, 'coach.space.ready', 'ready', 'ready'],
    ], 30000).map(([, c]) => c.replace(/\.\d+$/, ''));
    expect(said.filter((c) => c === 'coach/coach.space.intro')).toHaveLength(1);
    expect(said.filter((c) => c === 'coach/coach.space.ready')).toHaveLength(2);
    v.reset();
    expect(speak(v, [[0, 'coach.space.intro', 'frame', 'intro']], 1000).map(([, c]) => c)).toHaveLength(1);
  });

  it('the rendered takes take turns', () => {
    const v = new SpaceVoice();
    const said = speak(v, [
      [0, 'coach.space.back'], [2000, 'coach.space.closer'], [10000, 'coach.space.back'], [12000, 'coach.space.closer'], [20000, 'coach.space.back'],
    ], 24000).map(([, c]) => c).filter((c) => c.startsWith('coach/coach.space.back'));
    expect(said).toEqual(['coach/coach.space.back.01', 'coach/coach.space.back.02', 'coach/coach.space.back.03']);
  });

  it('lines the Coach has no take for are never said, and a missing bank is silence', () => {
    expect(speak(new SpaceVoice(), [[0, 'space.turn', 'frame', 'turned']], 5000)).toEqual([]);
    expect(speak(new SpaceVoice(), [[0, 'space.one', 'frame', 'swap']], 5000)).toEqual([]);
    expect(speak(new SpaceVoice(), [[0, 'coach.space.back']], 5000, new Set())).toEqual([]);
  });

  it('on a real check (stand → reach → stand): the opening line, the reach, "all set" — each once', () => {
    const frames = synthesize(spaceSession({ end: 9 }), { camera: { distance: 3.6, heightM: 1.2 }, seed: 11 }).frames;
    const c = new SpaceCheck(), v = new SpaceVoice();
    const said = frames.map((f) => v.next(c.push(f), BANK)).filter((x): x is string => !!x).map((x) => x.replace(/\.\d+$/, ''));
    expect(said[0]).toBe('coach/coach.space.intro');
    expect(said).toContain('coach/coach.space.ready');
    expect(new Set(said).size).toBe(said.length);
  });
});
