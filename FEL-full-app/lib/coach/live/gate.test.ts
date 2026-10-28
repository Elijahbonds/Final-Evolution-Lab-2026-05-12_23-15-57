import { describe, expect, it } from 'vitest';
import { decideLiveRoom, parseRoomId, roomIdOf, type LiveGateInput } from './gate';

const now = new Date('2026-10-25T18:00:00Z');
const program = (o: Partial<LiveGateInput> = {}): LiveGateInput => ({
  userId: 'coach1', now, coachAdult: true, clientVerifiedAdult: true, client: { ok: true, band: 'adult' },
  room: { kind: 'program', program: { coachId: 'coach1', clientId: 'client1' }, rosterLive: true }, ...o,
});
const booking = (o: Partial<LiveGateInput> & { status?: string; kind?: string; startsAt?: Date } = {}): LiveGateInput => ({
  userId: 'client1', now, coachAdult: true, clientVerifiedAdult: true, client: { ok: true, band: 'adult' },
  room: { kind: 'booking', askerAdult: true, booking: {
    coachUserId: 'coach1', clientUserId: 'client1', status: o.status ?? 'PAID', kind: o.kind ?? 'live_1on1',
    startsAt: o.startsAt ?? new Date('2026-10-25T18:05:00Z'), endsAt: new Date('2026-10-25T19:05:00Z'),
  } }, ...o,
});

describe('room ids', () => {
  it('p_ and b_ only, with a sane id', () => {
    expect(parseRoomId('p_ckabc123')).toEqual({ kind: 'program', id: 'ckabc123' });
    expect(parseRoomId('b_ckabc123')).toEqual({ kind: 'booking', id: 'ckabc123' });
    expect(roomIdOf({ kind: 'booking', id: 'ckabc123' })).toBe('b_ckabc123');
    for (const bad of ['x_ckabc123', 'p_', 'p_../../etc', 'p_a', 42, null]) expect(parseRoomId(bad)).toBeNull();
  });
});

describe('who opens a live room', () => {
  it('a live roster link: the coach and the client, with their roles', () => {
    expect(decideLiveRoom(program())).toMatchObject({ ok: true, role: 'coach', clientVideo: true });
    expect(decideLiveRoom(program({ userId: 'client1' }))).toMatchObject({ ok: true, role: 'client' });
  });
  it('nobody else, and the same 404 whether the program exists or not', () => {
    expect(decideLiveRoom(program({ userId: 'stranger' }))).toEqual({ ok: false, status: 404, error: 'not_found' });
    expect(decideLiveRoom(program({ room: { kind: 'program', program: null, rosterLive: false } }))).toEqual({ ok: false, status: 404, error: 'not_found' });
  });
  it('an ended roster link opens nothing', () => {
    expect(decideLiveRoom(program({ room: { kind: 'program', program: { coachId: 'coach1', clientId: 'client1' }, rosterLive: false } })))
      .toMatchObject({ ok: false, error: 'roster_ended' });
  });
  it('a booked session: the coach store\'s own rule (paid, live_1on1, in its window, adults)', () => {
    expect(decideLiveRoom(booking())).toMatchObject({ ok: true, role: 'client' });
    expect(decideLiveRoom(booking({ status: 'HELD' }))).toMatchObject({ ok: false, error: 'not_found' });
    expect(decideLiveRoom(booking({ kind: 'video_review' }))).toMatchObject({ ok: false, error: 'not_found' });
    expect(decideLiveRoom(booking({ startsAt: new Date('2026-10-25T19:00:00Z') }))).toMatchObject({ ok: false, error: 'not_open_yet' });
  });
  it('the coach is a verified adult', () => {
    expect(decideLiveRoom(program({ coachAdult: false }))).toMatchObject({ ok: false, error: 'coach_not_adult' });
  });
});

describe('age: the teen gate, and no live video from a minor', () => {
  it('under 13, a blank year, or a teen without coach-training consent: closed for both sides', () => {
    for (const error of ['under_13', 'age_required', 'guardian_consent_required'] as const) {
      expect(decideLiveRoom(program({ client: { ok: false, error } }))).toMatchObject({ ok: false, error });
      expect(decideLiveRoom(program({ userId: 'client1', client: { ok: false, error } }))).toMatchObject({ ok: false, error });
    }
  });
  it('a consented teen gets pose + voice, never video', () => {
    expect(decideLiveRoom(program({ client: { ok: true, band: 'teen' }, clientVerifiedAdult: false })))
      .toMatchObject({ ok: true, clientBand: 'teen', clientVideo: false });
  });
  it('an adult by the teen gate but not VERIFIED adult (18 by year): no video', () => {
    expect(decideLiveRoom(program({ clientVerifiedAdult: false }))).toMatchObject({ ok: true, clientVideo: false });
  });
});
