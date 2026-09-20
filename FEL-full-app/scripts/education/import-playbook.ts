/**
 * import-playbook — turn the Neuro-Mechanic Playbook manuscript into course data.
 *
 * WHY A PARSER AND NOT A RETYPING. The book is the owner's, it is ~30,000 words, and it will be revised. Anything
 * I paraphrase by hand goes stale the moment chapter 6 gets an edit, and paraphrasing a movement book is exactly
 * where a wrong number creeps in — "knee at roughly 85 to 90 degrees" is a coaching instruction, not a vibe. So
 * the course reads from the manuscript, and re-running this after a revision is the whole update process.
 *
 * WHAT IT TAKES AND WHAT IT LEAVES. It takes the spine: chapter titles, section headings, the drills with their
 * numbered steps, the TRAINER'S NOTE callouts, and the "What to Remember" summaries. It deliberately does NOT
 * take every paragraph of prose — a free web page carrying all 30,000 words IS the book, and would compete with
 * selling it. PROSE_PER_SECTION is the dial; raise it if the owner wants the course to carry more of the text.
 *
 *   npx tsx scripts/education/import-playbook.ts [path-to.docx]
 *
 * Defaults to ~/Downloads/Neuro_Mechanic_Playbook_REVISED.docx. The manuscript is NOT committed; the derived
 * JSON is, so the app never depends on a file sitting in somebody's Downloads folder.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

/** How many paragraphs of the book's own prose each section carries into the course. */
const PROSE_PER_SECTION = 3;

const SRC = process.argv[2] ?? join(homedir(), 'Downloads', 'Neuro_Mechanic_Playbook_REVISED.docx');
const OUT = join(process.cwd(), 'lib', 'education', 'playbook.data.json');

interface Para { style: string; text: string }

function docxParagraphs(path: string): Para[] {
  const dir = mkdtempSync(join(tmpdir(), 'playbook-'));
  execFileSync('unzip', ['-q', '-o', path, 'word/document.xml', '-d', dir]);
  const xml = readFileSync(join(dir, 'word', 'document.xml'), 'utf8');
  const out: Para[] = [];
  for (const m of xml.matchAll(/<w:p\b[^>]*>(.*?)<\/w:p>/gs)) {
    const body = m[1];
    const style = /w:pStyle w:val="([^"]+)"/.exec(body)?.[1] ?? 'Body';
    const text = [...body.matchAll(/<w:t[^>]*>(.*?)<\/w:t>/gs)]
      .map((t) => t[1])
      .join('')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#8217;/g, "'").replace(/&#8212;/g, '—')
      .trim();
    if (text) out.push({ style, text });
  }
  return out;
}

/**
 * A section heading in this manuscript carries no style of its own — everything is [Body]. It is recognised by
 * shape instead: short, title-cased, no terminal punctuation, and followed by real prose. That heuristic was
 * checked against all ten chapters before it was trusted, and it recovers the structure the printed contents
 * page implies.
 */
function isHeading(texts: string[], i: number): boolean {
  const t = texts[i];
  if (t.length > 95 || t.length < 6) return false;
  if (/[.!?:;,]$/.test(t)) return false;
  if (/^[a-z]/.test(t)) return false;
  const next = texts[i + 1] ?? '';
  // A drill heading is often followed by a SHORT line ("Purpose: teach the correct joint angles."), which the
  // length test alone threw away — Chapter 6's "Drill 1: The Countermovement Geometry Check" vanished that way.
  if (/^Purpose\b/i.test(next)) return true;
  return next.length > 120;
}

/** A numbered or imperative step inside a drill, as opposed to the prose that introduces it. */
function looksLikeStep(t: string): boolean {
  if (t.length > 220) return false;
  return /^(Stand|Hold|Drop|Come|Check|Step|Place|Keep|Start|Drive|Push|Pull|Brace|Breathe|Inhale|Exhale|Land|Jump|Lower|Raise|Repeat|Set|Sit|Lie|Walk|Run|Reach|Rest|Five|Three|Ten|Two|One|Do|Perform|Finish|Begin|Move|Turn|Squeeze|Press|Pause|Count)\b/.test(t);
}

const SECTION_KINDS = [
  { re: /^(Drill|Movement|Protocol|Check|Joint|Phase|Step|Red Flag|Section)\s*\d*\s*[—:-]?/i, kind: 'drill' as const },
  { re: /^TRAINER'S NOTE$/i, kind: 'note' as const },
  { re: /^What to Remember$/i, kind: 'summary' as const },
];

function kindOf(title: string): 'drill' | 'note' | 'summary' | 'concept' {
  for (const k of SECTION_KINDS) if (k.re.test(title)) return k.kind;
  return 'concept';
}

function main() {
  if (!existsSync(SRC)) {
    console.error(`Manuscript not found: ${SRC}\nPass the path as the first argument.`);
    process.exit(1);
  }
  const paras = docxParagraphs(SRC);
  const texts = paras.map((p) => p.text);

  const chapters: unknown[] = [];
  let current: { number: number; title: string; subtitle: string; thesis: string; sections: unknown[] } | null = null;
  let section: { title: string; kind: string; purpose: string; prose: string[]; steps: string[] } | null = null;

  const closeSection = () => {
    if (current && section && (section.prose.length || section.steps.length || section.purpose)) current.sections.push(section);
    section = null;
  };

  for (let i = 0; i < texts.length; i++) {
    const t = texts[i];

    const chapterMatch = /^CHAPTER (\d+)$/.exec(t);
    if (chapterMatch) {
      closeSection();
      if (current) chapters.push(current);
      current = {
        number: Number(chapterMatch[1]),
        title: texts[i + 1] ?? '',
        subtitle: texts[i + 2] ?? '',
        // The thesis is the line the chapter opens on — in this book it is always a single declarative sentence
        // doing the work of the whole chapter ("The jump is not a muscular event.").
        thesis: texts[i + 3] ?? '',
        sections: [],
      };
      i += 3;
      continue;
    }
    if (!current) continue;
    if (/^(GLOSSARY|QUICK-REFERENCE INDEX|ACKNOWLEDGMENTS|ABOUT THE AUTHOR)$/i.test(t)) break;

    if (isHeading(texts, i)) {
      closeSection();
      section = { title: t, kind: kindOf(t), purpose: '', prose: [], steps: [] };
      continue;
    }
    if (!section) continue;

    // "Purpose: …" is the drill's own statement of what it is for, and reads better as its own line than as
    // the first sentence of the prose.
    if (/^Purpose\s*[:—-]/i.test(t)) section.purpose = t.replace(/^Purpose\s*[:—-]\s*/i, '');
    else if (section.kind === 'drill' && looksLikeStep(t)) section.steps.push(t);
    else if (section.prose.length < PROSE_PER_SECTION) section.prose.push(t);
  }
  closeSection();
  if (current) chapters.push(current);

  const data = {
    source: 'The Neuro-Mechanic Playbook — Elijah Bonds',
    importedAt: new Date().toISOString().slice(0, 10),
    prosePerSection: PROSE_PER_SECTION,
    chapters,
  };
  writeFileSync(OUT, JSON.stringify(data, null, 2));

  const secs = (chapters as { sections: unknown[] }[]).reduce((n, c) => n + c.sections.length, 0);
  const drills = (chapters as { sections: { kind: string }[] }[])
    .reduce((n, c) => n + c.sections.filter((s) => s.kind === 'drill').length, 0);
  console.log(`playbook.data.json — ${chapters.length} chapters, ${secs} sections, ${drills} drills`);
}

main();
