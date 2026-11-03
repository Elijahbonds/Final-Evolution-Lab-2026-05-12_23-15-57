// scripts/program-ask/sample.ts — PROGRAM-ASK (2026-11-02): writes the sample band-only program into docs/PROGRAM-ASK.md
// (between the SAMPLE markers), so the owner can judge the programming on paper. Run: npx tsx scripts/program-ask/sample.ts
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadLibraryFiles } from '@/lib/library/files';
import { buildProgram } from '@/lib/program-ask/build';
import { programProblems } from '@/lib/program-ask/check';
import { readProgramAsk } from '@/lib/program-ask/request';
import { doseText, programTables, volumeTable } from '@/lib/program-ask/table';

const ASK = 'all I have is a band, full body, 3 days a week, 40 minutes';
const LIB = loadLibraryFiles();
const read = readProgramAsk(ASK);
const p = buildProgram({ request: read.request, library: LIB });
const problems = programProblems(p, LIB, { jumpsOpen: false });
if (problems.length) { console.error(problems); process.exit(1); }

const out: string[] = [];
out.push(`**Ask:** "${ASK}"`, '');
out.push(`**Read as:** ${read.chips.map((c) => `${c.label}${c.assumed ? ' (assumed)' : ''}`).join(' · ')}`, '');
out.push('**Assumptions:**', ...read.assumptions.map((a) => `- ${a}`), '');
out.push(`**${p.title}.** ${p.summary}`, '');
out.push(`**Why this plan (FEL's own words; the AI may only rewrite this paragraph, through guards):** ${p.why}`, '');
out.push('**Notes the program shows:**', ...p.notes.map((n) => `- ${n}`), '');

out.push('#### The block at a glance: every exercise, week by week', '');
for (const key of [...new Set(p.weeks[0].days.map((d) => d.key))]) {
  const days = p.weeks.map((w) => w.days.find((d) => d.key === key)!);
  out.push(`**Day ${key} (${p.weeks[0].days.filter((d) => d.key === key).map((d) => d.day).join(', ')})**`, '');
  out.push(`| | Exercise | ${p.weeks.map((w) => `W${w.n}${w.lighter ? ' lighter' : ''}`).join(' | ')} |`, `|---|---|${p.weeks.map(() => '---').join('|')}|`);
  days[0].blocks.filter((b) => b.kind !== 'filler').forEach((b, bi) => b.items.forEach((it, ii) => {
    const cells = days.map((d) => { const x = d.blocks[bi]?.items[ii]; return x ? `${doseText(x)}${x.tempo ? `, tempo ${x.tempo}` : ''} · ${x.effortWords.split(':')[0]}${x.name !== it.name ? ` (${x.name})` : ''}` : ''; });
    out.push(`| ${it.label} | ${it.name} | ${cells.join(' | ')} |`);
  }));
  out.push('');
}
out.push('Effort words: Cruise = 5–6 reps left, Drive = 3–4 left, Surge = 1–2 left (lib/coach/taxonomy.ts EFFORT_BANDS; a timed set says how it should feel).', '');
out.push('#### Each exercise\'s own lines (week 1, day A)', '');
out.push('| | Exercise | Band setup | Too easy? | Too hard? |', '|---|---|---|---|---|');
for (const b of p.weeks[0].days[0].blocks.filter((x) => x.kind !== 'filler')) for (const i of b.items) out.push(`| ${i.label} | ${i.name} | ${(i.bandSetup ?? '—').replace(/^Band setup: /, '')} | ${i.harder ?? ''} | ${i.easier ?? ''} |`);
out.push('', '#### Weekly hard sets per group (fractional: a split squat or lunge counts half legs, half hips)', '', volumeTable(p), '');
out.push('#### Week 1 and week 4 in full (warm-up, pairs, finisher, cool-down, rest, minutes)', '', programTables(p, { weeks: [1, 4] }));

const doc = path.resolve(__dirname, '../../docs/PROGRAM-ASK.md');
const text = readFileSync(doc, 'utf8');
const a = text.indexOf('<!-- SAMPLE:start -->'), b = text.indexOf('<!-- SAMPLE:end -->');
if (a < 0 || b < 0) throw new Error('markers missing');
writeFileSync(doc, `${text.slice(0, a)}<!-- SAMPLE:start -->\n${out.join('\n')}\n${text.slice(b)}`);
console.log('wrote', doc, out.length, 'lines');
