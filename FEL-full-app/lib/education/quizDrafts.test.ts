import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildCheckBank, parseQuizDrafts, readOwnerMark } from './quizDrafts';

// EDU-LINKS (2026-10-07): the chapter check asks the owner's drafts exactly as docs/PLAYBOOK-QUIZ-DRAFTS.md writes them,
// and honours the owner's mark on each one. This pins the reading of that doc.
const DOC = readFileSync('docs/PLAYBOOK-QUIZ-DRAFTS.md', 'utf8');

const one = (owner: string, extra = '') => `## Chapter 2 — Test

### 1. §2.4 · A section
${extra}
**Q.** What does the line say?

- A. Wrong one
- B. Right one
- C. Wrong two
- D. Wrong three

**Answer:** B — Right one

**Book line** (ch. 2, "A section"):

> The line says the right one.

${owner}
`;

describe('the owner’s mark on a draft', () => {
  it('the untouched line is a draft', () => {
    expect(readOwnerMark('Owner: ☐ ship ☐ edit ☐ drop')).toBe('draft');
  });

  it('reads ✅ / a ticked ship as approved, ✏️ / a ticked edit as edited, ❌ / a ticked drop as dropped', () => {
    expect(readOwnerMark('Owner: ✅')).toBe('approved');
    expect(readOwnerMark('Owner: ☑ ship ☐ edit ☐ drop')).toBe('approved');
    expect(readOwnerMark('Owner: [x] ship [ ] edit [ ] drop')).toBe('approved');
    expect(readOwnerMark('Owner: ✏️ changed the wording')).toBe('edited');
    expect(readOwnerMark('Owner: ☐ ship ☒ edit ☐ drop')).toBe('edited');
    expect(readOwnerMark('Owner: ❌')).toBe('dropped');
    expect(readOwnerMark('Owner: ☐ ship ☐ edit ✔ drop')).toBe('dropped');
  });

  it('a line ticked two ways is read as the most cautious of them', () => {
    expect(readOwnerMark('Owner: ✅ ❌')).toBe('dropped');
    expect(readOwnerMark('Owner: ☑ ship ☑ edit')).toBe('edited');
  });

  it('a box ticked before a word that is not the mark’s does not count', () => {
    // "☑" before nothing it names is not approval — only a tick against ship / edit / drop is
    expect(readOwnerMark('Owner: ☐ ship ☐ edit ☐ drop ☑')).toBe('draft');
  });
});

describe('the doc, parsed', () => {
  const all = parseQuizDrafts(DOC);

  it('every draft in the doc is read — none silently skipped', () => {
    expect(all).toHaveLength((DOC.match(/^### /gm) ?? []).length);
    expect(all.length).toBeGreaterThanOrEqual(80);
  });

  it('ids are the doc’s promised q-<chapter>-<section>, unique, and every chapter has questions', () => {
    expect(new Set(all.map((q) => q.id)).size).toBe(all.length);
    for (const q of all) expect(q.id).toBe(`q-${q.section.replace('.', '-')}`);
    expect(new Set(all.map((q) => q.chapter))).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
  });

  it('every answer is one of its own four options', () => {
    for (const q of all) {
      expect(q.options, q.id).toHaveLength(4);
      expect(q.answer, q.id).toBeGreaterThanOrEqual(0);
      expect(q.answer, q.id).toBeLessThan(4);
    }
  });

  it('a draft keeps its mark, and a dropped one never reaches the bank', () => {
    expect(parseQuizDrafts(one('Owner: ☐ ship ☐ edit ☐ drop'))[0]).toMatchObject({ id: 'q-2-4', status: 'draft', answer: 1 });
    expect(parseQuizDrafts(one('Owner: ✅'))[0].status).toBe('approved');
    expect(buildCheckBank(one('Owner: ❌')).questions).toEqual([]);
    expect(buildCheckBank(one('Owner: ✏️')).questions[0].status).toBe('edited');
  });

  it('a draft it cannot read throws instead of shipping a short check', () => {
    expect(() => parseQuizDrafts(one('Owner: ✅').replace('- D. Wrong three\n', ''))).toThrow(/not readable/);
    expect(() => parseQuizDrafts(one('Owner: ✅').replace('**Answer:** B — Right one', '**Answer:** B — Not an option'))).toThrow(/answer/);
    expect(() => parseQuizDrafts(one('Owner: ✅').replace('§2.4', '§3.4'))).toThrow(/chapter/);
  });
});
