// rewards — what a Playbook chapter pays, and the course bonus, through the wallet's reward rules. SERVER-SIDE.
//
// EDU-LINKS (2026-10-07), Mirror & coaching plan Phase 5 (#15): the course bonus (COURSE_BONUS_SHARDS) was priced and
// tested but never paid. It is paid here, once per account, the moment the tenth chapter is paid.
//
// THE AMOUNTS ARE THE RULES'. A chapter pays the EDU_CHAPTER_COMPLETE rule and the bonus the EDU_COURSE_COMPLETE rule
// (lib/wallet/reward-rules.ts); nothing here or in a request names an amount. course.ts chapterReward is the table the
// UI shows, and rewards.test.ts keeps what this pays equal to what chapterReward says, chapter by chapter.
//
// ONCE ONLY, BY KEY. Both keys name the account and nothing else that varies — no attempt, no day, no score — so a
// replayed request, a second passed check or a race returns the original ledger entry instead of a second payout:
//   playbook:chapter:<userId>:<n>   (the key the lesson route already used, so a chapter paid before this phase is paid)
//   playbook:course:<userId>
// The bonus's cap is that key (once per account, ever) plus its rule's maxGrant (one bonus's worth, no more).
//
// Pure apart from the two functions it is handed, so it is tested over a stand-in ledger (rewards.test.ts).

import { CHAPTERS } from './course';
import { REASON } from '@/lib/wallet/reward-rules';

export const chapterKey = (userId: string, chapter: number) => `playbook:chapter:${userId}:${chapter}`;
export const courseKey = (userId: string) => `playbook:course:${userId}`;

export interface RewardDeps {
  /** grantServerReward, or a stand-in: prices from the rule, idempotent on the key. */
  grant: (a: { playerId: string; reasonCode: string; idempotencyKey: string; metadata?: Record<string, unknown> }) =>
    Promise<{ granted: { coins: number; shards: number } } | null>;
  /** Which of these ledger keys exist. */
  paidKeys: (keys: string[]) => Promise<Set<string>>;
}

export interface Paid {
  /** Shards this call credited for the chapter: 0 when it was already paid (the replay returns the original entry). */
  chapter: number;
  /** Shards this call credited for the course bonus: 0 unless this call paid it. */
  bonus: number;
  /** Chapters paid on this account, after this call. */
  chaptersPaid: number;
}

/**
 * Pay chapter `n` to `userId`, and the course bonus if every chapter is now paid. The caller has already decided this
 * account may be paid (the age rule and the 80% check live at the call site).
 */
export async function payChapter(deps: RewardDeps, userId: string, n: number, meta: Record<string, unknown> = {}): Promise<Paid> {
  const keys = CHAPTERS.map((c) => chapterKey(userId, c.number));
  const before = await deps.paidKeys(keys).catch(() => new Set<string>());
  const wasPaid = before.has(chapterKey(userId, n));
  const res = await deps.grant({
    playerId: userId, reasonCode: REASON.EDU_CHAPTER_COMPLETE, idempotencyKey: chapterKey(userId, n),
    metadata: { track: 'playbook', chapter: n, ...meta },
  }).catch(() => null);
  const chapterPaidNow = !!res;
  // A replay returns the original entry's delta: report 0, because nothing moved on this call.
  const chapter = chapterPaidNow && !wasPaid ? res!.granted.shards : 0;
  const after = new Set(before);
  if (chapterPaidNow) after.add(chapterKey(userId, n));

  let bonus = 0;
  if (keys.every((k) => after.has(k))) {
    const bonusBefore = await deps.paidKeys([courseKey(userId)]).catch(() => new Set<string>());
    const b = await deps.grant({
      playerId: userId, reasonCode: REASON.EDU_COURSE_COMPLETE, idempotencyKey: courseKey(userId),
      metadata: { track: 'playbook', chapters: CHAPTERS.length, lastChapter: n },
    }).catch(() => null);
    if (b && !bonusBefore.has(courseKey(userId))) bonus = b.granted.shards;
  }
  return { chapter, bonus, chaptersPaid: keys.filter((k) => after.has(k)).length };
}

/** RewardDeps over a Prisma client and grantServerReward. */
export function prismaRewardDeps(
  db: { walletLedgerEntry: { findMany: (a: { where: { idempotencyKey: { in: string[] } }; select: { idempotencyKey: true } }) => Promise<{ idempotencyKey: string | null }[]> } },
  grant: RewardDeps['grant'],
): RewardDeps {
  return {
    grant,
    paidKeys: async (keys) => {
      const rows = await db.walletLedgerEntry.findMany({ where: { idempotencyKey: { in: keys } }, select: { idempotencyKey: true } });
      return new Set(rows.map((r) => r.idempotencyKey).filter((k): k is string => typeof k === 'string'));
    },
  };
}
