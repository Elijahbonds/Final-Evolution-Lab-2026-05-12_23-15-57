// summary.mts — run.sh's matrices, per subject x tier: each run's skin-through-cloth px (all, the tops slot, the shorts slot), the
// cloth seen from outside (pokeFront), the flicker (flipsGarment), and per garment the stretch (edges past x2 of bind) and the
// distance off the skin (p50 / p95, m). Before runs vs after runs, with the control's spread (KIT-FIT-PLAN §10.1a).
//   npx tsx scripts/probes/kit-mac-jobs/summary.mts <out-dir>
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
type Scr = { poke?: number; pokeBySlot?: Record<string, number>; pokeFront?: number; flipsGarment?: number; failed?: string };
type Row = { mesh: string; cls: string; stretch?: { over2: number } | null; offSkin?: { p50: number; p95: number } | null };
type Cell = { subject: string; tier: string; pose: string; cam: string; screen: Scr; cpu?: { rows: Row[] }[] };
type Agg = { poke: number; tops: number; shorts: number; front: number; flips: number; over2: Record<string, number>; gap: Record<string, number[]>; cells: number };
const runs: Record<string, Record<string, Agg[]>> = {};   // side → subject|tier → per run
for (const f of readdirSync(dir).filter((x) => /^(before|after)-(desktop|mobile)-\d+\.json$/.test(x)).sort()) {
  const side = f.split('-')[0];
  const cells = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Cell[];
  const failed = new Set(cells.filter((c) => c.screen.failed).map((c) => `${c.subject}|${c.tier}`));
  const per = new Map<string, Agg>();
  for (const c of cells) {
    const k = `${c.subject}|${c.tier}`; if (c.screen.poke == null || failed.has(k)) continue;
    const a = per.get(k) ?? { poke: 0, tops: 0, shorts: 0, front: 0, flips: 0, over2: {}, gap: {}, cells: 0 }; per.set(k, a);
    a.cells++; a.poke += c.screen.poke; a.tops += c.screen.pokeBySlot?.tops ?? 0; a.shorts += c.screen.pokeBySlot?.shorts ?? 0;
    a.front += c.screen.pokeFront ?? 0; a.flips += c.screen.flipsGarment ?? 0;
    for (const r of (c.cpu ?? []).flatMap((x) => x.rows)) {
      if (r.cls !== 'tops' && r.cls !== 'shorts') continue;
      a.over2[r.cls] = (a.over2[r.cls] ?? 0) + (r.stretch?.over2 ?? 0);
      if (r.offSkin) (a.gap[r.cls] ??= []).push(r.offSkin.p50);
    }
  }
  for (const [k, a] of per) ((runs[side] ??= {})[k] ??= []).push(a);
}
const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const range = (xs: number[]) => (xs.length ? `${Math.min(...xs)}–${Math.max(...xs)}` : '-');
const keys = [...new Set([...Object.keys(runs.before ?? {}), ...Object.keys(runs.after ?? {})])].sort();
console.log('subject|tier                     runs b/a | skin px (all)        | tops slot           | shorts slot         | cloth from outside  | flicker       | tears tops/shorts | gap p50 mm tops/shorts');
for (const k of keys) {
  const b = runs.before?.[k] ?? [], a = runs.after?.[k] ?? [];
  const f = (xs: Agg[], g: (x: Agg) => number) => range(xs.map(g));
  const gap = (xs: Agg[], cls: string) => { const v = xs.flatMap((x) => x.gap[cls] ?? []); return v.length ? (med(v) * 1000).toFixed(0) : '-'; };
  console.log(`${k.padEnd(34)} ${b.length}/${a.length} | ${f(b, (x) => x.poke)} → ${f(a, (x) => x.poke)} | ${f(b, (x) => x.tops)} → ${f(a, (x) => x.tops)} | ${f(b, (x) => x.shorts)} → ${f(a, (x) => x.shorts)} | ${f(b, (x) => x.front)} → ${f(a, (x) => x.front)} | ${f(b, (x) => x.flips)} → ${f(a, (x) => x.flips)} | ${f(b, (x) => x.over2.tops ?? 0)}/${f(b, (x) => x.over2.shorts ?? 0)} → ${f(a, (x) => x.over2.tops ?? 0)}/${f(a, (x) => x.over2.shorts ?? 0)} | ${gap(b, 'tops')}/${gap(b, 'shorts')} → ${gap(a, 'tops')}/${gap(a, 'shorts')}`);
}
