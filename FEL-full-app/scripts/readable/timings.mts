// How long the app's passing messages stay up, against the read time (lane/readable, 2026-11-02; docs/READABLE.md).
//
// Reads every call site whose text is a literal: JuiceKit's banner() and callout() (the modes' shared beats and refusals),
// the modes' banner channels (BannerChannel.flash, BannerQueue.show, BannerSlot.show), and sonner toasts. Each one's
// on-screen time (its own ms, or the primitive's default) is compared with lib/readable/rules.ts minReadMs: words × 0.3 s
// + 1 s. Static and approximate by design — a template literal's ${…} counts as one word — and the shared primitives
// now apply the floor themselves (readableMs), so the "after" column is what a player gets.
//
//   npx tsx scripts/readable/timings.mts [--json=<file>]
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as rulesNs from '../../lib/readable/rules.ts';
import * as filesNs from '../../tests/readable/files.ts';

const rules = ((rulesNs as { default?: unknown }).default ?? rulesNs) as typeof rulesNs;
const { readableFiles } = ((filesNs as { default?: unknown }).default ?? filesNs) as typeof filesNs;
const ROOT = resolve(import.meta.dirname, '../..');

interface Site { file: string; line: number; kind: string; text: string; ms: number; need: number; shown: number }
const DEFAULTS: Record<string, number> = { banner: 1100, callout: 700, toast: 4000 };
const sites: Site[] = [];
const lit = String.raw`(['"\`])((?:\\.|(?!\1).)*)\1`;
/** floored: the primitive itself applies readableMs now (JuiceKit, readToast / felToast), so the player gets max(ms, need). */
const PATTERNS: { kind: string; re: RegExp; msGroup: number | null; floored?: boolean }[] = [
  { kind: 'banner', re: new RegExp(String.raw`juice\??\.banner\(\s*${lit}(?:\s*,\s*[^,()]+(?:\([^)]*\))?)?(?:\s*,\s*(\d[\d_]*))?`, 'g'), msGroup: 3, floored: true },
  { kind: 'callout', re: new RegExp(String.raw`juice\??\.callout\(\s*${lit}(?:\s*,\s*[^,()]+(?:\([^)]*\))?)?(?:\s*,\s*(\d[\d_]*))?`, 'g'), msGroup: 3, floored: true },
  { kind: 'flash', re: new RegExp(String.raw`banners?\??\.(?:flash|show)\(\s*${lit}\s*,\s*(\d[\d_]*)`, 'g'), msGroup: 3 },
  { kind: 'toast', re: new RegExp(String.raw`\btoast(?:\.(?:success|error|warning|info|message))?\(\s*${lit}`, 'g'), msGroup: null },
  { kind: 'toast', re: new RegExp(String.raw`\b(?:readToast(?:\.(?:success|error|warning|info|message))?|felToast)\(\s*${lit}`, 'g'), msGroup: null, floored: true },
];
for (const f of readableFiles(ROOT)) {
  const src = readFileSync(join(ROOT, f), 'utf8');
  for (const p of PATTERNS) {
    for (const m of src.matchAll(p.re)) {
      const text = m[2].replace(/\$\{[^}]*\}/g, 'X');
      const ms = p.msGroup && m[p.msGroup] ? Number(m[p.msGroup].replace(/_/g, '')) : DEFAULTS[p.kind] ?? 0;
      if (!ms) continue;
      const need = rules.minReadMs(text);
      sites.push({ file: f, line: src.slice(0, m.index).split('\n').length, kind: p.kind, text, ms, need, shown: p.floored ? Math.max(ms, need) : ms });
    }
  }
}
const short = sites.filter((s) => s.shown < s.need);
const byKind: Record<string, { sites: number; short: number }> = {};
for (const s of sites) { const k = (byKind[s.kind] ??= { sites: 0, short: 0 }); k.sites++; if (s.shown < s.need) k.short++; }
console.log(`message sites with a literal text: ${sites.length}; up for less than the read time: ${short.length}`);
console.log(JSON.stringify(byKind));
for (const s of short.sort((a, b) => (b.need - b.ms) - (a.need - a.ms)).slice(0, 25)) console.log(`  ${s.kind.padEnd(7)} ${String(s.ms).padStart(5)} → ${String(s.need).padStart(5)} ms  "${s.text.slice(0, 60)}"  ${s.file}:${s.line}`);
const json = process.argv.find((a) => a.startsWith('--json='))?.slice(7);
if (json) writeFileSync(json, JSON.stringify({ sites: sites.length, short: short.length, byKind, list: short }, null, 1));
