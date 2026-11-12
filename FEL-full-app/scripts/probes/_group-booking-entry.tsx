// GROUP-BOOKING (2026-11-02): the fixture for the 390 px contact sheet (scripts/probes/_group-booking-shots.mts). The real
// components — the groups browser with the shop's card and buy sheet in reserve mode, the 1:1 booker, the coach's board —
// over answers shaped exactly like lib/group-booking/server.ts's, with the pending SQL applied. `window.__VIEW` picks one.
import { createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { SHOP_LOOK as L } from '@/components/shop/look';
import { GroupsBrowser, type GroupsBoardView } from '@/components/group-booking/groups-browser';
import { OneOnOneBooker, type OneOnOneView } from '@/components/group-booking/one-on-one-booker';
import { CoachGroups } from '@/components/group-booking/coach-groups';
import { GROUP_COPY as T } from '@/lib/group-booking/copy';

const FORMAT = '30 min strength & conditioning + 30 min correctives & athletic skill';
const CANCEL = 'Cancel 24h+ ahead: free (a package keeps the session). Later, or a no-show: the session counts as used.';
const opt = (kind: 'drop_in' | 'package' | 'full', title: string, cents: number, sessions: number, first = 'Mon Nov 9', firstDate = '2026-11-09') =>
  ({ kind, title, priceCents: cents, priceLabel: `$${cents / 100} · pay at the gym`, payMode: 'at_gym' as const, sessions, firstLabel: first, firstDate });
const full3 = [opt('drop_in', 'Drop in · 1 session', 6500, 1), opt('package', '4 weeks · 8 sessions', 40000, 8), opt('full', 'Full 8 weeks · 16 sessions', 80000, 16)];
const gyms = [{ id: '24hr-victory', name: '24 Hour Fitness Victory', address: null }, { id: '24hr-topanga', name: '24 Hour Fitness Topanga', address: null }, { id: 'la-fitness-balboa', name: 'LA Fitness Balboa', address: null }];
const board: GroupsBoardView = {
  available: true, format: FORMAT, cancelLine: CANCEL, gyms, sizes: { min: 6, max: 8, weeks: 8 },
  times: [{ hour: 17, label: '5 pm' }, { hour: 18, label: '6 pm' }, { hour: 19, label: '7 pm' }],
  groups: [
    { id: 'g1', name: 'Valley Strength', gymId: '24hr-victory', gymName: '24 Hour Fitness Victory', gymAddress: null, dayPair: 'mon_wed', days: 'Mon & Wed', hour: 17, time: '5 pm', startLabel: 'Mon Nov 9', endLabel: 'Wed Dec 30', weeks: 8, seatsLeft: 3, full: false, maxSeats: 8, minSeats: 6, trainerName: 'Elijah', options: full3, lateJoin: false },
    { id: 'g2', name: 'Topanga Athletes', gymId: '24hr-topanga', gymName: '24 Hour Fitness Topanga', gymAddress: null, dayPair: 'tue_thu', days: 'Tue & Thu', hour: 18, time: '6 pm', startLabel: 'Tue Oct 6', endLabel: 'Thu Nov 26', weeks: 8, seatsLeft: 2, full: false, maxSeats: 8, minSeats: 6, trainerName: 'Elijah', options: [opt('drop_in', 'Drop in · 1 session', 6500, 1, 'Tue Nov 3', '2026-11-03')], lateJoin: true },
    { id: 'g3', name: 'Balboa Speed', gymId: 'la-fitness-balboa', gymName: 'LA Fitness Balboa', gymAddress: null, dayPair: 'mon_wed', days: 'Mon & Wed', hour: 19, time: '7 pm', startLabel: 'Mon Nov 9', endLabel: 'Wed Dec 30', weeks: 8, seatsLeft: 0, full: true, maxSeats: 8, minSeats: 6, trainerName: 'Elijah', options: full3, lateJoin: false },
  ],
};
const one: OneOnOneView = {
  available: true, cancelLine: CANCEL,
  trainers: [{ id: 'owner', name: 'Elijah', gyms, online: null, choices: [
    { mode: 'in_person', available: true, priceCents: 10000, minutes: 60, needsGym: true, priceLabel: '$100 · pay at the gym' },
    { mode: 'online', available: false, priceCents: null, minutes: 60, needsGym: false, priceLabel: null },
  ] }],
};
const slots = ['2026-11-04T17:00:00.000Z', '2026-11-04T18:00:00.000Z', '2026-11-05T17:00:00.000Z', '2026-11-05T18:00:00.000Z', '2026-11-06T17:00:00.000Z', '2026-11-06T18:00:00.000Z'].map((s) => ({ startsAt: s, label: s }));
const sessions = ['Mon Nov 9', 'Wed Nov 11', 'Mon Nov 16', 'Wed Nov 18'].map((d, i) => ({ slotKey: `group:g1:${i}`, label: `${d} · 5 pm`, startsAt: '2026-11-10T01:00:00Z', taken: [7, 6, 5, 5][i] }));
const coachBoard = {
  available: true, role: 'owner', gyms,
  groups: [
    { id: 'g1', name: 'Valley Strength', gymId: '24hr-victory', gymName: '24 Hour Fitness Victory', days: 'Mon & Wed', time: '5 pm', status: 'open', decision: null, trainerName: 'Elijah', people: 7, minSeats: 6, maxSeats: 8, waitlist: 0, line: '7/8 people · 0 waitlist · runs', notice: null, startLabel: 'Mon Nov 9', endLabel: 'Wed Dec 30', sessions },
    { id: 'g4', name: 'Balboa Speed', gymId: 'la-fitness-balboa', gymName: 'LA Fitness Balboa', days: 'Mon & Wed', time: '7 pm', status: 'open', decision: null, trainerName: 'Elijah', people: 4, minSeats: 6, maxSeats: 8, waitlist: 2, line: '4/8 people · 2 waitlist · under 6', notice: { line: '4 of 6 by the cut-off. Run, merge or cancel?' }, startLabel: 'Mon Nov 9', endLabel: 'Wed Dec 30', sessions: [] },
  ],
  makeups: [{ slotKey: 'makeup:24hr-victory:2026-11-13:18', gymName: '24 Hour Fitness Victory', label: 'Fri Nov 13 · 6 pm', taken: 2 }],
  oneOnOne: [{ id: 'i1', client: 'Marcus Lee', trainer: 'Elijah', gymName: 'LA Fitness Balboa', startsAt: '2026-11-04T17:00:00Z', status: 'booked', paid: false, priceLabel: '$100' }],
  trainers: [], form: { hours: board.times, dayPairs: [{ id: 'mon_wed', label: 'Mon & Wed' }, { id: 'tue_thu', label: 'Tue & Thu' }], minSeats: 6, maxSeats: 8, weeks: 8 },
};
const roster = { available: true, rows: [
  { seatId: 's1', name: 'Ada Brooks', status: 'present', kind: 'regular', group: 'Valley Strength', passId: 'p1', passKind: 'package', paid: true, priceLabel: '$400' },
  { seatId: 's2', name: 'Marcus Lee', status: 'booked', kind: 'regular', group: 'Valley Strength', passId: 'p2', passKind: 'full', paid: false, priceLabel: '$800' },
  { seatId: 's3', name: 'Priya Shah', status: 'missed', kind: 'regular', group: 'Valley Strength', passId: 'p3', passKind: 'package', paid: true, priceLabel: '$400' },
  { seatId: 's4', name: 'Jordan Kim', status: 'booked', kind: 'regular', group: 'Valley Strength', passId: 'p4', passKind: 'drop_in', paid: false, priceLabel: '$65' },
  { seatId: 's5', name: 'Sam Ortiz', status: 'booked', kind: 'makeup', group: 'Valley Strength', passId: 'p5', passKind: 'package', paid: true, priceLabel: '$400' },
] };

const reply = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
(window as unknown as { fetch: typeof fetch }).fetch = ((url: string, init?: RequestInit) => {
  const u = String(url);
  if (u.startsWith('/api/group-booking/reserve')) return reply({ ok: true, pay: { mode: 'at_gym' }, ics: 'BEGIN:VCALENDAR\r\nEND:VCALENDAR' }, 201);
  if (u.startsWith('/api/group-booking/one-on-one') && init?.method === 'POST') return reply({ ok: true, pay: { mode: 'at_gym' }, ics: 'BEGIN:VCALENDAR\r\nEND:VCALENDAR' }, 201);
  if (u.startsWith('/api/group-booking/one-on-one')) return reply({ available: true, slots });
  if (u.startsWith('/api/group-booking/coach?slot=')) return reply(roster);
  if (u.startsWith('/api/group-booking/coach') && init?.method === 'POST') return reply({ ok: true });
  if (u.startsWith('/api/group-booking/coach')) return reply(coachBoard);
  if (u.startsWith('/api/group-booking/me')) return reply({ available: true, seats: [], makeups: [], oneOnOne: [], cancelLine: CANCEL });
  return reply({}, 404);
}) as typeof fetch;

const view = (window as unknown as { __VIEW?: string }).__VIEW ?? 'join';
const page = (eyebrow: string, title: string, body: unknown) => h('main', { className: L.page }, h('p', { className: L.eyebrow }, eyebrow), h('h1', { className: L.title }, title), body as never);
const el = view === 'one' ? page('Train 1:1', 'Book a session', h(OneOnOneBooker, { view: one }))
  : view === 'coach' ? page('Coach', 'Groups', h('div', { className: 'mt-6' }, h(CoachGroups)))
    : page('Train in person', T.title, [h('p', { key: 'l', className: L.lede }, T.lede(6, 8, 8)), h(GroupsBrowser, { key: 'b', board })]);
createRoot(document.getElementById('root')!).render(el);
