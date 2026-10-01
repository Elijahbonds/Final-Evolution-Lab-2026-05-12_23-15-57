// The Cypher's room decisions (lib/babylon/modes/danceRoomFlow.ts), in node — MUSIC-SUITE P2 FIX PASS (2026-09-25).
//
// Phase 2's pause, count back in, pick timeout and count-in latency were new behaviour with no vitest (nothing imports
// DanceMode: it builds a Babylon scene) — only the browser probe scripts/probes/_dance-p2-timing.mts drove them. The
// decisions now live in danceRoomFlow.ts and DanceMode calls them; here they run against the real SongClock and the real
// DancePerformance. The review's step-0 finding is pinned too: a tap 30 ms early on beat 0 was dropped in the count-in.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { holdAction, countBackFirstBeat, pickTimer, countInTapReaches, type RoomPhase } from './danceRoomFlow';
import { SongClock } from '../audio/SongClock';
import { DancePerformance, generateRoutine, beatDuration, MISS_AFTER, isPressHold } from '../core/DanceCore';
import { houseSongFor, houseSongSteps, judgeDanceSet, dancePress, houseSongEndSec, type HousePress, type HouseSong } from '../dance/houseSong';
import { trackById, PICK_TIMEOUT_SEC } from '../core/danceTracks';

const DANCE = readFileSync(join(process.cwd(), 'lib/babylon/modes/DanceMode.ts'), 'utf8');

describe('holdAction: when the song holds, and how it comes back', () => {
  const base = { ended: false, hidden: false, harnessPhase: 'playing', clockPaused: false, roomPhase: 'playing' as RoomPhase };

  it('holds on a hidden page or any harness phase but playing; nothing while it runs', () => {
    expect(holdAction(base)).toBe('none');
    expect(holdAction({ ...base, hidden: true })).toBe('pause');
    for (const p of ['paused', 'countdown', 'ready', 'ended']) expect(holdAction({ ...base, harnessPhase: p }), p).toBe('pause');
    expect(holdAction({ ...base, hidden: true, clockPaused: true })).toBe('none');       // already held
  });

  it('comes back by the room\'s phase: a count back in, a fresh count-in, or straight on', () => {
    const back = { ...base, clockPaused: true };
    expect(holdAction({ ...back, roomPhase: 'playing' })).toBe('resume-count-back');
    expect(holdAction({ ...back, roomPhase: 'countin' })).toBe('resume-rearm');
    expect(holdAction({ ...back, roomPhase: 'pick' })).toBe('resume');
    expect(holdAction({ ...back, hidden: true })).toBe('none');                          // still hidden: still held
  });

  it('a finished routine never holds or resumes', () => {
    expect(holdAction({ ...base, ended: true, hidden: true })).toBe('none');
    expect(holdAction({ ...base, ended: true, clockPaused: true })).toBe('none');
  });

  it('the count back starts on the first beat of the replayed bar', () => {
    const bd = beatDuration(96);
    const clock = new SongClock();
    clock.pause(10 + 5.3 * bd);                                                          // paused mid-beat 5
    clock.resume(20, 4 * bd);
    const s = clock.song(20);                                                            // one bar before the pause point
    expect(countBackFirstBeat(10, s, bd)).toBeCloseTo(10 + 2 * bd, 9);                  // beats 2, 3, 4, 5 click
    expect(countBackFirstBeat(10, 10 + 2 * bd, bd)).toBeCloseTo(10 + 2 * bd, 9);        // on a beat: that beat
  });

  it('DanceMode takes its decision from holdAction and countBackFirstBeat', () => {
    // (MUSIC-SUITE P9 FIX PASS: + `arena` — an Arena run's song never holds; the describe below)
    expect(DANCE).toContain('const act = holdAction({ ended, hidden, harnessPhase: ctx.phase(), clockPaused: clock.paused, roomPhase: phase, arena: !!arena });');
    expect(DANCE).toContain('kit?.countIn(clock.audio(countBackFirstBeat(startAt, s, bd)), 4);');
  });
});

describe('pickTimer: the pick screen starts a track itself only when nobody is choosing', () => {
  it(`starts after ${PICK_TIMEOUT_SEC} s untouched`, () => {
    let sec = 0, startedAt = -1;
    for (let f = 1; f <= 60 * 8 && startedAt < 0; f++) {
      const r = pickTimer(sec, { type: 'tick', dt: 1 / 60 }, PICK_TIMEOUT_SEC);
      sec = r.sec;
      if (r.start) startedAt = f / 60;
    }
    expect(startedAt).toBeCloseTo(PICK_TIMEOUT_SEC, 1);
  });

  it('every browse restarts the wait (P1: it started 6.07–6.28 s after wake while presses at +2, +4, +5.5 s browsed)', () => {
    let sec = 0, t = 0, startedAt = -1;
    const browses = [2, 4, 5.5];
    while (t < 20 && startedAt < 0) {
      t = Math.round((t + 1 / 60) * 1e6) / 1e6;
      if (browses.some((b) => Math.abs(b - t) < 1 / 120)) sec = pickTimer(sec, { type: 'browse' }, PICK_TIMEOUT_SEC).sec;
      const r = pickTimer(sec, { type: 'tick', dt: 1 / 60 }, PICK_TIMEOUT_SEC);
      sec = r.sec;
      if (r.start) startedAt = t;
    }
    expect(startedAt).toBeGreaterThan(5.5 + PICK_TIMEOUT_SEC - 0.05);
    expect(startedAt).toBeLessThan(5.5 + PICK_TIMEOUT_SEC + 0.05);
  });

  it('a bad frame time does not start it', () => {
    expect(pickTimer(1, { type: 'tick', dt: Number.NaN }, 6)).toEqual({ sec: 1, start: false });
    expect(pickTimer(1, { type: 'tick', dt: -5 }, 6)).toEqual({ sec: 1, start: false });
  });

  it('DanceMode browses and ticks through pickTimer', () => {
    expect(DANCE).toContain("pickSec = pickTimer(pickSec, { type: 'browse' }, PICK_TIMEOUT_SEC).sec;");
    // (MUSIC-SUITE P9 FIX PASS: `held` while the phone pad is being paired — the describe below)
    expect(DANCE).toContain("const pt = pickTimer(pickSec, { type: 'tick', dt, held: phonePadLink.armed() }, PICK_TIMEOUT_SEC);");
  });
});

describe('beat 0 can be hit early, in the count-in (review: dropped, then a MISS)', () => {
  /** The cypher track as DanceMode builds it: its generated routine starts on beat 0. */
  function cypher(): { perf: DancePerformance; bd: number } {
    const t = trackById('cypher');
    const perf = new DancePerformance(t.bpm);
    const routine = generateRoutine({ bars: t.bars, difficulty: t.difficulty, seed: t.seed });
    expect(routine[0].beat).toBe(0);
    perf.setRoutine(routine);
    return { perf, bd: beatDuration(t.bpm) };
  }

  it('countInTapReaches: only once armed, and only inside beat 0\'s early window', () => {
    expect(countInTapReaches({ countArmed: false, heard: 9.99, startAt: 10, missAfter: MISS_AFTER })).toBe(false);
    expect(countInTapReaches({ countArmed: true, heard: 10 - MISS_AFTER - 0.001, startAt: 10, missAfter: MISS_AFTER })).toBe(false);
    expect(countInTapReaches({ countArmed: true, heard: 10 - MISS_AFTER, startAt: 10, missAfter: MISS_AFTER })).toBe(true);
    expect(countInTapReaches({ countArmed: true, heard: 9.97, startAt: 10, missAfter: MISS_AFTER })).toBe(true);
    expect(countInTapReaches({ countArmed: true, heard: Number.NaN, startAt: 10, missAfter: MISS_AFTER })).toBe(false);
  });

  it('the review\'s timeline: 96 BPM, latency 16 ms, a tap 30 ms early on beat 0 is PERFECT, and beat 0 never expires a MISS', () => {
    const { perf, bd } = cypher();
    const latency = 0.016;
    const armedAt = 5;                                  // song time the count-in is armed
    const startAt = armedAt + 4 * bd;                   // beat 0
    perf.start(startAt);                                // DanceMode: at the arming, not at the flip
    const judged: string[] = [];
    perf.onJudged = (label) => { judged.push(label); };
    // the count-in frames: update() is not called in 'countin' (DanceMode returns before it), and nothing fires early anyway
    perf.update(startAt - 0.5 - latency);
    expect(judged).toEqual([]);
    // the tap: heard = startAt − 0.030, song = startAt − 0.014 — the room is still in 'countin'
    const heard = startAt - 0.030;
    expect(heard + latency).toBeLessThan(startAt);      // the song has not reached beat 0: still the count-in
    expect(countInTapReaches({ countArmed: true, heard, startAt, missAfter: MISS_AFTER })).toBe(true);
    expect(perf.hit(heard)).toBe('PERFECT');
    // the flip and the song: beat 0 is not fired again, and its window passes with no MISS
    for (let t = startAt; t < startAt + 0.5; t += 1 / 60) perf.update(t);
    expect(judged).toEqual(['PERFECT']);
    expect(perf.counts.MISS).toBe(0);
    expect(perf.combo).toBe(1);
  });

  it('a count-in tap earlier than that is the player counting along: not forwarded, never a wild MISS', () => {
    const { perf, bd } = cypher();
    const startAt = 5 + 4 * bd;
    perf.start(startAt);
    for (const heard of [5 + 0.1, 5 + bd, 5 + 2 * bd, startAt - 0.3]) {
      expect(countInTapReaches({ countArmed: true, heard, startAt, missAfter: MISS_AFTER }), String(heard)).toBe(false);
    }
    expect(perf.counts.MISS).toBe(0);
  });

  it('DanceMode starts the judge when the count-in is armed, forwards a count-in tap through countInTapReaches, and does not restart it at the flip', () => {
    const armed = DANCE.slice(DANCE.indexOf('if (!countArmed) {'), DANCE.indexOf('band?.start(startAt);'));
    expect(armed).toContain('readLatency();');
    expect(armed).toContain('perf.start(startAt);');
    const flip = DANCE.slice(DANCE.indexOf("phase = 'playing';"), DANCE.indexOf("phase = 'playing';") + 400);
    expect(flip).not.toMatch(/perf\.start\(/);
    // MUSIC-SUITE P9 (2026-09-29): every judged press now goes through ONE seam, judgePress (the key names a press hold's
    // release and a freestyle pick) — the count-in tap still reaches the judge only through countInTapReaches, and the
    // seam is still a plain perf.hit on the heard time it is given.
    expect(DANCE).toContain('if (countInTapReaches({ countArmed, heard: heardNow, startAt, missAfter: MISS_AFTER })) judgePress(heardNow, edge.down);');
    expect(DANCE).toContain('void perf.hit(heard, { key, move: padMove(key) });');
  });
});

describe('the room claims the audio session for itself and gives it back', () => {
  it('DanceMode claims at load and releases on dispose (SoundKit no longer sets it for every mode)', () => {
    expect(DANCE).toContain('releaseSession = claimPlaybackSession();');
    const dispose = DANCE.slice(DANCE.indexOf('dispose() {'));
    expect(dispose).toContain('releaseSession?.(); releaseSession = null;');
    const soundKit = readFileSync(join(process.cwd(), 'lib/babylon/audio/SoundKit.ts'), 'utf8');
    expect(soundKit).not.toMatch(/audioSession\.type\s*=/);
  });

  it('DanceMode reads the calibration through the shared reader (an undated pre-P2 offset is ignored)', () => {
    expect(DANCE).toContain('return loadRoomCalibration().offsetMs;');
    expect(DANCE).toContain("if (cal.stale) return 'Recalibrate: /play/calibrate (old reading ignored)';");
  });
});

// ── MUSIC-SUITE P9 FIX PASS (2026-09-29) ─────────────────────────────────────────────────────────────────────────────
describe('P9 FIX PASS: an Arena set runs to its end — there is no pause (owner decision #40, P6\'s Arena rule)', () => {
  const base = { ended: false, hidden: false, harnessPhase: 'playing', clockPaused: false, roomPhase: 'playing' as RoomPhase, arena: true };

  it('holdAction(arena): the count-in and the song never hold — START, a hidden tab, any harness phase; the ready screen holds as ever', () => {
    for (const roomPhase of ['countin', 'playing'] as RoomPhase[]) {
      expect(holdAction({ ...base, roomPhase }), roomPhase).toBe('none');
      expect(holdAction({ ...base, roomPhase, hidden: true }), roomPhase).toBe('none');
      for (const p of ['paused', 'countdown', 'ready', 'ended']) expect(holdAction({ ...base, roomPhase, harnessPhase: p }), `${roomPhase} ${p}`).toBe('none');
      expect(holdAction({ ...base, roomPhase, clockPaused: true, harnessPhase: 'paused' }), roomPhase).toBe('resume');   // never a count back
    }
    // the ready screen (nothing scheduled, the attempt not yet used): exactly as free play
    expect(holdAction({ ...base, roomPhase: 'pick', harnessPhase: 'paused' })).toBe('pause');
    expect(holdAction({ ...base, roomPhase: 'pick', clockPaused: true })).toBe('resume');
    // free play keeps its pause and its count back in
    expect(holdAction({ ...base, arena: false, harnessPhase: 'paused' })).toBe('pause');
    expect(holdAction({ ...base, arena: false, clockPaused: true })).toBe('resume-count-back');
    expect(holdAction({ ...base, ended: true, clockPaused: true })).toBe('none');
  });

  /** A house song on `songId` (the first of a few seeds that picks it). */
  const houseOn = (songId: string): HouseSong => {
    for (let i = 0; i < 400; i++) { const h = houseSongFor(`flow-${i}`); if (h.songId === songId) return h; }
    throw new Error(songId);
  };

  /**
   * The room, frame by frame at 120 Hz on the REAL SongClock, with its REAL hold decision, for a dancer who hears every step
   * `lateSec` late. `trick`: the phase review's exploit — START just after each beat (the step still pending), 3 s of
   * rest, resume, and press on the replayed beat as the count back in rolls it up to the line again. The list is what the
   * room records (a press only while the clock accepts — clock.accepting, as onInput reads it — on song time from beat 0).
   */
  function room(h: HouseSong, o: { arena: boolean; trick: boolean; lateSec?: number }): { presses: HousePress[]; backwards: boolean } {
    const bd = beatDuration(h.bpm);
    const late = o.lateSec ?? 0.15;
    const startAt = 1;                                                   // song time of beat 0 (the count-in before it)
    const times = houseSongSteps(h).map((st) => ({ t: startAt + st.beat * bd, hold: isPressHold(st) ? st.pressHoldBeats! * bd : 0 }));
    const clock = new SongClock();
    const presses: HousePress[] = [];
    const endSong = startAt + houseSongEndSec(h);
    let harness: 'playing' | 'paused' = 'playing', resumeAt = 0, i = 0, pausedFor = -1, lastSong = -Infinity, backwards = false;
    for (let a = 0; a < 20_000 && i < times.length; a += 1 / 120) {
      const act = holdAction({ ended: false, hidden: false, harnessPhase: harness, clockPaused: clock.paused, roomPhase: 'playing', arena: o.arena });
      if (act === 'pause') clock.pause(a);
      else if (act === 'resume-count-back') clock.resume(a, 4 * bd);
      else if (act === 'resume') clock.resume(a, 0);
      const s = clock.song(a);
      if (s < lastSong - 1e-9) backwards = true;
      lastSong = s;
      if (s > endSong) break;
      if (harness === 'paused') { if (a >= resumeAt) harness = 'playing'; continue; }   // presses are the harness's while it is paused
      const step = times[i];
      if (o.trick && pausedFor !== i && s >= step.t + late && s < step.t + MISS_AFTER) {
        pausedFor = i; harness = 'paused'; resumeAt = a + 3; continue;              // START, 3 s of rest
      }
      if (s > step.t + MISS_AFTER) { i++; continue; }                               // gone: the next step
      // the press: `late` after the beat — or, on the replayed bar, right on it (the count back in showed it coming)
      const aim = o.trick && pausedFor === i ? step.t : step.t + late;
      if (s >= aim && clock.accepting(a, MISS_AFTER)) {
        presses.push(dancePress(s - startAt, { key: 'A' }));
        presses.push(dancePress((step.hold ? s + step.hold + 0.02 : s + 0.08) - startAt, { key: 'A', up: true }));
        i++;
      }
    }
    return { presses: presses.sort((x, y) => x.tMs - y.tMs), backwards };
  }

  it('MEASURED AND CLOSED on CANALS: the late dancer scores the same whether or not they pause; the old room paid the pause 10,000', () => {
    const h = houseOn('canals');
    const straight = judgeDanceSet(h, room(h, { arena: true, trick: false }).presses).score;
    expect(straight).toBeGreaterThan(3_000);
    expect(straight).toBeLessThan(6_000);                                            // a steady 150 ms lag: GOODs, far from PERFECT
    // before the fix (free play's hold decision on a staked set): pause after every beat, hit the replayed beat
    const old = room(h, { arena: false, trick: true });
    expect(old.backwards).toBe(true);                                                // the song clock rewound on every resume
    expect(judgeDanceSet(h, old.presses).score).toBe(10_000);                        // the exploit, reproduced
    // the Arena now: the song never rewinds, and the pause buys nothing — every step it covers passes as a MISS
    const now = room(h, { arena: true, trick: true });
    expect(now.backwards).toBe(false);
    expect(judgeDanceSet(h, now.presses).score).toBeLessThanOrEqual(straight);
    console.info(`[P9 FIX pause] CANALS, 150 ms late: straight ${straight}; pausing after every beat — old room ${judgeDanceSet(h, old.presses).score}, Arena now ${judgeDanceSet(h, now.presses).score}`);
    // and a set danced without pausing is judged exactly as before: the arena flag changes nothing while nobody pauses
    expect(room(h, { arena: true, trick: false }).presses).toEqual(room(h, { arena: false, trick: false }).presses);
  });

  it('DanceMode passes arena to holdAction, keeps the judge on time under START\'s overlay, and says why nothing stopped', () => {
    expect(DANCE).toContain('if (act === \'none\') { if (arena) arenaRunsOn(ctx); return; }');
    const runsOn = DANCE.slice(DANCE.indexOf('function arenaRunsOn('), DANCE.indexOf('function arenaRunsOn(') + 900);
    expect(runsOn).toContain('ctx.setHud({ round: ARENA_DANCE_NO_PAUSE })');
    expect(runsOn).toContain('perf.update(heard);');
    expect(runsOn).toContain('finish(ctx);');
  });
});

describe('P9 FIX PASS: the pick screen waits while the phone pad is being paired', () => {
  it('a held tick never starts the song, and resets the wait; an unheld one counts as before', () => {
    expect(pickTimer(5.9, { type: 'tick', dt: 1, held: true }, 6)).toEqual({ sec: 0, start: false });
    expect(pickTimer(5.9, { type: 'tick', dt: 1, held: false }, 6)).toEqual({ sec: 6.9, start: true });
    expect(pickTimer(5.9, { type: 'tick', dt: 1 }, 6)).toEqual({ sec: 6.9, start: true });
  });
});
