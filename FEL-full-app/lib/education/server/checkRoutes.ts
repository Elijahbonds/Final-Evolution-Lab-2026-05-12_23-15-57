// The Playbook chapter check's route logic — GET the questions, POST the answers. Auth and the request stay in
// app/api/education/playbook/check/route.ts, thin on purpose, so this runs for real over a stand-in database in
// checkRoutes.test.ts (vitest does not collect app/). EDU-LINKS (2026-10-07), Mirror & coaching plan Phase 5.
//
// GRADED HERE, NEVER ON THE CLIENT. GET hands out the questions without answers or book lines (chapterCheck.ts
// publicQuestions); POST grades the chosen options against the key on the server. Nothing the request says about a
// score, a pass or an amount is read.
//
// THE AGE RULE (the Knowledge Feed's, KNOWLEDGE-FEED v2: learning progress reaches the account only for a VERIFIED
// ADULT — User.dobYear from the database, the strict verifiedAdult rule). A verified adult's attempt is kept (one
// Credential row: score, pass mark, pass, the chosen answers) and a pass pays the chapter's shards through the wallet's
// rules. Under 18 or an unknown age: the check is graded and the result shown, and NOTHING is written — no Credential,
// no ledger row. The device keeps their pass (components/education/chapter-check.tsx), as the owner's 2026-10-07
// decision 1 keeps a teen's progress on the device. assumption: no shards for a minor's pass (learning rewards are
// account rewards, adults only, as in the Knowledge Feed); paying them without keeping the answers is one line below.
//
// A check that is not live (no approved questions, draft flag off) answers 404 `check_unavailable` and writes nothing.

import { chapterByNumber, chapterReward, CHAPTERS, PASS_MARK } from '../course';
import { CHECK_VERSION, checkIsDraft, checkLive, gradeCheck, publicQuestions } from '../chapterCheck';
import { chapterKey, payChapter, type RewardDeps } from '../rewards';

export interface Out { status: number; body: Record<string, unknown> }

export const TRACK = 'playbook';
export const moduleKeyFor = (chapter: number) => `chapter-${chapter}`;

export interface CheckDb {
  credential: {
    create: (a: { data: Record<string, unknown> }) => Promise<unknown>;
    findFirst: (a: { where: Record<string, unknown>; select?: Record<string, boolean> }) => Promise<{ id: string } | null>;
  };
}

export interface CheckDeps {
  db: CheckDb;
  rewards: RewardDeps;
  /** Verified 18+ from the database (the caller wires readDobYear → verifiedAdult). */
  isAdult: (userId: string) => Promise<boolean>;
  drafts: boolean;
}

function chapterOf(raw: unknown) {
  const n = Number(raw);
  return Number.isInteger(n) ? chapterByNumber(n) : null;
}

/** What a pass of this chapter is worth to this account, from course.ts's table (the bonus on the last chapter). */
async function worth(deps: CheckDeps, userId: string, n: number): Promise<number> {
  const keys = CHAPTERS.map((c) => chapterKey(userId, c.number));
  const paid = await deps.rewards.paidKeys(keys).catch(() => new Set<string>());
  const paidChapters = new Set(CHAPTERS.filter((c) => paid.has(chapterKey(userId, c.number))).map((c) => c.number));
  return chapterReward(n, paidChapters);
}

/** GET /api/education/playbook/check?chapter=n */
export async function checkGet(deps: CheckDeps, userId: string, chapterRaw: unknown): Promise<Out> {
  const chapter = chapterOf(chapterRaw);
  if (!chapter) return { status: 404, body: { error: 'unknown_chapter' } };
  const opts = { drafts: deps.drafts };
  if (!checkLive(chapter.number, opts)) return { status: 200, body: { available: false, chapter: chapter.number } };
  const adult = await deps.isAdult(userId).catch(() => false);
  let passedBefore = false;
  let shards = 0;
  if (adult) {
    passedBefore = !!(await deps.db.credential.findFirst({
      where: { userId, trackKey: TRACK, moduleKey: moduleKeyFor(chapter.number), passed: true }, select: { id: true },
    }).catch(() => null));
    shards = await worth(deps, userId, chapter.number);
  }
  return {
    status: 200,
    body: {
      available: true, chapter: chapter.number, draft: checkIsDraft(chapter.number, opts), passMark: PASS_MARK,
      questions: publicQuestions(chapter.number, opts),
      // `saves`: whether this account's attempt is kept and paid. False under 18 or an unknown age.
      saves: adult, passedBefore, worth: shards,
    },
  };
}

/** POST /api/education/playbook/check { chapter, answers: { [questionId]: chosenOptionText } } */
export async function checkPost(deps: CheckDeps, userId: string, body: unknown): Promise<Out> {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const chapter = chapterOf(b.chapter);
  if (!chapter) return { status: 404, body: { error: 'unknown_chapter' } };
  const opts = { drafts: deps.drafts };
  const graded = gradeCheck(chapter.number, b.answers, opts);
  if (!graded) return { status: 404, body: { error: 'check_unavailable' } };
  const draft = checkIsDraft(chapter.number, opts);
  const result = {
    chapter: chapter.number, draft, passMark: PASS_MARK, score: graded.score, passed: graded.passed,
    correct: graded.correct, total: graded.total, results: graded.results,
  };

  const adult = await deps.isAdult(userId).catch(() => false);
  if (!adult) return { status: 200, body: { ...result, saved: false, awarded: 0, bonus: 0, reason: 'adults_only' } };

  const saved = await deps.db.credential.create({
    data: {
      userId, trackKey: TRACK, moduleKey: moduleKeyFor(chapter.number), curriculumVersion: CHECK_VERSION,
      score: graded.score, passMark: PASS_MARK, passed: graded.passed, answers: graded.answers,
    },
  }).then(() => true).catch(() => false);

  // Under the mark pays nothing, and asks the wallet nothing.
  if (!graded.passed) return { status: 200, body: { ...result, saved, awarded: 0, bonus: 0 } };
  const paid = await payChapter(deps.rewards, userId, chapter.number, { via: 'check', score: graded.score, draft });
  return { status: 200, body: { ...result, saved, awarded: paid.chapter, bonus: paid.bonus, chaptersPaid: paid.chaptersPaid } };
}
