// THE MIC (2026-09-24): the writers' drafts → the shipped scripts.
//
//   node node_modules/tsx/dist/cli.mjs scripts/mic/merge-drafts.mts <drafts dir> [critiques.json]
//
// Applies the critics' replacements (exact old text → new text; an empty new text deletes the line), lints every line with the
// shared rules (lib/babylon/audio/mic/scriptRules.ts), drops the lines that still fail (and says which), assigns the stable ids,
// and writes lib/babylon/audio/mic/script/<cast>.json. Prints the shortfalls against the moment counts.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ScriptFile, ScriptLine } from '../../lib/babylon/audio/mic/scriptRules.ts';
import * as castNs from '../../lib/babylon/audio/mic/cast.ts';
import * as rulesNs from '../../lib/babylon/audio/mic/scriptRules.ts';
// the app's modules load as CommonJS under tsx: the named exports sit on the default
const unwrap = <T,>(ns: T): T => ((ns as unknown as { default?: T }).default ?? ns);
const { CAST } = unwrap(castNs);
const { lineId, lintLine, shortfalls } = unwrap(rulesNs);

const [draftDir, critPath] = process.argv.slice(2);
if (!draftDir) { console.error('usage: merge-drafts.mts <drafts dir> [critiques.json]'); process.exit(1); }
const OUT = join(process.cwd(), 'lib/babylon/audio/mic/script');
mkdirSync(OUT, { recursive: true });

type Rep = { cast: string; moment: string; old: string; new: string; why: string };
const reps: Rep[] = critPath && existsSync(critPath) ? (JSON.parse(readFileSync(critPath, 'utf8')) as Rep[]) : [];
const norm = (s: string) => s.trim().replace(/\s+/g, ' ');

let applied = 0, dropped = 0;
const report: string[] = [];
for (const f of readdirSync(draftDir).filter((x) => x.endsWith('.json'))) {
  const draft = JSON.parse(readFileSync(join(draftDir, f), 'utf8')) as ScriptFile;
  const cast = CAST.find((c) => c.id === draft.cast);
  if (!cast) { report.push(`? ${f}: unknown cast ${draft.cast}`); continue; }
  let lines: ScriptLine[] = draft.lines.map((l) => ({ moment: l.moment, text: norm(l.text), ...(l.tier !== undefined ? { tier: l.tier } : {}), ...(l.tags?.length ? { tags: l.tags } : {}) }));
  for (const r of reps.filter((x) => x.cast === draft.cast)) {
    const i = lines.findIndex((l) => l.moment === r.moment && norm(l.text) === norm(r.old));
    if (i < 0) { report.push(`  ${draft.cast} ${r.moment}: replacement target not found: "${r.old}"`); continue; }
    if (!r.new.trim()) lines.splice(i, 1); else lines[i] = { ...lines[i], text: norm(r.new) };
    applied++;
  }
  // exact duplicates within a moment go
  const seen = new Set<string>();
  lines = lines.filter((l) => { const k = `${l.moment}|${l.text.toLowerCase()}`; if (seen.has(k)) { dropped++; return false; } seen.add(k); return true; });
  const kept: ScriptLine[] = [];
  for (const l of lines) {
    const why = lintLine(l);
    if (why.length) { dropped++; report.push(`  ${draft.cast} ${l.moment}: DROPPED "${l.text}" (${why.join(', ')})`); continue; }
    kept.push(l);
  }
  // stable ids: numbered within each (moment, tier, tags) slot in draft order
  const n = new Map<string, number>();
  const withIds = kept.map((l) => { const slot = `${l.moment}|${l.tier ?? ''}|${(l.tags ?? []).join(',')}`; const k = (n.get(slot) ?? 0) + 1; n.set(slot, k); return { id: lineId(l, k), ...l }; });
  writeFileSync(join(OUT, `${draft.cast}.json`), JSON.stringify({ cast: draft.cast, lines: withIds }, null, 1) + '\n');
  const short = cast.role === 'mc' || cast.role === 'side' ? shortfalls({ cast: draft.cast, lines: withIds }, cast.role) : [];
  report.push(`${draft.cast}: ${withIds.length} lines${short.length ? `, SHORT: ${short.join('; ')}` : ''}`);
}
console.log(report.join('\n'));
console.log(`replacements applied: ${applied}/${reps.length}; lines dropped: ${dropped}`);
