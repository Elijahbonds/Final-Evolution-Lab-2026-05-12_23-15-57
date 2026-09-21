import { describe, expect, it } from 'vitest';
import { captionsFromHud, rememberHud } from './hudCaptions';

/** Drive an update through both halves the way ModeHarness does. */
const feed = (last: Record<string, string>, update: Record<string, unknown>) => {
  const cues = captionsFromHud(update, last);
  rememberHud(update, last);
  return cues.map((c) => c.text);
};

describe('captionsFromHud', () => {
  it('announces a banner the first time it appears', () => {
    expect(feed({}, { banner: 'FLIGHT NIGHT' })).toEqual(['FLIGHT NIGHT']);
  });

  it('does NOT repeat it every frame', () => {
    // setHud runs each frame with the same object. Cueing every call would repeat one banner sixty times a
    // second and a screen reader would never say anything else again.
    const last: Record<string, string> = {};
    expect(feed(last, { banner: 'FLIGHT NIGHT' })).toEqual(['FLIGHT NIGHT']);
    for (let i = 0; i < 60; i++) expect(feed(last, { banner: 'FLIGHT NIGHT' })).toEqual([]);
  });

  it('announces the same text again after it has been cleared', () => {
    // A mode that banners "NICE!" twice in a row means it twice.
    const last: Record<string, string> = {};
    expect(feed(last, { banner: 'NICE!' })).toEqual(['NICE!']);
    expect(feed(last, { banner: '' })).toEqual([]);
    expect(feed(last, { banner: 'NICE!' })).toEqual(['NICE!']);
  });

  it('says nothing for a banner being cleared', () => {
    const last: Record<string, string> = { banner: 'GONE' };
    expect(feed(last, { banner: '' })).toEqual([]);
  });

  it('ignores HUD keys that are numbers a player reads at leisure', () => {
    expect(feed({}, { score: 42, hype: 100, lap: '2/3', speed: 26 })).toEqual([]);
  });

  it('ignores a banner that is not a string', () => {
    expect(feed({}, { banner: 42 })).toEqual([]);
    expect(feed({}, { banner: null })).toEqual([]);
  });

  it('trims, so whitespace churn is not news', () => {
    const last: Record<string, string> = {};
    expect(feed(last, { banner: '  DUNK!  ' })).toEqual(['DUNK!']);
    expect(feed(last, { banner: 'DUNK!' })).toEqual([]);
  });

  it('leaves the memory alone for a key this update did not mention', () => {
    const last: Record<string, string> = { banner: 'HELD' };
    feed(last, { score: 3 });
    expect(last.banner).toBe('HELD');
  });
});
