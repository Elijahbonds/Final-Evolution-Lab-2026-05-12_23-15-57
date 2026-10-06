// CREATOR SOUNDTRACK: when the soundtrack may sound (policy), shuffle without repeats, play counting, focus, the LRU.
import { describe, expect, it } from 'vitest';
import { decideStage, stageForPhase, ownsMusic, type PlayConditions } from './policy';
import { Shuffler, moodPool } from './shuffle';
import { PlayTracker, PLAY_THRESHOLD_SEC, utcDayStart, listenerOf } from './playCount';
import { MusicFocus } from './focus';
import { lruPlan, CACHE_MAX_BYTES } from './cache';
import { houseTracks } from './house';
import type { SoundtrackTrack } from './types';

const base: PlayConditions = { pathname: '/', unlocked: true, enabled: true, saveData: false, hidden: false, ageLocked: false, focusHeld: false, requested: null, hasTracks: true };

describe('decideStage', () => {
  it('menus play at the menu stage once tapped', () => {
    expect(decideStage(base)).toEqual({ stage: 'menu' });
    expect(decideStage({ ...base, unlocked: false })).toEqual({ silent: 'waiting-for-tap' });
  });
  it('never on the Quick Screen, whatever else holds', () => {
    for (const p of ['/screen', '/screen/privacy', '/play/mirror/assess', '/play/mirror/assess/results']) {
      expect(decideStage({ ...base, pathname: p, requested: 'menu' })).toEqual({ silent: 'quick-screen' });
    }
  });
  it('off on data saver, for an age-locked visitor, when turned off, in a music room, behind focus, in a hidden tab', () => {
    expect(decideStage({ ...base, saveData: true })).toEqual({ silent: 'data-saver' });
    expect(decideStage({ ...base, ageLocked: true })).toEqual({ silent: 'age-locked' });
    expect(decideStage({ ...base, enabled: false })).toEqual({ silent: 'off' });
    expect(decideStage({ ...base, pathname: '/play/dance' })).toEqual({ silent: 'own-music' });
    expect(decideStage({ ...base, pathname: '/play/music/studio' })).toEqual({ silent: 'own-music' });
    expect(decideStage({ ...base, focusHeld: true })).toEqual({ silent: 'focus' });
    expect(decideStage({ ...base, hidden: true })).toEqual({ silent: 'hidden' });
    expect(decideStage({ ...base, hasTracks: false })).toEqual({ silent: 'no-tracks' });
  });
  it('a game page is the quiet bed until its host says its phase; the host\'s stage wins', () => {
    expect(decideStage({ ...base, pathname: '/play/dunk' })).toEqual({ stage: 'bed' });
    expect(decideStage({ ...base, pathname: '/play/dunk', requested: 'loading' })).toEqual({ stage: 'loading' });
    expect(decideStage({ ...base, requested: 'off' })).toEqual({ silent: 'stage-off' });
  });
  it('harness phases map to stages', () => {
    expect(['loading', 'ready', 'countdown', 'playing', 'paused', 'ended', 'error'].map(stageForPhase))
      .toEqual(['loading', 'loading', 'bed', 'bed', 'bed', 'end', 'loading']);
    expect(ownsMusic('/playground')).toBe(false);
    expect(ownsMusic('/create')).toBe(true);
  });
});

describe('Shuffler', () => {
  const tracks = houseTracks();
  let seed = 7;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  it('plays every track once before any repeats, and never the same twice in a row across bags', () => {
    const s = new Shuffler(rng);
    const seq = Array.from({ length: 60 }, () => s.next(tracks)!);
    for (let b = 0; b < 10; b++) expect(new Set(seq.slice(b * 6, b * 6 + 6)).size).toBe(6);
    for (let i = 1; i < seq.length; i++) expect(seq[i]).not.toBe(seq[i - 1]);
  });
  it('a featured track comes up twice per bag, never back to back', () => {
    const t = tracks.map((x, i) => (i === 0 ? { ...x, featured: true } : x));
    const s = new Shuffler(rng);
    const seq = Array.from({ length: 700 }, () => s.next(t)!);
    const count = (id: string) => seq.filter((x) => x === id).length;
    expect(Math.abs(count(t[0].id) - 200)).toBeLessThanOrEqual(2);
    for (const x of t.slice(1)) expect(Math.abs(count(x.id) - 100)).toBeLessThanOrEqual(1);
    for (let i = 1; i < seq.length; i++) expect(seq[i]).not.toBe(seq[i - 1]);
  });
  it('a one-track pool repeats; an empty pool gives null; a mood narrows unless nothing matches', () => {
    const s = new Shuffler(rng);
    expect([s.next([tracks[0]]), s.next([tracks[0]])]).toEqual([tracks[0].id, tracks[0].id]);
    expect(s.next([])).toBeNull();
    expect(moodPool(tracks, 'hype').every((t) => t.moods.includes('hype'))).toBe(true);
    expect(moodPool(tracks.map((t) => ({ ...t, moods: [] })) as SoundtrackTrack[], 'hype')).toHaveLength(6);
  });
});

describe('PlayTracker: 30 s heard, once per start', () => {
  it('counts only audible time, caps a late tick, reports once', () => {
    const p = new PlayTracker();
    p.start('house:warmup');
    expect(p.tick(20, false)).toBeNull();          // muted / hidden: nothing
    expect(p.tick(100, true)).toBeNull();          // a stalled tab's leap counts 1.5 s
    let hit: string | null = null;
    for (let i = 0; i < 40 && !hit; i++) hit = p.tick(1, true);
    expect(hit).toBe('house:warmup');
    expect(p.heardSec).toBeGreaterThanOrEqual(PLAY_THRESHOLD_SEC);
    expect(p.tick(1, true)).toBeNull();            // once
    p.start('house:warmup');                       // a restart is a new play
    for (let i = 0; i < 29; i++) expect(p.tick(1, true)).toBeNull();
    expect(p.tick(1, true)).toBe('house:warmup');
  });
  it('the dedupe day and the listener', () => {
    expect(utcDayStart(new Date('2026-10-06T23:59:59Z')).toISOString()).toBe('2026-10-06T00:00:00.000Z');
    expect(listenerOf('u1', 'g-token-123')).toEqual({ userId: 'u1' });
    expect(listenerOf(null, 'g-token-123')).toEqual({ guestId: 'g-token-123' });
    expect(listenerOf(null, 'x')).toBeNull();
    expect(listenerOf(undefined, undefined)).toBeNull();
  });
});

describe('MusicFocus', () => {
  it('counted claims with one-shot releases, and listeners', () => {
    const f = new MusicFocus();
    let calls = 0;
    f.subscribe(() => calls++);
    const a = f.claim('dance'), b = f.claim('walkout');
    expect(f.count).toBe(2);
    a(); a();
    expect(f.holders).toEqual(['walkout']);
    b();
    expect(f.count).toBe(0);
    expect(calls).toBe(4);
  });
});

describe('device cache LRU', () => {
  it('keeps the 6 most recent under 25 MB, evicts the rest', () => {
    const idx = Array.from({ length: 6 }, (_, i) => ({ url: `u${i}`, bytes: 3e6, at: i }));
    const r = lruPlan(idx, { url: 'new', bytes: 3e6, at: 100 });
    expect(r.keep.map((e) => e.url)).toEqual(['new', 'u5', 'u4', 'u3', 'u2', 'u1']);
    expect(r.evict).toEqual(['u0']);
    const big = lruPlan([{ url: 'a', bytes: 20e6, at: 1 }], { url: 'b', bytes: 10e6, at: 2 });
    expect(big.evict).toEqual(['a']);
    expect(lruPlan([], { url: 'huge', bytes: CACHE_MAX_BYTES + 1, at: 1 })).toEqual({ keep: [], evict: ['huge'] });
  });
});
