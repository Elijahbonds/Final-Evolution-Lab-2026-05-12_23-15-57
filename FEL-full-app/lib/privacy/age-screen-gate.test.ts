// AGE-SCREEN: movement numbers still wait on the opt-in. canSaveScanNumbers stays false without it, and a
// mocked opt-in still refuses everyone who is not a verified adult.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./scanSaveOptIn', async (importOriginal) => {
  const real = await importOriginal<typeof import('./scanSaveOptIn')>();
  return { scanSaveOptIn: vi.fn(real.scanSaveOptIn) };
});

import { canSaveScanNumbers } from './scanSaveGate';
import { scanSaveOptIn } from './scanSaveOptIn';
import { newSpyDb, seedUser, spyPrisma } from '@/tests/helpers/writeSpyDb';

const optIn = vi.mocked(scanSaveOptIn);
const real = optIn.getMockImplementation()!;
const THIS_YEAR = new Date().getFullYear();
const UID = 'gate-athlete';

async function ask(year: number, optedIn: boolean): Promise<boolean> {
  const db = newSpyDb();
  seedUser(db, UID, year);
  optIn.mockImplementation(optedIn ? async () => true : real);
  return canSaveScanNumbers(spyPrisma(db), UID);
}

describe('canSaveScanNumbers', () => {
  beforeEach(() => { optIn.mockImplementation(real); });

  it('is false for thisYear−12, −15 and −18 when nobody has opted in', async () => {
    expect(await ask(THIS_YEAR - 12, false)).toBe(false);
    expect(await ask(THIS_YEAR - 15, false)).toBe(false);
    expect(await ask(THIS_YEAR - 18, false)).toBe(false);
  });

  it('with the opt-in mocked true, stays false for −12, −15 and −18, and is true for −19', async () => {
    expect(await ask(THIS_YEAR - 12, true)).toBe(false);
    expect(await ask(THIS_YEAR - 15, true)).toBe(false);
    expect(await ask(THIS_YEAR - 18, true)).toBe(false);
    expect(await ask(THIS_YEAR - 19, true)).toBe(true);
  });
});
