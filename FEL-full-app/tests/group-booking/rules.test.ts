// GROUP-BOOKING (owner, 2026-11-02): the rules, pure. Capacity (6–8, full, waitlist), day pairs and times on the Los
// Angeles clock across the DST end of 2026-11-01, the package math, make-ups, a gym move, the under-6 cut-off notice,
// pay at the gym vs online, and 1:1 in person vs online.
import { describe, expect, it } from 'vitest';
import { GYMS, groupConfig, dollars, hourLabel } from '@/lib/group-booking/config';
import { addDays, atPt, groupSessions, makeupSlots, mondayOf, ptDayKey, weekdayOf, weeksBetween } from '@/lib/group-booking/calendar';
import {
  cancelKind, cleanGroup, cutoffNotice, groupSeatsLeft, isMakeupCredit, joinOptions, makeupCheck, makeupWindow, moveGymCheck, oneOnOneChoices,
  packageMath, payPlan, seatState, type GroupClass, type GroupPass, type GroupSeat,
} from '@/lib/group-booking/rules';
import { cancelRuleLine, joinTitle, lateJoinLine, payAtGymPrice } from '@/lib/group-booking/copy';

const cfg = groupConfig({});
const group = (over: Partial<GroupClass> = {}): GroupClass => ({
  id: 'g1', ownerId: 'o', trainerUserId: 'o', name: 'Valley Strength', gymId: '24hr-victory', dayPair: 'mon_wed', hour: 17,
  startDate: '2026-11-09', weeks: 8, minSeats: 6, maxSeats: 8, cutoffHours: 48, decision: null, status: 'open', ...over,
});
const at = (iso: string) => new Date(iso);

describe('config: the owner\'s numbers, each one env value away', () => {
  it('defaults are the owner\'s of 2026-11-02', () => {
    expect(cfg).toMatchObject({ minSeats: 6, maxSeats: 8, weeks: 8, packageWeeks: 4, packageSessions: 8, dropInCents: 6500, packageCents: 40000, hours: [17, 18, 19], makeupDays: [5, 6], makeupHours: [17, 18, 19], cutoffHours: 48, cancelFreeHours: 24, inPersonCents: 10000, inPersonMinutes: 60, onlineCents: 7500, onlinePaymentSwitch: false, trainersBookable: false });
    expect(GYMS.map((g) => g.name)).toEqual(['24 Hour Fitness Victory', '24 Hour Fitness Topanga', 'LA Fitness Balboa']);
  });
  it('the env overrides them; nonsense falls back to the default', () => {
    expect(groupConfig({ GROUP_MAX_SEATS: '10', GROUP_HOURS: '18,19', GROUP_DROP_IN_CENTS: '7000' })).toMatchObject({ maxSeats: 10, hours: [18, 19], dropInCents: 7000 });
    expect(groupConfig({ GROUP_MAX_SEATS: 'eight', GROUP_HOURS: '5pm' })).toMatchObject({ maxSeats: 8, hours: [17, 18, 19] });
    expect(groupConfig({ GROUP_MIN_SEATS: '12' }).minSeats).toBe(8);   // never above the max
  });
  it('the owner is GROUP_BOOKING_OWNER_ID, else the coach store\'s first allowlisted coach, else nobody (closed)', () => {
    expect(groupConfig({ GROUP_BOOKING_OWNER_ID: 'eli' }).ownerId).toBe('eli');
    expect(groupConfig({ COACH_STORE_COACH_USER_IDS: ' eli , other' }).ownerId).toBe('eli');
    expect(groupConfig({}).ownerId).toBeNull();
  });
  it('labels', () => {
    expect([hourLabel(17), hourLabel(18), hourLabel(19), hourLabel(12)]).toEqual(['5 pm', '6 pm', '7 pm', '12 pm']);
    expect([dollars(6500), dollars(40000), dollars(6550)]).toEqual(['$65', '$400', '$65.50']);
    expect(payAtGymPrice(6500)).toBe('$65 · pay at the gym');
    expect(lateJoinLine(6500)).toBe('Joining late? Drop in for $65 a session.');
    expect(cancelRuleLine(cfg)).toBe('Cancel 24h+ ahead: free (a package keeps the session). Later, or a no-show: the session counts as used.');
  });
});

describe('day pairs and times on the Los Angeles clock, across the DST end (2026-11-01)', () => {
  it('5 pm stays 5 pm local: PDT before, PST after', () => {
    const s = groupSessions(group({ startDate: '2026-10-26', weeks: 2 }));
    expect(s.map((x) => [x.date, x.week, x.startsAt.toISOString()])).toEqual([
      ['2026-10-26', 1, '2026-10-27T00:00:00.000Z'],   // Mon 5 pm PDT (UTC−7)
      ['2026-10-28', 1, '2026-10-29T00:00:00.000Z'],   // Wed 5 pm PDT
      ['2026-11-02', 2, '2026-11-03T01:00:00.000Z'],   // Mon 5 pm PST (UTC−8): the clocks went back on Sun Nov 1
      ['2026-11-04', 2, '2026-11-05T01:00:00.000Z'],
    ]);
  });
  it('Tue/Thu at 7 pm through the same week', () => {
    const s = groupSessions(group({ startDate: '2026-10-26', dayPair: 'tue_thu', hour: 19, weeks: 2 }));
    expect(s.map((x) => x.startsAt.toISOString())).toEqual(['2026-10-28T02:00:00.000Z', '2026-10-30T02:00:00.000Z', '2026-11-04T03:00:00.000Z', '2026-11-06T03:00:00.000Z']);
  });
  it('8 weeks = 16 sessions, two a week, on the right weekdays; any start day becomes its week\'s Monday', () => {
    const s = groupSessions(group());
    expect(s).toHaveLength(16);
    expect(new Set(s.map((x) => weekdayOf(x.date)))).toEqual(new Set([1, 3]));
    expect(mondayOf('2026-11-12')).toBe('2026-11-09');
    expect(cleanGroup({ name: 'A', gymId: '24hr-topanga', dayPair: 'tue_thu', hour: 18, startDate: '2026-11-12' }, cfg, at('2026-11-02T12:00:00Z'), 'o')).toMatchObject({ ok: true, g: { startDate: '2026-11-09', trainerUserId: 'o' } });
  });
  it('calendar arithmetic never drifts on the DST day, and a Pacific day is the Pacific day', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
    expect(ptDayKey(at('2026-11-03T01:00:00Z'))).toBe('2026-11-02');   // 5 pm Mon in LA is already Tue in UTC
    expect(atPt('2026-11-01', 17).toISOString()).toBe('2026-11-02T01:00:00.000Z');
    expect(weeksBetween('2026-11-09', '2026-11-15')).toBe(0);
    expect(weeksBetween('2026-11-15', '2026-11-16')).toBe(1);
  });
  it('make-up slots: Friday and Saturday at 5, 6, 7 pm at the gym', () => {
    const m = makeupSlots('24hr-victory', '2026-10-26', '2026-11-08', cfg.makeupDays, cfg.makeupHours);
    expect(m).toHaveLength(12);
    expect(m[0]).toMatchObject({ date: '2026-10-30', hour: 17, slotKey: 'makeup:24hr-victory:2026-10-30:17' });
    expect(m[0].startsAt.toISOString()).toBe('2026-10-31T00:00:00.000Z');   // Fri 5 pm PDT
    expect(m.find((x) => x.date === '2026-11-07' && x.hour === 18)!.startsAt.toISOString()).toBe('2026-11-08T02:00:00.000Z');   // Sat 6 pm PST
  });
});

describe('capacity: min 6 to run, max 8, full, waitlist', () => {
  it('seats left and full', () => {
    expect(seatState(0, 8)).toEqual({ taken: 0, left: 8, full: false });
    expect(seatState(7, 8)).toEqual({ taken: 7, left: 1, full: false });
    expect(seatState(8, 8)).toEqual({ taken: 8, left: 0, full: true });
    expect(seatState(9, 8).left).toBe(0);
  });
  it('a group is full when ANY session still ahead is full (a package needs every one)', () => {
    const g = group();
    const taken = new Map([[`group:g1:2026-11-11`, 8], [`group:g1:2026-11-09`, 3]]);
    expect(groupSeatsLeft(g, taken, at('2026-11-01T00:00:00Z'), (d) => `group:g1:${d}`)).toMatchObject({ full: true, left: 0 });
    expect(groupSeatsLeft(g, new Map([[`group:g1:2026-11-09`, 5]]), at('2026-11-01T00:00:00Z'), (d) => `group:g1:${d}`)).toMatchObject({ full: false, left: 3 });
  });
});

describe('package math (owner: $65 drop-in; $400 = 8 sessions over 4 weeks; 8 weeks = two packages)', () => {
  it('$50 a session, $120 under 8 drop-ins, $800 for the full 8 weeks', () => {
    expect(packageMath(cfg)).toEqual({ perSessionCents: 5000, dropInTotalCents: 52000, savingCents: 12000, packagesInGroup: 2, fullCents: 80000 });
  });
  it('before the group starts: drop-in, 4 weeks (8 sessions) and the full 8 weeks (16)', () => {
    const o = joinOptions(group(), at('2026-11-01T20:00:00Z'), cfg);
    expect(o.map((x) => [x.kind, x.sessions.length, x.priceCents, x.startWeek, x.windowEnd])).toEqual([
      ['drop_in', 1, 6500, 1, '2026-11-09'],
      ['package', 8, 40000, 1, '2026-12-06'],   // weeks 1–4; the window ends the Sunday closing week 4
      ['full', 16, 80000, 1, '2027-01-03'],
    ]);
    expect(joinTitle('package', cfg)).toBe('4 weeks · 8 sessions');
    expect(joinTitle('full', cfg)).toBe('Full 8 weeks · 16 sessions');
  });
  it('after the first session: the package starts next week; no full 8 weeks', () => {
    const o = joinOptions(group(), at('2026-11-10T20:00:00Z'), cfg);   // Tue Nov 10: Mon done, Wed ahead
    expect(o.map((x) => [x.kind, x.sessions[0].date, x.windowEnd])).toEqual([['drop_in', '2026-11-11', '2026-11-11'], ['package', '2026-11-16', '2026-12-13']]);
  });
  it('late joiners (fewer than 4 weeks left): drop-in only', () => {
    const o = joinOptions(group(), at('2026-12-10T20:00:00Z'), cfg);   // week 5 is under way
    expect(o.map((x) => x.kind)).toEqual(['drop_in']);
  });
  it('a drop-in may name a later session; an over or cancelled group offers nothing', () => {
    expect(joinOptions(group(), at('2026-11-01T00:00:00Z'), cfg, '2026-11-18')[0].sessions[0].date).toBe('2026-11-18');
    expect(joinOptions(group(), at('2027-01-01T00:00:00Z'), cfg)).toEqual([]);
    expect(joinOptions(group({ status: 'cancelled' }), at('2026-11-01T00:00:00Z'), cfg)).toEqual([]);
  });
});

describe('make-ups: one per missed session, same week or next, not past the package, only seats under 8', () => {
  const pass: GroupPass = { id: 'p1', groupId: 'g1', userId: 'u', kind: 'package', sessions: 8, startWeek: 1, windowEnd: '2026-12-06', priceCents: 40000, payMode: 'at_gym', paidAt: null, status: 'active' };
  const missed: GroupSeat = { id: 's1', slotKey: 'group:g1:2026-11-09', groupId: 'g1', gymId: '24hr-victory', userId: 'u', passId: 'p1', date: '2026-11-09', startsAt: atPt('2026-11-09', 17), kind: 'regular', makeupForId: null, status: 'missed', late: false };
  const now = at('2026-11-10T20:00:00Z');
  const check = (slot: { gymId?: string; date: string; hour: number }, o: { taken?: number; used?: boolean; seat?: Partial<GroupSeat>; pass?: Partial<GroupPass>; now?: Date } = {}) =>
    makeupCheck({ source: { ...missed, ...o.seat }, pass: { ...pass, ...o.pass }, group: group(), slot: { gymId: '24hr-victory', ...slot }, taken: o.taken ?? 0, alreadyUsed: !!o.used, now: o.now ?? now, cfg });

  it('same week and next week are fine', () => {
    expect(check({ date: '2026-11-13', hour: 17 })).toEqual({ ok: true });
    expect(check({ date: '2026-11-21', hour: 19 })).toEqual({ ok: true });
  });
  it('two weeks later, a non-make-up day or hour, another gym: refused', () => {
    expect(check({ date: '2026-11-27', hour: 17 })).toEqual({ ok: false, reason: 'wrong_week' });
    expect(check({ date: '2026-11-15', hour: 17 })).toEqual({ ok: false, reason: 'not_makeup_slot' });   // a Sunday
    expect(check({ date: '2026-11-13', hour: 16 })).toEqual({ ok: false, reason: 'not_makeup_slot' });
    expect(check({ gymId: 'la-fitness-balboa', date: '2026-11-13', hour: 17 })).toEqual({ ok: false, reason: 'wrong_gym' });
  });
  it('one per miss; a drop-in has none; only a missed (or cancelled) regular seat', () => {
    expect(check({ date: '2026-11-13', hour: 17 }, { used: true })).toEqual({ ok: false, reason: 'already_made_up' });
    expect(check({ date: '2026-11-13', hour: 17 }, { pass: { kind: 'drop_in' } })).toEqual({ ok: false, reason: 'not_package' });
    expect(check({ date: '2026-11-13', hour: 17 }, { seat: { status: 'booked' } })).toEqual({ ok: false, reason: 'not_missed' });
    expect(check({ date: '2026-11-13', hour: 17 }, { seat: { status: 'present' } })).toEqual({ ok: false, reason: 'not_missed' });
    expect(check({ date: '2026-11-13', hour: 17 }, { seat: { kind: 'makeup' } })).toEqual({ ok: false, reason: 'not_missed' });
    expect(check({ date: '2026-11-13', hour: 17 }, { seat: { status: 'cancelled' } })).toEqual({ ok: true });   // a package keeps the session
    expect(isMakeupCredit({ ...missed }, { ...pass, kind: 'full' })).toBe(true);
  });
  it('seats under 8 only', () => {
    expect(check({ date: '2026-11-13', hour: 17 }, { taken: 7 })).toEqual({ ok: true });
    expect(check({ date: '2026-11-13', hour: 17 }, { taken: 8 })).toEqual({ ok: false, reason: 'full' });
  });
  it('not past the package\'s end, and not in the past', () => {
    const lastWeek = { seat: { date: '2026-12-02', startsAt: atPt('2026-12-02', 17) }, now: at('2026-12-03T00:00:00Z') };
    expect(check({ date: '2026-12-04', hour: 17 }, lastWeek)).toEqual({ ok: true });                         // that week's Friday
    expect(check({ date: '2026-12-11', hour: 17 }, lastWeek)).toEqual({ ok: false, reason: 'past_package_end' });   // next week, past the package
    expect(check({ date: '2026-11-13', hour: 17 }, { now: at('2026-11-14T03:00:00Z') })).toEqual({ ok: false, reason: 'past' });
  });
  it('the window a credit offers: the open Fri/Sat slots from now to the next Sunday, clipped at the package end', () => {
    const w = makeupWindow(missed, pass, group(), now, cfg);
    expect(w.map((s) => `${s.date}@${s.hour}`)).toEqual(['2026-11-13@17', '2026-11-13@18', '2026-11-13@19', '2026-11-14@17', '2026-11-14@18', '2026-11-14@19',
      '2026-11-20@17', '2026-11-20@18', '2026-11-20@19', '2026-11-21@17', '2026-11-21@18', '2026-11-21@19']);
    const end = makeupWindow({ ...missed, date: '2026-12-02' }, pass, group(), at('2026-12-03T00:00:00Z'), cfg);
    expect(end.every((s) => s.date <= '2026-12-06')).toBe(true);
    expect(end).toHaveLength(6);
  });
});

describe('cancel: 24h+ free, later counts as used', () => {
  it('free, late, started', () => {
    const s = at('2026-11-10T01:00:00Z');
    expect(cancelKind(s, new Date(s.getTime() - 25 * 3_600_000), cfg)).toBe('free');
    expect(cancelKind(s, new Date(s.getTime() - 24 * 3_600_000), cfg)).toBe('free');
    expect(cancelKind(s, new Date(s.getTime() - 23 * 3_600_000), cfg)).toBe('late');
    expect(cancelKind(s, new Date(s.getTime() + 60_000), cfg)).toBe('started');
  });
});

describe('gym move', () => {
  it('to another of the three gyms, an open group only', () => {
    expect(moveGymCheck(group(), 'la-fitness-balboa')).toEqual({ ok: true, gymId: 'la-fitness-balboa' });
    expect(moveGymCheck(group(), '24hr-victory')).toEqual({ ok: false, error: 'same_gym' });
    expect(moveGymCheck(group(), 'equinox')).toEqual({ ok: false, error: 'bad_gym' });
    expect(moveGymCheck(group({ status: 'cancelled' }), 'la-fitness-balboa')).toEqual({ ok: false, error: 'not_open' });
  });
});

describe('the under-6 cut-off notice (nothing auto-cancels)', () => {
  const g = group();   // first session Mon Nov 9 5 pm PST = 2026-11-10T01:00Z; the cut-off is 48 h before
  it('before the cut-off: nothing; at it with 5 people: the coach is told; with 6: nothing', () => {
    expect(cutoffNotice(g, 5, at('2026-11-08T00:59:00Z'))).toBeNull();
    expect(cutoffNotice(g, 5, at('2026-11-08T01:00:00Z'))).toMatchObject({ people: 5, min: 6 });
    expect(cutoffNotice(g, 5, at('2026-11-08T01:00:00Z'))!.deadline.toISOString()).toBe('2026-11-08T01:00:00.000Z');
    expect(cutoffNotice(g, 6, at('2026-11-09T00:00:00Z'))).toBeNull();
  });
  it('a decision (run, merge or cancel) clears it; the coach\'s own cut-off hours are used', () => {
    expect(cutoffNotice(group({ decision: 'run' }), 2, at('2026-11-09T00:00:00Z'))).toBeNull();
    expect(cutoffNotice(group({ cutoffHours: 72 }), 2, at('2026-11-07T01:30:00Z'))).not.toBeNull();
    expect(cutoffNotice(group({ cutoffHours: 72 }), 2, at('2026-11-07T00:30:00Z'))).toBeNull();
  });
});

describe('pay at the gym unless every online switch is on', () => {
  const on = { GROUP_BOOKING_ONLINE_PAYMENT: '1', GROUP_PACKAGE_PACKAGE_ID: 'pk1' };
  it('off by default', () => {
    expect(payPlan(cfg, true, 'package')).toEqual({ mode: 'at_gym' });
  });
  it('the switch alone, the gate alone, or no package id: still the gym', () => {
    expect(payPlan(groupConfig(on), false, 'package')).toEqual({ mode: 'at_gym' });
    expect(payPlan(groupConfig({ GROUP_PACKAGE_PACKAGE_ID: 'pk1' }), true, 'package')).toEqual({ mode: 'at_gym' });
    expect(payPlan(groupConfig(on), true, 'drop_in')).toEqual({ mode: 'at_gym' });
  });
  it('all three: online, through the named coach-business package', () => {
    expect(payPlan(groupConfig(on), true, 'package')).toEqual({ mode: 'online', packageId: 'pk1' });
  });
});

describe('1:1: in person vs online', () => {
  it('in person: the owner\'s $100, 60 min, at a gym', () => {
    expect(oneOnOneChoices(cfg, null)[0]).toEqual({ mode: 'in_person', available: true, priceCents: 10000, minutes: 60, needsGym: true });
  });
  it('online: the coach store\'s own listing price and length; none → not available and NO price', () => {
    expect(oneOnOneChoices(cfg, { priceCents: 7500, durationMin: 60 })[1]).toEqual({ mode: 'online', available: true, priceCents: 7500, minutes: 60, needsGym: false });
    expect(oneOnOneChoices(cfg, null)[1]).toMatchObject({ mode: 'online', available: false, priceCents: null });
  });
});

describe('the coach\'s new group, checked', () => {
  const now = at('2026-11-02T12:00:00Z');
  it.each([
    [{ gymId: '24hr-victory', dayPair: 'mon_wed', hour: 17, startDate: '2026-11-09' }, 'bad_name'],
    [{ name: 'A', gymId: 'x', dayPair: 'mon_wed', hour: 17, startDate: '2026-11-09' }, 'bad_gym'],
    [{ name: 'A', gymId: '24hr-victory', dayPair: 'fri_sat', hour: 17, startDate: '2026-11-09' }, 'bad_days'],
    [{ name: 'A', gymId: '24hr-victory', dayPair: 'mon_wed', hour: 16, startDate: '2026-11-09' }, 'bad_time'],
    [{ name: 'A', gymId: '24hr-victory', dayPair: 'mon_wed', hour: 17, startDate: '2026-02-30' }, 'bad_start'],
    [{ name: 'A', gymId: '24hr-victory', dayPair: 'mon_wed', hour: 17, startDate: '2025-01-06' }, 'bad_start'],
  ])('%j → %s', (body, error) => {
    expect(cleanGroup(body, cfg, now, 'o')).toEqual({ ok: false, error });
  });
});
