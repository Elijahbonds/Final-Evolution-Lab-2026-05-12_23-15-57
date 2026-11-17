// hoops-sound (phase 11a): the sample bank's promises: lazy, a few files at a time, a failed file is skipped, a cue with nothing loaded
// hands back null (SoundKit then plays the synth), the round-robin never repeats a hit back to back, the jitter stays in its band.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  HOOPS_BED_URL, HOOPS_SAMPLES, RoundRobin, SampleBank, bedLoopWindow, jitterGain, jitterRate, sampleBankFor, type SampleCue,
} from './samples';

const seq = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };
const cue = (urls: string[], extra: Partial<SampleCue> = {}): SampleCue => ({ urls, gain: 0.5, pitchJitter: 0.05, volJitterDb: 2, bus: 'sfx', maxVoices: 3, ...extra });
/** An io whose files are listed: a url in `fail` rejects at fetch, in `bad` at decode; `gate` holds every fetch until released. */
function io(opts: { fail?: string[]; bad?: string[] } = {}) {
  const fetched: string[] = []; let inFlight = 0, maxInFlight = 0; const waiters: (() => void)[] = [];
  const api = {
    fetched, get maxInFlight() { return maxInFlight; },
    release() { while (waiters.length) waiters.shift()!(); },
    fetch: async (url: string) => {
      fetched.push(url); inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise<void>((r) => waiters.push(r));
      inFlight--;
      if (opts.fail?.includes(url)) throw new Error('404');
      return new TextEncoder().encode(url).buffer as ArrayBuffer;
    },
    decode: async (bytes: ArrayBuffer) => {
      const url = new TextDecoder().decode(bytes);
      if (opts.bad?.includes(url)) throw new Error('EncodingError');
      return { url };
    },
  };
  return api;
}
const settle = async (x: ReturnType<typeof io>, p: Promise<void>) => { for (let i = 0; i < 50; i++) { x.release(); await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); } await p; };

describe('SampleBank', () => {
  it('fetches nothing until load(), then every file once, at most `concurrency` at a time, the cues in the order given', async () => {
    const x = io();
    const bank = new SampleBank({ bounce: cue(['/b1', '/b2', '/b3']), swish: cue(['/s1', '/s2']) }, { url: '/bed' }, x, Math.random, 2);
    expect(x.fetched).toEqual([]);
    expect(bank.state).toBe('idle');
    expect(bank.pick('bounce')).toBeNull();          // not loaded: SoundKit plays the synth
    const p = bank.load(); expect(bank.load()).toBe(p);   // idempotent
    expect(bank.state).toBe('loading');
    await settle(x, p);
    expect(x.fetched).toEqual(['/b1', '/b2', '/b3', '/s1', '/s2', '/bed']);   // the dribble first
    expect(x.maxInFlight).toBe(2);
    expect(bank.state).toBe('ready');
    expect(bank.loaded).toBe(6);
    expect(bank.bedBuffer()).toEqual({ url: '/bed' });
  });

  it('a variation that fails to fetch or decode is skipped; the cue plays what did load', async () => {
    const x = io({ fail: ['/b1'], bad: ['/b3'] });
    const bank = new SampleBank({ bounce: cue(['/b1', '/b2', '/b3']) }, null, x);
    await settle(x, bank.load());
    expect(bank.failed).toBe(2);
    for (let i = 0; i < 12; i++) expect((bank.pick('bounce')!.buffer as { url: string }).url).toBe('/b2');
  });

  it('a cue whose every file failed, an unknown cue, and a whole bank that failed all hand back null: the synth plays', async () => {
    const x = io({ fail: ['/s1', '/s2'] });
    const bank = new SampleBank({ bounce: cue(['/b1']), swish: cue(['/s1', '/s2']) }, null, x);
    await settle(x, bank.load());
    expect(bank.pick('swish')).toBeNull();
    expect(bank.has('swish')).toBe(false);
    expect(bank.pick('groan')).toBeNull();
    expect(bank.pick('bounce')).not.toBeNull();
    const y = io({ fail: ['/b1'] });
    const dead = new SampleBank({ bounce: cue(['/b1']) }, null, y);
    await settle(y, dead.load());                      // never rejects
    expect(dead.state).toBe('failed');
    expect(dead.pick('bounce')).toBeNull();
  });

  it('every hit carries the cue level and bus, with the rate and level jitter inside their bands', async () => {
    const x = io();
    const bank = new SampleBank({ crowdCheer: cue(['/c1', '/c2'], { gain: 0.4, pitchJitter: 0.03, volJitterDb: 1, bus: 'crowd', maxVoices: 2 }) }, null, x);
    await settle(x, bank.load());
    for (let i = 0; i < 200; i++) {
      const s = bank.pick('crowdCheer')!;
      expect(s.bus).toBe('crowd'); expect(s.maxVoices).toBe(2);
      expect(s.rate).toBeGreaterThanOrEqual(0.97); expect(s.rate).toBeLessThanOrEqual(1.03);
      expect(s.gain).toBeGreaterThanOrEqual(0.4 * 10 ** (-1 / 20) - 1e-9); expect(s.gain).toBeLessThanOrEqual(0.4 * 10 ** (1 / 20) + 1e-9);
    }
  });
});

describe('RoundRobin and the jitter', () => {
  it('every variation once before any repeats, and never the same one twice in a row (across rounds too)', () => {
    for (const n of [2, 3, 6]) {
      const rr = new RoundRobin(n, seq([0.9, 0.1, 0.5, 0.7, 0.3, 0.2, 0.8]));
      let last = -1;
      for (let round = 0; round < 40; round++) {
        const got = Array.from({ length: n }, () => rr.next());
        expect(new Set(got).size).toBe(n);
        for (const g of got) { expect(g).not.toBe(last); last = g; }
      }
    }
    expect(new RoundRobin(1).next()).toBe(0);
  });
  it('jitter: rand 0 / 0.5 / 1 map to the low edge, none, the high edge', () => {
    expect(jitterRate(0.05, () => 0)).toBeCloseTo(0.95, 12);
    expect(jitterRate(0.05, () => 0.5)).toBeCloseTo(1, 12);
    expect(jitterGain(6, () => 1 - 1e-12)).toBeCloseTo(10 ** (6 / 20), 6);
    expect(jitterGain(0, () => 0.9)).toBe(1);
  });
});

describe('the hoops set', () => {
  it('only the court modes load it', () => {
    expect(sampleBankFor('onevone')).toBe('hoops');
    expect(sampleBankFor('threevthree')).toBe('hoops');
    expect(sampleBankFor('threepoint')).toBe('hoops');
    for (const m of ['dunk', 'dunkduel', 'karate', 'carnival', '', null, undefined]) expect(sampleBankFor(m)).toBeNull();
  });
  it('every file it names is in public/, with its credits', () => {
    const pub = join(__dirname, '..', '..', '..', 'public');
    const urls = [...Object.values(HOOPS_SAMPLES).flatMap((c) => c.urls), HOOPS_BED_URL];
    expect(urls.length).toBe(24);
    for (const u of urls) expect(existsSync(join(pub, u)), u).toBe(true);
    expect(existsSync(join(pub, 'audio/hoops/CREDITS.md'))).toBe(true);
    expect(existsSync(join(pub, 'audio/hoops/sources.json'))).toBe(true);
  });
  it('the cues it replaces are the court\'s: no synth it does not have a recording for is touched', () => {
    expect(Object.keys(HOOPS_SAMPLES).sort()).toEqual(['bounce', 'catch', 'crowdCheer', 'rattle', 'squeak', 'swish']);
  });
});

describe('bedLoopWindow', () => {
  it('a decode of exactly the authored length loops whole; a longer one skips a possible encoder delay', () => {
    expect(bedLoopWindow(14, 14)).toEqual({ start: 0, end: 14 });
    expect(bedLoopWindow(14.001, 14)).toEqual({ start: 0, end: 14 });
    const w = bedLoopWindow(14.05, 14);
    expect(w.start).toBeCloseTo(0.03, 9); expect(w.end).toBeCloseTo(14.03, 9);
    const short = bedLoopWindow(13.9, 14);
    expect(short.start).toBe(0); expect(short.end).toBeCloseTo(13.9, 9);
  });
});
