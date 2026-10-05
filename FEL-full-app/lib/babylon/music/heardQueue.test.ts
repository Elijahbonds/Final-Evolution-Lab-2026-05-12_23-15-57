// MUSIC-SUITE P10 (2026-09-29): song mode's section on screen when its bar is HEARD (P6: the lanes showed the next
// section's chart 233–255 ms early at 5 of 5 changes). Driven on the real AudioEngine over fakeWebAudio: the room's wiring
// (push on onStepScheduled, take on onStepAudible) replayed around a song-mode section change made on the bar line.
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HeardQueue, sectionShownOnSchedule } from './heardQueue';
import { FakeAudioBuffer, installFakeWebAudio, type FakeAudioContext, type FakeWebAudio } from './fakeWebAudio';
import { AudioEngine, type TrackState } from './AudioEngine';

describe('HeardQueue (pure)', () => {
  it('hands back the newest value heard by a time, and nothing before its first step is heard', () => {
    const q = new HeardQueue<string>();
    q.push(1.0, 'verse'); q.push(1.1, 'verse'); q.push(1.2, 'hook');
    expect(q.take(0.9)).toBeNull();
    expect(q.take(1.05)).toEqual({ v: 'verse' });
    expect(q.take(1.2)).toEqual({ v: 'hook' });
    expect(q.size).toBe(0);
  });
  it('a stop that drops scheduled steps unheard leaves stale entries that simply leave with the next heard step', () => {
    const q = new HeardQueue<string | null>();
    q.push(2.0, 'old'); q.push(2.1, 'old');          // scheduled, then STOP (never heard)
    q.push(5.0, 'new');                               // the next run
    expect(q.take(5.0)).toEqual({ v: 'new' });
  });
  it('caps what it holds', () => {
    const q = new HeardQueue<number>(4);
    for (let i = 0; i < 10; i++) q.push(i, i);
    expect(q.size).toBe(4);
    expect(q.take(100)).toEqual({ v: 9 });
  });
});

const BPM = 120, STEPS = 16, TICK = 0.025, BASE = 60 / BPM / 4, BAR = STEPS * BASE, LEAD = 0.05;
let fake: FakeWebAudio;
beforeEach(() => { fake = installFakeWebAudio(); });
afterEach(() => fake.uninstall());
const row = (id: string, hits: number[]): TrackState => ({ sampleId: id, pattern: Array.from({ length: STEPS }, (_, i) => hits.includes(i)), volume: 0.8, muted: false, pan: 0 });

describe('a section change on the bar line, as the room wires it', () => {
  it('the new section shows when the second bar\'s first step is HEARD — the old wiring showed it on the scheduler\'s bar line, early', () => {
    const eng = new AudioEngine({ bpm: BPM, steps: STEPS, swing: 0, tracks: [row('kick', [0, 4, 8, 12])] });
    eng.loadBuffer('kick', 'Kick', new FakeAudioBuffer(1, 441, 44100) as unknown as AudioBuffer, 'kick');
    const ctx = eng.context as unknown as FakeAudioContext;
    let sched: string | null = 'verse';
    const heard = new HeardQueue<string | null>();
    let shownNew: number | null = null, shownOld: number | null = null;
    // SongPanel's onBar: the chain says bar 2 is the HOOK (the old room set its picture right here)
    eng.onBar = (b) => { if (b === 1) { sched = 'hook'; if (shownOld === null) shownOld = ctx.currentTime; } };   // bar 0 is the first (begin → onBar(0))
    eng.onStepScheduled = (_s, t) => { heard.push(t, sched); };
    eng.onStepAudible = (_s, at) => { const h = heard.take(at); if (h?.v === 'hook' && shownNew === null) shownNew = ctx.currentTime; };
    ctx.currentTime = 0;
    eng.start();
    for (let k = 1; k * TICK <= 2 * BAR + 0.3; k++) { ctx.currentTime = k * TICK; fake.tick(); }
    eng.stop();
    const barLine = LEAD + BAR;                       // bar 2's first step on the audio clock
    expect(shownOld).not.toBeNull();
    expect(shownNew).not.toBeNull();
    expect(barLine - shownOld!).toBeGreaterThan(0.05);             // the old picture changed ahead of the ear
    expect(shownNew!).toBeGreaterThanOrEqual(barLine - 1e-9);      // the new one: not before the bar is heard…
    expect(shownNew! - barLine).toBeLessThanOrEqual(TICK + 1e-9);  // …and within one scheduler tick of it
    eng.dispose();
  });
  it('StudioMode feeds the queue on every scheduled step and reads it on every heard one', () => {
    const src = fs.readFileSync(path.resolve(__dirname, 'StudioMode.tsx'), 'utf8');
    expect(src).toContain('heardSectionRef.current.push(t, songSchedRef.current);');
    expect(src).toContain('const sec = heardSectionRef.current.take(heardAt);');
    expect(src).not.toContain('const songNowChanged = useCallback((id: string | null): void => { setSongNow(id); swapSectionChops(id); }');
  });
});

// MUSIC-SUITE P10 FIX (2026-09-29): the review's two edges of the deferral — SONG MODE switched on mid-play showed the
// chain's FIRST section until a step was heard (songNow null → shownSection's bar-0 fallback), and a STOP inside the
// lookahead after a bar line left the old section on screen while the engine held the new one.
describe('sectionShownOnSchedule: what waits for the ear, and what shows at once', () => {
  it('stopped: every change shows at once', () => {
    expect(sectionShownOnSchedule(null, 'B', false)).toBe('now');
    expect(sectionShownOnSchedule('A', 'B', false)).toBe('now');
    expect(sectionShownOnSchedule('A', null, false)).toBe('now');
  });
  it('playing: song mode switched ON shows its section at once (nothing section-shaped was on screen to run ahead of)', () => {
    expect(sectionShownOnSchedule(null, 'B', true)).toBe('now');
  });
  it('playing: a bar-line change between sections, and song mode OFF, still wait for the step to be heard (P6\'s fix)', () => {
    expect(sectionShownOnSchedule('A', 'B', true)).toBe('heard');
    expect(sectionShownOnSchedule('B', null, true)).toBe('heard');
    expect(sectionShownOnSchedule(null, null, true)).toBe('heard');
  });
  it('the room: songNowChanged asks it (and clears the queue when it shows at once); a stop shows what the engine holds', () => {
    const src = fs.readFileSync(path.resolve(__dirname, 'StudioMode.tsx'), 'utf8');
    expect(src).toContain("if (sectionShownOnSchedule(songNowRef.current, id, !!engineRef.current?.isRunning) === 'now') { heardSectionRef.current.clear(); setSongNow(id); }");
    const at = src.indexOf('useEffect(() => {\n    if (playing) return;\n    heardSectionRef.current.clear();\n    setSongNow(songSchedRef.current);');
    expect(at).toBeGreaterThan(0);
  });
});
