// hostVoice — the shared, PURE half of a room's own single-voice host (MUSIC-SUITE P8, 2026-09-25): Stoop in the Cypher
// (lib/babylon/modes/DanceMode.ts) and Professor Okta in the Groove Academy (lib/babylon/music/StudioMode.tsx). Neither
// is hoops: they do not go through CAST / MicDirector / ModeMic (THE MIC's court-booth-crowd-players machinery), the
// same "own contract" shape BRAINBRAWL-RESIDUAL's bb_host used (scripts/mic/build-brainbrawl-voice.mts, DOC VOLT) —
// one voice, one line at a time, no booth fight, no crowd. What IS shared with THE MIC: the rendered-bank format
// (VoiceKit already plays it), the script rules (scriptRules.lintLine, against the DANCE_MOMENTS / ACADEMY_MOMENTS
// word limits in moments.ts) and the voice bus (SoundKit's voiceBus — VoiceKit routes into it either way).
//
// (VOICEOVER 2026-10-06: pickHostLine's shuffle bag reads lineMemory's device copy, a typeof-guarded localStorage read that
// is an in-memory bag in node.) This file touches no window / AudioContext / fetch — every export here runs the same in a vitest node environment
// as in the browser, so the room-mode files (which DO touch VoiceKit / the DOM) can be exercised through these pure
// functions without mocking Web Audio. The task's four owner rules, each a pure decision here:
//   · NEVER REPEATS THE SAME LINE TWICE IN A ROW — pickHostLine (same rotation as brainBrawlLines.pickFrom).
//   · A PER-RUN SEED, NOT A FIXED ONE — ModeMic.ts's own comment names the bug this avoids: "a fixed seed opened every
//     session with the same shouts". newRunSeed reads Date.now(), never a constant.
//   · NEVER TALKS OVER A JUDGE WINDOW — inJudgeWindow / SpeechQueue: "wait for a gap" (the task's own second option,
//     alongside ducking under a note), chosen because it is exactly decidable from a clock and a list of windows, with
//     no audio graph or gain automation needed to test it.
//   · CAPTIONS FOR EVERY VOICED LINE — hostCaption turns a line into the {mic, micWho} pair the shared caption layer
//     (components/games/mic-caption.tsx's <MicCaption>) already knows how to draw; the room sets it whether or not
//     the clip actually plays (muted, no bank yet, no Web Audio at all), same as ModeMic.showCaption.

import { deviceLineMemory } from '../voice/lineMemory';

/** One rendered (or about-to-be-rendered) line. Shape matches MicLine (id/moment/text) minus the hoops-only tier/tags,
 *  so a HostLine can be linted with scriptRules.lintLine unchanged. */
export interface HostLine {
  id: string;
  moment: string;
  text: string;
}

/** A room's single voice: its render identity (Kokoro mix + rate — tools/voice/render-mic.py's job shape) and where
 *  its banks live under public/audio/voice/v1/<id>/. */
export interface HostCast {
  id: string;
  name: string;
  /** The bank group this voice's lines render into (one file: public/audio/voice/v1/<id>/<group>.<hash>.bin). A
   *  single-voice room needs only one group — there is no "shared" bank to also fetch, unlike a hoops MC. */
  group: string;
  voice: { mix: readonly (readonly [string, number])[]; speed: number };
}

/** One of `pool`, never the one said last time — same rotation as brainBrawlLines.pickFrom, generalised to anything
 *  with an `id` (a HostLine) instead of a plain string, and to `lastId` (a moment can remember "the last line's id"
 *  without keeping the line object itself, which is how DanceMode's/StudioMode's own lastSaid map works).
 *
 *  VOICEOVER (2026-10-06): and now a SHUFFLE BAG (lineMemory.ts): every line of the pool once before any line again, the round
 *  remembered on this device across runs. "Never twice in a row" alone let a four-line pool play the same two all night (the
 *  owner's "too repetitive"). The bag is keyed by the pool (its first id's family and its size), so the call sites in the rooms
 *  are unchanged. The device memory is a guarded localStorage read, absent in node: there it is an in-memory bag. */
export function pickHostLine<T extends { id: string }>(pool: readonly T[], rnd: () => number, lastId?: string): T {
  if (pool.length === 0) throw new Error('pickHostLine: empty pool');
  if (pool.length === 1) return pool[0];
  const mem = deviceLineMemory();
  const key = `host|${pool[0].id.replace(/\.\d+$/, '')}|${pool.length}`;
  let chosen = mem.pick(key, pool, rnd, (l) => (l.id === lastId ? 0 : 1));
  if (chosen.id === lastId) { const rest = pool.filter((l) => l.id !== lastId); chosen = rest[Math.floor(rnd() * rest.length) % rest.length]; }
  mem.mark(key, chosen.id);
  return chosen;
}

/** A tiny seeded PRNG (mulberry32 — the same algorithm BrainBrawlCore.mulberry32 and lib/pose/synth.ts's own copy
 *  use), kept local here rather than imported from either: this module must stay free of any coupling to the party
 *  game or the pose pipeline, and the algorithm is four lines. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fresh seed for one run of a room (call once per load(), never a constant — see the file header's second rule). */
export function newRunSeed(): number { return Date.now() % 2147483647; }

/** A span of the room's own clock the host must not START a new line inside — a judged note's flash, a big score
 *  reveal, anything with its own sting the voice would otherwise talk over. `from`/`to` are in the same clock the
 *  caller polls with (DanceMode: song-heard seconds; StudioMode: the set's own seconds). */
export interface JudgeWindow { from: number; to: number }

/** True when `t` falls inside any window, widened by `pad` seconds on each side. */
export function inJudgeWindow(t: number, windows: readonly JudgeWindow[], pad = 0): boolean {
  return windows.some((w) => t >= w.from - pad && t < w.to + pad);
}

/**
 * A line waiting for a clear gap to speak. `push` queues it (replacing anything still waiting — a newer event wins,
 * same as ModeMic's `pending`); `poll` is called every tick with the room's current clock and its live judge windows,
 * and returns the line exactly once, on the first tick where the ENTIRE span the line would speak (`[now, now+sec]`)
 * clears every window — not just the instant `now`, so a line is never handed out only to run into a window a beat
 * later. A line that waited past `maxWaitSec` (a gap that never came — a long streak of tight judge windows) is
 * dropped: silence beats talking over the score, and the next event queues its own line regardless.
 */
export class SpeechQueue<T> {
  private queued: { line: T; sec: number; queuedAt: number } | null = null;
  constructor(private readonly maxWaitSec = 4) {}

  /** Queue `line` (estimated to take `sec` to say), timestamped at `now`. */
  push(line: T, sec: number, now: number): void { this.queued = { line, sec, queuedAt: now }; }
  /** Drop whatever is queued (a phase change, a dispose) without speaking it. */
  clear(): void { this.queued = null; }
  get pending(): boolean { return !!this.queued; }

  poll(now: number, windows: readonly JudgeWindow[]): T | null {
    const q = this.queued;
    if (!q) return null;
    if (now - q.queuedAt > this.maxWaitSec) { this.queued = null; return null; }
    if (inJudgeWindow(now, windows) || windows.some((w) => w.from >= now && w.from < now + q.sec)) return null;
    this.queued = null;
    return q.line;
  }
}

/**
 * MUSIC-SUITE P8 FIX (2026-09-29): a single-voice room's own "am I still speaking the line before this one" gate.
 * Both Stoop (DanceMode.ts's `pollStoop`) and Okta (StudioMode.tsx's `speakOkta`) promise "one voice, one line at a
 * time" (script/stoop.ts / script/okta.ts's own file docs), but neither had ever actually checked it against the
 * VOICE ITSELF — `stoopWindows`/Okta's lack of any window at all only ever guarded against a JUDGED NOTE's own
 * reveal, and VoiceKit's channel:'booth' stop-then-play (written for THE MIC's court MC/sidekick hand-off) is not a
 * gate either room's successive lines actually go through on 'player' or a fast two-tick 'booth' sequence — so two
 * of Stoop's own moments (e.g. `dance.walkout` then `dance.countin`, queued a tick apart at every count-in) or two of
 * Okta's (`academy.firstvisit` then `academy.firstbeat`, fired seconds apart on a new player's very first grid tap)
 * could start on top of each other: the same single voice audibly talking over itself.
 *
 * `speakingUntil` is the room's own clock time (song-heard seconds for Stoop, wall seconds for Okta — whichever
 * clock that room already polls/schedules with) the line most recently started is expected to finish; `now` is that
 * same clock read fresh. A caller must not START a new line while this reads true — either hold it in the room's
 * own queue (Stoop: `pollStoop` skips `stoopQueue.poll` outright) or defer it with a timer (Okta: `speakOkta`
 * reschedules itself for `speakingUntil - now` seconds out) — never let the new line simply overwrite the old.
 */
export function stillSpeaking(now: number, speakingUntil: number): boolean {
  return now < speakingUntil;
}

/** A rough speaking length before the real render is measured (VoiceKit.line(clipId)?.sec, once the bank is in) —
 *  ~2.6 words/sec plus a beat to start and stop, the same shape scriptRules.wordCount assumes when it sets a
 *  moment's maxWords against its speech window. Good enough to size a queue's look-ahead; never used to schedule the
 *  actual audio (VoiceKit.play always uses the bank's measured length once it has one). */
export function estimateSec(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(0.6, words / 2.6 + 0.35);
}

/** The {mic, micWho} pair components/games/mic-caption.tsx's <MicCaption> draws, and how long to hold it — every
 *  voiced line gets one, whether or not the clip actually plays (ModeMic.showCaption does the same: the words land
 *  either way). `sec` is the line's real or estimated length; the caption holds a little past the end. */
export function hostCaption(cast: Pick<HostCast, 'name'>, line: Pick<HostLine, 'text'>, sec: number): { mic: string; micWho: string; holdSec: number } {
  return { mic: line.text, micWho: cast.name, holdSec: sec + 0.7 };
}

/** First time `key` has been seen in a small persisted set (a comma-joined string — the shape a localStorage value
 *  can hold): "new dancer" (Stoop, once ever) and Okta's first-visit / first-beat / first-PERFORM gates are all this
 *  same decision. Pure over the string so the persistence (localStorage, one key per room) stays the caller's; a
 *  broken/missing store reads as "nothing seen yet", never as a crash. */
export function seenFirstTime(seenCsv: string | null | undefined, key: string): { first: boolean; next: string } {
  const set = new Set((seenCsv ?? '').split(',').map((s) => s.trim()).filter(Boolean));
  if (set.has(key)) return { first: false, next: [...set].join(',') };
  set.add(key);
  return { first: true, next: [...set].join(',') };
}

/** The clip id VoiceKit's bank format keys a line by: '<cast id>/<line id>' (VoiceKit.line, VoiceKit.play's `clips`). */
export function clipId(cast: Pick<HostCast, 'id'>, line: Pick<HostLine, 'id'>): string { return `${cast.id}/${line.id}`; }
