import { describe, expect, it } from 'vitest';
import { attentionBoard, prqSnapshots, toAthleteRow, toClientActivity, type ClientFacts } from './attention';
import { QUIET_DAYS } from './triage';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 21, 12, 0, 0);
const ago = (d: number) => NOW - d * DAY;

const facts = (over: Partial<ClientFacts> = {}): ClientFacts => ({
  clientId: 'c1', name: 'Rae', joinedAtMs: ago(60), hasProgram: true,
  sessionTimesMs: [ago(1), ago(3), ago(5)], prq: [], lastActiveMs: ago(1), ...over,
});

/** Eight attributes measured together on one day. */
const fullReading = (d: number, value: number) =>
  ['strength', 'speed', 'endurance', 'agility', 'power', 'flexibility', 'recovery', 'mental']
    .map((attribute) => ({ attribute, value, measuredAtMs: ago(d) }));

describe('prqSnapshots', () => {
  it('reads nothing out of nothing', () => {
    expect(prqSnapshots([])).toEqual([]);
  });

  it('makes ONE snapshot from attributes measured together, not one per attribute', () => {
    expect(prqSnapshots(fullReading(10, 60))).toHaveLength(1);
  });

  it('averages the attributes into the composite', () => {
    expect(prqSnapshots(fullReading(10, 60))[0].composite).toBe(60);
  });

  it('carries an unmeasured attribute forward instead of dropping it', () => {
    const snaps = prqSnapshots([...fullReading(10, 60), { attribute: 'speed', value: 84, measuredAtMs: ago(2) }]);
    expect(snaps).toHaveLength(2);
    expect(snaps[1].axes.strength).toBe(60);              // never re-measured, still known
    expect(snaps[1].axes.speed).toBe(84);
    expect(snaps[1].composite).toBe(63);                  // (60*7 + 84) / 8
  });

  it('ignores an attribute that is not a PRQ attribute, and a NaN', () => {
    const snaps = prqSnapshots([
      ...fullReading(10, 60),
      { attribute: 'vibes', value: 99, measuredAtMs: ago(9) },
      { attribute: 'speed', value: Number.NaN, measuredAtMs: ago(8) },
    ]);
    expect(snaps[0].axes.vibes).toBeUndefined();
    expect(snaps[0].composite).toBe(60);
  });

  // THE COVERAGE TRAP. Four attributes on Monday and eight on Friday is not a fitness change.
  it('does not let a change in COVERAGE look like a change in the athlete', () => {
    const partial = ['strength', 'speed'].map((attribute) => ({ attribute, value: 90, measuredAtMs: ago(20) }));
    const snaps = prqSnapshots([...partial, ...fullReading(2, 60)]);
    expect(snaps).toHaveLength(1);                        // the 2-attribute reading is not comparable
    expect(snaps[0].composite).toBe(60);
  });

  it('still gives a trend to an athlete who has never had all eight measured', () => {
    const two = (d: number, v: number) => ['strength', 'speed'].map((attribute) => ({ attribute, value: v, measuredAtMs: ago(d) }));
    const snaps = prqSnapshots([...two(20, 50), ...two(2, 70)]);
    expect(snaps).toHaveLength(2);                        // their own best coverage is the bar, not all eight
    expect(snaps.map((s) => s.composite)).toEqual([50, 70]);
  });
});

describe('toAthleteRow', () => {
  it('counts sessions in the windows triage asks about', () => {
    const r = toAthleteRow(facts({ sessionTimesMs: [ago(0.2), ago(0.5), ago(3), ago(20)] }), NOW);
    expect(r.sessions24h).toBe(2);
    expect(r.sessions7d).toBe(3);
  });

  it('passes silence through as null rather than as a very old date', () => {
    expect(toAthleteRow(facts({ lastActiveMs: null }), NOW).lastActiveAt).toBeNull();
  });
});

describe('toClientActivity', () => {
  it('hands compliance its sessions newest first', () => {
    const a = toClientActivity(facts({ sessionTimesMs: [ago(5), ago(1), ago(3)] }));
    expect(a.completedAtMs).toEqual([ago(1), ago(3), ago(5)]);
  });
});

describe('attentionBoard', () => {
  it('says so plainly when a roster is empty', () => {
    const b = attentionBoard([], NOW);
    expect(b.triage.flags).toEqual([]);
    expect(b.headline).toBeNull();
  });

  it('puts an athlete waiting on PROGRAMMING ahead of any readiness analysis', () => {
    // Only this coach can write the program; nothing about readiness outranks it.
    const b = attentionBoard([
      facts({ clientId: 'a', name: 'Ada', hasProgram: false, joinedAtMs: ago(30) }),
      facts({ clientId: 'b', name: 'Bo', lastActiveMs: ago(QUIET_DAYS + 5), sessionTimesMs: [] }),
    ], NOW);
    expect(b.headline).toContain('waiting on programming');
  });

  it('flags the athlete who has gone quiet', () => {
    const b = attentionBoard([facts({ clientId: 'q', name: 'Quinn', lastActiveMs: ago(QUIET_DAYS + 4), sessionTimesMs: [] })], NOW);
    expect(b.triage.flags.map((f) => f.kind)).toContain('gone-quiet');
  });

  it('says nothing needs the coach when everyone is training normally', () => {
    // 55, deliberately under PROGRESSION_COMPOSITE: at 70 an athlete is flagged ready-to-progress, which is GOOD
    // news rather than a problem but is still a row on the board, so it is not "nothing to say".
    const healthy = (id: string) => facts({ clientId: id, name: id, prq: fullReading(3, 55), sessionTimesMs: [ago(1), ago(3), ago(6)] });
    const b = attentionBoard([healthy('a'), healthy('b')], NOW);
    expect(b.triage.flags).toEqual([]);
    expect(b.triage.clear).toBe(2);
    expect(b.headline).toBeNull();
  });

  it('raises good news as its own kind of row, not as a problem', () => {
    // A coach who only ever sees problems stops opening the screen.
    const b = attentionBoard([facts({ clientId: 'p', name: 'Pia', prq: fullReading(3, 78), sessionTimesMs: [ago(1), ago(3), ago(6)] })], NOW);
    const flag = b.triage.flags.find((f) => f.kind === 'ready-to-progress');
    expect(flag?.positive).toBe(true);
  });

  it('every client appears on the drift board, flagged or not', () => {
    const b = attentionBoard([facts({ clientId: 'a', name: 'A' }), facts({ clientId: 'b', name: 'B' })], NOW);
    expect(b.drift.map((d) => d.clientId).sort()).toEqual(['a', 'b']);
  });
});

// MIRROR-COACH P2 (2026-09-25): the adapter carries coached sessions, logged coached work, games and Mirror screens as
// four facts, and each board reads the one it means.
describe('coached work, games and screens, read apart', () => {
  const coachedSix = [ago(1), ago(3), ago(5), ago(7), ago(9), ago(11)];

  it('a client with coached sessions and no games is not stalled, and triage has nothing to say', () => {
    const b = attentionBoard([facts({ sessionTimesMs: coachedSix, loggedTimesMs: coachedSix, gameTimesMs: [], screenTimesMs: [], lastActiveMs: ago(1) })], NOW);
    expect(b.drift[0]).toMatchObject({ state: 'steady', recent: 6, games: 0 });
    expect(b.triage.flags).toEqual([]);          // coached work is current data: no "ask for a System Scan"
    expect(b.headline).toBeNull();
  });

  it('a client who only plays games is stalled, named with their games — and not gone quiet', () => {
    const games = [ago(0.5), ago(2), ago(4)];
    const b = attentionBoard([facts({ sessionTimesMs: [], loggedTimesMs: [], gameTimesMs: games, screenTimesMs: [], lastActiveMs: ago(0.5) })], NOW);
    expect(b.drift[0]).toMatchObject({ state: 'stalled', games: 3 });
    expect(b.drift[0].note).toMatch(/Still playing: 3 games/);
    // P2 review (2026-09-26): never any coached work is not "no coached session in 10+ days"
    expect(b.headline).toBe('1 athlete has not logged any coached work yet.');
    expect(b.triage.flags.map((f) => f.kind)).toEqual(['stale-scan']);
    expect(b.triage.flags[0].observed).toBe('No PRQ System Scan on file; no graded Mirror screen; no coached work logged.');
  });

  it('a GRADED Mirror screen yesterday is current data for triage (the route passes graded screens only)', () => {
    const b = attentionBoard([facts({ sessionTimesMs: [], loggedTimesMs: [], gameTimesMs: [ago(1)], screenTimesMs: [ago(1)], lastActiveMs: ago(1) })], NOW);
    expect(b.triage.flags).toEqual([]);
  });

  it('the load read counts coached sessions only: ten games in a day is not under-recovered', () => {
    const tenGames = Array.from({ length: 10 }, (_, i) => ago(0.05 * (i + 1)));
    const row = toAthleteRow(facts({ sessionTimesMs: [ago(2)], gameTimesMs: tenGames }), NOW);
    expect(row.sessions24h).toBe(0);
    expect(row.sessions7d).toBe(1);
  });

  it('hands triage the newest coached work (a logged set can be newer than the last completed session)', () => {
    const row = toAthleteRow(facts({ sessionTimesMs: [ago(5)], loggedTimesMs: [ago(2)], screenTimesMs: [ago(8)] }), NOW);
    expect(row.lastCoachedAt).toBe(new Date(ago(2)).toISOString());
    expect(row.lastScreenAt).toBe(new Date(ago(8)).toISOString());
  });

  it('a fact the caller did not read stays unread: no lastCoachedAt / lastScreenAt keys at all', () => {
    const row = toAthleteRow(facts(), NOW);
    expect('lastCoachedAt' in row).toBe(false);
    expect('lastScreenAt' in row).toBe(false);
    const a = toClientActivity(facts());
    expect('gameAtMs' in a).toBe(false);
    expect('loggedAtMs' in a).toBe(false);
  });
});

// MIRROR-COACH P2 review (2026-09-26): an ungraded Mirror screen (every screen stored until P3) is not current data.
describe('gradedScreenTimes: only a screen the coach can read counts', () => {
  it('an ungraded row, a legacy empty row and junk count nothing; a graded row counts', async () => {
    const { gradedScreenTimes } = await import('./attention');
    const { storedScreen } = await import('../mirror/screenStore');
    const { scoreScreen } = await import('../mirror/screen');
    const results = [{ checkId: 'heelLine', grade: 'stable', source: 'camera' }] as Parameters<typeof scoreScreen>[1];
    const t = (d: number) => new Date(ago(d));
    expect(gradedScreenTimes([
      { createdAt: t(1), metrics: storedScreen('ungraded', 'modified', [], scoreScreen('modified', [])) },
      { createdAt: t(2), metrics: { screenId: 'legacy', screen: 'full', results: [], summary: { score: 100 } } },
      { createdAt: t(3), metrics: {} },
      { createdAt: t(4), metrics: null },
      { createdAt: t(5), metrics: storedScreen('graded', 'modified', results, scoreScreen('modified', results)) },
    ])).toEqual([ago(5)]);
  });
});
