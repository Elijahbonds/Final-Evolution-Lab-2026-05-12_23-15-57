import { describe, expect, it } from 'vitest';
import { CHAPTERS, CHAPTER_SHARDS, COURSE_BONUS_SHARDS, chapterReward } from './course';
import { chapterKey, courseKey, payChapter, prismaRewardDeps, type RewardDeps } from './rewards';
import { DEFAULT_REWARD_RULES, REASON, SHARD_REASONS, computeGrant } from '@/lib/wallet/reward-rules';
import { fakeLedger } from '@/tests/helpers/fakeRewardLedger';

// EDU-LINKS (2026-10-07): a chapter pays once, the course bonus pays once, and both are priced by the wallet's rules.
// The stand-in ledger (tests/helpers/fakeRewardLedger.ts) behaves as grantServerReward does.

describe('the rules that price it', () => {
  it('the course bonus has a rule, in shards, capped at one bonus, matching COURSE_BONUS_SHARDS', () => {
    const r = DEFAULT_REWARD_RULES[REASON.EDU_COURSE_COMPLETE];
    expect(r).toBeDefined();
    expect(r).toMatchObject({ currency: 'shards', formula: 'flat', active: true, baseAmount: COURSE_BONUS_SHARDS, minGrant: COURSE_BONUS_SHARDS, maxGrant: COURSE_BONUS_SHARDS });
    expect(computeGrant(r, { score: 10_000 })).toBe(COURSE_BONUS_SHARDS);
    expect(SHARD_REASONS.has(REASON.EDU_COURSE_COMPLETE)).toBe(true);
  });

  it('the keys name the account and the chapter, nothing that varies per attempt', () => {
    expect(chapterKey('u1', 6)).toBe('playbook:chapter:u1:6');   // the key the lesson route used since 2026-09-20
    expect(courseKey('u1')).toBe('playbook:course:u1');
  });
});

describe('payChapter', () => {
  it('pays a chapter once: a second call (a replay, a second pass) moves nothing', async () => {
    const l = fakeLedger();
    expect(await payChapter(l.deps, 'u1', 3)).toMatchObject({ chapter: CHAPTER_SHARDS, bonus: 0, chaptersPaid: 1 });
    expect(await payChapter(l.deps, 'u1', 3)).toMatchObject({ chapter: 0, bonus: 0, chaptersPaid: 1 });
    expect(l.shards('u1')).toBe(CHAPTER_SHARDS);
    expect(l.rows.size).toBe(1);
  });

  it('pays the course bonus with the tenth chapter, once, and what it pays matches chapterReward at every step', async () => {
    const l = fakeLedger();
    const paid = new Set<number>();
    for (const c of [...CHAPTERS].reverse()) {
      const expected = chapterReward(c.number, paid);
      const got = await payChapter(l.deps, 'u1', c.number);
      expect(got.chapter + got.bonus, `chapter ${c.number}`).toBe(expected);
      paid.add(c.number);
    }
    expect(l.shards('u1')).toBe(CHAPTERS.length * CHAPTER_SHARDS + COURSE_BONUS_SHARDS);
    // again, every chapter: nothing more
    for (const c of CHAPTERS) expect(await payChapter(l.deps, 'u1', c.number)).toMatchObject({ chapter: 0, bonus: 0 });
    expect(l.shards('u1')).toBe(CHAPTERS.length * CHAPTER_SHARDS + COURSE_BONUS_SHARDS);
    expect([...l.rows.keys()].filter((k) => k === courseKey('u1'))).toHaveLength(1);
  });

  it('a bonus whose grant failed the first time is paid on the next chapter payment (its key is still free)', async () => {
    const l = fakeLedger();
    for (const c of CHAPTERS.slice(0, -1)) await payChapter(l.deps, 'u1', c.number);
    const flaky: RewardDeps = { ...l.deps, grant: async (a) => (a.idempotencyKey === courseKey('u1') ? null : l.deps.grant(a)) };
    expect(await payChapter(flaky, 'u1', 10)).toMatchObject({ chapter: CHAPTER_SHARDS, bonus: 0, chaptersPaid: 10 });
    expect(await payChapter(l.deps, 'u1', 10)).toMatchObject({ chapter: 0, bonus: COURSE_BONUS_SHARDS });
  });

  it('one account’s chapters never count toward another’s bonus', async () => {
    const l = fakeLedger();
    for (const c of CHAPTERS.slice(0, 9)) await payChapter(l.deps, 'u1', c.number);
    expect(await payChapter(l.deps, 'u2', 10)).toMatchObject({ chapter: CHAPTER_SHARDS, bonus: 0, chaptersPaid: 1 });
    expect(l.shards('u2')).toBe(CHAPTER_SHARDS);
  });

  it('prismaRewardDeps reads which keys are in the ledger', async () => {
    const db = { walletLedgerEntry: { findMany: async (a: { where: { idempotencyKey: { in: string[] } } }) => a.where.idempotencyKey.in.filter((k) => k.endsWith(':2')).map((k) => ({ idempotencyKey: k })) } };
    const d = prismaRewardDeps(db, async () => null);
    expect(await d.paidKeys([chapterKey('u', 1), chapterKey('u', 2)])).toEqual(new Set([chapterKey('u', 2)]));
  });
});
