/**
 * scripts/prq-tests.ts — PRQ / Digital-Twin Foundation integrity tests.
 *
 * Harness: `yarn tsx scripts/prq-tests.ts` + node:assert.
 *
 * Coverage:
 *   PURE:
 *     - PRQ_SOURCES + PRQ_ATTRS are defined and disjoint
 *       (manual | device | drillResult | camera — 'camera' is the body-camera ESTIMATE, movement play 2026-09-24)
 *     - ATTR_UNITS covers every PRQ attribute
 *     - DeviceSource seam interface exists and validator works
 *     - camera requires sessionId, like drillResult (checked before any row is written, so no database)
 *   DB INTEGRATION (throwaway user, cleaned up):
 *     - Manual entry creates a traceable PrqEntry
 *     - No value without source+timestamp (enforced by createPrqEntry)
 *     - drillResult requires sessionId
 *     - Client cannot write PRQ directly (source=drillResult rejected on manual path)
 *     - Unmeasured attribute → absent from vector (null = "not measured")
 *     - computeTraceablePrq only counts measured attributes
 *     - deletePrqEntries hard-deletes entries
 */

import 'dotenv/config';
import assert from 'node:assert';
import { PrismaClient } from '@/public/_prisma/client';

import { PRQ_ATTRS, PRQ_CAMERA_SOURCE } from '../lib/prq';
import {
  PRQ_SOURCES,
  ATTR_UNITS,
  ATTR_LABELS,
  isDeviceSourceValid,
  createPrqEntry,
  getLatestPrqVector,
  computeTraceablePrq,
  deletePrqEntries,
  listPrqEntries,
} from '../lib/prq-entries';

const prisma = new PrismaClient();

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  \u2713 ${name}`);
}
async function checkAsync(name: string, fn: () => Promise<void>) {
  await fn();
  passed++;
  console.log(`  \u2713 ${name}`);
}

async function pureTests() {
  console.log('\nPURE LOGIC');

  // MOVEMENT PLAY (2026-09-24): 'camera' joined the enum — the session's best measured jump, written as PRQ power by
  // /api/sessions as an estimate (lib/prq.ts isPrqEstimate: it counts in the vector, never on the verified shield).
  check('PRQ_SOURCES is a valid enum set', () => {
    assert.deepStrictEqual([...PRQ_SOURCES], ['manual', 'device', 'drillResult', PRQ_CAMERA_SOURCE]);
    assert.equal(PRQ_CAMERA_SOURCE, 'camera');
  });

  check('ATTR_UNITS covers every PRQ attribute', () => {
    for (const attr of PRQ_ATTRS) {
      assert.ok(ATTR_UNITS[attr] && ATTR_UNITS[attr].length > 0, `no units for ${attr}`);
    }
  });

  check('ATTR_LABELS covers every PRQ attribute', () => {
    for (const attr of PRQ_ATTRS) {
      assert.ok(ATTR_LABELS[attr] && ATTR_LABELS[attr].length > 0, `no label for ${attr}`);
    }
  });

  check('DeviceSource seam validator works', () => {
    assert.equal(isDeviceSourceValid({ provider: 'apple_health', deviceId: 'x', syncedAt: new Date() }), true);
    assert.equal(isDeviceSourceValid({ provider: '', deviceId: 'x', syncedAt: new Date() }), false);
    assert.equal(isDeviceSourceValid({ provider: 'garmin', deviceId: '', syncedAt: new Date() }), false);
  });

  // createPrqEntry validates before it writes, so a client that throws on ANY touch proves the refusal needs no
  // database (and that nothing was written): a camera estimate is traceable to the session that measured it.
  const untouchable = new Proxy({}, { get: (_t, key) => { throw new Error(`database touched: ${String(key)}`); } });
  await checkAsync('camera entry without sessionId rejected (before the database)', async () => {
    await assert.rejects(
      () => createPrqEntry(untouchable as any, {
        userId: 'u', attribute: 'power', value: 42, unit: 'score',
        source: PRQ_CAMERA_SOURCE, measuredAt: new Date(),
      }),
      /camera entries require a sessionId/
    );
  });
}

async function dbTests() {
  console.log('\nDB INTEGRATION');
  const stamp = Date.now();
  const user = await prisma.user.create({
    data: {
      email: `__prqtest_${stamp}@fel.test`,
      name: 'PRQ Test',
      password: 'x',
    },
    select: { id: true },
  });
  const userId = user.id;

  try {
    await checkAsync('no value without source: invalid source rejected', async () => {
      await assert.rejects(
        () => createPrqEntry(prisma, {
          userId, attribute: 'strength', value: 50, unit: 'lbs',
          source: 'bogus' as any, measuredAt: new Date(),
        }),
        /Invalid PRQ source/
      );
    });

    await checkAsync('no value without timestamp: invalid date rejected', async () => {
      await assert.rejects(
        () => createPrqEntry(prisma, {
          userId, attribute: 'strength', value: 50, unit: 'lbs',
          source: 'manual', measuredAt: new Date('invalid'),
        }),
        /valid Date/
      );
    });

    await checkAsync('invalid attribute rejected', async () => {
      await assert.rejects(
        () => createPrqEntry(prisma, {
          userId, attribute: 'flying' as any, value: 50, unit: 'score',
          source: 'manual', measuredAt: new Date(),
        }),
        /Invalid PRQ attribute/
      );
    });

    await checkAsync('drillResult without sessionId rejected', async () => {
      await assert.rejects(
        () => createPrqEntry(prisma, {
          userId, attribute: 'strength', value: 50, unit: 'score',
          source: 'drillResult', measuredAt: new Date(),
        }),
        /require a sessionId/
      );
    });

    await checkAsync('unmeasured attribute → absent from vector', async () => {
      const vec = await getLatestPrqVector(prisma, userId);
      assert.equal(vec.size, 0, 'fresh user should have zero entries');
      const prq = await computeTraceablePrq(prisma, userId);
      assert.equal(prq.score, 0);
      assert.equal(prq.measured, 0);
      assert.equal(prq.total, PRQ_ATTRS.length);
    });

    await checkAsync('manual entry creates a traceable PrqEntry', async () => {
      const { id } = await createPrqEntry(prisma, {
        userId, attribute: 'power', value: 28, unit: 'in',
        source: 'manual', measuredAt: new Date(),
      });
      assert.ok(id, 'entry id must be returned');

      const vec = await getLatestPrqVector(prisma, userId);
      assert.equal(vec.size, 1);
      const entry = vec.get('power');
      assert.ok(entry);
      assert.equal(entry!.value, 28);
      assert.equal(entry!.unit, 'in');
      assert.equal(entry!.source, 'manual');
      assert.ok(entry!.measuredAt instanceof Date);
      assert.equal(entry!.entryId, id);
    });

    await checkAsync('computeTraceablePrq counts only measured attributes', async () => {
      const prq = await computeTraceablePrq(prisma, userId);
      assert.equal(prq.measured, 1); // only power
      assert.equal(prq.total, PRQ_ATTRS.length);
      assert.equal(prq.score, 28); // single attr = its value
    });

    await checkAsync('drillResult entry with sessionId succeeds', async () => {
      const { id } = await createPrqEntry(prisma, {
        userId, attribute: 'speed', value: 65.5, unit: 'score',
        source: 'drillResult', measuredAt: new Date(),
        sessionId: 'test_session_id',
      });
      assert.ok(id);
      const vec = await getLatestPrqVector(prisma, userId);
      assert.equal(vec.size, 2); // power + speed
      const s = vec.get('speed');
      assert.equal(s!.source, 'drillResult');
    });

    await checkAsync('listPrqEntries returns entries in order', async () => {
      const entries = await listPrqEntries(prisma, userId);
      assert.ok(entries.length >= 2);
      // most recent first
      assert.ok(new Date(entries[0].measuredAt) >= new Date(entries[1].measuredAt));
    });

    await checkAsync('deletePrqEntries hard-deletes and is idempotent', async () => {
      const count1 = await deletePrqEntries(prisma, userId);
      assert.ok(count1 >= 2);
      const count2 = await deletePrqEntries(prisma, userId);
      assert.equal(count2, 0, 'second delete is a no-op');
      const vec = await getLatestPrqVector(prisma, userId);
      assert.equal(vec.size, 0, 'all entries gone');
    });
  } finally {
    await prisma.prqEntry.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  }
}

async function main() {
  console.log('PRQ / Digital-Twin Foundation — integrity tests');
  await pureTests();
  await dbTests();
  console.log(`\nALL ${passed} CHECKS PASSED`);
}

main()
  .catch((e) => {
    console.error('\nPRQ TESTS FAILED:\n', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
