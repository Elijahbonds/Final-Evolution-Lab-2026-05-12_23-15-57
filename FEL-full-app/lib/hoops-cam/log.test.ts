import { describe, expect, it } from 'vitest';
import { byZone, cleanSession, clearDeviceSessions, DEVICE_KEY, DEVICE_MAX, keepDeviceSession, readDeviceSessions, tally, trend, type ShotSession } from './log';
import { hoopsCamAccess, keepsSessions, TEEN_SHOT_SAVE } from './gate';

function mem() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); }, m };
}
const AT = Date.UTC(2026, 9, 26, 18);
const shots = (made: boolean[], spot: [number, number] | null = [0, 4.6]): ShotSession['shots'] =>
  made.map((m, i) => ({ t: i * 5000, made: m, fixed: false, x: spot ? spot[0] : null, z: spot ? spot[1] : null }));

describe('the shot log', () => {
  it('keeps numbers only, in one shape, and refuses anything else', () => {
    const s: ShotSession = { kind: 'shots', day: '2026-10-26', at: AT, placement: 'left_wing', shots: shots([true, false]) };
    expect(cleanSession(s)).toEqual(s);
    expect(cleanSession({ ...s, placement: 'roof' })).toBeNull();
    expect(cleanSession({ ...s, day: 'yesterday' })).toBeNull();
    expect(cleanSession({ ...s, shots: [{ t: 1, made: 'yes' }] })).toBeNull();
    // a frame smuggled in is dropped with the field: the clean copy carries only the named numbers
    const dirty = cleanSession({ ...s, frame: 'data:image/png;base64,AAAA', shots: [{ t: 1, made: true, image: 'x' }] }) as ShotSession;
    expect(JSON.stringify(dirty)).not.toMatch(/image|frame|data:/);
    expect(cleanSession({ kind: 'dribble', day: '2026-10-26', at: AT, count: 3, crossovers: 4, left: 0, right: 3, rateHz: 2, rhythmCv: 5, sec: 10 })).toBeNull();
  });

  it('keeps the newest DEVICE_MAX sessions on the phone, newest first, and clears them', () => {
    const s = mem();
    for (let k = 0; k < DEVICE_MAX + 5; k++) keepDeviceSession(s, { kind: 'shots', day: '2026-10-26', at: AT + k, placement: 'top', shots: shots([true]) });
    const all = readDeviceSessions(s);
    expect(all).toHaveLength(DEVICE_MAX);
    expect(all[0].at).toBe(AT + DEVICE_MAX + 4);
    s.m.set(DEVICE_KEY, 'not json');
    expect(readDeviceSessions(s)).toEqual([]);
    clearDeviceSessions(s);
    expect(s.m.has(DEVICE_KEY)).toBe(false);
  });

  it('the chart\'s zones and the make-% trend a day', () => {
    const z = byZone([...shots([true, true, false], [0, 0.6]), ...shots([false], [0, 7.3]), ...shots([true], null)]);
    expect(z.rim).toEqual({ made: 2, taken: 3 });
    expect(z.three).toEqual({ made: 0, taken: 1 });
    expect(tally(shots([true, false, true]))).toEqual({ made: 2, taken: 3 });
    const t = trend([
      { kind: 'shots', day: '2026-10-25', at: AT - 864e5, placement: 'top', shots: shots([true, false]) },
      { kind: 'shots', day: '2026-10-26', at: AT, placement: 'top', shots: shots([true, true, true, false]) },
      { kind: 'shots', day: '2026-10-26', at: AT + 1, placement: 'top', shots: shots([false]) },
    ]);
    expect(t).toEqual([{ day: '2026-10-25', made: 1, taken: 2, pct: 50 }, { day: '2026-10-26', made: 3, taken: 5, pct: 60 }]);
  });
});

describe('who may use it, and whose sessions are kept', () => {
  const now = new Date(Date.UTC(2026, 9, 26));
  it('13 and over; a teen\'s sessions are kept nowhere (owner call TEEN_SHOT_SAVE)', () => {
    expect(hoopsCamAccess({ signedIn: true, dobYear: 1995 }, now)).toEqual({ ok: true, tier: 'adult' });
    expect(hoopsCamAccess({ signedIn: true, dobYear: 2011 }, now)).toEqual({ ok: true, tier: 'teen' });
    expect(hoopsCamAccess({ signedIn: true, dobYear: 2015 }, now)).toEqual({ ok: false, error: 'under_13' });
    expect(hoopsCamAccess({ signedIn: true, dobYear: null }, now)).toEqual({ ok: false, error: 'age_unknown' });
    expect(TEEN_SHOT_SAVE).toBe(false);
    expect(keepsSessions('teen')).toBe(false);
    expect(keepsSessions('adult')).toBe(true);
  });
});
