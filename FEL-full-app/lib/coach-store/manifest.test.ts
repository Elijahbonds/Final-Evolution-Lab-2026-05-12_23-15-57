// STORE-LISTING-FORMAT: the three added manifest kinds (course, series, bundle) parse correctly, bad shapes are
// rejected, the itemKeys are distinct and collision-free, and the four pre-existing kinds are unaffected.
import { describe, expect, it } from 'vitest';
import { coachManifest, itemKeyFor, programComingSoon } from './manifest';

function parse(json: unknown) {
  return coachManifest.safeParse(json);
}

describe('new manifest kinds: course, series, bundle', () => {
  it('parses a course manifest', () => {
    const r = parse({ kind: 'course', product: 'signature-dunk-course', billing: 'one_time' });
    expect(r.success).toBe(true);
  });

  it('parses a series manifest', () => {
    const r = parse({ kind: 'series', product: 'blueprint-series', billing: 'one_time' });
    expect(r.success).toBe(true);
  });

  it('parses a bundle manifest with members', () => {
    const r = parse({
      kind: 'bundle', product: 'bundle-all-three', billing: 'one_time',
      members: ['dunking-plyometrics-8wk', 'signature-dunk-course', 'blueprint-series'],
    });
    expect(r.success).toBe(true);
  });

  it('rejects a bad product slug (uppercase, underscore, leading dash)', () => {
    expect(parse({ kind: 'course', product: 'Signature_Dunk', billing: 'one_time' }).success).toBe(false);
    expect(parse({ kind: 'series', product: '-leading-dash', billing: 'one_time' }).success).toBe(false);
  });

  it('rejects an empty members array', () => {
    expect(parse({ kind: 'bundle', product: 'bundle-all-three', billing: 'one_time', members: [] }).success).toBe(false);
  });

  it('rejects a duplicate member', () => {
    const r = parse({
      kind: 'bundle', product: 'bundle-all-three', billing: 'one_time',
      members: ['signature-dunk-course', 'signature-dunk-course'],
    });
    expect(r.success).toBe(false);
  });

  it('rejects a bundle that references itself as a member', () => {
    const r = parse({
      kind: 'bundle', product: 'bundle-all-three', billing: 'one_time',
      members: ['bundle-all-three', 'signature-dunk-course'],
    });
    expect(r.success).toBe(false);
  });

  it('rejects an unknown kind', () => {
    expect(parse({ kind: 'subscription_box', product: 'x', billing: 'one_time' }).success).toBe(false);
  });

  it('the four existing kinds still parse exactly as before', () => {
    expect(parse({ kind: 'program', lane: 'dunking', billing: 'one_time' }).success).toBe(true);
    expect(parse({ kind: 'program', lane: 'correctives', billing: 'one_time', weeks: 8 }).success).toBe(true);
    expect(parse({ kind: 'live_1on1', durationMin: 30 }).success).toBe(true);
    expect(parse({ kind: 'video_review' }).success).toBe(true);
    expect(parse({ kind: 'membership', audience: 'adult', interval: 'month' }).success).toBe(true);
    // unchanged rejection behaviour
    expect(parse({ kind: 'program', lane: 'bogus', billing: 'one_time' }).success).toBe(false);
    expect(parse({ kind: 'live_1on1', durationMin: 45 }).success).toBe(false);
  });

  it('course/series/bundle never come back "coming soon"; only non-dunking programs do', () => {
    expect(programComingSoon({ kind: 'course', product: 'signature-dunk-course', billing: 'one_time' })).toBe(false);
    expect(programComingSoon({ kind: 'series', product: 'blueprint-series', billing: 'one_time' })).toBe(false);
    expect(programComingSoon({
      kind: 'bundle', product: 'bundle-all-three', billing: 'one_time',
      members: ['dunking-plyometrics-8wk'],
    })).toBe(false);
  });
});

describe('itemKeyFor: the three new keys, and no collision with the existing four', () => {
  it('builds distinct keys for course, series and bundle', () => {
    expect(itemKeyFor({ kind: 'course', product: 'signature-dunk-course', billing: 'one_time' }, 'elijah'))
      .toBe('coach-store:elijah:course:signature-dunk-course:one_time');
    expect(itemKeyFor({ kind: 'series', product: 'blueprint-series', billing: 'one_time' }, 'elijah'))
      .toBe('coach-store:elijah:series:blueprint-series:one_time');
    expect(itemKeyFor({
      kind: 'bundle', product: 'bundle-all-three', billing: 'one_time',
      members: ['dunking-plyometrics-8wk', 'signature-dunk-course', 'blueprint-series'],
    }, 'elijah')).toBe('coach-store:elijah:bundle:bundle-all-three:one_time');
  });

  it('existing four outputs are byte-identical to before', () => {
    expect(itemKeyFor({ kind: 'program', lane: 'dunking', billing: 'one_time' }, 'elijah'))
      .toBe('coach-store:elijah:program:dunking:one_time');
    expect(itemKeyFor({ kind: 'live_1on1', durationMin: 30 }, 'elijah'))
      .toBe('coach-store:elijah:live_1on1:30:one_time');
    expect(itemKeyFor({ kind: 'video_review', maxClips: 3, maxClipSeconds: 60 }, 'elijah'))
      .toBe('coach-store:elijah:video_review:clip:one_time');
    expect(itemKeyFor({ kind: 'membership', audience: 'adult', interval: 'month' }, 'elijah'))
      .toBe('coach-store:elijah:membership:adult:month');
  });

  it('the dunking program, course, series and bundle keys are all distinct for the same coach slug', () => {
    const keys = [
      itemKeyFor({ kind: 'program', lane: 'dunking', billing: 'one_time' }, 'elijah'),
      itemKeyFor({ kind: 'course', product: 'signature-dunk-course', billing: 'one_time' }, 'elijah'),
      itemKeyFor({ kind: 'series', product: 'blueprint-series', billing: 'one_time' }, 'elijah'),
      itemKeyFor({
        kind: 'bundle', product: 'bundle-all-three', billing: 'one_time',
        members: ['dunking-plyometrics-8wk', 'signature-dunk-course', 'blueprint-series'],
      }, 'elijah'),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });
});
