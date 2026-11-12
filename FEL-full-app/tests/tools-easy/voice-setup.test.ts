// TOOLS-EASY (2026-10-28): one voice, every line heard in full (lib/tools-easy/voiceQueue.ts), and the setup card's one
// word from the live pose (lib/tools-easy/setup.ts). Pure.
import { describe, expect, it } from 'vitest';
import { MAX_WAITING, VoiceQueue } from '@/lib/tools-easy/voiceQueue';
import { SetupReader, WORD_HOLD_MS } from '@/lib/tools-easy/setup';
import { buildTake, filmTake } from '@/lib/jump/ballistic';

function rig() {
  const log: string[] = [];
  let end: (() => void) | null = null;
  const timers: { fn: () => void; ms: number }[] = [];
  const q = new VoiceQueue({ speak: (t, onend) => { log.push(`start:${t}`); end = onend; }, cancel: () => log.push('cancel') },
    { set: (fn, ms) => { timers.push({ fn, ms }); return timers.length - 1; }, clear: () => {} });
  return { q, log, end: () => { const e = end; end = null; e?.(); }, timers };
}

describe('the one voice', () => {
  it('a line starts only when the one before has ended — nothing is cut off', () => {
    const r = rig();
    r.q.say('Your hands left your hips. Keep them there and jump again.');
    r.q.say('One.');
    expect(r.log).toEqual(['start:Your hands left your hips. Keep them there and jump again.']);
    r.end();
    expect(r.log).toEqual(['start:Your hands left your hips. Keep them there and jump again.', 'start:One.']);
    expect(r.log).not.toContain('cancel');
  });

  it('a lost end event does not stall it: the line\'s own length, twice over, moves it on', () => {
    const r = rig();
    r.q.say('Step back');
    r.q.say('Ready');
    expect(r.timers[0].ms).toBeGreaterThan(0);
    r.timers[0].fn();
    expect(r.q.said).toEqual(['Step back', 'Ready']);
  });

  it(`at most ${MAX_WAITING} lines wait; a line already waiting is not queued twice; hush drops the rest, not the line`, () => {
    const r = rig();
    r.q.say('a'); r.q.say('b'); r.q.say('b'); r.q.say('c'); r.q.say('d');
    r.end(); r.end(); r.end();
    expect(r.q.said).toEqual(['a', 'c', 'd']);
    const s = rig();
    s.q.say('Three.'); s.q.say('Reading');
    s.q.hush();
    s.end();
    expect(s.q.said).toEqual(['Three.']);
    expect(s.log).not.toContain('cancel');
  });
});

describe('the setup word', () => {
  const stand = filmTake(buildTake([], { leadS: 3 }), { fps: 30, seed: 2 }).frames;
  it('a person standing whole in the shot reads "Ready"; nobody reads "Step into view"', () => {
    const r = new SetupReader('front');
    expect(r.push({ t: 0, present: false, image: [] }).word).toBe('Step into view');
    let w = r.push(stand[0]);
    for (const f of stand.slice(1)) w = r.push({ ...f, t: f.t + 1 });
    expect(w).toMatchObject({ word: 'Ready', ready: true });
  });

  it(`a new word must hold ${WORD_HOLD_MS} ms before it replaces the shown one (no flicker)`, () => {
    const r = new SetupReader('front');
    r.push({ ...stand[0], t: 0 });
    expect(r.push({ t: 100, present: false, image: [] }).word).toBe('Ready');
    expect(r.push({ t: 100 + WORD_HOLD_MS, present: false, image: [] }).word).toBe('Step into view');
  });
});
