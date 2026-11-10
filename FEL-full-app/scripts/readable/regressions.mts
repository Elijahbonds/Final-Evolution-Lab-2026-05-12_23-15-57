// The readability gate between two crawls (lane/readable-2, 2026-11-10; docs/READABLE.md section 2): what is NEW in the
// after-crawl against the before-crawl, per route and set-up, for the three faults a size or wrapping change can cause —
// clipping, overlap and a page that scrolls sideways. Exits 1 if anything is new, or a route that rendered before no
// longer renders.
//
//   npx tsx scripts/readable/regressions.mts <outDir> <before label> <after label> [--all] [--body]
//     --all    also list what is new under the other rules (size, contrast): information, not part of the exit code
//     --body   per route, the runs of body copy under 16 px on a phone, before → after
//
// "New" is counted, not just named: a text clipped twice before and three times after is one new finding. A sideways
// scroll is new when the page did not scroll sideways before, or scrolls more than 2 px further.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

interface Finding { rule: string; text: string; px?: number; ratio?: number; key?: boolean; detail?: string }
type Res = Record<string, { ok: boolean; findings?: Finding[]; errors?: string[]; hscroll?: number }> & { route: string };

const args = process.argv.slice(2);
const pos = args.filter((a) => !a.startsWith('--'));
const OUT_ROOT = resolve(pos[0]);
const CONFIGS = ['phone', 'desktop', 'zoom200', 'font150'];
const GATED = new Set(['clipped', 'overlap-fixed', 'overlap-text', 'hscroll']);

function load(label: string): Map<string, Res> {
  const dir = join(OUT_ROOT, label, 'routes');
  const m = new Map<string, Res>();
  if (!existsSync(dir)) return m;
  for (const f of readdirSync(dir)) if (f.endsWith('.json')) { const r = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Res; m.set(r.route, r); }
  return m;
}

/** The findings of `now` that `was` does not have, with multiplicity. A line clamp on text that is not key information is not a finding at all (audit.mts), so none reaches here. */
export function newFindings(was: Finding[], now: Finding[]): Finding[] {
  const left = new Map<string, number>();
  const k = (f: Finding) => `${f.rule}|${f.text}`;
  for (const f of was) if (f.rule !== 'hscroll') left.set(k(f), (left.get(k(f)) ?? 0) + 1);
  const out: Finding[] = [];
  const px = (f?: Finding) => Number(/^(\d+)px/.exec(f?.detail ?? '')?.[1] ?? 0);
  for (const f of now) {
    if (f.rule === 'hscroll') { if (px(f) > px(was.find((w) => w.rule === 'hscroll')) + 2) out.push(f); continue; }
    const n = left.get(k(f)) ?? 0;
    if (n > 0) left.set(k(f), n - 1); else out.push(f);
  }
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const before = load(pos[1]), after = load(pos[2]);
  let gated = 0, other = 0, lost = 0;
  const fixed: Record<string, number> = {};
  for (const [route, a] of [...after].sort((x, y) => x[0].localeCompare(y[0]))) {
    const b = before.get(route);
    if (!b) { console.log(`${route}: new route (not in ${pos[1]})`); continue; }
    if (b.phone?.ok && !a.phone?.ok) { lost++; console.log(`${route}: RENDERED BEFORE, NOT NOW — ${(a.phone?.errors ?? [])[0]?.slice(0, 160)}`); continue; }
    if (!a.phone?.ok) continue;
    for (const c of CONFIGS) {
      const was = b[c]?.findings ?? [], now = a[c]?.findings ?? [];
      for (const f of newFindings(was, now)) {
        const g = GATED.has(f.rule);
        if (g) gated++; else other++;
        if (g || args.includes('--all')) console.log(`${g ? 'NEW' : 'new'} ${route} [${c}] ${f.rule}: "${f.text.slice(0, 70)}" ${f.detail ?? ''}${f.ratio ? ` ${f.ratio}:1` : ''}${f.px ? ` ${f.px}px` : ''}`);
      }
      for (const f of newFindings(now, was)) if (GATED.has(f.rule)) fixed[`${c} ${f.rule}`] = (fixed[`${c} ${f.rule}`] ?? 0) + 1;
    }
    if (args.includes('--body')) {
      const n = (r: Res) => (r.phone?.findings ?? []).filter((f) => f.rule === 'body-small').length;
      if (n(b) || n(a)) console.log(`body ${route}: ${n(b)} → ${n(a)}`);
    }
  }
  for (const route of before.keys()) if (!after.has(route)) console.log(`${route}: in ${pos[1]}, not in ${pos[2]}`);
  console.log(`\ngone since ${pos[1]} (clipping, overlap, sideways scroll): ${JSON.stringify(fixed)}`);
  console.log(`new clipping / overlap / sideways scroll: ${gated}; routes that stopped rendering: ${lost}; new under other rules: ${other}`);
  process.exit(gated || lost ? 1 : 0);
}
