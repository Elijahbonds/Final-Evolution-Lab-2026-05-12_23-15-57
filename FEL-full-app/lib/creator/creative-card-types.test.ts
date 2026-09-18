import { describe, expect, it } from 'vitest';
import { DISCIPLINES, DISCIPLINE_META, NEEDS_REVIEW, isDiscipline, validateArtPayload } from './creative-card-types';

describe('disciplines', () => {
  it('nine disciplines, every one with hub metadata, the guard rejects strangers', () => {
    expect(DISCIPLINES.length).toBe(9);
    for (const d of DISCIPLINES) expect(DISCIPLINE_META[d].label.length).toBeGreaterThan(0);
    expect(isDiscipline('cooking')).toBe(true); expect(isDiscipline('crypto')).toBe(false); expect(isDiscipline(3)).toBe(false);
  });
  it('UGC audio and text disciplines go through review; cooking and fashion do not', () => {
    expect(NEEDS_REVIEW).toEqual(expect.arrayContaining(['music', 'acting', 'scene', 'writing']));
    expect(NEEDS_REVIEW).not.toContain('cooking'); expect(NEEDS_REVIEW).not.toContain('fashion');
  });
});

describe('payload validation', () => {
  const q = { prompt: 'Which court is this?', options: ['Venice', 'Blossom Park', 'Orbit', 'Rooftop'], answer: 0 };
  it('scene packs: bounded questions, four distinct options, a valid answer', () => {
    expect(validateArtPayload({ kind: 'scene', venueId: 'basketball_h2h', cameraPath: 'sweep', questions: [q] })).toEqual({ ok: true });
    expect(validateArtPayload({ kind: 'scene', venueId: 'basketball_h2h', cameraPath: 'sweep', questions: [] }).ok).toBe(false);
    expect(validateArtPayload({ kind: 'scene', venueId: 'x', cameraPath: 'sweep', questions: [{ ...q, options: ['a', 'a', 'b', 'c'] }] }).ok).toBe(false);
    expect(validateArtPayload({ kind: 'scene', venueId: 'x', cameraPath: 'sweep', questions: [{ ...q, answer: 4 }] }).ok).toBe(false);
  });
  it('cooking: steps and ingredients required, photo must be an image url', () => {
    expect(validateArtPayload({ kind: 'cooking', steps: ['Boil'], ingredients: ['Eggs'], fuelTags: ['protein'] })).toEqual({ ok: true });
    expect(validateArtPayload({ kind: 'cooking', steps: [], ingredients: ['Eggs'], fuelTags: [] }).ok).toBe(false);
    expect(validateArtPayload({ kind: 'cooking', steps: ['Boil'], ingredients: ['Eggs'], fuelTags: [], photoUrl: 'javascript:x' }).ok).toBe(false);
  });
  it('fashion: wearables and hex palette; writing: 20–4000 chars', () => {
    expect(validateArtPayload({ kind: 'fashion', lookId: 'look1', wearableIds: ['top_lab'], palette: ['#00E5FF'] })).toEqual({ ok: true });
    expect(validateArtPayload({ kind: 'fashion', lookId: 'look1', wearableIds: [], palette: [] }).ok).toBe(false);
    expect(validateArtPayload({ kind: 'fashion', lookId: 'look1', wearableIds: ['x'], palette: ['blue'] }).ok).toBe(false);
    expect(validateArtPayload({ kind: 'writing', text: 'x'.repeat(20) })).toEqual({ ok: true });
    expect(validateArtPayload({ kind: 'writing', text: 'short' }).ok).toBe(false);
    expect(validateArtPayload({ kind: 'writing', text: 'x'.repeat(4001) }).ok).toBe(false);
  });
  it('the existing five still validate, unknown kinds fail', () => {
    expect(validateArtPayload({ kind: 'music', stemUrls: ['https://cdn/x.wav'], bpm: 92 }).ok).toBe(true);
    expect(validateArtPayload({ kind: 'music', stemUrls: [], bpm: 10 }).ok).toBe(false);
    expect(validateArtPayload({ kind: 'acting', sceneId: 's', performanceUrl: 'ftp://x' }).ok).toBe(false);
    expect(validateArtPayload({ kind: 'nope' }).ok).toBe(false); expect(validateArtPayload(null).ok).toBe(false);
  });
});
