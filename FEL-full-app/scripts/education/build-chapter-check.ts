/**
 * build-chapter-check — the Playbook chapter check's question bank, read from the owner's quiz drafts.
 *
 * EDU-LINKS (2026-10-07), plan Phase 5, owner decision 6: "Playbook chapter shards: quiz at 80%." The questions are the
 * owner's drafts in docs/PLAYBOOK-QUIZ-DRAFTS.md, never retyped. This reads that doc (lib/education/quizDrafts.ts) and
 * writes lib/education/chapterCheck.data.json, which the server grades against. Dropped drafts are left out; every other
 * draft keeps the owner's mark (approved / edited / draft), and only approved or edited ones are asked without the draft
 * flag (lib/education/chapterCheck.ts).
 *
 *   npx tsx scripts/education/build-chapter-check.ts
 *
 * Re-run it after the owner marks the drafts. lib/education/chapterCheck.test.ts fails while the JSON is stale.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildCheckBank } from '../../lib/education/quizDrafts';

const DOC = join(process.cwd(), 'docs', 'PLAYBOOK-QUIZ-DRAFTS.md');
const OUT = join(process.cwd(), 'lib', 'education', 'chapterCheck.data.json');

const bank = buildCheckBank(readFileSync(DOC, 'utf8'));
writeFileSync(OUT, `${JSON.stringify(bank, null, 2)}\n`);
const by = (s: string) => bank.questions.filter((q) => q.status === s).length;
console.log(`chapter check: ${bank.questions.length} questions (${by('approved')} approved, ${by('edited')} edited, ${by('draft')} draft) → ${OUT}`);
