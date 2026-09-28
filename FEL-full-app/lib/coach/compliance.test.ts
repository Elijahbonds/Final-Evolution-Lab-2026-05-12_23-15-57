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
    // MIRROR-COACH P2 (2026-09-25): was "Nothing for 12 days." — it now names what stopped, the coached work
    expect(r.note).toBe('No coached session for 12 days.');
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
    expect(r.note).toMatch(/^2 coached sessions in two weeks/);
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

// MIRROR-COACH P2 (2026-09-25): coached work and games, read apart. P1 put games and completed coached sessions in one
// list: that stopped a client doing every coached session reading "stalled", and made a client who only played games
// read "steady". STALLED_DAYS is now "no coached work in this many days" — a completed session or a logged set.
describe('stalled means no coached work — games are a separate signal', () => {
  it('STALLED_DAYS is 10, and it is days without COACHED work', () => {
    expect(STALLED_DAYS).toBe(10);
    const edge = driftFor(c({ clientId: 'x', name: 'X', joinedAtMs: ago(60), completedAtMs: [ago(STALLED_DAYS)] }), NOW);
    expect(edge.state).toBe('stalled');
    const inside = driftFor(c({ clientId: 'x', name: 'X', joinedAtMs: ago(60), completedAtMs: [ago(STALLED_DAYS - 1)] }), NOW);
    expect(inside.state).toBe('steady');
  });

  it('a client with coached sessions and no games is NOT stalled', () => {
    const r = driftFor(c({ clientId: 'k', name: 'Kai', joinedAtMs: ago(60), completedAtMs: [ago(1), ago(3), ago(5), ago(7), ago(9), ago(11)], gameAtMs: [] }), NOW);
    expect(r).toMatchObject({ state: 'steady', daysSince: 1, recent: 6, games: 0, note: '6 coached sessions in the last two weeks.' });
  });

  it('a client who only plays games IS stalled on the program, and the note says they are still around', () => {
    const r = driftFor(c({ clientId: 'g', name: 'Gio', joinedAtMs: ago(60), completedAtMs: [], gameAtMs: [ago(0.5), ago(1), ago(2), ago(4), ago(6)] }), NOW);
    expect(r).toMatchObject({ state: 'stalled', daysSince: null, recent: 0, games: 5 });
    expect(r.note).toBe('Has never completed a coached session. Still playing: 5 games in the last two weeks.');
    const lapsed = driftFor(c({ clientId: 'g', name: 'Gio', joinedAtMs: ago(60), completedAtMs: [ago(15)], gameAtMs: [ago(1)] }), NOW);
    expect(lapsed.note).toBe('No coached session for 15 days. Still playing: 1 game in the last two weeks.');
  });

  it('games never count as sessions: 6 coached + 6 games is 6, with the games beside it', () => {
    const six = [ago(1), ago(3), ago(5), ago(7), ago(9), ago(11)];
    const r = driftFor(c({ clientId: 'b', name: 'Both', joinedAtMs: ago(60), completedAtMs: six, gameAtMs: six }), NOW);
    expect(r).toMatchObject({ state: 'steady', recent: 6, games: 6, note: '6 coached sessions in the last two weeks · 6 games.' });
  });

  it('a set logged on a session nobody marked complete keeps a client off stalled, and says so', () => {
    const r = driftFor(c({ clientId: 'l', name: 'Lou', joinedAtMs: ago(60), completedAtMs: [], loggedAtMs: [ago(2)] }), NOW);
    expect(r).toMatchObject({ state: 'steady', daysSince: 2, recent: 0 });
    expect(r.note).toBe('Coached work logged 2 days ago; no session marked complete in the last two weeks.');
  });

  it('a new client who has only played games is still new, not stalled', () => {
    const r = driftFor(c({ clientId: 'n', name: 'Nia', joinedAtMs: ago(1), completedAtMs: [], gameAtMs: [ago(0.2)] }), NOW);
    expect(r.state).toBe('new');
  });

  it('the headline says what stalled means', () => {
    const rows = driftBoard([c({ clientId: 'g', name: 'Gio', joinedAtMs: ago(60), completedAtMs: [ago(12)], gameAtMs: [ago(1)] })], NOW);
    expect(driftHeadline(rows)).toBe('1 athlete has had no coached session in 10+ days.');
    expect(driftHeadline(rows)).not.toMatch(/stopped training/);
  });

  // MIRROR-COACH P2 review (2026-09-26): "10+ days" was said of a client with no coached work EVER — e.g. one given a
  // first program yesterday through a camp plan (no CoachClient row, so no join date and no grace).
  it('never-started athletes are not counted in "10+ days": they are named apart', () => {
    const never = c({ clientId: 'n', name: 'Nel', joinedAtMs: ago(20), completedAtMs: [] });
    const gap = c({ clientId: 'g', name: 'Gio', joinedAtMs: ago(60), completedAtMs: [ago(12)] });
    expect(driftHeadline(driftBoard([never], NOW))).toBe('1 athlete has not logged any coached work yet.');
    expect(driftHeadline(driftBoard([never, { ...never, clientId: 'n2' }], NOW))).toBe('2 athletes have not logged any coached work yet.');
    expect(driftHeadline(driftBoard([gap, never], NOW))).toBe('1 athlete has had no coached session in 10+ days; 1 more has not logged any coached work yet.');
  });

  it('a client whose only join date is a program assigned yesterday is "new" (grace), not stalled', () => {
    expect(driftFor(c({ clientId: 'p', name: 'Pat', joinedAtMs: ago(1), completedAtMs: [] }), NOW).state).toBe('new');
  });
});
