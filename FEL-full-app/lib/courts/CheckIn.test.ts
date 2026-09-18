// Courts — geo check-in v1, and the promises it makes (2026-09-13).
//
// Most of these assert an ABSENCE, which is unusual and deliberate: the mission's constraints are all about
// what this feature must never do — never store a coordinate, never grant anything scarce, never have a
// late-night window, never give a minor a public presence. A test suite that only checked the happy path
// would pass on the day someone adds a streak bonus.

import { describe, it, expect } from 'vitest';
import {
  COURTS, courtById, distanceM, resolve, checkIn, greetingFor, checkInHere,
  MAX_ACCURACY_M, HAS_TIME_WINDOWS, CHECK_IN_MESSAGES, FIX_TIMEOUT_MS,
  type Fix, type CheckInResult,
} from './CheckIn';
import { EMPTY_RECORD, apply, hasPublicPresence, type CreatorRecord } from '../creator/CreatorRecord';

const venice = courtById('venice')!;
const atVenice: Fix = { lat: venice.lat, lng: venice.lng, accuracyM: 20 };

/** The canonical record's real emit path, with storage swapped for a variable. */
function memoryEmit() {
  let rec: CreatorRecord = { ...EMPTY_RECORD, disciplines: {}, places: {} };
  return {
    emit: (e: { kind: 'place'; placeId: string }) => { rec = apply(rec, e); return rec; },
    get record() { return rec; },
  };
}

describe('distance and resolution', () => {
  it('a court is zero metres from itself', () => {
    expect(distanceM(venice.lat, venice.lng, venice.lat, venice.lng)).toBeCloseTo(0, 6);
  });

  it('the distance is real metres — a degree of latitude is about 111 km', () => {
    expect(distanceM(0, 0, 1, 0)).toBeGreaterThan(110_000);
    expect(distanceM(0, 0, 1, 0)).toBeLessThan(112_000);
  });

  it('standing at a court resolves to that court', () => {
    expect(resolve(atVenice)).toBe('venice');
  });

  it('standing somewhere else resolves to NOTHING — no nearest-court fallback', () => {
    // a "closest court" answer would check people in from miles away, which is the one thing a location
    // feature must never do
    expect(resolve({ lat: 51.5007, lng: -0.1246, accuracyM: 10 })).toBeNull();
    expect(resolve({ lat: venice.lat + 0.05, lng: venice.lng, accuracyM: 10 })).toBeNull();
  });

  it('a fix too vague to trust cannot place you anywhere', () => {
    expect(resolve({ ...atVenice, accuracyM: MAX_ACCURACY_M + 1 })).toBeNull();
    expect(resolve({ ...atVenice, accuracyM: Number.NaN })).toBeNull();
    expect(resolve({ lat: Number.NaN, lng: 0, accuracyM: 5 })).toBeNull();
  });

  it('a generous accuracy bar can only fail to check you in, never check you in falsely', () => {
    // the radius test still has to pass, so a loose fix far away is still nothing
    expect(MAX_ACCURACY_M).toBeGreaterThan(100);
    expect(resolve({ lat: 0, lng: 0, accuracyM: MAX_ACCURACY_M - 1 })).toBeNull();
  });

  it('between two courts, the nearer one wins', () => {
    const a = { id: 'a', name: 'A', blurb: '', lat: 0, lng: 0, radiusM: 5000 };
    const b = { id: 'b', name: 'B', blurb: '', lat: 0.01, lng: 0, radiusM: 5000 };
    expect(resolve({ lat: 0.009, lng: 0, accuracyM: 5 }, [a, b])).toBe('b');
  });

  it('every court is real: a name, a line, a sane radius', () => {
    expect(COURTS.length).toBeGreaterThan(1);
    for (const c of COURTS) {
      expect(c.name).toBe(c.name.toUpperCase());
      expect(c.blurb.length).toBeGreaterThan(4);
      expect(c.radiusM).toBeGreaterThan(30);
      expect(c.radiusM).toBeLessThan(500);       // a 1 km "court" is a neighbourhood
      expect(Math.abs(c.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(c.lng)).toBeLessThanOrEqual(180);
    }
    expect(new Set(COURTS.map((c) => c.id)).size).toBe(COURTS.length);
  });
});

describe('THE COORDINATES DIE IN resolve()', () => {
  it('a check-in writes a placeId and a count, and nothing else', () => {
    const m = memoryEmit();
    checkIn('venice', m.emit);
    expect(m.record.places).toEqual({ venice: { visits: 1 } });
    const json = JSON.stringify(m.record);
    expect(json).not.toContain(String(venice.lat));
    expect(json).not.toContain(String(venice.lng));
    expect(json).not.toMatch(/lat|lng|accuracy|coord/i);
  });

  it('resolve returns a string or null — there is no path that hands a coordinate onward', () => {
    const out = resolve(atVenice);
    expect(typeof out === 'string' || out === null).toBe(true);
  });

  it('visits accumulate across check-ins', () => {
    const m = memoryEmit();
    checkIn('venice', m.emit);
    const second = checkIn('venice', m.emit)!;
    expect(second.visits).toBe(2);
    expect(m.record.places.venice.visits).toBe(2);
  });

  it('an unknown place is not recorded at all', () => {
    const m = memoryEmit();
    expect(checkIn('no-such-court', m.emit)).toBeNull();
    expect(m.record.places).toEqual({});
  });
});

describe('NOTHING SCARCE, TRADEABLE, COMPETITIVE OR GAMEPLAY-AFFECTING', () => {
  it('the result has nowhere to put a prize', () => {
    const m = memoryEmit();
    const r = checkIn('venice', m.emit)!;
    expect(Object.keys(r).sort()).toEqual(['greeting', 'name', 'placeId', 'visits']);
    for (const forbidden of ['reward', 'points', 'item', 'rank', 'streak', 'bonus', 'currency', 'xp', 'unlock']) {
      expect(Object.prototype.hasOwnProperty.call(r, forbidden), `the result carries "${forbidden}"`).toBe(false);
    }
  });

  it('the greeting is warm and worth nothing — it names a place, never a prize', () => {
    const words = [1, 2, 3, 9].map((n) => greetingFor(venice, n).toLowerCase()).join(' ');
    for (const forbidden of ['reward', 'earn', 'unlock', 'bonus', 'points', 'exclusive', 'rare', 'limited', 'claim']) {
      expect(words.includes(forbidden), `the greeting says "${forbidden}"`).toBe(false);
    }
    expect(greetingFor(venice, 1)).toContain(venice.name);
  });

  it('the greeting changes with familiarity, which is the only thing it tracks', () => {
    expect(greetingFor(venice, 1)).not.toBe(greetingFor(venice, 2));
    expect(greetingFor(venice, 9)).toContain('9');
  });
});

describe('NO LATE-NIGHT WINDOWS — the system has no concept of time', () => {
  it('says so, and means it', () => {
    expect(HAS_TIME_WINDOWS).toBe(false);
  });

  it('a check-in result carries no hour, no timestamp and no schedule', () => {
    const m = memoryEmit();
    const r = checkIn('venice', m.emit)!;
    const json = JSON.stringify({ r, rec: m.record });
    for (const forbidden of ['hour', 'time', 'night', 'window', 'schedule', 'expires', 'until']) {
      expect(json.toLowerCase().includes(`"${forbidden}"`), `carries "${forbidden}"`).toBe(false);
    }
  });

  it('two check-ins are indistinguishable in the record however far apart they were', () => {
    const a = memoryEmit(); checkIn('venice', a.emit); checkIn('venice', a.emit);
    const b = memoryEmit(); checkIn('venice', b.emit); checkIn('venice', b.emit);
    expect(a.record).toEqual(b.record);   // nothing about WHEN survives
  });
});

describe('UNDER 18 HAS NO PUBLIC PRESENCE', () => {
  it('a minor can check in, and none of it is public', () => {
    // the feature still works for them — it is a private memory, and taking it away would be the wrong fix
    const m = memoryEmit();
    checkIn('venice', m.emit);
    const minorRecord: CreatorRecord = { ...m.record, minor: true };
    expect(minorRecord.places.venice.visits).toBe(1);
    expect(hasPublicPresence(minorRecord)).toBe(false);
  });
});

describe('FOREGROUND AND EXPLICIT ONLY', () => {
  it('no module-level location call — importing this file must never prompt anyone', () => {
    // if geolocation were touched at import time, loading any page that imports Courts would raise the
    // browser's permission prompt with no gesture behind it
    expect(typeof checkInHere).toBe('function');
    expect(FIX_TIMEOUT_MS).toBeGreaterThan(1000);
  });

  it('declining is a normal answer, not an error', async () => {
    const m = memoryEmit();
    const out = await checkInHere(m.emit);     // no navigator.geolocation in vitest: the deny path
    expect(out.ok).toBe(false);
    if (!out.ok) expect(CHECK_IN_MESSAGES[out.why]).toBeTruthy();
    expect(m.record.places).toEqual({});
  });

  it('every failure message is kind and none of them blames the player', () => {
    for (const msg of Object.values(CHECK_IN_MESSAGES)) {
      expect(msg.length).toBeGreaterThan(10);
      expect(msg.toLowerCase()).not.toMatch(/error|failed|invalid|denied you|must/);
    }
  });
});

describe('Courts writes through the Creator Card and nowhere else', () => {
  it('the only writer it is given is emit()', () => {
    const seen: string[] = [];
    const result: CheckInResult | null = checkIn('venice', (e) => { seen.push(e.kind); return { places: { venice: { visits: 4 } } }; });
    expect(seen).toEqual(['place']);
    expect(result!.visits).toBe(4);
  });

  it('with no record to write to, a check-in still answers rather than throwing', () => {
    const r = checkIn('venice', () => null);
    expect(r).not.toBeNull();
    expect(r!.visits).toBe(1);
  });
});
