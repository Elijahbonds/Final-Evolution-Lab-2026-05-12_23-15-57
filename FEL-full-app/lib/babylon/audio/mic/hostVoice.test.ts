// hostVoice — the pure rules Stoop (the Cypher) and Professor Okta (the Academy) both run on (MUSIC-SUITE P8,
// 2026-09-25): no-repeat picking, a per-run seed, "never talk over a judge window", and the caption every voiced line
// gets. Nothing here touches VoiceKit / AudioContext / window — see hostVoice.ts's header for why that split matters.
import { describe, it, expect } from 'vitest';
import {
  pickHostLine, mulberry32, newRunSeed, inJudgeWindow, SpeechQueue, estimateSec, hostCaption, seenFirstTime, clipId,
  stillSpeaking,
  type HostLine, type JudgeWindow,
} from './hostVoice';

const line = (id: string, text = id): HostLine => ({ id, moment: 'test.moment', text });

describe('pickHostLine — never the same line twice in a row', () => {
  it('never repeats the last id, over many draws and many seeds', () => {
    const pool = [line('a'), line('b'), line('c'), line('d')];
    for (let seed = 1; seed < 200; seed++) {
      const rnd = mulberry32(seed);
      let last = pickHostLine(pool, rnd);
      for (let i = 0; i < 40; i++) {
        const next = pickHostLine(pool, rnd, last.id);
        expect(next.id).not.toBe(last.id);
        last = next;
      }
    }
  });

  it('a pool of one has nothing else to say (the single line, every time)', () => {
    const only = [line('solo')];
    const rnd = mulberry32(7);
    expect(pickHostLine(only, rnd, 'solo').id).toBe('solo');
    expect(pickHostLine(only, rnd).id).toBe('solo');
  });

  it('an empty pool is a programming error, not a silent no-op (a typo\'d moment must be loud)', () => {
    expect(() => pickHostLine([], mulberry32(1))).toThrow();
  });

  it('draws land roughly evenly over many trials (not stuck rotating the same two)', () => {
    const pool = [line('a'), line('b'), line('c'), line('d'), line('e')];
    const rnd = mulberry32(42);
    const counts = new Map<string, number>();
    let last: string | undefined;
    for (let i = 0; i < 5000; i++) {
      const l = pickHostLine(pool, rnd, last);
      counts.set(l.id, (counts.get(l.id) ?? 0) + 1);
      last = l.id;
    }
    for (const id of ['a', 'b', 'c', 'd', 'e']) expect(counts.get(id) ?? 0).toBeGreaterThan(700);   // ~1000 each at even odds
  });
});

describe('newRunSeed — a per-run seed, never a fixed one', () => {
  it('is not a hardcoded constant (ModeMic.ts\'s own lesson: "a fixed seed opened every session with the same shouts")', () => {
    const a = newRunSeed();
    // Date.now() advances even inside a fast test; two calls a few ms apart must not collide with a canned constant.
    expect(a).toBeGreaterThan(0);
    expect(Number.isInteger(a)).toBe(true);
  });

  it('two runs seeded from different moments in time pick a different order (not the same "first line" every session)', () => {
    const pool = [line('a'), line('b'), line('c'), line('d'), line('e'), line('f')];
    const firstPick = (seed: number): string => pickHostLine(pool, mulberry32(seed)).id;
    const seeds = [1000, 1001, 1002, 1003, 1004, 1005, 1006, 1007].map(firstPick);
    expect(new Set(seeds).size).toBeGreaterThan(1);   // consecutive seeds do not all pick the same line
  });
});

describe('inJudgeWindow / SpeechQueue — never talk over a judge window (wait for a gap)', () => {
  it('inJudgeWindow is true only inside a window, padding included', () => {
    const w: JudgeWindow[] = [{ from: 10, to: 10.3 }];
    expect(inJudgeWindow(9.9, w)).toBe(false);
    expect(inJudgeWindow(10.0, w)).toBe(true);
    expect(inJudgeWindow(10.2, w)).toBe(true);
    expect(inJudgeWindow(10.3, w)).toBe(false);   // half-open: `to` itself is clear
    expect(inJudgeWindow(10.3, w, 0.05)).toBe(true);   // …unless padded
    expect(inJudgeWindow(9.96, w, 0.05)).toBe(true);
  });

  it('a line queued clear of any window speaks on the very next poll', () => {
    const q = new SpeechQueue<HostLine>();
    q.push(line('a'), 1.5, 0);
    expect(q.poll(0, [])).toEqual(line('a'));
    expect(q.pending).toBe(false);   // handed out once
  });

  it('a line queued while a window is open waits, then speaks the instant it clears', () => {
    const q = new SpeechQueue<HostLine>();
    const windows: JudgeWindow[] = [{ from: 0, to: 0.4 }];
    q.push(line('a'), 1, 0);
    expect(q.poll(0.1, windows)).toBeNull();      // inside the window: silence, not a cue
    expect(q.poll(0.3, windows)).toBeNull();
    expect(q.poll(0.4, windows)).toEqual(line('a'));   // the window just closed
  });

  it('a line is held back if speaking it would run INTO a window that has not opened yet', () => {
    const q = new SpeechQueue<HostLine>();
    // now = 0 is clear, but a 2s line would still be talking when the window at 1.0-1.3 opens
    const windows: JudgeWindow[] = [{ from: 1.0, to: 1.3 }];
    q.push(line('a'), 2, 0);
    expect(q.poll(0, windows)).toBeNull();
    // a SHORT line that finishes before the window opens is fine
    const q2 = new SpeechQueue<HostLine>();
    q2.push(line('b'), 0.5, 0);
    expect(q2.poll(0, windows)).toEqual(line('b'));
  });

  it('a queued line that never finds a gap is dropped, not spoken late over the score', () => {
    const q = new SpeechQueue<HostLine>(2);   // maxWaitSec = 2
    const alwaysBusy: JudgeWindow[] = [{ from: 0, to: 100 }];
    q.push(line('a'), 1, 0);
    expect(q.poll(1, alwaysBusy)).toBeNull();
    expect(q.poll(2.5, alwaysBusy)).toBeNull();   // past maxWaitSec: dropped
    expect(q.pending).toBe(false);
  });

  it('pushing a new line replaces whatever was still waiting (the newer event wins, like ModeMic.pending)', () => {
    const q = new SpeechQueue<HostLine>();
    q.push(line('old'), 1, 0);
    q.push(line('new'), 1, 0.1);
    expect(q.poll(0.1, [])).toEqual(line('new'));
  });
});

describe('stillSpeaking — a single voice must not talk over its OWN previous line', () => {
  it('is true strictly before speakingUntil, false at and after it', () => {
    expect(stillSpeaking(2.9, 3)).toBe(true);
    expect(stillSpeaking(3, 3)).toBe(false);
    expect(stillSpeaking(3.1, 3)).toBe(false);
  });

  it('a fresh room (speakingUntil = 0) is never "still speaking"', () => {
    expect(stillSpeaking(0, 0)).toBe(false);
    expect(stillSpeaking(5, 0)).toBe(false);
  });

  // MUSIC-SUITE P8 FIX (2026-09-29) regression: reproduces the exact bug this fix closes — Stoop's `dance.walkout`
  // line (queued the instant a count-in begins) was cut off almost immediately by `dance.countin` (queued one tick
  // later), because nothing checked whether Stoop was still speaking before a queued line was allowed to dequeue and
  // play — only the judge-window list was ever consulted, and the count-in has none (stoopWindows returns [] while
  // phase !== 'playing'). This composes the exact primitives DanceMode.ts's pollStoop/playStoopLine now use
  // (SpeechQueue.poll gated by stillSpeaking against a `speakingUntil` set from each line's own measured `sec`) to
  // prove the fix holds the second line out until the first one has actually finished.
  it('gates a SpeechQueue so a second moment queued mid-line waits for the first line to finish (walkout -> count-in)', () => {
    const queue = new SpeechQueue<HostLine>();
    let speakingUntil = 0;
    const noWindows: JudgeWindow[] = [];   // the count-in has no judged-step windows to duck under (stoopWindows)

    function poll(now: number): HostLine | null {
      if (stillSpeaking(now, speakingUntil)) return null;
      const got = queue.poll(now, noWindows);
      if (got) speakingUntil = now + 3;   // 'dance.walkout' is a 3s line in this scenario
      return got;
    }

    // t=0: count-in begins, dance.walkout is queued.
    queue.push(line('dance.walkout'), 3, 0);
    expect(poll(0)).toEqual(line('dance.walkout'));   // plays immediately; speakingUntil is now 3

    // t=0.05 (one tick later): countArmed flips, dance.countin is queued right behind it.
    queue.push(line('dance.countin'), 1, 0.05);

    // Without the fix this would dequeue and hard-stop the still-playing walkout line almost instantly.
    expect(poll(0.06)).toBeNull();
    expect(poll(1.5)).toBeNull();   // walkout is still talking at 1.5s of its 3s
    expect(queue.pending).toBe(true);   // dance.countin is still safely waiting, not dropped

    // t=3: walkout has finished — count-in's own line is free to play.
    expect(poll(3)).toEqual(line('dance.countin'));
  });
});

describe('estimateSec — a rough speaking length before the render is measured', () => {
  it('grows with the word count and never reads a blip as instant', () => {
    expect(estimateSec('Go.')).toBeGreaterThanOrEqual(0.6);
    expect(estimateSec('This is a somewhat longer line with several more words in it')).toBeGreaterThan(estimateSec('Short line'));
  });
});

describe('hostCaption — every voiced line gets one', () => {
  it('carries the exact text and the cast name, and holds a little past the line', () => {
    const c = hostCaption({ name: 'STOOP' }, line('dance.open.01', 'Block is open.'), 2);
    expect(c.mic).toBe('Block is open.');
    expect(c.micWho).toBe('STOOP');
    expect(c.holdSec).toBeGreaterThan(2);
  });
});

describe('seenFirstTime — "new dancer" / Okta\'s first-visit gates', () => {
  it('is first the very first time a key is seen, and never again after', () => {
    const a = seenFirstTime(null, 'visited');
    expect(a.first).toBe(true);
    const b = seenFirstTime(a.next, 'visited');
    expect(b.first).toBe(false);
  });
  it('keys are independent (visiting does not also mark first-beat seen)', () => {
    const a = seenFirstTime(null, 'visited');
    const b = seenFirstTime(a.next, 'firstBeat');
    expect(b.first).toBe(true);
    expect(seenFirstTime(b.next, 'visited').first).toBe(false);
    expect(seenFirstTime(b.next, 'firstBeat').first).toBe(false);
  });
  it('a broken or missing store reads as nothing seen yet, never throws', () => {
    expect(() => seenFirstTime(undefined, 'x')).not.toThrow();
    expect(seenFirstTime('', 'x').first).toBe(true);
  });
});

describe('clipId — the bank key VoiceKit plays by', () => {
  it('is "<cast id>/<line id>"', () => {
    expect(clipId({ id: 'stoop' }, line('dance.open.01'))).toBe('stoop/dance.open.01');
  });
});
