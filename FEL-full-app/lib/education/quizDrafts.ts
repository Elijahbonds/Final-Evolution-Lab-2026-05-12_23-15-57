// quizDrafts — reads docs/PLAYBOOK-QUIZ-DRAFTS.md into questions, with the owner's mark on each one.
//
// EDU-LINKS (2026-10-07), Mirror & coaching plan Phase 5, owner decision 6 (2026-10-07): "Playbook chapter shards: quiz at
// 80%." The questions are NOT written here. They are the owner's quiz drafts (KNOWLEDGE-FEED v2, 2026-10-06), each one a
// line of the book turned into a question, and the owner approves them before they ship. This file only reads the doc,
// so the chapter check (lib/education/chapterCheck.ts) asks exactly what the doc says and nothing anyone retyped.
//
// THE OWNER'S MARK. Every draft ends in a line `Owner: ☐ ship ☐ edit ☐ drop`. The doc asks the owner to mark ✅ (ship),
// ✏️ (ship with your edit) or ❌ (drop). Read here as:
//   ✅, or a ticked box before "ship" (☑ ☒ ✓ ✔ [x])          → 'approved'
//   ✏️, or a ticked box before "edit"                        → 'edited'   (ships: the owner's edit IS the text above it)
//   ❌, or a ticked box before "drop"                         → 'dropped'  (never asked)
//   anything else, including the untouched line              → 'draft'    (asked only behind the draft flag, labelled DRAFT)
// A line ticked both ways is read as the most cautious of them (dropped over edited over approved).
//
// Pure: no fs, no React, no database. scripts/education/build-chapter-check.ts feeds it the doc and writes
// lib/education/chapterCheck.data.json; lib/education/chapterCheck.test.ts re-parses the doc and fails if that file is
// stale, so a mark the owner makes cannot be silently left out of the shipped check.

export type DraftStatus = 'approved' | 'edited' | 'dropped' | 'draft';

export interface DraftQuestion {
  /** `q-<chapter>-<section>`, the id the doc's own header promises (`playbook.q-<chapter>-<section>` in the feed). */
  id: string;
  chapter: number;
  /** The book section the question comes from, e.g. "1.0". */
  section: string;
  /** The section's title, as the doc heads it. */
  title: string;
  question: string;
  /** The four options, in the order the doc authors them. */
  options: string[];
  /** Index into `options` of the right answer. */
  answer: number;
  /** The book line the question is built from, verbatim. */
  bookLine: string;
  status: DraftStatus;
}

const TICK = '(?:☑|☒|✓|✔|\\[x\\]|\\[X\\])';

/** The owner's mark on one `Owner:` line. Exported for its own test. */
export function readOwnerMark(line: string): DraftStatus {
  const l = line.trim();
  const ticked = (word: string) => new RegExp(`${TICK}\\s*${word}`).test(l);
  if (l.includes('❌') || ticked('drop')) return 'dropped';
  if (l.includes('✏') || ticked('edit')) return 'edited';
  if (l.includes('✅') || ticked('ship')) return 'approved';
  return 'draft';
}

/** Parse the whole doc. Throws on a draft it cannot read, so a malformed edit fails loudly instead of shipping short. */
export function parseQuizDrafts(doc: string): DraftQuestion[] {
  const out: DraftQuestion[] = [];
  let chapter = 0;
  // Chapters are `## Chapter N — Title`; drafts are `### K. §C.S · Title`.
  const blocks = doc.split(/^(?=## Chapter |### )/m);
  for (const block of blocks) {
    const ch = /^## Chapter (\d+) — /.exec(block);
    if (ch) { chapter = Number(ch[1]); continue; }
    const head = /^### \d+\. §(\d+)\.(\d+) · (.+)$/m.exec(block);
    if (!head) continue;
    const where = head[0];
    if (Number(head[1]) !== chapter) throw new Error(`quiz draft "${where}" sits under chapter ${chapter}`);
    const q = /^\*\*Q\.\*\* (.+)$/m.exec(block);
    const options = [...block.matchAll(/^- ([ABCD])\. (.+)$/gm)].map((m) => m[2].trim());
    const ans = /^\*\*Answer:\*\* ([ABCD]) — (.+)$/m.exec(block);
    const line = /^> (.+)$/m.exec(block);
    const owner = /^Owner: .*$/m.exec(block);
    if (!q || options.length !== 4 || !ans || !line || !owner) throw new Error(`quiz draft "${where}" is not readable`);
    const answer = 'ABCD'.indexOf(ans[1]);
    if (options[answer] !== ans[2].trim()) throw new Error(`quiz draft "${where}": the answer is not its own option`);
    out.push({
      id: `q-${head[1]}-${head[2]}`,
      chapter,
      section: `${head[1]}.${head[2]}`,
      title: head[3].trim(),
      question: q[1].trim(),
      options,
      answer,
      bookLine: line[1].trim(),
      status: readOwnerMark(owner[0]),
    });
  }
  return out;
}

/** What lib/education/chapterCheck.data.json holds: the doc's questions minus the dropped ones, marks kept. */
export interface CheckBank {
  source: 'docs/PLAYBOOK-QUIZ-DRAFTS.md';
  questions: DraftQuestion[];
}

export function buildCheckBank(doc: string): CheckBank {
  return { source: 'docs/PLAYBOOK-QUIZ-DRAFTS.md', questions: parseQuizDrafts(doc).filter((q) => q.status !== 'dropped') };
}
