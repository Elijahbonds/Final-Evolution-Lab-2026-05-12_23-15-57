// THE ROOM IS NOT THE POINT; THE BINDING IS (2026-09-13).
//
// The Music Room brief, verbatim: "THE BINDING (this is why it exists — do not build it standalone)."
// Three bindings were named and none existed. These tests hold the two decisions that shape them: a
// walk-out is METADATA rather than audio, and plays are an engagement count that never becomes a score.

import { describe, it, expect } from 'vitest';
import {
  makeWalkOut, parseWalkOut, countPlay, musicCredential, walkOutFromCard,
  WalkOutRefused, WALKOUT_VERSION, MAX_TITLE, MIN_BARS, MAX_BARS, saveWalkOut, readWalkOut,
} from './WalkOut';
import { installFakeWebAudio } from './fakeWebAudio';

const NOW = Date.parse('2026-09-13T12:00:00.000Z');
const draft = (over = {}) => ({ songId: 'song_1', title: 'Boardwalk', bpm: 96, bars: 16, now: NOW, ...over });

describe('a walk-out is metadata, not audio', () => {
  it('carries what a contest needs to re-render, and nothing heavy', () => {
    const w = makeWalkOut(draft());
    expect(w.songId).toBe('song_1');
    expect(w.bpm).toBe(96);
    // the buffer belongs to the Music Room; a card copied into a duel link must not carry megabytes
    const keys = Object.keys(w).sort();
    expect(keys).toEqual(['bars', 'bpm', 'chosenAt', 'plays', 'songId', 'title', 'v']);
    expect(JSON.stringify(w).length).toBeLessThan(400);
  });

  it('refuses what a player could not actually walk out to', () => {
    expect(() => makeWalkOut(draft({ songId: '  ' }))).toThrow(WalkOutRefused);
    expect(() => makeWalkOut(draft({ bars: MIN_BARS - 1 }))).toThrow(WalkOutRefused);
    for (const bpm of [0, 39, 221, NaN]) {
      expect(() => makeWalkOut(draft({ bpm })), String(bpm)).toThrow(WalkOutRefused);
    }
  });

  it('clamps rather than trusting', () => {
    const w = makeWalkOut(draft({ title: 'x'.repeat(200), bars: 9999 }));
    expect(w.title.length).toBeLessThanOrEqual(MAX_TITLE);
    expect(w.bars).toBe(MAX_BARS);
  });

  it('starts with no plays — you have not been heard yet', () => {
    expect(makeWalkOut(draft()).plays).toBe(0);
  });
});

describe('reading one back', () => {
  it('round-trips', () => {
    const w = makeWalkOut(draft());
    expect(parseWalkOut(JSON.stringify(w))).toEqual(w);
  });

  it('A FUTURE VERSION IS REFUSED, not half-read', () => {
    const w = { ...makeWalkOut(draft()), v: WALKOUT_VERSION + 1 };
    expect(parseWalkOut(w)).toBeNull();
  });

  it('junk is null rather than a crash', () => {
    for (const bad of ['', 'not json', '{}', null, 42, { v: 1 }, { v: 1, songId: '' }]) {
      expect(parseWalkOut(bad), String(bad)).toBeNull();
    }
  });

  it('a partial record is repaired to something playable', () => {
    const w = parseWalkOut({ v: 1, songId: 's', bpm: 100 })!;
    expect(w.title).toBe('Untitled');
    expect(w.bars).toBeGreaterThanOrEqual(MIN_BARS);
    expect(w.plays).toBe(0);
  });
});

describe('PLAYS ARE ENGAGEMENT, NEVER A SCORE', () => {
  it('counting a play returns a new record and does not mutate', () => {
    const w = makeWalkOut(draft());
    const after = countPlay(w);
    expect(after.plays).toBe(1);
    expect(w.plays).toBe(0);
  });

  it('the credential states plays as plays, and says nothing that ranks', () => {
    const w = countPlay(countPlay(makeWalkOut(draft())));
    const c = musicCredential(w, 3);
    expect(c.plays).toBe(2);
    expect(c.label).toContain('2 plays');
    const blob = JSON.stringify(c).toLowerCase();
    for (const bad of ['rank', 'score', 'rating', 'percentile', 'best', 'top ', 'level']) {
      expect(blob, bad).not.toContain(bad);
    }
  });

  it('one play is singular — the label is the only string a card prints', () => {
    expect(musicCredential(countPlay(makeWalkOut(draft())), 1).label).toContain('1 play');
  });

  it('an athlete with tracks but no walk-out still has a credential', () => {
    const c = musicCredential(null, 4);
    expect(c.walkOut).toBeNull();
    expect(c.label).toBe('4 tracks authored');
  });

  it('and one with neither reads as zero rather than as absent', () => {
    expect(musicCredential(null, 0).label).toBe('0 tracks authored');
  });
});

describe('a ghost duel plays THEIR track, and it came from their JSON', () => {
  it('an imported walk-out is re-parsed rather than trusted', () => {
    const theirs = { ...makeWalkOut(draft({ title: 'Their Song' })), plays: 900 };
    const w = walkOutFromCard(JSON.stringify(theirs))!;
    expect(w.title).toBe('Their Song');
    expect(w.bpm).toBe(96);
  });

  it('THEIR PLAY COUNT IS DROPPED — this device does not add to somebody else’s total', () => {
    const theirs = { ...makeWalkOut(draft()), plays: 900 };
    expect(walkOutFromCard(theirs)!.plays).toBe(0);
  });

  it('a forged or broken card yields no walk-out rather than a bad one', () => {
    for (const bad of [null, '{}', { v: 99, songId: 'x', bpm: 100 }, 'nope']) {
      expect(walkOutFromCard(bad), String(bad)).toBeNull();
    }
  });

  it('and an oversized title from a stranger is still clamped', () => {
    const theirs = { ...makeWalkOut(draft()), title: 'z'.repeat(500) };
    expect(walkOutFromCard(theirs)!.title.length).toBeLessThanOrEqual(MAX_TITLE);
  });
});

// MUSIC-SUITE P3 (2026-09-25): no save fails silently. saveWalkOut returned nothing and swallowed the error.
describe('saveWalkOut says whether the record was kept', () => {
  it('true when kept, false when the storage refuses, false with no window', () => {
    expect(saveWalkOut(makeWalkOut(draft()))).toBe(false);            // node: no window, nothing kept
    const fake = installFakeWebAudio({ quotaChars: 10_000 });
    try {
      expect(saveWalkOut(makeWalkOut(draft()))).toBe(true);
      expect(readWalkOut()?.songId).toBe('song_1');
      fake.storage.setItem('filler', 'x'.repeat(10_000 - fake.storage.usedChars - 'filler'.length));
      expect(saveWalkOut({ ...makeWalkOut(draft()), title: 'a much longer title than before' })).toBe(false);
      expect(readWalkOut()?.title).toBe('Boardwalk');                   // the old record is untouched
    } finally { fake.uninstall(); }
  });
});
