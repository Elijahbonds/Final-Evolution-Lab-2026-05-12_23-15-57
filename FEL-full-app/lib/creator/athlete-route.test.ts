// GET + POST /api/v1/creator/athlete, DRIVEN (no database): the PRQ it serves and stores is the MEASURED one.
//
// HOTFIX (2026-09-24): axesFor stopped reading the dice-seeded profile row, but Finalizes before that stored the dice
// axes in AthleteBuild.prq — and GET served `row.prq ?? axesFor`, so the old roll kept coming back as the athlete's
// PRQ, while Finalize wrote `prq ?? undefined` (leave the column alone), so it was never cleared. GET reads the
// measured axes now and Finalize writes Prisma.DbNull when there are none.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@/public/_prisma/client';

const getServerSession = vi.fn();
vi.mock('next-auth', () => ({ getServerSession: (...a: unknown[]) => getServerSession(...a) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));

const axesFor = vi.fn();
vi.mock('@/lib/creator/athleteAxes-server', () => ({ axesFor: (...a: unknown[]) => axesFor(...a) }));

const buildRow = vi.fn();
const buildUpsert = vi.fn();
vi.mock('@/lib/db', () => ({
  prisma: {
    athleteBuild: { findUnique: (...a: unknown[]) => buildRow(...a), upsert: (...a: unknown[]) => buildUpsert(...a) },
    avatarLook: { findUnique: async () => null, upsert: async () => ({}) },
    ownedWearable: { findMany: async () => [] },
    $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
  },
}));

import { GET, POST } from '@/app/api/v1/creator/athlete/route';

const finalize = async () => {
  const res = await POST({ json: async () => ({ values: {}, plate: '' }) } as never);
  return { status: res.status, body: await res.json() };
};

beforeEach(() => {
  getServerSession.mockResolvedValue({ user: { id: 'u1' } });
  axesFor.mockReset(); buildRow.mockReset(); buildUpsert.mockReset();
  buildUpsert.mockResolvedValue({ finalizedAt: new Date(0) });
});

describe('the athlete\'s PRQ is what was measured', () => {
  it('GET ignores a snapshot an earlier Finalize stored and serves the measured axes', async () => {
    buildRow.mockResolvedValue({ build: null, prq: { speed: 63, power: 91 }, finalizedAt: new Date(0) });   // the old dice roll
    axesFor.mockResolvedValue(null);
    expect((await (await GET()).json()).prq).toBeNull();

    axesFor.mockResolvedValue({ power: 71 });
    expect((await (await GET()).json()).prq).toEqual({ power: 71 });
  });

  it('Finalize with no measurement CLEARS the stored snapshot', async () => {
    axesFor.mockResolvedValue(null);
    const r = await finalize();
    expect(r.status).toBe(200);
    const arg = buildUpsert.mock.calls[0][0];
    expect(arg.update.prq).toBe(Prisma.DbNull);
    expect(arg.create.prq).toBe(Prisma.DbNull);
  });

  it('Finalize with measured axes stores them', async () => {
    axesFor.mockResolvedValue({ speed: 80 });
    expect((await finalize()).status).toBe(200);
    const arg = buildUpsert.mock.calls[0][0];
    expect(arg.update.prq).toEqual({ speed: 80 });
    expect(arg.create.prq).toEqual({ speed: 80 });
  });
});
