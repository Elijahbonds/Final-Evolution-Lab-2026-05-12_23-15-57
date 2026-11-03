// The readability audit's totals (lane/readable, 2026-11-02; docs/READABLE.md): reads <outDir>/<label>/routes/*.json from
// scripts/readable/audit.mts and writes summary.json — counts per rule per set-up, the worst screens, the most repeated
// misses — and a contact sheet of the worst screens' first-screen shots (JPG, failing runs boxed in red).
//
//   npx tsx scripts/readable/summary.mts <outDir> <label> [--vs=<label>] [--sheet=15]
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import sharp from 'sharp';

const args = process.argv.slice(2);
const pos = args.filter((a) => !a.startsWith('--'));
const flag = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const OUT_ROOT = resolve(pos[0]);
const LABEL = pos[1];
const VS = flag('vs');
const SHEET_N = Number(flag('sheet') ?? 15);

interface Finding { rule: string; text: string; px?: number; ratio?: number; key?: boolean; detail?: string }
type Res = Record<string, { ok: boolean; findings?: Finding[]; errors?: string[] }> & { route: string };

/** The rules as the report groups them. */
export const GROUP: Record<string, string> = {
  tiny: 'under 12 px', 'body-small': 'body under 16 px (phone)', 'hud-small': 'HUD under 14 px', 'hud-tv-small': 'HUD under 24 px (TV)',
  contrast: 'contrast', 'contrast-large': 'contrast', 'contrast-media': 'unreadable over image/3D', clipped: 'clipped',
  'overlap-fixed': 'overlapped', 'overlap-text': 'overlapped', hscroll: 'sideways scroll',
};
const CONFIGS = ['phone', 'desktop', 'zoom200', 'font150'];

function load(label: string) {
  const dir = join(OUT_ROOT, label, 'routes');
  const routes: Res[] = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8'))) : [];
  const counts: Record<string, Record<string, number>> = {};
  const keyClipped: Record<string, number> = {};
  const perRoute: { route: string; score: number; by: Record<string, number> }[] = [];
  const texts: Record<string, number> = {};
  let rendered = 0;
  const failed: string[] = [];
  for (const r of routes) {
    if (!r.phone?.ok) { failed.push(`${r.route}: ${(r.phone?.errors ?? [])[0]?.slice(0, 120) ?? 'no render'}`); continue; }
    rendered++;
    const by: Record<string, number> = {};
    for (const c of CONFIGS) {
      const fs = r[c]?.findings ?? [];
      for (const f of fs) {
        // a run past the viewport's edge inside a side-scrolling shelf was counted as clipped by the rig before
        // 2026-11-03 (inpage.ts now stops at the scroll container); both crawls carry it, so it is split out here
        const g = f.rule === 'clipped' && /^viewport/.test(f.detail ?? '') ? 'off-screen in a shelf' : GROUP[f.rule] ?? f.rule;
        ((counts[c] ??= {})[g] = (counts[c][g] ?? 0) + 1);
        if (f.rule === 'clipped' && f.key && !/^viewport/.test(f.detail ?? '')) keyClipped[c] = (keyClipped[c] ?? 0) + 1;
        if (c === 'phone' || c === 'desktop') { by[g] = (by[g] ?? 0) + 1; texts[`${g} · ${f.text.slice(0, 40)}`] = (texts[`${g} · ${f.text.slice(0, 40)}`] ?? 0) + 1; }
      }
    }
    // the worst screens: a contrast or clip or overlap miss counts double a size miss
    const score = Object.entries(by).reduce((a, [g, n]) => a + n * (g === 'off-screen in a shelf' || g === 'contrast-disabled' ? 0 : /under/.test(g) ? 1 : 2), 0);
    perRoute.push({ route: r.route, score, by });
  }
  perRoute.sort((a, b) => b.score - a.score);
  return { routes: routes.length, rendered, failed, counts, keyClipped, worst: perRoute, top: Object.entries(texts).sort((a, b) => b[1] - a[1]).slice(0, 40) };
}

const now = load(LABEL);
const before = VS ? load(VS) : null;
const slug = (p: string) => (p === '/' ? 'root' : p.slice(1).replace(/[\/\[\]\.]+/g, '_'));
writeFileSync(join(OUT_ROOT, LABEL, 'summary.json'), JSON.stringify({ label: LABEL, vs: VS ?? null, now, before }, null, 1));

console.log(`${LABEL}: ${now.rendered}/${now.routes} routes rendered on the rig`);
const groups = [...new Set([...Object.values(GROUP), 'off-screen in a shelf'])];
console.log(`${'rule'.padEnd(28)} ${CONFIGS.map((c) => c.padStart(16)).join('')}`);
for (const g of groups) {
  console.log(`${g.padEnd(28)} ${CONFIGS.map((c) => (before ? `${before.counts[c]?.[g] ?? 0} → ${now.counts[c]?.[g] ?? 0}` : String(now.counts[c]?.[g] ?? 0)).padStart(16)).join('')}`);
}
console.log(`${'  of which key info clipped'.padEnd(28)} ${CONFIGS.map((c) => (before ? `${before.keyClipped[c] ?? 0} → ${now.keyClipped[c] ?? 0}` : String(now.keyClipped[c] ?? 0)).padStart(16)).join('')}`);
console.log('\nworst screens:');
for (const w of now.worst.slice(0, 20)) console.log(`  ${String(w.score).padStart(4)}  ${w.route.padEnd(36)} ${JSON.stringify(w.by)}`);

// the contact sheet: the worst screens' phone shots, five across
const sheetFor = async (routes: string[], label: string, name: string) => {
  const tiles: { input: Buffer; left: number; top: number }[] = [];
  const W = 260, H = 563;
  for (const [i, r] of routes.entries()) {
    const f = join(OUT_ROOT, label, 'shots', `${slug(r)}-phone.jpg`);
    if (!existsSync(f)) continue;
    const img = await sharp(f).resize(W, H, { fit: 'cover', position: 'top' }).toBuffer();
    const cap = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="22"><rect width="${W}" height="22" fill="#000"/><text x="6" y="16" font-family="sans-serif" font-size="13" fill="#fff">${r.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text></svg>`);
    tiles.push({ input: img, left: (i % 5) * (W + 6), top: Math.floor(i / 5) * (H + 28) + 22 }, { input: cap, left: (i % 5) * (W + 6), top: Math.floor(i / 5) * (H + 28) });
  }
  if (!tiles.length) return;
  const rows = Math.ceil(routes.length / 5);
  await sharp({ create: { width: 5 * (W + 6), height: rows * (H + 28), channels: 3, background: '#222' } }).composite(tiles).jpeg({ quality: 70 }).toFile(join(OUT_ROOT, LABEL, name));
  console.log(`contact sheet → ${join(OUT_ROOT, LABEL, name)}`);
};
const worstRoutes = (before ?? now).worst.slice(0, SHEET_N).map((w) => w.route);
await sheetFor(worstRoutes, LABEL, before ? `contact-after.jpg` : `contact.jpg`);
