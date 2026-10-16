// QA phase 3 (#250) + PM (2026-10-14): the doc is the source. Every piece of card text must be, WORD FOR WORD, one WHOLE
// segment of programs/DUNK-PROGRAM.md — a table cell, a whole sentence, the text after a bold "Label:", or one item of
// the weekly layout (its day shown on the card). No paraphrase, no fragment, no new number (rest 60 s → 45 s fails).
// The only liberty: a segment's first letter may be capitalised on a card ("off or a walk" → "Off or a walk").
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WEEK1_DUNK_DAYS, WEEK1_END_SET, WEEK1_EXIT, WEEK1_TITLE } from './week1-dunk';

const DOC = readFileSync(join(__dirname, '../../programs/DUNK-PROGRAM.md'), 'utf8');
const unbold = (s: string) => s.replace(/\*\*/g, '').trim();

/** Every whole segment of the doc. */
const SEGMENTS = new Set<string>();
const WEEKLY: string[] = [];
for (const raw of DOC.split('\n')) {
  const line = raw.trim();
  if (!line) continue;
  if (line.startsWith('|')) { for (const c of line.split('|').slice(1, -1)) SEGMENTS.add(unbold(c)); continue; }
  for (const m of line.matchAll(/\*\*([^*]+)\*\*/g)) { SEGMENTS.add(m[1].trim()); if (m[1].trim().endsWith(':')) SEGMENTS.add(m[1].trim().slice(0, -1)); }   // a bold label, as the card's block name
  const text = unbold(line.replace(/^#+\s*|^-\s+/, ''));
  SEGMENTS.add(text);
  for (const sent of text.split(/(?<=[.!?])\s+/)) SEGMENTS.add(sent.trim());
  const label = /^\*\*[^*]+:\*\*\s*(.+)$/.exec(line.replace(/^-\s+/, ''));
  if (label) { SEGMENTS.add(unbold(label[1])); for (const sent of unbold(label[1]).split(/(?<=[.!?])\s+/)) SEGMENTS.add(sent.trim()); }
  const wk = /^\*\*Weekly layout \(every track\):\*\*\s*(.+?)\.?$/.exec(line);
  if (wk) WEEKLY.push(...wk[1].split(' · ').map((x) => x.trim()));
}
const isSegment = (s: string) => SEGMENTS.has(s) || SEGMENTS.has(s[0].toLowerCase() + s.slice(1));

describe('week-1 dunk cards: word for word from programs/DUNK-PROGRAM.md', () => {
  it('the doc parses (the check is not vacuous)', () => {
    expect(WEEKLY).toHaveLength(7);
    expect(SEGMENTS.has('Rung 0: 4 × 5, rest 60 s')).toBe(true);
  });

  it('the title, the end-the-set rule, the exit, and every block name and line are whole segments of the doc', () => {
    const shown = [WEEK1_TITLE, WEEK1_END_SET, WEEK1_EXIT, ...WEEK1_DUNK_DAYS.flatMap((d) => d.blocks.flatMap((b) => [b.name, b.what]))];
    expect(shown.filter((s) => !isSegment(s)).join(' ## ')).toBe('');
  });

  it('each day card is its weekly-layout item, day and title, word for word', () => {
    // Saturday's item names the base weeks' day and then the later weeks': the card is the base-week part, the words
    // before " (base weeks)" of THIS line's Sat item, exactly (PM 2026-10-14). Every other day is its whole item.
    const SAT = 'Sat Movement Snack (base weeks); weeks 3+ may add the optional dunk session';
    expect(WEEKLY[5]).toBe(SAT);
    const item = (i: number) => (i === 5 ? SAT.slice(0, SAT.indexOf(' (base weeks)')) : WEEKLY[i]);
    expect(item(5)).toBe('Sat Movement Snack');
    WEEK1_DUNK_DAYS.forEach((d, i) => expect([`${d.day} ${d.title}`, `${d.day} ${d.title[0].toLowerCase()}${d.title.slice(1)}`], d.day).toContain(item(i)));
    expect(WEEK1_DUNK_DAYS).toHaveLength(WEEKLY.length);
  });

  it('the sessions are the §9.3 A / B / C cells, in their rows', () => {
    const rows = new Map<string, string[]>();
    const base = DOC.slice(DOC.indexOf('### 9.3'), DOC.indexOf('**Weeks 3 and 5', DOC.indexOf('### 9.3')));
    for (const line of base.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| Block'))) {
      const [name, ...cells] = line.split('|').slice(1, -1).map(unbold);
      rows.set(name, cells);
    }
    const sessions = WEEK1_DUNK_DAYS.filter((d) => d.kind === 'session');
    expect(sessions).toHaveLength(3);
    for (const name of ['Spring', 'Strong']) {
      sessions.forEach((d, i) => expect(d.blocks.filter((b) => b.name === name).map((b) => b.what), `${d.day} ${name}`).toEqual([rows.get(name)![i]]));
    }
    sessions.forEach((d, i) => {
      const cell = rows.get('Breath and stack')![i];
      expect(d.blocks.filter((b) => b.name === 'Breath and stack').map((b) => b.what), d.day).toContain(cell);
      const duc = rows.get('Down, Up, Check')![i];
      expect(d.blocks.find((b) => b.name === 'Down, Up, Check')!.what, d.day).toBe(duc === 'Same' ? rows.get('Down, Up, Check')![0] : duc);
    });
  });

  // QA (2026-10-14): another whole sentence of the doc passed in these lines' place. Each is tied to ITS passage now.
  it('the exit, the end-the-set rule, the Neural Flush, the check-in, breath and stack and the Movement Snack are each their own passage, exactly', () => {
    const lines = DOC.split('\n');
    const firstSentence = (t: string) => t.split(/(?<=[.!?])\s+/)[0].trim();
    // §9.3 Weeks 1–2 · Base: the sentence under the table that says when to leave the base
    const base = DOC.slice(DOC.indexOf('### 9.3'), DOC.indexOf('**Weeks 3 and 5', DOC.indexOf('### 9.3')));
    const leave = base.split('\n').filter((l) => l.startsWith('Leave the base'));
    expect(leave).toHaveLength(1);
    expect(WEEK1_EXIT).toBe(leave[0].trim());
    // the bold "End the set the moment:" rule, its first sentence
    const endSet = lines.filter((l) => l.startsWith('**End the set the moment:**'));
    expect(endSet).toHaveLength(1);
    expect(WEEK1_END_SET).toBe(firstSentence(unbold(endSet[0])));
    // §6.1 session table: row 0 Check-in, row 4 Breath and stack, row 7 Reset (Neural Flush) — the "What you do" cell
    const row = (n: number, name: string) => {
      const r = lines.filter((l) => l.startsWith(`| ${n} | ${name} |`));
      expect(r, name).toHaveLength(1);
      return unbold(r[0].split('|')[3]);
    };
    const sessionBlock = (name: string) => [...new Set(WEEK1_DUNK_DAYS.filter((d) => d.kind === 'session').map((d) => d.blocks.find((b) => b.name === name)!.what))];
    expect(sessionBlock('Reset (Neural Flush)')).toEqual([row(7, 'Reset (Neural Flush)')]);
    expect(sessionBlock('Check-in')).toEqual([row(0, 'Check-in')]);
    const breath = WEEK1_DUNK_DAYS.find((d) => d.day === 'Mon')!.blocks.filter((b) => b.name === 'Breath and stack').map((b) => b.what);
    expect(breath[0]).toBe(row(4, 'Breath and stack'));
    // the bold "Movement Snack:" passage, on both snack days
    const snack = lines.filter((l) => l.startsWith('**Movement Snack:**'));
    expect(snack).toHaveLength(1);
    for (const d of WEEK1_DUNK_DAYS.filter((x) => x.kind === 'snack')) expect(d.blocks.map((b) => b.what), d.day).toEqual([unbold(snack[0].replace('**Movement Snack:**', ''))]);
  });
});
