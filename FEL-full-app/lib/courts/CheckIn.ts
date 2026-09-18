// Courts — GEO CHECK-IN v1 (2026-09-13).
//
// Mission constraints, verbatim, and each one is answered by a specific decision below:
//   · "foreground and explicit only... Never request location on page load or in the background"
//   · "Nothing scarce, tradeable, competitive, or gameplay-affecting may come from a check-in"
//   · "The Creator Card stores placeId and visit counts only. Never raw coordinates, never per-session
//      timestamps, never a movement trail"
//   · "Accounts flagged under 18 have no public presence in this system at all"
//   · "Do not create, schedule, or reward late-night windows"
//   · "Depends on the Creator Card canonical record and emit() contract. If that mission has not shipped,
//      stop and report" — it has: lib/creator/CreatorRecord.ts.
//
// WHAT A CHECK-IN IS HERE. You are standing at a real court, you press a button, and the game says "yes,
// that's Venice" and remembers that you have been. That is the whole feature. It is a memory, not a
// currency: nothing you can trade, nothing anyone can beat you at, nothing that changes how the game plays.
//
// WHY THAT RESTRAINT IS THE DESIGN AND NOT A LIMITATION. The moment a check-in grants something scarce, the
// incentive is to be somewhere — and the people most able to act on that incentive are the ones with a car,
// free evenings and a safe neighbourhood. A reward for being at a place at a time is a reward for a
// circumstance. So the feature is allowed to be warm and is not allowed to be worth anything.
//
// THE COORDINATE LIFETIME. A fix enters this module, is compared against the known courts, and is discarded
// in the same function. It is never stored, never logged, never sent anywhere. `resolve()` returns a placeId
// or null — there is no code path in this file that can persist a latitude, which is a stronger guarantee
// than a rule saying we will not.
//
// Pure: no browser API is called here. The geolocation call itself lives in requestFix(), at the bottom,
// behind an explicit user gesture the caller has to provide.

/** A court the game knows about. */
export interface Court {
  id: string;
  name: string;
  /** One line for the sheet. */
  blurb: string;
  lat: number;
  lng: number;
  /** How close you have to be, metres. */
  radiusM: number;
}

/**
 * The courts, v1.
 *
 * These are the locations the game already renders (docs/SPEC-COURT-LOCATIONS.md). A court appears here
 * because the game has a version of it, so a check-in means "you stood where this is" rather than "you
 * stood at a pin we dropped".
 */
export const COURTS: readonly Court[] = [
  { id: 'venice', name: 'VENICE', blurb: 'The boardwalk court.', lat: 33.9850, lng: -118.4695, radiusM: 120 },
  { id: 'blossom', name: 'BLOSSOM PARK', blurb: 'Trees over the fence line.', lat: 34.0983, lng: -118.3267, radiusM: 120 },
  { id: 'orbit', name: 'ORBIT', blurb: 'The rooftop with the city behind it.', lat: 34.0430, lng: -118.2673, radiusM: 90 },
  { id: 'canopy', name: 'CANOPY', blurb: 'Shade all afternoon.', lat: 34.1381, lng: -118.3534, radiusM: 120 },
];

export function courtById(id: string): Court | null {
  return COURTS.find((c) => c.id === id) ?? null;
}

// ── Distance ───────────────────────────────────────────────────────────────
const R_EARTH_M = 6371008.8;
const rad = (d: number): number => (d * Math.PI) / 180;

/** Great-circle distance in metres. */
export function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** What the browser handed us. Lives for the length of one function call. */
export interface Fix { lat: number; lng: number; accuracyM: number }

/**
 * A fix worse than this cannot place you at a court.
 *
 * 250 m is deliberately generous — a phone indoors reports poor accuracy and a player standing at the court
 * should not be told they are not there because of the weather. The radius check still has to pass, so a
 * loose fix cannot check you in somewhere you are not; it can only fail to check you in somewhere you are.
 */
export const MAX_ACCURACY_M = 250;

/**
 * Which court is this fix at, if any.
 *
 * THE COORDINATES DIE HERE. They come in as an argument, they are compared, and a string or null goes out.
 * Nothing in this function writes, caches or transmits them.
 */
export function resolve(fix: Fix, courts: readonly Court[] = COURTS): string | null {
  if (!Number.isFinite(fix.lat) || !Number.isFinite(fix.lng)) return null;
  if (!(fix.accuracyM <= MAX_ACCURACY_M)) return null;          // NaN fails this, which is correct
  let best: { id: string; d: number } | null = null;
  for (const c of courts) {
    const d = distanceM(fix.lat, fix.lng, c.lat, c.lng);
    if (d <= c.radiusM && (!best || d < best.d)) best = { id: c.id, d };
  }
  return best?.id ?? null;
}

// ── What a check-in may and may not give you ───────────────────────────────
/**
 * Everything a check-in can produce.
 *
 * There is no `reward`, no `points`, no `item`, no `rank` and no `streak` field — not because we chose not
 * to populate them, but because the type has nowhere to put them. A shape that cannot express a prize
 * cannot accidentally grant one, and a later change that wants to would have to say so out loud, here, in
 * a diff someone reads.
 */
export interface CheckInResult {
  placeId: string;
  name: string;
  /** How many times this player has been here, after this visit. */
  visits: number;
  /** The line the game says back. Warm, and worth nothing. */
  greeting: string;
}

/**
 * The one thing a check-in unlocks: the court's own look, in a mode the player was already going to play.
 *
 * Cosmetic, already in the build, available to everyone from the splash picker regardless — so a player who
 * never leaves the house is not behind one that does. This is the line the mission draws, and it is why the
 * greeting mentions a place rather than a prize.
 */
export function greetingFor(court: Court, visits: number): string {
  if (visits <= 1) return `First time at ${court.name}.`;
  if (visits === 2) return `Back at ${court.name}.`;
  if (visits < 6) return `${court.name} again — ${visits} visits.`;
  return `${court.name} is yours. ${visits} visits.`;
}

/**
 * NO LATE-NIGHT WINDOWS.
 *
 * The mission forbids creating, scheduling or rewarding them, and the strongest way to honour that is for
 * this system to have no concept of time at all: there is no hour in the record (visit counts only), no
 * schedule, no window, no bonus. This function exists to be the place where someone would add one, and to
 * say no. It is asserted by the tests.
 */
export const HAS_TIME_WINDOWS = false;

// ── The check-in ───────────────────────────────────────────────────────────
/**
 * Record a resolved check-in through the canonical record's emit().
 *
 * `emit` is injected rather than imported so this stays pure and testable, and so the dependency the mission
 * names is explicit at the call site: Courts writes to the Creator Card and to nothing else. No parallel
 * store, no courts-only profile.
 */
export function checkIn(
  placeId: string,
  emit: (e: { kind: 'place'; placeId: string }) => { places: Record<string, { visits: number }> } | null,
): CheckInResult | null {
  const court = courtById(placeId);
  if (!court) return null;
  const rec = emit({ kind: 'place', placeId });
  const visits = rec?.places?.[placeId]?.visits ?? 1;
  return { placeId, name: court.name, visits, greeting: greetingFor(court, visits) };
}

// ── The only place the browser is touched ──────────────────────────────────
/**
 * Ask for one fix, once, because the player just pressed a button.
 *
 * FOREGROUND AND EXPLICIT ONLY. This must be called from a user gesture handler and nowhere else: not on
 * page load, not on an interval, not from a service worker, not "warmed up" ahead of time. There is no
 * watchPosition in this module and no background permission is ever requested — one call, one fix, and the
 * caller's own comment should say which button it came from.
 *
 * Resolves null rather than throwing when the player says no, when the API is missing, or when it times out:
 * declining to share your location is a normal answer, not an error state.
 */
export const FIX_TIMEOUT_MS = 10_000;

export async function requestFix(): Promise<Fix | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
  return new Promise<Fix | null>((res) => {
    let done = false;
    const finish = (v: Fix | null): void => { if (!done) { done = true; res(v); } };
    try {
      navigator.geolocation.getCurrentPosition(
        (p) => finish({ lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: p.coords.accuracy ?? 9999 }),
        () => finish(null),
        // maximumAge 0: a cached fix from some earlier moment is not where the player is standing NOW, and
        // "are you at the court" is a question about now. enableHighAccuracy for the same reason.
        { enableHighAccuracy: true, timeout: FIX_TIMEOUT_MS, maximumAge: 0 },
      );
    } catch { finish(null); }
  });
}

/**
 * The whole flow, for a button handler: ask, resolve, record, discard.
 *
 * The fix is a local const that goes out of scope when this function returns. That is the entire lifetime of
 * a coordinate in this system.
 */
export async function checkInHere(
  emit: (e: { kind: 'place'; placeId: string }) => { places: Record<string, { visits: number }> } | null,
): Promise<{ ok: true; result: CheckInResult } | { ok: false; why: 'denied' | 'inaccurate' | 'away' }> {
  const fix = await requestFix();
  if (!fix) return { ok: false, why: 'denied' };
  if (!(fix.accuracyM <= MAX_ACCURACY_M)) return { ok: false, why: 'inaccurate' };
  const placeId = resolve(fix);
  if (!placeId) return { ok: false, why: 'away' };
  const result = checkIn(placeId, emit);
  return result ? { ok: true, result } : { ok: false, why: 'away' };
}

/** What to say when it did not work. None of these is a failure the player should feel bad about. */
export const CHECK_IN_MESSAGES: Record<'denied' | 'inaccurate' | 'away', string> = {
  denied: 'No location shared — that is fine, everything works without it.',
  inaccurate: 'Could not get a clear fix. Try again outside.',
  away: 'No court here yet.',
};
