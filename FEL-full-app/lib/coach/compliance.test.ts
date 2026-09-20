import { describe, expect, it } from 'vitest';
import { GRACE_DAYS, STALLED_DAYS, driftBoard, driftFor, driftHeadline, type ClientActivity } from './compliance';

const NOW = Date.UTC(2026, 5, 1);
const DAY = 24 * 60 * 60 * 1000;
const ago = (d: number) => NOW - d * DAY;
const c = (o: Partial<ClientActivity> & { clientId: string; name: string }): ClientActivity =>
  ({ hasProgram: true, completedAtMs: [], ...o });

describe('who is drifting', () => {
  it('an athlete with no programming is waiting on the COACH, not failing', () => {
    const r = driftFor(c({ clientId: 'a', name: 'Ama', hasProgram: false, joinedAtMs: ago(9) }), NOW);
    expect(r.state).toBe('awaitingProgram');
    expect(r.note).toMatch(/waiting on you/i);
    expect(r.priority).toBeGreaterThan(100);        // it outranks every athlete-side problem
  });

  it('a brand-new client has not missed anything yet', () => {
    const r = driftFor(c({ clientId: 'b', name: 'Bo', joinedAtMs: ago(GRACE_DAYS - 1) }), NOW);
    expect(r.state).toBe('new');
    expect(r.note).toMatch(/just joined/i);
  });

  it('stopped is stopped, and it says how long', () => {
    const r = driftFor(c({ clientId: 'd', name: 'Di', joinedAtMs: ago(60), completedAtMs: [ago(STALLED_DAYS + 2)] }), NOW);
    expect(r.state).toBe('stalled');
    expect(r.daysSince).toBe(STALLED_DAYS + 2);
    expect(r.note).toMatch(/nothing for 12 days/i);
  });

  it('slowing is measured against their OWN pace, not a target', () => {
    const r = driftFor(c({
      clientId: 'e', name: 'Eli', joinedAtMs: ago(60),
      completedAtMs: [ago(2), ago(6), ago(16), ago(18), ago(20), ago(24)],
    }), NOW);
    expect(r.state).toBe('slowing');
    expect(r.recent).toBe(2);
    expect(r.previous).toBe(4);
    expect(r.note).toMatch(/down from 4/);
    expect(r.note).toMatch(/50% off their own pace/);
  });

  it('steady athletes are steady and sort to the bottom', () => {
    const steady = driftFor(c({ clientId: 'f', name: 'Fi', joinedAtMs: ago(60), completedAtMs: [ago(1), ago(4), ago(8)] }), NOW);
    expect(steady.state).toBe('steady');
    expect(steady.priority).toBe(0);
  });

  it('the board puts the coach\'s own backlog first, then stopped, then slowing', () => {
    const rows = driftBoard([
      c({ clientId: '1', name: 'Steady', joinedAtMs: ago(60), completedAtMs: [ago(1), ago(5)] }),
      c({ clientId: '2', name: 'Stopped', joinedAtMs: ago(60), completedAtMs: [ago(30)] }),
      c({ clientId: '3', name: 'Waiting', hasProgram: false, joinedAtMs: ago(5) }),
    ], NOW);
    expect(rows.map((r) => r.state)).toEqual(['awaitingProgram', 'stalled', 'steady']);
  });

  it('the headline names the one thing to do, and says nothing when there is nothing', () => {
    expect(driftHeadline(driftBoard([c({ clientId: '1', name: 'W', hasProgram: false })], NOW)))
      .toMatch(/waiting on programming/i);
    expect(driftHeadline(driftBoard([c({ clientId: '1', name: 'S', joinedAtMs: ago(60), completedAtMs: [ago(1)] })], NOW)))
      .toBeNull();
  });
});
