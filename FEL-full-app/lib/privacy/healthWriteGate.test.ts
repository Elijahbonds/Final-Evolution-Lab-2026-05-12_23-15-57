// TEEN-WRITE-BLOCK (2026-09-29; FE PM 19:19 PT): the health-write gate — verified 18+ from the database's User.dobYear,
// WITHOUT the movement opt-in; never the session, never a request body, never a parent's GuardianConsent; never throws.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.hoisted(() => vi.fn());
vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('./scanSaveOptIn', () => ({ scanSaveOptIn: vi.fn(async () => false) }));

import { scanSaveOptIn } from './scanSaveOptIn';
import { HEALTH_WRITE_REFUSED, HEALTH_WRITE_ROUTES, canWriteHealthData, refuseHealthWrite } from './healthWriteGate';
import {
  HEALTH_ADULT, HEALTH_REFUSED_CASES, THIS_YEAR, argsOf, callsOn, newSpyDb, seedUser, spyPrisma, writesOf,
} from '@/tests/helpers/writeSpyDb';

const UID = 'user-2b81d0';
const optIn = vi.mocked(scanSaveOptIn);

async function logLines(fn: () => Promise<unknown>): Promise<string[]> {
  const lines: string[] = [];
  const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((k) =>
    vi.spyOn(console, k).mockImplementation((...a: unknown[]) => { lines.push(a.map(String).join(' ')); }));
  try { await fn(); } finally { for (const s of spies) s.mockRestore(); }
  return lines;
}

beforeEach(() => {
  optIn.mockClear();
  getServerSession.mockReset();
  getServerSession.mockResolvedValue({ user: { id: UID, dobYear: 1970 } });
});
afterEach(() => vi.restoreAllMocks());

describe('canWriteHealthData', () => {
  it('the adult (1990) may write; the opt-in is not part of this rule and is never read', async () => {
    const db = newSpyDb();
    HEALTH_ADULT.seed(db, UID);
    expect(await canWriteHealthData(spyPrisma(db), UID)).toBe(true);
    expect(optIn).not.toHaveBeenCalled();
  });

  it('unknown age, 15, and 17 with an ACCEPTED GuardianConsent are refused — a parent\'s yes unlocks nothing', async () => {
    for (const c of HEALTH_REFUSED_CASES) {
      const db = newSpyDb();
      c.seed(db, UID);
      expect(await canWriteHealthData(spyPrisma(db), UID), c.id).toBe(false);
      expect(callsOn(db, 'guardianConsent'), c.id).toEqual([]);
      expect(writesOf(db), c.id).toEqual([]);
    }
  });

  it('the same boundary as the movement gate: exactly 18 by year is not verified, 19 is', async () => {
    for (const [year, want] of [[THIS_YEAR - 18, false], [THIS_YEAR - 19, true]] as const) {
      const db = newSpyDb();
      seedUser(db, UID, year);
      expect(await canWriteHealthData(spyPrisma(db), UID), String(year)).toBe(want);
    }
  });

  it('reads User.dobYear from the database by the id it is given — never the session (which here says 1970)', async () => {
    const db = newSpyDb();
    seedUser(db, UID, null);
    expect(await canWriteHealthData(spyPrisma(db), UID)).toBe(false);
    expect(db.calls.map((c) => c.op)).toEqual(['user.findUnique']);
    expect(argsOf(db, 'user.findUnique')).toEqual([{ where: { id: UID }, select: { dobYear: true } }]);
    expect(getServerSession).not.toHaveBeenCalled();
  });
});

describe('never throws (AM 19:47 PT) → false, one log line, no PII', () => {
  const noPii = (line: string) => {
    expect(line).not.toContain(UID);
    expect(line).not.toContain('@');
    expect(line).not.toContain('1990');
    expect(line).not.toMatch(/dobYear|birth|age\b/i);
  };

  it('(i) there is no opt-in in the health rule: an opt-in reader that rejects changes nothing for the adult (and logs nothing)', async () => {
    optIn.mockRejectedValue(new Error('no such table'));
    const db = newSpyDb();
    HEALTH_ADULT.seed(db, UID);
    const lines = await logLines(() => expect(canWriteHealthData(spyPrisma(db), UID)).resolves.toBe(true));
    expect(lines).toEqual([]);
    expect(optIn).not.toHaveBeenCalled();
  });

  it('(ii) the database read rejects — a Prisma P2021 and a plain Error', async () => {
    const errors = [
      Object.assign(new Error(`The table \`public.User\` does not exist. ${UID}@fel.test 1990`), { name: 'PrismaClientKnownRequestError', code: 'P2021' }),
      new Error(`boom ${UID}`),
    ];
    for (const e of errors) {
      const failing = { user: { findUnique: () => Promise.reject(e) } } as never;
      const lines = await logLines(() => expect(canWriteHealthData(failing, UID)).resolves.toBe(false));
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatch(/^\[privacy\] health_write_gate_read_failed /);
      noPii(lines[0]);
    }
  });

  it('(iii) the row is missing', async () => {
    const lines = await logLines(() => expect(canWriteHealthData(spyPrisma(newSpyDb()), UID)).resolves.toBe(false));
    expect(lines).toEqual(['[privacy] health_write_gate_no_user_row']);
  });
});

describe('the refusal and the table', () => {
  it('is 403 { error: health_data_adults_only, saved: false }', async () => {
    const res = refuseHealthWrite();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'health_data_adults_only', saved: false });
    expect(HEALTH_WRITE_REFUSED).toEqual({ error: 'health_data_adults_only', saved: false });
  });

  it('HEALTH_WRITE_ROUTES names a–f once each; each gated file imports the gate, each routed one names its holder', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    expect(HEALTH_WRITE_ROUTES.map((r) => r.id)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    for (const r of HEALTH_WRITE_ROUTES) {
      const src = readFileSync(join(__dirname, '../..', r.file), 'utf8');
      // both ways: a file that calls the gate is marked gated (R-HEALTH flips d and e when it lands)
      expect(r.status === 'gated', `${r.id} ${r.file}`).toBe(/canWriteHealthData\(prisma, userId\)/.test(src));
      if (r.status === 'routed') expect(r.holder, r.id).toBeTruthy();
    }
  });
});
