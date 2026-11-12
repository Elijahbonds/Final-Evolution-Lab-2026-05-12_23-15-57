// KIT-GLITCH: read a matrix JSON (rig.mts) and print the symptoms per subject / pose / camera — worst first.
//   npx tsx scripts/probes/kit-glitch/report.mts <matrix.json> [poke|flips|stretch|float|errors|all]
import { readFileSync } from 'node:fs';
import type { Cell } from './rig.mts';

type Row = { mesh: string; cls: string; stretch?: { over2: number; maxRatio: number; over2Bones: Record<string, number> } | null; offSkin?: { p95: number; max: number } | null; bind?: { linkedToBody: number; bones: number; maxBoneDelta: number } | null; infl?: { nbi: number; weightSumOff: number; zeroWeight: number }; mat?: { zOffset: number; zOffsetUnits: number } | null; culled?: boolean };
type Cpu = { rows: Row[]; slots: Record<string, string[]>; mask: unknown; cloth: boolean }[];

export function load(f: string): Cell[] { return JSON.parse(readFileSync(f, 'utf8')) as Cell[]; }
const scr = (c: Cell) => c.screen as { poke?: number; pokeBySlot?: Record<string, number>; garmentPx?: number; flipsGarment?: number; flipPairs?: Record<string, number> };

export function totals(cells: Cell[]): { cells: number; poke: number; garmentPx: number; flips: number; tornEdges: number; tornCells: number; floatCells: number } {
  let poke = 0, garmentPx = 0, flips = 0, n = 0, tornEdges = 0, tornCells = 0, floatCells = 0;
  for (const c of cells) {
    const s = scr(c); if (s.poke == null) continue;
    n++; poke += s.poke; garmentPx += s.garmentPx ?? 0; flips += s.flipsGarment ?? 0;
    for (const b of (c.cpu as Cpu | undefined) ?? []) for (const r of b.rows) {
      if (r.cls === 'key') continue;
      if (r.stretch?.over2) { tornEdges += r.stretch.over2; tornCells++; }
      if ((r.offSkin?.p95 ?? 0) > 0.1) floatCells++;
    }
  }
  return { cells: n, poke, garmentPx, flips, tornEdges, tornCells, floatCells };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cells = load(process.argv[2]);
  const what = process.argv[3] ?? 'all';
  const grp = (k: (c: Cell) => string) => { const m = new Map<string, Cell[]>(); for (const c of cells) { const kk = k(c); (m.get(kk) ?? m.set(kk, []).get(kk)!).push(c); } return m; };
  if (what === 'all' || what === 'poke') {
    console.log('— poke-through px (sum over cameras) by subject × pose, worst 30');
    const rows = [...grp((c) => `${c.subject} ${c.tier} ${c.pose}`)].map(([k, cs]) => [k, cs.reduce((t, c) => t + (scr(c).poke ?? 0), 0), cs.map((c) => `${c.cam}:${scr(c).poke ?? '-'}`).join(' '), JSON.stringify(cs.reduce((acc, c) => { for (const [s, v] of Object.entries(scr(c).pokeBySlot ?? {})) acc[s] = (acc[s] ?? 0) + v; return acc; }, {} as Record<string, number>))] as const);
    for (const r of rows.sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 30)) console.log(' ', String(r[1]).padStart(6), r[0], '|', r[2], r[3]);
  }
  if (what === 'all' || what === 'flips') {
    console.log('— flicker (interior class flips under a 0.4 mm nudge) worst 20');
    const rows = cells.filter((c) => (scr(c).flipsGarment ?? 0) > 0).sort((a, b) => (scr(b).flipsGarment ?? 0) - (scr(a).flipsGarment ?? 0)).slice(0, 20);
    for (const c of rows) console.log(' ', String(scr(c).flipsGarment).padStart(5), c.subject, c.tier, c.pose, c.cam, JSON.stringify(scr(c).flipPairs));
  }
  if (what === 'all' || what === 'stretch' || what === 'float') {
    console.log('— garments: edges past ×2 (torn), p95 off the skin (floating), binding, influencers');
    const agg = new Map<string, { torn: number; poses: string[]; maxR: number; bones: Record<string, number>; p95: number; bind: string; infl: string; z: string }>();
    for (const c of cells) for (const b of (c.cpu as Cpu | undefined) ?? []) for (const r of b.rows) {
      if (r.cls === 'key') continue;
      const k = `${c.subject.replace(/^(closet|game)-/, '$1 ')} ${c.tier} ${r.mesh}`;
      const a = agg.get(k) ?? { torn: 0, poses: [], maxR: 0, bones: {}, p95: 0, bind: '', infl: '', z: '' }; agg.set(k, a);
      if (r.stretch?.over2) { a.torn += r.stretch.over2; a.poses.push(`${c.pose}:${r.stretch.over2}`); for (const [bn, v] of Object.entries(r.stretch.over2Bones)) a.bones[bn] = (a.bones[bn] ?? 0) + v; }
      a.maxR = Math.max(a.maxR, r.stretch?.maxRatio ?? 0); a.p95 = Math.max(a.p95, r.offSkin?.p95 ?? 0);
      a.bind = r.bind ? `${r.bind.linkedToBody}/${r.bind.bones} Δ${r.bind.maxBoneDelta}` : '-'; a.infl = r.infl ? `nbi${r.infl.nbi} off${r.infl.weightSumOff} zero${r.infl.zeroWeight}` : '-'; a.z = r.mat ? `z${r.mat.zOffset}/${r.mat.zOffsetUnits}` : '';
    }
    for (const [k, a] of [...agg].sort((x, y) => y[1].torn - x[1].torn).slice(0, Number(process.env.TOP ?? 40))) console.log(' ', String(a.torn).padStart(5), `max×${a.maxR.toFixed(2)}`, `p95off ${(a.p95 * 100).toFixed(1)}cm`, k, a.bind, a.infl, a.z, a.poses.join(' '), JSON.stringify(a.bones));
  }
  if (what === 'all' || what === 'errors') {
    for (const c of cells) { const s = c.screen as Record<string, unknown>; if (s.errors || s.failed || s.pageerror || s.missingClip) console.log('  !', c.subject, c.tier, c.pose, JSON.stringify(s).slice(0, 400)); }
  }
  console.log('totals', JSON.stringify(totals(cells)));
}
