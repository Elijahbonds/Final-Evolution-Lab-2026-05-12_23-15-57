// THE PROFILE SURVIVES A ROUND TRIP (2026-09-13).
//
// The brief's hard acceptance criterion: "SharedProfile must serialize to JSON and back with no loss." That
// is stricter than it sounds — the things that break a round trip are never the obvious fields. They are
// floats that lose a digit, empty collections that come back as undefined, absent optionals that come back
// as null, unicode that gets mangled, and a profile written by a LATER version that this build half-reads
// and silently misinterprets.
//
// So the round trip is tested structurally (deep equality on a profile built to contain every awkward case)
// rather than field by field, and the read path is tested against garbage the way the dunk card is — this
// object crosses a version boundary and an export made six months ago has to open.

import { describe, it, expect } from 'vitest';
import {
  SHARED_PROFILE_VERSION, emptyProfile, serialize, deserialize, roundTrip,
  currentPRQ, currentComposite, completedModules, credentials, prqTrend,
  type SharedProfile,
} from './sharedProfile';

/** A profile containing every shape that has ever broken a serialiser. */
function awkward(): SharedProfile {
  return {
    v: SHARED_PROFILE_VERSION,
    clientId: 'cl_abc123',
    displayName: 'Ké’Andre "AK" Ō—  🏀',          // unicode, quotes, an em dash, an emoji
    scans: [
      { attribute: 'verticalJump', value: 31.456789, unit: 'in', source: 'device', measuredAt: '2026-09-01T10:00:00.000Z', sessionId: 's1' },
      { attribute: 'ankleCompliance', value: 0, unit: 'score', source: 'manual', measuredAt: '2026-09-02T10:00:00.000Z' },  // zero, and NO sessionId
      { attribute: 'reach', value: -0.5, unit: 'in', source: 'manual', measuredAt: '2026-09-03T10:00:00.000Z' },            // negative
    ],
    prq: [
      { composite: 62.5, axes: { power: 70, speed: 55.25, control: 0 }, at: '2026-09-01T10:00:00.000Z', sourceScanAt: '2026-09-01T10:00:00.000Z' },
      { composite: 68, axes: {}, at: '2026-09-08T10:00:00.000Z' },                                                          // EMPTY axes, no source
    ],
    academy: [
      { trackKey: 'blueprint', moduleKey: 'm1', completedAt: '2026-08-01T00:00:00.000Z', score: 92, passed: true, curriculumVersion: '2026.09-draft1' },
      { trackKey: 'blueprint', moduleKey: 'm2', completedAt: '2026-08-05T00:00:00.000Z' },                                   // unassessed: no score, no passed
      { trackKey: 'blueprint', moduleKey: 'm3', completedAt: '2026-08-09T00:00:00.000Z', score: 41, passed: false },
    ],
    history: [
      { modeId: 'dunk', score: 214, at: '2026-09-10T00:00:00.000Z', outcome: 'CONTEST_WON' },
      { modeId: 'onevone', score: 0, at: '2026-09-11T00:00:00.000Z' },                                                       // zero score, no outcome
    ],
    signature: { zones: { rib_thoracic: 0.7142857142857143, upper_traps: 0 }, sessions: 7, updatedAt: '2026-09-12T00:00:00.000Z' },
    cards: [{ slug: 'ak-47', displayName: 'AK', mode: 'dunk', rarity: 'rare', prq: 68 }],
    assembledAt: '2026-09-13T12:00:00.000Z',
  };
}

describe('LOSSLESS ROUND TRIP — the brief’s acceptance criterion', () => {
  it('an awkward profile comes back deep-equal', () => {
    const p = awkward();
    expect(roundTrip(p)).toEqual(p);
  });

  it('an empty profile comes back deep-equal', () => {
    const p = emptyProfile('cl_new', 'Rookie');
    expect(roundTrip(p)).toEqual(p);
  });

  it('ABSENT OPTIONALS STAY ABSENT — they do not come back as null or undefined keys', () => {
    // the classic round-trip failure: `{...x, sessionId: undefined}` serialises away and deserialises as a
    // key that exists with value undefined, which is not deep-equal to a record that never had it
    const back = roundTrip(awkward())!;
    expect('sessionId' in back.scans[1]).toBe(false);
    expect('sourceScanAt' in back.prq[1]).toBe(false);
    expect('score' in back.academy[1]).toBe(false);
    expect('passed' in back.academy[1]).toBe(false);
    expect('outcome' in back.history[1]).toBe(false);
  });

  it('floats keep their precision, and zeros stay zeros', () => {
    const back = roundTrip(awkward())!;
    expect(back.scans[0].value).toBe(31.456789);
    expect(back.signature.zones.rib_thoracic).toBe(0.7142857142857143);
    expect(back.scans[1].value).toBe(0);
    expect(back.signature.zones.upper_traps).toBe(0);
    expect(back.prq[0].axes.control).toBe(0);
    expect(back.history[1].score).toBe(0);
  });

  it('negative values survive', () => {
    expect(roundTrip(awkward())!.scans[2].value).toBe(-0.5);
  });

  it('empty collections stay empty rather than becoming undefined', () => {
    const back = roundTrip(awkward())!;
    expect(back.prq[1].axes).toEqual({});
    expect(roundTrip(emptyProfile('x'))!.scans).toEqual([]);
    expect(roundTrip(emptyProfile('x'))!.signature.zones).toEqual({});
  });

  it('unicode, quotes and emoji survive the display name', () => {
    expect(roundTrip(awkward())!.displayName).toBe(awkward().displayName);
  });

  it('and it round-trips repeatedly without drifting', () => {
    let p = awkward();
    for (let i = 0; i < 5; i++) p = roundTrip(p)!;
    expect(p).toEqual(awkward());
  });
});

describe('THE READ PATH SURVIVES A PROFILE IT DID NOT WRITE', () => {
  it('garbage returns null rather than throwing', () => {
    for (const bad of [null, undefined, '', 'not json', '[]', '{}', '{"v":1}', 0, [], { v: 1, clientId: '' }]) {
      expect(() => deserialize(bad as never)).not.toThrow();
      expect(deserialize(bad as never), JSON.stringify(bad)).toBeNull();
    }
  });

  it('A FUTURE VERSION IS REFUSED, not half-read', () => {
    // a v2 field this build does not understand could carry meaning that silently changes what the profile
    // says, so it is better to show nothing than to show something wrong
    const future = { ...awkward(), v: SHARED_PROFILE_VERSION + 1 };
    expect(deserialize(JSON.stringify(future))).toBeNull();
  });

  it('an older profile missing whole sections still opens', () => {
    const old = deserialize(JSON.stringify({ v: 1, clientId: 'cl_old', displayName: 'Old' }))!;
    expect(old).not.toBeNull();
    expect(old.scans).toEqual([]);
    expect(old.signature).toEqual({ zones: {}, sessions: 0 });
    expect(old.cards).toEqual([]);
  });

  it('malformed rows are dropped, not allowed to poison the profile', () => {
    const p = deserialize(JSON.stringify({
      v: 1, clientId: 'cl_x',
      scans: [{ attribute: 'ok', value: 1 }, { value: 2 }, null, 'nope'],
      academy: [{ moduleKey: 'm1' }, {}],
      history: [{ modeId: 'dunk', score: 1 }, { score: 2 }],
      cards: [{ slug: 's' }, {}],
    }))!;
    expect(p.scans).toHaveLength(1);
    expect(p.academy).toHaveLength(1);
    expect(p.history).toHaveLength(1);
    expect(p.cards).toHaveLength(1);
  });

  it('nonsense numbers never reach a screen as NaN', () => {
    const p = deserialize(JSON.stringify({
      v: 1, clientId: 'cl_x',
      scans: [{ attribute: 'a', value: 'twelve', unit: 1, source: null, measuredAt: 5 }],
      signature: { zones: { z: 'lots' }, sessions: 'many' },
    }))!;
    expect(Number.isNaN(p.scans[0].value)).toBe(false);
    expect(p.scans[0].value).toBe(0);
    expect(p.signature.zones.z).toBe(0);
    expect(p.signature.sessions).toBe(0);
  });

  it('deserialize accepts a parsed object as well as a string', () => {
    expect(deserialize(JSON.parse(serialize(awkward())))).toEqual(awkward());
  });
});

describe('reading a profile', () => {
  it('the current PRQ is the newest, not the last in the array', () => {
    const p = awkward();
    p.prq.reverse();                       // out of order on purpose
    expect(currentPRQ(p)!.at).toBe('2026-09-08T10:00:00.000Z');
    expect(currentComposite(p)).toBe(68);
  });

  it('AN UNSCANNED ATHLETE IS NULL, NOT 50', () => {
    // "never scanned" and "average" are different states, and a coach acts differently on each
    expect(currentPRQ(emptyProfile('x'))).toBeNull();
    expect(currentComposite(emptyProfile('x'))).toBeNull();
  });

  it('credentials are PASSED modules only', () => {
    const p = awkward();
    expect(credentials(p).map((c) => c.moduleKey)).toEqual(['m1']);
    expect(completedModules(p, 'blueprint')).toEqual(['m1', 'm2', 'm3']);
    expect(completedModules(p, 'nothing')).toEqual([]);
  });

  it('a trend needs two points, and says so by returning null', () => {
    const p = awkward();
    expect(prqTrend(p, '2026-01-01T00:00:00.000Z')).toBe(5.5);
    expect(prqTrend(p, '2026-09-05T00:00:00.000Z')).toBeNull();   // only one snapshot in window
    expect(prqTrend(emptyProfile('x'), '2000-01-01T00:00:00.000Z')).toBeNull();
  });
});

describe('no clinical language in the type surface or its output', () => {
  const CLINICAL = ['diagnos', 'patholog', 'symptom', 'therap', 'treat', 'patient', 'disorder', 'injur'];

  it('nothing a profile carries reads as a health claim', () => {
    const blob = serialize(awkward()).toLowerCase();
    for (const bad of CLINICAL) expect(blob, bad).not.toContain(bad);
  });
});
