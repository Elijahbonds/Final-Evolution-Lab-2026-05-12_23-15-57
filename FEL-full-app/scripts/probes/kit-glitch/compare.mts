// KIT-GLITCH: before → after over the SAME cells. Reads matrix JSONs (rig.mts), keeps only the cells present in both, and
// prints each symptom per group (closet / game / rival / pack) and tier.
//   npx tsx scripts/probes/kit-glitch/compare.mts "before1.json,before2.json" "after1.json,after2.json"
import { readFileSync } from 'node:fs';
import type { Cell } from './rig.mts';

type Scr = { poke?: number; garmentPx?: number; flipsGarment?: number; pokeBySlot?: Record<string, number> };
type Row = { cls: string; mesh: string; offSkin?: { max: number } | null };
const load = (list: string) => list.split(',').flatMap((f) => JSON.parse(readFileSync(f, 'utf8')) as Cell[]);
// a subject that failed or was cut short in a file is dropped from that file (a re-run supplies it)
function clean(cells: Cell[]): Map<string, Cell> {
  const failed = new Set(cells.filter((c) => (c.screen as { failed?: string }).failed).map((c) => `${c.subject}|${c.tier}`));
  const m = new Map<string, Cell>();
  for (const c of cells) { const s = c.screen as Scr; if (s.poke == null || failed.has(`${c.subject}|${c.tier}`)) continue; m.set(`${c.subject}|${c.tier}|${c.pose}|${c.cam}`, c); }
  return m;
}
const B = clean(load(process.argv[2])), A = clean(load(process.argv[3]));
const keys = [...B.keys()].filter((k) => A.has(k));
const group = (c: Cell) => (c.subject.startsWith('pack-football') ? 'football' : c.subject.split('-')[0]);
type Agg = { cells: number; poke: number; px: number; pokeCells: number; flips: number; flipCells: number; slots: Record<string, number>; floatCells: number };
const agg = () => ({ cells: 0, poke: 0, px: 0, pokeCells: 0, flips: 0, flipCells: 0, slots: {}, floatCells: 0 }) as Agg;
const G = new Map<string, { b: Agg; a: Agg }>();
for (const k of keys) {
  const b = B.get(k)!, a = A.get(k)!;
  for (const name of [`${group(b)} ${b.tier}`, `ALL ${b.tier}`]) {
    const g = G.get(name) ?? { b: agg(), a: agg() }; G.set(name, g);
    for (const [c, t] of [[b, g.b], [a, g.a]] as const) {
      const s = c.screen as Scr;
      t.cells++; t.poke += s.poke ?? 0; t.px += s.garmentPx ?? 0; if ((s.poke ?? 0) >= 100) t.pokeCells++;
      t.flips += s.flipsGarment ?? 0; if ((s.flipsGarment ?? 0) >= 25) t.flipCells++;
      for (const [sl, v] of Object.entries(s.pokeBySlot ?? {})) t.slots[sl] = (t.slots[sl] ?? 0) + v;
      const rows = ((c.cpu as { rows: Row[] }[] | undefined) ?? []).flatMap((x) => x.rows);
      if (rows.some((r) => r.cls !== 'key' && r.cls !== 'cloth' && (r.offSkin?.max ?? 0) > 0.2)) t.floatCells++;
    }
  }
}
const pct = (t: Agg) => (100 * t.poke / Math.max(1, t.px)).toFixed(2);
console.log(`cells compared: ${keys.length}`);
console.log('group              cells | skin-through px (% of garment)        | cells ≥100 px | flicker px     | cells ≥25 flicker | floating (>0.2 m) poses');
for (const [k, { b, a }] of [...G].sort()) {
  console.log(`${k.padEnd(18)} ${String(b.cells).padStart(5)} | ${String(b.poke).padStart(7)} (${pct(b)}%) → ${String(a.poke).padStart(7)} (${pct(a)}%) | ${String(b.pokeCells).padStart(4)} → ${String(a.pokeCells).padStart(4)} | ${String(b.flips).padStart(5)} → ${String(a.flips).padStart(5)} | ${String(b.flipCells).padStart(4)} → ${String(a.flipCells).padStart(4)} | ${b.floatCells} → ${a.floatCells}`);
  console.log(`${''.padEnd(25)} by slot ${JSON.stringify(b.slots)} → ${JSON.stringify(a.slots)}`);
}
