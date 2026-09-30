// MUSIC-SUITE P9 (2026-09-29): the Cypher's side of an Arena dance duel (lib/babylon/dance/arenaDance.ts) and its wiring in
// DanceMode.ts. Owner decision #10: "Arena dance (fixed): same house song for both players, accuracy-based score; own
// songs free play only". Proven here, in node: the duel id is read from ?arena= and nothing else; the ready screen names
// the house song and ONE ATTEMPT before any count-in; a finished list is kept on the device (checked as the server checks
// it) until the Arena has it; the score handed to the shell is judgeDanceSet's — or the Arena's own when it already had a
// set; a used attempt settles now (sent, on file, or 0); and THE ROOM'S RECORDING — every press and release the room's
// judge took, on the heard clock from beat 0, recorded at the room's one seam — rejudges to exactly the room's own judge,
// wherever beat 0 sits on the song clock and whatever the frame rate. DanceMode.ts is a Babylon file (no node run), so
// its wiring is held by source pins, as studioWiring.test.ts holds StudioMode's.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  arenaMatchFromQuery, arenaReadyHud, keepDanceFinish, readDanceFinish, clearDanceFinish, arenaDanceKey, arenaFinishEnd,
  arenaUsedEnd, arenaScoreWords, ARENA_DANCE_UNSENT_HINT, ARENA_DANCE_CHIP, ARENA_DANCE_NO_PAUSE, houseSongLine,
} from './arenaDance';
import {
  houseSongFor, houseSongSteps, houseSongTrack, houseSongEndSec, judgeDanceSet, dancePress, DANCE_ARENA_RULES, DANCE_ARENA_SCALE,
  type HousePress,
} from './houseSong';
import { DancePerformance, beatDuration, isPressHold, isFreeSlot, MISS_AFTER } from '../core/DanceCore';
import { pickBanner } from '../core/danceTracks';
import { padMove, type PressKey } from './freestyle';

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
function memStore(): { data: Map<string, string>; getItem: (k: string) => string | null; setItem: (k: string, v: string) => void; removeItem: (k: string) => void } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); }, removeItem: (k) => { data.delete(k); } };
}
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 0x100000000; };
}

describe('the duel is ?arena=, and the ready screen says the song and ONE ATTEMPT before any count-in', () => {
  it('reads the duel id the shell submits under, and nothing that is not one', () => {
    expect(arenaMatchFromQuery('?arena=cm_abc-123')).toBe('cm_abc-123');
    expect(arenaMatchFromQuery('?track=battle&arena=m1&free=1')).toBe('m1');
    for (const q of [null, undefined, '', '?track=battle', '?arena=', '?arena=has%20space', `?arena=${'x'.repeat(65)}`, '?arena=a/b']) {
      expect(arenaMatchFromQuery(q), String(q)).toBeNull();
    }
  });

  it('the ready HUD: the house song on the banner (never a pick), ONE ATTEMPT, START, and the rules line', () => {
    const house = houseSongFor('cm-ready');
    const hud = arenaReadyHud(house);
    expect(hud.banner).toBe(pickBanner(houseSongTrack(house)));
    expect(hud.round).toBe(ARENA_DANCE_CHIP);
    expect(ARENA_DANCE_CHIP).toMatch(/ONE ATTEMPT — USED AT START · LEAVING AFTER THAT SCORES 0/);
    // the dance host draws round / banner / nextStep and no hint — so the rule is on the chip, and the whole line rides along
    const host = src('components/games/timing-babylon.tsx');
    expect(host).toContain('{hnode(hud.round');
    expect(host).toContain('{hud.nextStep}');
    expect(hud.nextStep).toMatch(/START MY ONE ATTEMPT/);
    expect(hud.hint).toBe(DANCE_ARENA_RULES);
  });
});

describe('the set kept on the device until the Arena has it', () => {
  it('keeps, reads back (checked as the server checks it) and clears, per duel', () => {
    const store = memStore();
    const presses = [dancePress(0.5, { key: 'A', move: padMove('A') }), dancePress(0.62, { key: 'A', up: true })];
    expect(keepDanceFinish(store, 'm1', presses)).toBe(true);
    expect([...store.data.keys()]).toEqual([arenaDanceKey('m1')]);
    expect(readDanceFinish(store, 'm1')).toEqual(presses);
    expect(readDanceFinish(store, 'm2')).toBeNull();
    clearDanceFinish(store, 'm1');
    expect(readDanceFinish(store, 'm1')).toBeNull();
  });
  it('a kept list the server would refuse reads as nothing; no storage keeps nothing and throws nothing', () => {
    const store = memStore();
    store.setItem(arenaDanceKey('m1'), JSON.stringify([{ tMs: 'soon' }]));
    expect(readDanceFinish(store, 'm1')).toBeNull();
    store.setItem(arenaDanceKey('m1'), 'not json');
    expect(readDanceFinish(store, 'm1')).toBeNull();
    expect(keepDanceFinish(null, 'm1', [])).toBe(false);
    expect(readDanceFinish(undefined, 'm1')).toBeNull();
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } };
    expect(keepDanceFinish(broken, 'm1', [])).toBe(false);
    expect(readDanceFinish(broken, 'm1')).toBeNull();
    expect(() => clearDanceFinish(broken, 'm1')).not.toThrow();
  });
});

describe('the score handed to the shell is the one the server rejudges', () => {
  const house = houseSongFor('cm-end');
  const bd = beatDuration(house.bpm);
  const presses = houseSongSteps(house).filter((_, i) => i % 3 !== 0).map((s) => dancePress(s.beat * bd + 0.03, { key: 'A' }));
  it('the finish landed: judgeDanceSet\'s accuracy score, and a line that says it is the one the Arena checks', () => {
    const e = arenaFinishEnd(house, presses, { kind: 'sent', score: judgeDanceSet(house, presses).score });
    expect(e.score).toBe(judgeDanceSet(house, presses).score);
    expect(e.score).toBeLessThanOrEqual(DANCE_ARENA_SCALE);
    expect(e.line).toMatch(/the score the Arena checks/);
    expect(arenaFinishEnd(house, presses, { kind: 'sent', score: null }).score).toBe(e.score);   // an answer with no score
  });
  it('the Arena already had another list for this attempt (another tab): the score on file goes in', () => {
    const e = arenaFinishEnd(house, presses, { kind: 'sent', score: 1234 });
    expect(e.score).toBe(1234);
    expect(e.verdict.score).toBe(1234);
    expect(e.line).toMatch(/score on file/);
  });
  it('a USED attempt settles now: kept presses are sent first; a finished one\'s recorded score; a left one scores 0', () => {
    expect(arenaUsedEnd(house, presses, { finished: false, score: 0 })).toEqual({ kind: 'send', presses });
    const onFile = arenaUsedEnd(house, presses, { finished: true, score: judgeDanceSet(house, presses).score });
    expect(onFile).toMatchObject({ kind: 'end', end: { score: judgeDanceSet(house, presses).score } });
    if (onFile.kind === 'end') expect(onFile.end.verdict.counts).toEqual(judgeDanceSet(house, presses).counts);
    expect(arenaUsedEnd(house, null, { finished: true, score: 777 })).toMatchObject({ kind: 'end', end: { score: 777 } });
    const left = arenaUsedEnd(house, null, { finished: false, score: 0 });
    expect(left).toMatchObject({ kind: 'end', end: { score: 0 } });
    if (left.kind === 'end') expect(left.end.line).toMatch(/scores 0/);
  });
  it('says an Arena score as accuracy', () => {
    expect(arenaScoreWords(8237)).toBe('8,237 (82.37 % accuracy)');
    expect(arenaScoreWords(DANCE_ARENA_SCALE)).toBe('10,000 (100.00 % accuracy)');
    expect(ARENA_DANCE_UNSENT_HINT).toMatch(/SEND AGAIN/);
  });
});

/**
 * THE ROOM'S RECORDING, simulated exactly as DanceMode wires it: the judge started at beat 0's time on the song clock
 * (startAt), update() on every frame, a press judged at `heard` through judgePress (recorded as heard − startAt, with its
 * key and the pad's move) and a release through judgeRelease (only while a hold is down — recorded then). The rejudge of
 * the recorded list must be the room's own judgement.
 */
function roomRun(seed: string, hz: number, startAt: number, style: 'steady' | 'sloppy' | 'mash'): { live: ReturnType<DancePerformance['result']>; recorded: HousePress[] } {
  const house = houseSongFor(seed);
  const bd = beatDuration(house.bpm);
  const r = lcg(seed.length * 131 + hz);
  const perf = new DancePerformance(house.bpm);
  perf.setRoutine(houseSongSteps(house));
  perf.start(startAt);
  const recorded: HousePress[] = [];
  // the player's inputs on the heard clock: a down (key) and, later, its up
  const inputs: { at: number; key: PressKey; up: boolean }[] = [];
  const keys: PressKey[] = ['A', 'B', 'X', 'Y', 'R2', 'SPACE'];
  if (style === 'mash') {
    for (let t = startAt - 0.5; t < startAt + houseSongEndSec(house); t += 0.09 + r() * 0.12) {
      const key = keys[Math.floor(r() * keys.length)];
      inputs.push({ at: t, key, up: false }, { at: t + 0.05, key, up: true });
    }
  } else {
    for (const s of houseSongSteps(house)) {
      if (style === 'sloppy' && r() < 0.2) continue;
      const at = startAt + s.beat * bd + (r() - 0.5) * (style === 'steady' ? 0.06 : 0.3);
      const key: PressKey = isFreeSlot(s) ? keys[Math.floor(r() * 4)] : r() < 0.5 ? 'A' : 'R2';
      const holdFor = isPressHold(s) ? s.pressHoldBeats! * bd * (style === 'sloppy' && r() < 0.5 ? 0.3 : 1.05) : 0.07;
      inputs.push({ at, key, up: false }, { at: at + holdFor, key, up: true });
    }
  }
  inputs.sort((a, b) => a.at - b.at);
  const judgePress = (heard: number, key: PressKey) => {
    recorded.push(dancePress(heard - startAt, { key, move: padMove(key) }));
    perf.hit(heard, { key, move: padMove(key) });
  };
  const judgeRelease = (heard: number, key: PressKey) => {
    if (!perf.holding) return;
    recorded.push(dancePress(heard - startAt, { key, up: true }));
    perf.release(heard, key);
  };
  const end = startAt + houseSongEndSec(house);
  let i = 0;
  for (let f = startAt - 1 + r() / hz; f <= end + 1 / hz; f += 1 / hz) {
    while (i < inputs.length && inputs[i].at <= f) {
      const x = inputs[i++];
      // the room: before beat 0 a press is judged only inside beat 0's early window (countInTapReaches), a release while holding
      if (x.up) judgeRelease(x.at, x.key);
      else if (x.at >= startAt - MISS_AFTER) judgePress(x.at, x.key);
    }
    if (f >= startAt) perf.update(Math.min(f, end));
  }
  perf.update(end);
  return { live: perf.result(), recorded };
}

describe('the room records what its judge took, and the rejudge of that list IS the room\'s judgement', () => {
  it('any beat-0 time on the song clock, 30/60/144 Hz, steady / sloppy / mashing players, holds and freestyle picks', () => {
    let runs = 0;
    for (const seed of ['cm-a', 'cm-b', 'cm-c', 'cm-d', 'cm-e', 'cm-f', 'cm-g', 'cm-h']) {
      for (const hz of [30, 60, 144]) {
        for (const style of ['steady', 'sloppy', 'mash'] as const) {
          const startAt = 3.7 + runs * 1.913;   // beat 0 sits anywhere on the song clock (the READY card, a pause)
          const { live, recorded } = roomRun(seed, hz, startAt, style);
          // …and after the wire: what the room posts is what the server parses and judges
          const wire = JSON.parse(JSON.stringify(recorded)) as HousePress[];
          const re = judgeDanceSet(houseSongFor(seed), wire);
          expect(re.counts, `${seed} ${hz} Hz ${style}`).toEqual(live.counts);
          expect(re.score).toBe(Math.round(live.accuracy * DANCE_ARENA_SCALE));
          runs++;
        }
      }
    }
    expect(new Set(['cm-a', 'cm-b', 'cm-c', 'cm-d', 'cm-e', 'cm-f', 'cm-g', 'cm-h'].map((s) => houseSongFor(s).songId)).size).toBeGreaterThan(2);
    expect(runs).toBe(72);
  });
});

describe('DanceMode wires it (source pins — a Babylon file does not run in node)', () => {
  const room = src('lib/babylon/modes/DanceMode.ts');
  it('reads ?arena= at load, dances the house song\'s track and chart, and never the deep link, the pick screen or free dance', () => {
    expect(room).toContain('arenaMatchFromQuery(window.location.search)');
    // (MUSIC-SUITE P9 moves-and-pads: a dance card's `?card=` link joined the free-play fallbacks AFTER the arena branch —
    // an Arena run still dances its house song first, and cardPick is never read when `arena` is set)
    expect(room).toContain('track = arena ? houseSongTrack(arena.house) : deepLink ?? cardPick ?? trackById(DEFAULT_TRACK_ID);');
    expect(room).toContain("const cardId = arena || deepLink || typeof window === 'undefined' ? null : cardIdFromQuery(window.location.search);");
    expect(room).toContain('const mine = arena ? houseSongSteps(arena.house) : stepsFor(track);');
    expect(room).toContain('if (arena) freeDance = false;');
    expect(room).toMatch(/if \(arena\) \{ playPreview\(track\); showArenaReady\(ctx\); \} else showPick\(ctx\);/);
  });
  it('the ready screen takes only START, never starts itself, and START posts the attempt before any count-in', () => {
    expect(room).toMatch(/if \(arena\) \{\s+if \(e\.t === 'button' && e\.pressed && \(e\.btn === 'A' \|\| e\.btn === 'B'\)\) void startArena\(ctx\);\s+return;\s+\}/);
    expect(room).toMatch(/\/\/ MUSIC-SUITE P9 \(fair dance duels\): an Arena attempt never starts itself[^\n]*\n\s+if \(arena\) return;/);
    const start = room.slice(room.indexOf('async function startArena'), room.indexOf('async function sendArena'));
    expect(start.indexOf("phase: 'start'")).toBeGreaterThan(-1);
    expect(start.indexOf("phase: 'start'")).toBeLessThan(start.indexOf('beginCountIn(ctx)'));
    expect(start).toContain('SoundKit.unlock();');
    expect(start.indexOf('SoundKit.unlock();')).toBeLessThan(start.indexOf('await'));
  });
  it('every judged press and release goes on the list at the one seam, capped at the server\'s limit', () => {
    // (MUSIC-SUITE P9 FIX PASS: freeSlotNearest — the X / Y gate — is gone; the seam runs to freeDanceMove)
    const seam = room.slice(room.indexOf('function judgePress'), room.indexOf('function freeDanceMove'));
    expect(room.indexOf('function judgePress')).toBeLessThan(room.indexOf('function freeDanceMove'));
    expect(seam).toContain("recordArena(dancePress(heard - startAt, { key, move: padMove(key) }))");
    expect(seam).toContain("recordArena(dancePress(heard - startAt, { key, up: true }))");
    expect(seam).toContain('arena.presses.length >= DANCE_MAX_PRESSES');
    // the press is judged with the same key and move the list carries
    expect(seam).toContain('void perf.hit(heard, { key, move: padMove(key) });');
  });
  it('the end posts the list (kept on the device first) and hands the shell the Arena score, never the points total', () => {
    expect(room).toContain('if (arena) { void sendArena(ctx, arena.presses.slice(), performance.now()); return; }');
    const send = room.slice(room.indexOf('async function sendArena'), room.indexOf('function endArena'));
    expect(send.indexOf('keepDanceFinish(')).toBeLessThan(send.indexOf('await postAttempt'));
    expect(send).toContain("phase: 'finish', taps: presses");
    const end = room.slice(room.indexOf('function endArena'), room.indexOf('// ── the pick screen'));
    expect(end).toContain('ctx.end(v.stars >= 3 ? \'GREAT\' : \'GOOD\', end.score, stats)');
    expect(end).toContain('arenaScore: end.score');
  });
  it('an unsent set is sent again with A, read before the ended gate', () => {
    const on = room.slice(room.indexOf('onInput(ctx: ModeContext, e: FelInput) {'));
    expect(on.indexOf("arena?.phase === 'unsent'")).toBeLessThan(on.indexOf('if (ended) return;'));
  });
});

// ── MUSIC-SUITE P9 FIX PASS (2026-09-29) ─────────────────────────────────────────────────────────────────────────────
describe('P9 FIX PASS: the Arena run\'s edges', () => {
  const room = src('lib/babylon/modes/DanceMode.ts');

  it('no pause: the chip and the START overlay say so (P6\'s words), and the rules line does', () => {
    expect(ARENA_DANCE_CHIP).toMatch(/NO PAUSE/);
    expect(ARENA_DANCE_NO_PAUSE).toBe('An Arena set runs to its end — there is no pause');
    expect(src('lib/babylon/music/StudioMode.tsx')).toContain(`say('${ARENA_DANCE_NO_PAUSE}')`);   // the same words as music's
    expect(DANCE_ARENA_RULES).toMatch(/No pause/);
  });

  it('nothing after the set\'s end is judged or recorded (a stall at the end used to lose the whole list)', () => {
    const seam = room.slice(room.indexOf('function judgePress'), room.indexOf('function freeDanceMove'));
    expect(seam).toContain("if (arena.phase !== 'playing' || heard - startAt > houseSongEndSec(arena.house)) return;");
    expect(seam).toContain("if (arena && (arena.phase !== 'playing' || heard - startAt > houseSongEndSec(arena.house))) return;");
    // and the rule it spares: a press past the end + 1 s refuses the WHOLE list
    const h = houseSongFor('cm-end');
    const late = dancePress(houseSongEndSec(h) + 1.2, { key: 'A' });
    expect(judgeDanceSet(h, [late]).judgedPresses).toBe(0);
  });

  it('a start answer must be a DANCE start (it carries the song) before the room dances it', () => {
    const start = room.slice(room.indexOf('async function startArena'), room.indexOf('async function sendArena'));
    expect(start).toContain("arenaStartVerdict(res).kind === 'play' && !(res.body && typeof res.body.song === 'object')");
  });

  it('the lobby names a dance duel\'s house song (open challenges and your own duels), so both sides stake knowing it', () => {
    const id = 'cm-lobby-1';
    const h = houseSongFor(id);
    const line = houseSongLine(id);
    expect(line).toBe(`HOUSE SONG: ${houseSongTrack(h).name.toUpperCase()} · DIFFICULTY ${h.difficulty}/6 · ${h.bpm} BPM`);
    const lobby = src('components/arena-view.tsx');
    expect(lobby.split('houseSongLine(d.id)').length - 1).toBe(2);
    expect(lobby.split("canonicalModeKey(d.mode) === 'dance'").length - 1).toBe(2);
  });
});
