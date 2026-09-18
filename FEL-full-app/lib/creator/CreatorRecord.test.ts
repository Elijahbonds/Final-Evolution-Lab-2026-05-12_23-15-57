// CreatorRecord — the mission's constraints, as tests (2026-09-13).
//
// Three of these exist because the failure mode is not a crash. A record that quietly holds a location
// trail, a sentence that reads like a clinician wrote it about a child, and a public surface that shows a
// minor are all things that would ship green without them.

import { describe, it, expect } from 'vitest';
import {
  EMPTY_RECORD, EMPTY_DISCIPLINE, apply, bandFor, describe as describeEngagement, estimates, places,
  hasPublicPresence, ENGAGEMENT_BANDS, ESTIMATE_PREFIX, RETURNING_AT, FAVOURITE_AT, MAX_EVENT_SECONDS,
  type CreatorRecord, type CreatorEvent,
} from './CreatorRecord';

const rec = (): CreatorRecord => ({ ...EMPTY_RECORD, disciplines: {}, places: {} });
const many = (r: CreatorRecord, e: CreatorEvent, n: number): CreatorRecord => {
  let out = r; for (let i = 0; i < n; i++) out = apply(out, e); return out;
};

describe('one record, one writer', () => {
  it('a session counts, and a discipline appears the first time it is played', () => {
    const r = apply(rec(), { kind: 'session', discipline: 'dunk' });
    expect(r.disciplines.dunk).toEqual({ ...EMPTY_DISCIPLINE, sessions: 1 });
  });

  it('time, completions and creations accumulate per discipline', () => {
    let r = apply(rec(), { kind: 'session', discipline: 'music' });
    r = apply(r, { kind: 'time', discipline: 'music', seconds: 90 });
    r = apply(r, { kind: 'completion', discipline: 'music' });
    r = apply(r, { kind: 'creation', discipline: 'music' });
    expect(r.disciplines.music).toEqual({ sessions: 1, seconds: 90, completions: 1, creations: 1 });
  });

  it('disciplines do not bleed into each other', () => {
    let r = apply(rec(), { kind: 'session', discipline: 'skate' });
    r = apply(r, { kind: 'session', discipline: 'surf' });
    expect(r.disciplines.skate.sessions).toBe(1);
    expect(r.disciplines.surf.sessions).toBe(1);
  });

  it('apply is PURE — the record handed in is never mutated', () => {
    const before = rec();
    const snapshot = JSON.stringify(before);
    apply(before, { kind: 'session', discipline: 'dunk' });
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('garbage in changes nothing rather than corrupting the record', () => {
    const r = rec();
    expect(apply(r, { kind: 'session', discipline: '' })).toBe(r);
    expect(apply(r, { kind: 'place', placeId: '' })).toBe(r);
    expect(apply(r, { kind: 'time', discipline: 'x', seconds: Number.NaN })).toBe(r);
    expect(apply(r, { kind: 'time', discipline: 'x', seconds: -50 })).toBe(r);
  });

  it('a single time event cannot claim more than half an hour', () => {
    // a tab left open for a week, or one glitched frame time, must not be able to make the estimate nonsense
    const r = apply(rec(), { kind: 'time', discipline: 'x', seconds: 999999 });
    expect(r.disciplines.x.seconds).toBe(MAX_EVENT_SECONDS);
  });
});

describe('PLACES ARE COUNTS — the shape cannot hold a trail', () => {
  it('a check-in increments a count and stores nothing else', () => {
    let r = apply(rec(), { kind: 'place', placeId: 'court_venice' });
    r = apply(r, { kind: 'place', placeId: 'court_venice' });
    expect(r.places.court_venice).toEqual({ visits: 2 });
    expect(Object.keys(r.places.court_venice)).toEqual(['visits']);
  });

  it('NO COORDINATES, NO TIMESTAMPS, NO TRAIL — anywhere in the record', () => {
    let r = rec();
    for (const id of ['court_venice', 'park_blossom', 'rooftop_orbit']) r = apply(r, { kind: 'place', placeId: id });
    r = apply(r, { kind: 'session', discipline: 'dunk' });
    const json = JSON.stringify(r);
    for (const forbidden of ['lat', 'lng', 'longitude', 'latitude', 'coord', 'accuracy', 'timestamp', 'at', 'when']) {
      expect(json.includes(`"${forbidden}"`), `the record carries a "${forbidden}" field`).toBe(false);
    }
  });

  it('places list most-visited first', () => {
    let r = rec();
    r = many(r, { kind: 'place', placeId: 'a' }, 1);
    r = many(r, { kind: 'place', placeId: 'b' }, 5);
    expect(places(r).map((p) => p.placeId)).toEqual(['b', 'a']);
  });
});

describe('ESTIMATED ENGAGEMENT — never a measurement', () => {
  it('every derived value is labelled as an estimate', () => {
    const r = many(rec(), { kind: 'session', discipline: 'dunk' }, 4);
    for (const e of estimates(r)) expect(e.label.startsWith(ESTIMATE_PREFIX)).toBe(true);
    expect(describeEngagement('x', undefined).label.startsWith(ESTIMATE_PREFIX)).toBe(true);
  });

  it('THE VOCABULARY CONTAINS NO CLINICAL OR DIAGNOSTIC LANGUAGE', () => {
    // the real risk is a word creeping in later, so this asserts the ABSENCE rather than the presence
    const forbidden = [
      'attention', 'focus', 'deficit', 'disorder', 'symptom', 'diagnos', 'assess', 'score', 'iq',
      'ability', 'aptitude', 'delay', 'impair', 'risk', 'concern', 'normal', 'abnormal', 'healthy',
      'treatment', 'therapy', 'clinical', 'evaluat', 'measur', 'test',
    ];
    const vocabulary = [...ENGAGEMENT_BANDS, ESTIMATE_PREFIX].join(' ').toLowerCase();
    for (const w of forbidden) expect(vocabulary.includes(w), `the vocabulary says "${w}"`).toBe(false);
  });

  it('the bands are about TIME SPENT IN A GAME and say so', () => {
    expect(ENGAGEMENT_BANDS).toEqual(['none', 'trying it', 'coming back', 'a favourite']);
  });

  it('a caller cannot invent a stronger claim — the label is fixed text', () => {
    const r = many(rec(), { kind: 'session', discipline: 'dunk' }, FAVOURITE_AT);
    expect(estimates(r)[0].label).toBe(`${ESTIMATE_PREFIX}: a favourite`);
  });

  it('bands move with repeat visits, not with how well anyone did', () => {
    expect(bandFor(undefined)).toBe('none');
    expect(bandFor({ ...EMPTY_DISCIPLINE, sessions: 1 })).toBe('trying it');
    expect(bandFor({ ...EMPTY_DISCIPLINE, sessions: RETURNING_AT })).toBe('coming back');
    expect(bandFor({ ...EMPTY_DISCIPLINE, sessions: FAVOURITE_AT })).toBe('a favourite');
    // a huge score in one session is still one session
    expect(bandFor({ sessions: 1, seconds: 3600, completions: 40, creations: 9 })).toBe('trying it');
  });

  it('a discipline never played does not appear at all', () => {
    const r = apply(rec(), { kind: 'session', discipline: 'dunk' });
    expect(estimates(r).map((e) => e.discipline)).toEqual(['dunk']);
    expect(estimates(rec())).toEqual([]);
  });

  it('strongest first, and time breaks a tie', () => {
    let r = rec();
    r = many(r, { kind: 'session', discipline: 'quiet' }, 3);
    r = many(r, { kind: 'session', discipline: 'loud' }, 3);
    r = apply(r, { kind: 'time', discipline: 'loud', seconds: 600 });
    expect(estimates(r)[0].discipline).toBe('loud');
  });
});

describe('UNDER 18 HAS NO PUBLIC PRESENCE', () => {
  it('a flagged record is not public, whatever else it contains', () => {
    const minor: CreatorRecord = { ...rec(), minor: true };
    expect(hasPublicPresence(minor)).toBe(false);
    const busy = many(minor, { kind: 'session', discipline: 'dunk' }, 20);
    expect(hasPublicPresence(busy)).toBe(false);
  });

  it('no record at all is not public either', () => {
    expect(hasPublicPresence(null)).toBe(false);
  });

  it('an adult record with activity is', () => {
    expect(hasPublicPresence(apply(rec(), { kind: 'session', discipline: 'dunk' }))).toBe(true);
  });
});

describe('NO-OP CLEANLY WHEN NO PROFILE EXISTS', () => {
  it('an empty record reads as empty everywhere, without throwing', () => {
    const r = rec();
    expect(estimates(r)).toEqual([]);
    expect(places(r)).toEqual([]);
    expect(describeEngagement('anything', undefined).band).toBe('none');
  });

  it('every read tolerates a missing discipline', () => {
    const r = rec();
    expect(bandFor(r.disciplines.nope)).toBe('none');
    expect(describeEngagement('nope', r.disciplines.nope).minutes).toBe(0);
  });
});
