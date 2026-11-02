// GROUP-BOOKING (owner, 2026-11-02): the real routes over the in-memory pending tables (tests/helpers/fakeGroupBookingDb.ts),
// the way the coach lanes test theirs. Fail closed before the SQL (0 writes); join (package, drop-in, full), capacity to 8,
// the waitlist, already booked; the teen gate (under 13, teen without consent, blank year); cancel free vs late; make-ups
// through the route; the coach's board (one line per group, the under-6 notice), roster, attendance, paid in person, move
// gym, open at another gym, message the group, gym addresses; 1:1 in person (slots, book, double booking) vs online; the
// trainer invite; and pay at the gym: no route here ever reaches a checkout.
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GBState } from '@/tests/helpers/fakeGroupBookingDb';

const h = vi.hoisted(() => ({ db: null as unknown, user: 'ada' as string | null }));
vi.mock('@/lib/db', () => ({ prisma: new Proxy({}, { get: (_t, p) => (p === 'then' ? undefined : (h.db as Record<string | symbol, unknown>)[p]) }) }));
vi.mock('@/lib/camp/server', () => ({ currentUserId: async () => h.user, bad: (error: string, status = 400) => Response.json({ error }, { status }) }));

import { POST as reservePOST } from '@/app/api/group-booking/reserve/route';
import { POST as waitPOST } from '@/app/api/group-booking/waitlist/route';
import { GET as meGET, POST as mePOST } from '@/app/api/group-booking/me/route';
import { GET as slotsGET, POST as bookPOST } from '@/app/api/group-booking/one-on-one/route';
import { GET as coachGET, POST as coachPOST } from '@/app/api/group-booking/coach/route';
import { POST as trainerPOST } from '@/app/api/group-booking/trainer/route';
import { groupsBoard, oneOnOneBoard, type GroupDb } from '@/lib/group-booking/server';
import { resetGroupBookingProbe } from '@/lib/group-booking/store';
import { adult, child, fakeGroupBookingDb, groupRow, teen } from '@/tests/helpers/fakeGroupBookingDb';

let state: GBState;
let db: GroupDb;
const post = (url: string, body: unknown) => new NextRequest(`http://fel.test${url}`, { method: 'POST', body: JSON.stringify(body) });
const get = (url: string) => new NextRequest(`http://fel.test${url}`);
const as = (u: string | null) => { h.user = u; };
const json = async (r: Response) => ({ status: r.status, body: await r.json() });
const reserve = async (u: string, body: unknown) => { as(u); return json(await reservePOST(post('/api/group-booking/reserve', body))); };
const coach = async (body: unknown) => { as('owner'); return json(await coachPOST(post('/api/group-booking/coach', body))); };

const NOW = new Date('2026-11-02T20:00:00Z');   // Mon Nov 2, noon PT; group g1 starts Mon Nov 9 at 5 pm PT

beforeEach(() => {
  resetGroupBookingProbe();
  vi.unstubAllEnvs();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.stubEnv('GROUP_BOOKING_OWNER_ID', 'owner');
  for (const k of ['GROUP_BOOKING_ONLINE_PAYMENT', 'COACH_CONNECT_PAYMENTS_ENABLED', 'STRIPE_SECRET_KEY', 'GROUP_TRAINERS_BOOKABLE', 'COACH_STORE_ENABLED']) vi.stubEnv(k, '');
  ({ db, state } = fakeGroupBookingDb({
    users: [adult('owner', 'Elijah'), adult('ada', 'Ada'), teen('tia', 'Tia'), child('kid'), { id: 'blank', name: 'Blank', dobYear: null },
      ...Array.from({ length: 9 }, (_, i) => adult(`p${i}`, `P${i}`)), adult('tom', 'Tom')],
    groups: [groupRow()],
  }));
  h.db = db;
  as('ada');
});

describe('fail closed until the pending SQL is applied', () => {
  it('every page reads "not available", every write 503, and nothing is written', async () => {
    state.ready = false;
    expect((await groupsBoard(db)).body).toEqual({ available: false });
    expect((await oneOnOneBoard(db)).body).toEqual({ available: false });
    expect(await reserve('ada', { groupId: 'g1', option: 'package' })).toEqual({ status: 503, body: { error: 'group_booking_not_ready' } });
    as('ada');
    expect((await json(await waitPOST(post('/api/group-booking/waitlist', { groupId: 'g1' })))).status).toBe(503);
    expect((await json(await meGET())).body).toEqual({ available: false });
    expect((await json(await mePOST(post('/api/group-booking/me', { action: 'cancel', seatId: 'x' })))).status).toBe(503);
    expect((await json(await bookPOST(post('/api/group-booking/one-on-one', { trainerId: 'owner' })))).status).toBe(503);
    as('owner');
    expect((await json(await coachGET(get('/api/group-booking/coach')))).body).toEqual({ available: false });
    expect((await coach({ action: 'create_group', name: 'X' })).status).toBe(503);
    expect((await json(await trainerPOST(post('/api/group-booking/trainer', { code: 'a'.repeat(24) })))).status).toBe(503);
    expect(state.writes).toEqual([]);
    expect(state.ran.every((k) => k === 'probe')).toBe(true);
  });

  it('no owner configured: closed too', async () => {
    vi.stubEnv('GROUP_BOOKING_OWNER_ID', '');
    vi.stubEnv('COACH_STORE_COACH_USER_IDS', '');
    expect((await groupsBoard(db)).body).toEqual({ available: false });
    expect((await reserve('ada', { groupId: 'g1', option: 'package' })).status).toBe(503);
    expect(state.writes).toEqual([]);
  });

  it('signed out: 401, nothing read', async () => {
    expect((await reserve(null as unknown as string, { groupId: 'g1', option: 'package' })).status).toBe(401);
    as(null);
    expect((await json(await coachGET(get('/api/group-booking/coach')))).status).toBe(401);
    expect(state.ran).toEqual([]);
  });
});

describe('joining a group', () => {
  it('the board: by gym, days and time, with seats left and the three options at the owner\'s prices', async () => {
    const b = (await groupsBoard(db)).body as any;
    expect(b.available).toBe(true);
    expect(b.groups[0]).toMatchObject({ id: 'g1', gymName: '24 Hour Fitness Victory', gymAddress: null, days: 'Mon & Wed', time: '5 pm', seatsLeft: 8, full: false, trainerName: 'Elijah', lateJoin: false });
    expect(b.groups[0].options.map((o: any) => [o.kind, o.priceLabel, o.sessions])).toEqual([['drop_in', '$65 · pay at the gym', 1], ['package', '$400 · pay at the gym', 8], ['full', '$800 · pay at the gym', 16]]);
    expect(b.format).toBe('30 min strength & conditioning + 30 min correctives & athletic skill');
    expect(b.gyms.map((g: any) => g.address)).toEqual([null, null, null]);   // blank until the owner fills them in
  });

  it('a package: 8 seats, pay at the gym, a calendar file; the same person again is "already booked"', async () => {
    const r = await reserve('ada', { groupId: 'g1', option: 'package' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ ok: true, seats: 8, priceCents: 40000, pay: { mode: 'at_gym' } });
    expect((r.body.ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(8);
    expect(r.body.ics).toContain('LOCATION:24 Hour Fitness Victory');
    expect(state.passes).toMatchObject([{ userId: 'ada', kind: 'package', sessions: 8, priceCents: 40000, payMode: 'at_gym', paidAt: null, windowEnd: '2026-12-06' }]);
    expect(state.seats.map((s) => s.seat)).toEqual(Array(8).fill(1));
    expect(await reserve('ada', { groupId: 'g1', option: 'drop_in' })).toEqual({ status: 409, body: { error: 'already_booked' } });
  });

  it('drop-in and the full 8 weeks', async () => {
    expect((await reserve('p0', { groupId: 'g1', option: 'drop_in', date: '2026-11-11' })).body).toMatchObject({ seats: 1, priceCents: 6500 });
    expect(state.seats.find((s) => s.userId === 'p0')!.date).toBe('2026-11-11');
    expect((await reserve('p1', { groupId: 'g1', option: 'full' })).body).toMatchObject({ seats: 16, priceCents: 80000 });
    expect((await reserve('p2', { groupId: 'g1', option: 'monthly' })).body).toEqual({ error: 'bad_option' });
  });

  it('capacity: 8 seats, the 9th is refused with the waitlist; the waitlist charges nothing', async () => {
    for (let i = 0; i < 8; i++) expect((await reserve(`p${i}`, { groupId: 'g1', option: 'package' })).status).toBe(201);
    expect(new Set(state.seats.filter((s) => s.date === '2026-11-09').map((s) => s.seat))).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8]));
    const b = (await groupsBoard(db)).body as any;
    expect(b.groups[0]).toMatchObject({ seatsLeft: 0, full: true });
    expect(await reserve('tom', { groupId: 'g1', option: 'package' })).toEqual({ status: 409, body: { error: 'full', waitlist: true } });
    expect(await reserve('tom', { groupId: 'g1', option: 'drop_in' })).toEqual({ status: 409, body: { error: 'full', waitlist: true } });
    expect(state.passes).toHaveLength(8);   // the refused one wrote no pass and no seat
    as('tom');
    expect((await waitPOST(post('/api/group-booking/waitlist', { groupId: 'g1' }))).status).toBe(201);
    expect((await waitPOST(post('/api/group-booking/waitlist', { groupId: 'g1' }))).status).toBe(201);   // once only
    expect(state.waits).toHaveLength(1);
    expect(state.seats.filter((s) => s.userId === 'tom')).toEqual([]);
  });

  it('a seat never goes past 8 even when the lock was skipped: the seat-number unique index refuses it', async () => {
    for (let i = 0; i < 8; i++) state.seats.push({ id: `x${i}`, slotKey: 'group:g1:2026-11-09', seat: i + 1, groupId: 'g1', gymId: '24hr-victory', userId: `p${i}`, passId: 'x', date: '2026-11-09', startsAt: new Date('2026-11-10T01:00:00Z'), kind: 'regular', makeupForId: null, status: 'booked', late: false });
    expect((await reserve('tom', { groupId: 'g1', option: 'drop_in' })).status).toBe(409);
    expect(state.seats.filter((s) => s.slotKey === 'group:g1:2026-11-09')).toHaveLength(8);
  });

  it('a cancelled or finished group cannot be joined', async () => {
    state.groups[0].status = 'cancelled';
    expect((await reserve('ada', { groupId: 'g1', option: 'package' })).body).toEqual({ error: 'not_open' });
    expect((await reserve('ada', { groupId: 'nope', option: 'package' })).status).toBe(404);
  });
});

describe('youth: the coach-loop teen gate (u13 never; a teen needs the guardian\'s coach-training consent; blank year first)', () => {
  it.each([['kid', 'under_13'], ['tia', 'guardian_consent_required'], ['blank', 'age_required']])('%s → 403 %s, nothing written', async (u, error) => {
    const r = await reserve(u, { groupId: 'g1', option: 'package' });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe(error);
    as(u);
    expect((await waitPOST(post('/api/group-booking/waitlist', { groupId: 'g1' }))).status).toBe(403);
    expect((await json(await bookPOST(post('/api/group-booking/one-on-one', { trainerId: 'owner', gymId: '24hr-victory', startsAt: '2026-11-04T17:00:00.000Z' })))).status).toBe(403);
    expect(state.writes).toEqual([]);
  });
});

describe('my sessions: cancel free or late, make-ups through the route', () => {
  it('cancel more than 24 h ahead is free; within 24 h it counts as used', async () => {
    await reserve('ada', { groupId: 'g1', option: 'package' });
    const seats = state.seats.filter((s) => s.userId === 'ada');
    as('ada');
    expect((await json(await mePOST(post('/api/group-booking/me', { action: 'cancel', seatId: seats[0].id })))).body).toEqual({ ok: true, late: false });
    vi.setSystemTime(new Date('2026-11-11T12:00:00Z'));   // Wed 4 am PT; Wed 5 pm is 13 h away
    expect((await json(await mePOST(post('/api/group-booking/me', { action: 'cancel', seatId: seats[1].id })))).body).toEqual({ ok: true, late: true });
    expect(state.seats.find((s) => s.id === seats[1].id)).toMatchObject({ status: 'cancelled', seat: null, late: true });
    as('p0');
    expect((await json(await mePOST(post('/api/group-booking/me', { action: 'cancel', seatId: seats[2].id })))).status).toBe(404);   // not theirs
  });

  it('a missed session: one make-up in a Fri/Sat slot at the home gym, same week or next; never two', async () => {
    await reserve('ada', { groupId: 'g1', option: 'package' });
    const mon = state.seats.find((s) => s.userId === 'ada' && s.date === '2026-11-09')!;
    vi.setSystemTime(new Date('2026-11-10T18:00:00Z'));
    expect((await coach({ action: 'mark', seatId: mon.id, status: 'missed' })).status).toBe(200);
    as('ada');
    const me = (await json(await meGET())).body;
    expect(me.makeups).toHaveLength(1);
    expect(me.makeups[0].options.map((o: any) => `${o.date}@${o.hour}`)).toContain('2026-11-13@17');
    expect(me.makeups[0].options).toHaveLength(12);
    expect((await json(await mePOST(post('/api/group-booking/me', { action: 'makeup', seatId: mon.id, date: '2026-11-27', hour: 17 })))).body).toEqual({ error: 'wrong_week' });
    const ok = await json(await mePOST(post('/api/group-booking/me', { action: 'makeup', seatId: mon.id, date: '2026-11-13', hour: 18 })));
    expect(ok.status).toBe(201);
    expect(state.seats.find((s) => s.id === ok.body.seatId)).toMatchObject({ kind: 'makeup', slotKey: 'makeup:24hr-victory:2026-11-13:18', makeupForId: mon.id, passId: mon.passId });
    expect((await json(await mePOST(post('/api/group-booking/me', { action: 'makeup', seatId: mon.id, date: '2026-11-14', hour: 17 })))).body).toEqual({ error: 'already_made_up' });
    expect((await json(await meGET())).body.makeups).toEqual([]);
  });

  it('a make-up slot with 8 already is full; a drop-in has no make-ups', async () => {
    await reserve('ada', { groupId: 'g1', option: 'package' });
    await reserve('p0', { groupId: 'g1', option: 'drop_in' });
    const mon = state.seats.find((s) => s.userId === 'ada' && s.date === '2026-11-09')!;
    const drop = state.seats.find((s) => s.userId === 'p0')!;
    vi.setSystemTime(new Date('2026-11-10T18:00:00Z'));
    await coach({ action: 'mark', seatId: mon.id, status: 'missed' });
    await coach({ action: 'mark', seatId: drop.id, status: 'missed' });
    for (let i = 1; i <= 8; i++) state.seats.push({ id: `m${i}`, slotKey: 'makeup:24hr-victory:2026-11-13:17', seat: i, groupId: 'g1', gymId: '24hr-victory', userId: `z${i}`, passId: 'z', date: '2026-11-13', startsAt: new Date('2026-11-14T01:00:00Z'), kind: 'makeup', makeupForId: null, status: 'booked', late: false });
    as('ada');
    expect((await json(await mePOST(post('/api/group-booking/me', { action: 'makeup', seatId: mon.id, date: '2026-11-13', hour: 17 })))).body).toEqual({ error: 'full' });
    expect((await json(await meGET())).body.makeups[0].options.map((o: any) => `${o.date}@${o.hour}`)).not.toContain('2026-11-13@17');
    as('p0');
    expect((await json(await mePOST(post('/api/group-booking/me', { action: 'makeup', seatId: drop.id, date: '2026-11-13', hour: 18 })))).body).toEqual({ error: 'not_package' });
  });
});

describe('the coach', () => {
  it('only the owner or an active trainer; a stranger is 403', async () => {
    as('ada');
    expect((await json(await coachGET(get('/api/group-booking/coach')))).status).toBe(403);
    expect((await json(await coachPOST(post('/api/group-booking/coach', { action: 'set_address', gymId: '24hr-victory', address: 'x' })))).status).toBe(403);
  });

  it('one line per group: people, waitlist, under the minimum; the cut-off notice and the decision', async () => {
    await reserve('ada', { groupId: 'g1', option: 'package' });
    await reserve('p0', { groupId: 'g1', option: 'drop_in' });
    state.waits.push({ id: 'w', groupId: 'g1', userId: 'tom', createdAt: new Date() });
    as('owner');
    let b = (await json(await coachGET(get('/api/group-booking/coach')))).body;
    expect(b.groups[0].line).toBe('2/8 people · 1 waitlist · under 6');
    expect(b.groups[0].notice).toBeNull();   // the cut-off (Sat Nov 7, 5 pm PT) has not come
    vi.setSystemTime(new Date('2026-11-08T02:00:00Z'));
    b = (await json(await coachGET(get('/api/group-booking/coach')))).body;
    expect(b.groups[0].notice.line).toBe('2 of 6 by the cut-off. Run, merge or cancel?');
    expect(state.groups[0].status).toBe('open');   // nothing auto-cancels
    expect((await coach({ action: 'decide', groupId: 'g1', decision: 'run' })).status).toBe(200);
    b = (await json(await coachGET(get('/api/group-booking/coach')))).body;
    expect(b.groups[0].notice).toBeNull();
  });

  it('the roster: attendance taps and "paid in person"', async () => {
    await reserve('ada', { groupId: 'g1', option: 'package' });
    as('owner');
    const r = (await json(await coachGET(get('/api/group-booking/coach?slot=group:g1:2026-11-09')))).body;
    expect(r.rows).toMatchObject([{ name: 'Ada', status: 'booked', passKind: 'package', paid: false, priceLabel: '$400' }]);
    expect((await coach({ action: 'mark', seatId: r.rows[0].seatId, status: 'present' })).status).toBe(200);
    expect((await coach({ action: 'paid', passId: r.rows[0].passId, paid: true })).status).toBe(200);
    expect(state.passes[0]).toMatchObject({ markedPaidByUserId: 'owner' });
    expect(state.passes[0].paidAt).toBeInstanceOf(Date);
    const again = (await json(await coachGET(get('/api/group-booking/coach?slot=group:g1:2026-11-09')))).body;
    expect(again.rows[0]).toMatchObject({ status: 'present', paid: true });
  });

  it('create a group, move its gym, open the same slot at another gym, set a gym address', async () => {
    const c = await coach({ action: 'create_group', name: 'Topanga Speed', gymId: '24hr-topanga', dayPair: 'tue_thu', hour: 19, startDate: '2026-11-12' });
    expect(c.status).toBe(201);
    expect(state.groups.find((g) => g.id === c.body.id)).toMatchObject({ startDate: '2026-11-09', minSeats: 6, maxSeats: 8, weeks: 8, cutoffHours: 48, trainerUserId: 'owner' });
    expect((await coach({ action: 'move_gym', groupId: 'g1', gymId: 'la-fitness-balboa' })).body).toEqual({ ok: true, gymId: 'la-fitness-balboa' });
    expect((await coach({ action: 'move_gym', groupId: 'g1', gymId: 'la-fitness-balboa' })).body).toEqual({ error: 'same_gym' });
    const o = await coach({ action: 'open_at_gym', groupId: 'g1', gymId: '24hr-victory' });
    expect(o.status).toBe(201);
    expect(state.groups.find((g) => g.id === o.body.id)).toMatchObject({ gymId: '24hr-victory', dayPair: 'mon_wed', hour: 17, startDate: '2026-11-09' });
    expect((await coach({ action: 'set_address', gymId: '24hr-victory', address: '  6290 Topanga  Canyon Blvd ' })).status).toBe(200);
    expect(state.gyms['24hr-victory']).toBe('6290 Topanga Canyon Blvd');
    expect(((await groupsBoard(db)).body as any).gyms[0].address).toBe('6290 Topanga Canyon Blvd');
  });

  it('message the group: into each member\'s existing program thread; none is created, nothing is emailed', async () => {
    await reserve('ada', { groupId: 'g1', option: 'package' });
    await reserve('p0', { groupId: 'g1', option: 'package' });
    state.programs.push({ id: 'prog-ada', coachId: 'owner', clientId: 'ada', isActive: true, createdAt: new Date() });
    expect((await coach({ action: 'message', groupId: 'g1', text: 'Moved to LA Fitness Balboa this week.' })).body).toEqual({ ok: true, sent: 1, noThread: 1 });
    expect(state.messages).toEqual([{ programId: 'prog-ada', authorId: 'owner', body: 'Moved to LA Fitness Balboa this week.' }]);
  });

  it('a trainer sees and runs only their own groups, and cannot do the owner\'s jobs', async () => {
    state.trainers.push({ id: 't1', ownerId: 'owner', trainerUserId: 'tom', displayName: 'Tom', inviteCode: null, gyms: '["24hr-topanga"]', weeklyHours: '[]', online: false, inPerson: true, status: 'active' });
    state.groups.push(groupRow({ id: 'g2', trainerUserId: 'tom', name: 'Tom\'s group', gymId: '24hr-topanga' }));
    as('tom');
    const b = (await json(await coachGET(get('/api/group-booking/coach')))).body;
    expect(b.role).toBe('trainer');
    expect(b.groups.map((g: any) => g.id)).toEqual(['g2']);
    expect((await json(await coachPOST(post('/api/group-booking/coach', { action: 'move_gym', groupId: 'g2', gymId: '24hr-victory' })))).status).toBe(403);
    expect((await json(await coachPOST(post('/api/group-booking/coach', { action: 'message', groupId: 'g1', text: 'hi' })))).status).toBe(404);
  });
});

describe('1:1 sessions', () => {
  const WEEKLY = [1, 2, 3, 4, 5].map((dow) => ({ dow, startMin: 9 * 60, endMin: 12 * 60 }));
  beforeEach(() => {
    state.instructors.push({ id: 'inst', userId: 'owner', slug: 'elijah', displayName: 'Elijah', published: true, weeklyHours: WEEKLY, blackoutDates: [], bufferMinutes: 15, minNoticeHours: 12, maxDaysAhead: 14 });
  });

  it('the board: Elijah only; in person at $100 · pay at the gym; online "Opens soon" with no price while there is no listing', async () => {
    const b = (await oneOnOneBoard(db)).body as any;
    expect(b.trainers.map((t: any) => t.name)).toEqual(['Elijah']);
    expect(b.trainers[0].gyms).toHaveLength(3);
    expect(b.trainers[0].choices).toMatchObject([
      { mode: 'in_person', available: true, priceCents: 10000, minutes: 60, priceLabel: '$100 · pay at the gym' },
      { mode: 'online', available: false, priceCents: null, priceLabel: null },
    ]);
  });

  it('the owner\'s to-do says what online 1:1 needs, a listing that charges another price than $75, and blank gyms', async () => {
    as('owner');
    expect((await json(await coachGET(get('/api/group-booking/coach')))).body.todo).toEqual([
      'Online 1:1 opens when your coach store has a live 1:1 listing ($75, 60 min).', 'Add the address for 3 gyms (Gyms, below).',
    ]);
    vi.stubEnv('COACH_STORE_ENABLED', '1');
    state.listings.push({ id: 'L60', creatorId: 'owner', active: true, itemKey: 'coach-store:elijah:live_1on1:60:one_time', priceUsd: 9000 });
    state.gyms = { '24hr-victory': 'a', '24hr-topanga': 'b', 'la-fitness-balboa': 'c' };
    expect((await json(await coachGET(get('/api/group-booking/coach')))).body.todo).toEqual(['Your online 1:1 listing charges $90; your price is $75. Change the listing to match.']);
  });

  it('online with the coach store on and a live 1:1 listing: that listing\'s own price, handed to its book page', async () => {
    vi.stubEnv('COACH_STORE_ENABLED', '1');
    state.listings.push({ id: 'L60', creatorId: 'owner', active: true, itemKey: 'coach-store:elijah:live_1on1:60:one_time', priceUsd: 7500 });
    const b = (await oneOnOneBoard(db)).body as any;
    expect(b.trainers[0].choices[1]).toMatchObject({ mode: 'online', available: true, priceCents: 7500, minutes: 60, priceLabel: '$75' });
    expect(b.trainers[0].online).toEqual({ slug: 'elijah', listingId: 'L60', durationMin: 60 });
  });

  it('in person: open times skip the group\'s hours; book one; the same time is gone for the next person', async () => {
    state.groups[0].hour = 17;
    as('ada');
    const s = (await json(await slotsGET(get('/api/group-booking/one-on-one?trainer=owner')))).body;
    expect(s.available).toBe(true);
    expect(s.slots.length).toBeGreaterThan(5);
    expect(new Date(s.slots[0].startsAt).getTime() - NOW.getTime()).toBeGreaterThanOrEqual(12 * 3_600_000);   // the coach store's notice
    const first = s.slots.find((x: any) => new Date(x.startsAt).getTime() - NOW.getTime() > 30 * 3_600_000).startsAt;
    const r = await json(await bookPOST(post('/api/group-booking/one-on-one', { trainerId: 'owner', gymId: 'la-fitness-balboa', startsAt: first })));
    expect(r.status).toBe(201);
    expect(r.body.pay).toEqual({ mode: 'at_gym' });
    expect(r.body.ics).toContain('1:1 with Elijah');
    expect(state.inPerson).toMatchObject([{ trainerUserId: 'owner', clientUserId: 'ada', gymId: 'la-fitness-balboa', minutes: 60, priceCents: 10000, payMode: 'at_gym', status: 'booked' }]);
    as('p0');
    expect((await json(await bookPOST(post('/api/group-booking/one-on-one', { trainerId: 'owner', gymId: 'la-fitness-balboa', startsAt: first })))).body).toEqual({ error: 'bad_slot' });
    expect((await json(await bookPOST(post('/api/group-booking/one-on-one', { trainerId: 'owner', gymId: 'equinox', startsAt: first })))).body).toEqual({ error: 'bad_gym' });
    // the coach sees it, marks it, and marks it paid in person
    const b = (await json(await (as('owner'), coachGET(get('/api/group-booking/coach'))))).body;
    expect(b.oneOnOne).toMatchObject([{ client: 'Ada', gymName: 'LA Fitness Balboa', paid: false }]);
    expect((await coach({ action: 'paid_1on1', id: b.oneOnOne[0].id, paid: true })).status).toBe(200);
    // the client cancels: more than 24 h ahead is free and frees the time
    as('ada');
    expect((await json(await mePOST(post('/api/group-booking/me', { action: 'cancel_1on1', id: b.oneOnOne[0].id })))).body).toEqual({ ok: true, late: false });
    expect(state.inPerson[0].slotLock).toBeNull();
  });

  it('a double booking of one instant is refused by the slot lock', async () => {
    state.inPerson.push({ id: 'x', trainerUserId: 'owner', clientUserId: 'p1', gymId: '24hr-victory', startsAt: new Date('2026-11-04T17:00:00Z'), minutes: 60, priceCents: 10000, payMode: 'at_gym', status: 'booked', late: false, slotLock: 'owner:2026-11-04T17:00:00.000Z' });
    as('ada');
    const s = (await json(await slotsGET(get('/api/group-booking/one-on-one?trainer=owner')))).body;
    expect(s.slots.map((x: any) => x.startsAt)).not.toContain('2026-11-04T17:00:00.000Z');
  });
});

describe('trainers: invite now, bookable when the owner switches it on', () => {
  it('invite → accept (adults, single use) → on the board only with GROUP_TRAINERS_BOOKABLE', async () => {
    const inv = await coach({ action: 'invite_trainer', name: 'Tom' });
    expect(inv.status).toBe(201);
    const code = inv.body.invitePath.split('/').pop();
    as('tia');
    expect((await json(await trainerPOST(post('/api/group-booking/trainer', { code })))).body).toEqual({ error: 'adults_only' });
    as('tom');
    expect((await json(await trainerPOST(post('/api/group-booking/trainer', { code })))).body).toEqual({ ok: true, name: 'Tom' });
    expect((await json(await trainerPOST(post('/api/group-booking/trainer', { code })))).status).toBe(404);   // single use
    expect(((await oneOnOneBoard(db)).body as any).trainers.map((t: any) => t.name)).toEqual(['Elijah']);
    vi.stubEnv('GROUP_TRAINERS_BOOKABLE', '1');
    expect(((await oneOnOneBoard(db)).body as any).trainers.map((t: any) => t.name)).toEqual(['Elijah', 'Tom']);
  });
});

describe('pay at the gym: no route here reaches a checkout', () => {
  it('online payment off (the default) → at_gym, and no network call is made', async () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f);
    vi.stubEnv('GROUP_PACKAGE_PACKAGE_ID', 'pk1');
    vi.stubEnv('COACH_CONNECT_PAYMENTS_ENABLED', '1'); vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_x'); vi.stubEnv('NEXTAUTH_URL', 'https://fel.test');
    expect((await reserve('ada', { groupId: 'g1', option: 'package' })).body.pay).toEqual({ mode: 'at_gym' });
    expect(f).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
  it('every switch on → the route names the coach-business package; it still charges nothing itself', async () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f);
    vi.stubEnv('GROUP_BOOKING_ONLINE_PAYMENT', '1'); vi.stubEnv('GROUP_PACKAGE_PACKAGE_ID', 'pk1');
    vi.stubEnv('COACH_CONNECT_PAYMENTS_ENABLED', '1'); vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_x'); vi.stubEnv('NEXTAUTH_URL', 'https://fel.test');
    const r = await reserve('ada', { groupId: 'g1', option: 'package' });
    expect(r.body.pay).toEqual({ mode: 'online', packageId: 'pk1' });
    expect(state.passes[0].payMode).toBe('online');
    expect(f).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('the calendar feed and the coach\'s busy hours', () => {
  it('the coaching feed gains the group sessions a coach runs, an athlete\'s seats and in-person 1:1s; nothing before the SQL', async () => {
    const { groupFeedEvents } = await import('@/lib/group-booking/feed');
    await reserve('ada', { groupId: 'g1', option: 'drop_in' });
    const from = new Date('2026-11-01T00:00:00Z'), to = new Date('2026-11-20T00:00:00Z');
    const coachEvents = await groupFeedEvents(db, 'owner', from, to);
    expect(coachEvents.map((e) => e.uid)).toEqual(['grp-g1-2026-11-09', 'grp-g1-2026-11-11', 'grp-g1-2026-11-16', 'grp-g1-2026-11-18']);
    expect(coachEvents[0]).toMatchObject({ title: 'Valley Strength (group)', place: '24 Hour Fitness Victory', cancelled: false });
    const mine = await groupFeedEvents(db, 'ada', from, to);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ title: 'Valley Strength', place: '24 Hour Fitness Victory' });
    state.ready = false; resetGroupBookingProbe();
    expect(await groupFeedEvents(db, 'owner', from, to)).toEqual([]);
  });

  it('a coach\'s 1:1 times never land on their own group\'s hours', async () => {
    state.instructors.push({ id: 'inst', userId: 'owner', slug: 'elijah', displayName: 'Elijah', published: true, weeklyHours: [{ dow: 1, startMin: 16 * 60, endMin: 20 * 60 }], blackoutDates: [], bufferMinutes: 0, minNoticeHours: 0, maxDaysAhead: 14 });
    as('ada');
    const s = (await json(await slotsGET(get('/api/group-booking/one-on-one?trainer=owner')))).body;
    const nov9 = s.slots.filter((x: any) => x.day === '2026-11-09').map((x: any) => x.startsAt);
    // 4 pm, then 6, 6:30 and 7 pm: nothing starts while the 5–6 pm group runs, or runs into it
    expect(nov9).toEqual(['2026-11-10T00:00:00.000Z', '2026-11-10T02:00:00.000Z', '2026-11-10T02:30:00.000Z', '2026-11-10T03:00:00.000Z']);
    expect(s.slots.filter((x: any) => x.day === '2026-11-02').length).toBeGreaterThan(0);   // no group that Monday
  });
});
