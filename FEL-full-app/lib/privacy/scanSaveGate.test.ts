// TEEN-WRITE-BLOCK (2026-09-29): the movement-save gate itself — who is "verified 18+", where the age is read from, that
// the opt-in half is false for everyone today, that a parent's GuardianConsent never counts, and that the gate NEVER
// throws (AM 19:47 PT: a deploy that ran before some pending SQL must refuse, not 500).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.hoisted(() => vi.fn());
vi.mock('next-auth', () => ({ getServerSession }));
// The real reader by default (so "18+ not opted in" runs the shipped code); a test flips it to true for the positive control.
vi.mock('./scanSaveOptIn', async (importOriginal) => {
  const real = await importOriginal<typeof import('./scanSaveOptIn')>();
  return { scanSaveOptIn: vi.fn(real.scanSaveOptIn) };
});

import { scanSaveOptIn } from './scanSaveOptIn';
import { SCAN_SAVE_REFUSED, SCAN_SAVE_ROUTES, canSaveScanNumbers, refuseScanSave, verifiedAdult } from './scanSaveGate';
import {
  OPTED_IN_ADULT, REFUSED_SCAN_CASES, THIS_YEAR, argsOf, callsOn, newSpyDb, refusedGateReads, seedAcceptedGuardian, seedUser, spyPrisma, writesOf,
} from '@/tests/helpers/writeSpyDb';

const optIn = vi.mocked(scanSaveOptIn);
let realOptIn: typeof scanSaveOptIn;
const UID = 'user-7f3a9c';

/** Every console line written during `fn`, from any level. */
async function logLines(fn: () => Promise<unknown>): Promise<{ result: unknown; lines: string[] }> {
  const lines: string[] = [];
  const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((k) =>
    vi.spyOn(console, k).mockImplementation((...a: unknown[]) => { lines.push(a.map(String).join(' ')); }));
  try {
    return { result: await fn(), lines };
  } finally {
    for (const s of spies) s.mockRestore();
  }
}
const noPii = (line: string, dobYear: number | null) => {
  expect(line).not.toContain(UID);
  expect(line).not.toContain('@');
  if (dobYear != null) {
    expect(line).not.toContain(String(dobYear));
    expect(line).not.toContain(String(THIS_YEAR - dobYear));
  }
  expect(line).not.toMatch(/dobYear|birth|age\b/i);
};

beforeAll(async () => {
  realOptIn = (await vi.importActual<typeof import('./scanSaveOptIn')>('./scanSaveOptIn')).scanSaveOptIn;
});
beforeEach(() => {
  optIn.mockReset();
  optIn.mockImplementation(realOptIn);
  // a session that would say "adult" for SOMEONE ELSE: the gate must not read it at all
  getServerSession.mockReset();
  getServerSession.mockResolvedValue({ user: { id: 'someone-else', dobYear: 1970 } });
});
afterEach(() => vi.restoreAllMocks());

describe('verifiedAdult: a year gap of MORE than 18 (only the year is stored, so exactly 18 may still be 17)', () => {
  it.each([
    [THIS_YEAR - 12, false], [THIS_YEAR - 15, false], [THIS_YEAR - 17, false], [THIS_YEAR - 18, false],
    [THIS_YEAR - 19, true], [1990, true],
  ])('%s → %s', (year, want) => {
    expect(verifiedAdult(year)).toBe(want);
  });

  it.each([null, undefined, Number.NaN, 1800, 1899, THIS_YEAR + 1, 1990.5, Number.POSITIVE_INFINITY])('%s → false (not a provable age)', (year) => {
    expect(verifiedAdult(year as number | null | undefined)).toBe(false);
  });

  it('reads the calendar year from `now`', () => {
    expect(verifiedAdult(2008, new Date('2026-12-31T12:00:00Z'))).toBe(false);
    expect(verifiedAdult(2007, new Date('2026-01-02T12:00:00Z'))).toBe(true);
  });
});

describe('canSaveScanNumbers: verified 18+ from the DATABASE, and opted in', () => {
  it('reads User.dobYear from the database by the id it is given — never the session', async () => {
    const db = newSpyDb();
    seedUser(db, UID, THIS_YEAR - 15);
    expect(await canSaveScanNumbers(spyPrisma(db), UID)).toBe(false);
    expect(db.calls.map((c) => c.op)).toEqual(['user.findUnique']);
    expect(argsOf(db, 'user.findUnique')).toEqual([{ where: { id: UID }, select: { dobYear: true } }]);
    expect(getServerSession).not.toHaveBeenCalled();
  });

  it('the real opt-in reader answers false when no grant is stored, so an adult who has not opted in is refused', async () => {
    const db = newSpyDb();
    seedUser(db, UID, 1990);
    expect(await realOptIn(spyPrisma(db), UID)).toBe(false);
    expect(await canSaveScanNumbers(spyPrisma(db), UID)).toBe(false);
    expect(optIn).toHaveBeenCalledTimes(1);
  });

  it('every refused case is refused, reads nothing but the user row (and the opt-in for the adult), and writes nothing', async () => {
    for (const c of REFUSED_SCAN_CASES) {
      const db = newSpyDb();
      c.seed(db, UID);
      expect(await canSaveScanNumbers(spyPrisma(db), UID), c.id).toBe(false);
      expect(db.calls.map((x) => x.op), c.id).toEqual(refusedGateReads(c.id));
      expect(writesOf(db), c.id).toEqual([]);
    }
  });

  it('POSITIVE CONTROL: with the opt-in mocked true, an adult passes; a 15-year-old and a 17-year-old with a parent\'s yes still do not', async () => {
    optIn.mockResolvedValue(true);
    const adult = newSpyDb();
    OPTED_IN_ADULT.seed(adult, UID);
    expect(await canSaveScanNumbers(spyPrisma(adult), UID)).toBe(true);

    for (const c of REFUSED_SCAN_CASES.filter((x) => !x.id.startsWith('18+'))) {
      const db = newSpyDb();
      c.seed(db, UID);
      expect(await canSaveScanNumbers(spyPrisma(db), UID), c.id).toBe(false);
    }
    // short-circuit: the opt-in is read for the adult only, never when the age already failed
    expect(optIn).toHaveBeenCalledTimes(1);
  });

  it('never reads GuardianConsent, even when an accepted one names this user', async () => {
    optIn.mockResolvedValue(true);
    const db = newSpyDb();
    seedUser(db, UID, THIS_YEAR - 17);
    seedAcceptedGuardian(db, UID, THIS_YEAR - 17);
    expect(await canSaveScanNumbers(spyPrisma(db), UID)).toBe(false);
    expect(callsOn(db, 'guardianConsent')).toEqual([]);
  });

  it('a missing row or a thrown read is false', async () => {
    expect(await canSaveScanNumbers(spyPrisma(newSpyDb()), UID)).toBe(false);
    const broken = { user: { findUnique: () => Promise.reject(new Error('connection reset')) } };
    await expect(canSaveScanNumbers(broken as never, UID)).resolves.toBe(false);
  });
});

describe('never throws (AM 19:47 PT): absent opt-in, a failing read, a missing row → false, one log line, no PII', () => {
  const adultDb = () => { const db = newSpyDb(); seedUser(db, UID, 1990); return spyPrisma(db); };
  const prismaError = (code: string, message: string) => Object.assign(new Error(message), { name: 'PrismaClientKnownRequestError', code });
  const failingDb = (e: unknown) => ({ user: { findUnique: () => Promise.reject(e) } }) as never;

  it('(i) the opt-in source rejects, or answers something that is not a boolean', async () => {
    for (const make of [
      () => optIn.mockRejectedValue(prismaError('P2021', `The table \`public.ScanOptIn\` does not exist (${UID})`)),
      () => optIn.mockResolvedValue(undefined as unknown as boolean),
    ]) {
      make();
      const { lines } = await logLines(() => expect(canSaveScanNumbers(adultDb(), UID)).resolves.toBe(false));
      expect(lines).toHaveLength(1);
      noPii(lines[0], 1990);
    }
  });

  it('(ii) the database read rejects — a Prisma P2021 and a plain Error, both carrying PII in their message', async () => {
    for (const e of [prismaError('P2021', `The table \`public.User\` does not exist. ${UID}@fel.test 1990`), new Error(`boom ${UID} 1990`)]) {
      const { lines } = await logLines(() => expect(canSaveScanNumbers(failingDb(e), UID)).resolves.toBe(false));
      expect(lines).toHaveLength(1);
      noPii(lines[0], 1990);
      expect(lines[0]).toMatch(/^\[privacy\] scan_save_gate_read_failed /);
    }
  });

  it('(iii) the row is missing', async () => {
    const { lines } = await logLines(() => expect(canSaveScanNumbers(spyPrisma(newSpyDb()), UID)).resolves.toBe(false));
    expect(lines).toEqual(['[privacy] scan_save_gate_no_user_row']);
  });

  it('and the ordinary refusals (unknown age, a minor, an adult not opted in) log nothing — they are not failures', async () => {
    for (const c of REFUSED_SCAN_CASES.filter((x) => x.id !== 'no user row')) {
      const db = newSpyDb();
      c.seed(db, UID);
      const { lines } = await logLines(() => canSaveScanNumbers(spyPrisma(db), UID));
      expect(lines, c.id).toEqual([]);
    }
  });
});

describe('the refusal', () => {
  it('is 403 { error: scan_save_adults_only, saved: false }', async () => {
    const res = refuseScanSave();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'scan_save_adults_only', saved: false });
    expect(SCAN_SAVE_REFUSED).toEqual({ error: 'scan_save_adults_only', saved: false });
  });
});

describe('SCAN_SAVE_ROUTES is GAP 1\'s table', () => {
  it('names 1a–1h once each, every file exists, and a routed row names its holder', () => {
    expect(SCAN_SAVE_ROUTES.map((r) => r.id)).toEqual(['1a', '1b', '1c', '1d', '1e', '1f', '1g', '1h', '1i', '1j']);
    for (const r of SCAN_SAVE_ROUTES) {
      expect(() => readFileSync(join(__dirname, '../..', r.file)), r.file).not.toThrow();
      if (r.status === 'routed') expect(r.holder, r.id).toBeTruthy();
    }
  });
});

// ── static: production-safe reads, and nothing held ───────────────────────────────────────────────────────────────────

const ROOT = join(__dirname, '../..');
const GATE_FILES = ['lib/privacy/scanSaveGate.ts', 'lib/privacy/scanSaveOptIn.ts', 'lib/privacy/healthWriteGate.ts', 'lib/privacy/verifiedAdult.ts'];
/**
 * User, the MIRROR-COACH p5/p6 tables, and ScanSaveOptIn.
 * assumption: naming scanSaveOptIn is safe because its reader catches a missing table and returns false
 * (prisma/pending/2026-10-04-adult-optin-ab04.sql). That replaces the old "don't name a table that isn't on
 * production yet" proxy for this one model. A thrown read is still a refusal, not a 500.
 */
const PROD_SAFE_MODELS = ['user', 'healthIntake', 'healthConsent', 'painCheckIn', 'readinessCheckIn', 'scanSaveOptIn'];
const ACCESS = /\b(?:db|prisma|tx|client)\s*(?:\.\s*([A-Za-z_]\w*)|\[\s*['"](\w+)['"]\s*\])/g;
const PICK = /Pick<\s*Prisma\.(?:TransactionClient|PrismaClient)\s*,\s*([^>]+)>/g;

function modelsReferenced(src: string): string[] {
  const out = new Set<string>();
  for (const m of src.matchAll(ACCESS)) out.add(m[1] ?? m[2]);
  for (const m of src.matchAll(PICK)) for (const q of m[1].matchAll(/'(\w+)'/g)) out.add(q[1]);
  return [...out].filter((n) => !n.startsWith('$')).sort();
}

describe('static: the gate reads only what production already has, and imports nothing held', () => {
  it('control: the scan catches a model it should refuse (so an empty list means none, not blindness)', () => {
    expect(modelsReferenced("await db.faceScanConsent.findFirst({})")).toEqual(['faceScanConsent']);
    expect(modelsReferenced("type D = Pick<Prisma.TransactionClient, 'user' | 'guardianConsent'>")).toEqual(['guardianConsent', 'user']);
    expect(modelsReferenced("prisma['ageRecord'].findMany()")).toEqual(['ageRecord']);
  });

  it.each(GATE_FILES)('%s references only the production-safe models, never GuardianConsent', (file) => {
    const src = readFileSync(join(ROOT, file), 'utf8');
    for (const model of modelsReferenced(src)) expect(PROD_SAFE_MODELS, `${file} reads ${model}`).toContain(model);
    expect(src).not.toMatch(/\.\s*guardianConsent\b|'guardianConsent'|faceScanConsent/);
  });

  it.each(GATE_FILES)('%s imports nothing from lib/coach, lib/mirror, lib/camp or lib/move', (file) => {
    const imports = [...readFileSync(join(ROOT, file), 'utf8').matchAll(/from ['"]([^'"]+)['"]/g)].map((m) => m[1]);
    for (const i of imports) expect(i, `${file} imports ${i}`).not.toMatch(/lib\/(coach|mirror|camp|move)\/|^\.\.\/(coach|mirror|camp|move)\//);
  });

  it('verifiedAdult.ts imports nothing, so a client-imported module (lib/health/intake.ts) can share the rule', () => {
    expect(readFileSync(join(ROOT, 'lib/privacy/verifiedAdult.ts'), 'utf8')).not.toMatch(/^\s*import\b|require\(/m);
  });

  it('nothing reads an env var, header or flag that could switch the opt-in on', () => {
    const src = readFileSync(join(ROOT, 'lib/privacy/scanSaveOptIn.ts'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    expect(src).not.toMatch(/process\.env|headers|cookies|searchParams/);
    expect(src).toMatch(/return false;/);
  });
});
