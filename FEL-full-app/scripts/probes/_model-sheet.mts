// _model-sheet — the contact sheet for a batch of rigged bodies (models pass, 2026-09-22).
//
// For each GLB URL: load it on /dev/model (CharacterLibrary: Gate 0 + the FEL clip set), record the rig report (joints,
// height, verts, clips, Gate 0 pass / the rejection note), shoot FRONT idle, THREE-QUARTER idle and RUNNING frames, sample
// the elbows under idle and run (a locked T reads as both elbows > 160° for the whole sample), and try one sport clip.
// Writes <OUT>/<name>-{front,turn,run}.png, <OUT>/sheet.json and <OUT>/index.html (the sheet the owner casts from).
//
//   BASE=http://localhost:3011 OUT=~/Claude/outbox/finish-release/meshy-2026-09-22/SHEET URLS=/models/a.glb,/models/b.glb npx tsx scripts/probes/_model-sheet.mts
//   NAMES=a,b (optional labels, same order) · SPORT=tennis_swing (the sport clip to try)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://localhost:3011';
const OUT = process.env.OUT ?? '/tmp/model-sheet';
const URLS = (process.env.URLS ?? '/models/athletes/flint.glb').split(',');
const NAMES = (process.env.NAMES ?? '').split(',').filter(Boolean);
const SPORT = process.env.SPORT ?? 'tennis_swing';
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: chromiumExe(), args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 560, height: 720 } });
const errors: string[] = [];
p.on('console', (m) => { if (m.type() === 'error' && !/favicon|40[14]/.test(m.text())) errors.push(m.text().slice(0, 160)); });
const rows: Record<string, unknown>[] = [];
const model = async (js: string) => p.evaluate(`(() => { const M = window.__FEL_MODEL; if (!M) return null; return ${js}; })()`).catch(() => null);
const sample = async (ms: number) => {
  const t0 = Date.now(); let n = 0, tee = 0, e: { eL: number | null; eR: number | null } | null = null;
  while (Date.now() - t0 < ms) { e = (await model('M.elbows ? M.elbows() : null')) as typeof e; if (e && e.eL != null && e.eR != null) { n++; if (e.eL > 160 && e.eR > 160) tee++; } await p.waitForTimeout(100); }
  return { samples: n, tee, last: e };
};
for (let i = 0; i < URLS.length; i++) {
  const url = URLS[i], name = NAMES[i] ?? url.split('/').pop()!.replace(/\.glb$/, '');
  errors.length = 0;
  await p.goto(`${BASE}/dev/model?url=${encodeURIComponent(url)}&clip=idle_stand`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  const t0 = Date.now(); let ready: unknown = null;
  while (Date.now() - t0 < 90000) { ready = await model('M.ready ? M : null'); if (ready) break; await p.waitForTimeout(250); }
  const report = (await model('M.report ?? null')) as Record<string, unknown> | null;
  const err = (await model('M.error ?? null')) as string | null;
  const row: Record<string, unknown> = { name, url, report, error: err, ready: !!ready };
  if (ready && !err) {
    await p.waitForTimeout(900);
    const idle = await sample(1000); row.idleTee = `${idle.tee}/${idle.samples}`; row.idleElbows = idle.last;
    await p.screenshot({ path: `${OUT}/${name}-front.png` });
    await model('M.turn(-40)'); await p.waitForTimeout(250); await p.screenshot({ path: `${OUT}/${name}-turn.png` }); await model('M.turn(0)');
    row.runClip = await model("M.play('run')"); await p.waitForTimeout(700);
    const run = await sample(1000); row.runTee = `${run.tee}/${run.samples}`; row.runElbows = run.last;
    await p.screenshot({ path: `${OUT}/${name}-run.png` });
    row.sportClip = await model(`M.play(${JSON.stringify(SPORT)})`); await p.waitForTimeout(500);
    const sport = await sample(600); row.sportTee = `${sport.tee}/${sport.samples}`;
    await p.screenshot({ path: `${OUT}/${name}-sport.png` });
    await model("M.play('idle_stand')");
  }
  row.errors = errors.slice(0, 4);
  rows.push(row);
  console.log(JSON.stringify({ name, ready: row.ready, error: err, joints: report?.joints, height: report?.height, verts: report?.verts, clips: report?.clipCount, idleTee: row.idleTee, runTee: row.runTee, sportTee: row.sportTee, runClip: row.runClip, sportClip: row.sportClip, errors: row.errors }));
}
fs.writeFileSync(`${OUT}/sheet.json`, JSON.stringify(rows, null, 2));
const tile = (r: Record<string, unknown>) => `<div class="c"><h3>${r.name}</h3><div class="row"><img src="${r.name}-front.png"><img src="${r.name}-turn.png"><img src="${r.name}-run.png"><img src="${r.name}-sport.png"></div><p>${r.error ? `<b style="color:#f66">REJECTED</b> ${r.error}` : `${(r.report as Record<string, unknown>)?.joints} joints · ${(r.report as Record<string, unknown>)?.height} m · ${(r.report as Record<string, unknown>)?.verts} verts · idle T ${r.idleTee} · run T ${r.runTee} · ${SPORT} T ${r.sportTee}`}</p><p class="cast">cast: <i>hero of ____ · rival of ____ · crowd</i></p></div>`;
fs.writeFileSync(`${OUT}/index.html`, `<!doctype html><meta charset="utf-8"><title>Meshy contact sheet 2026-09-22</title><style>body{background:#0b0d12;color:#ddd;font:13px ui-monospace,monospace;margin:16px}.c{margin:0 0 22px;padding:10px;border:1px solid #222;border-radius:8px}.row img{width:200px;height:257px;object-fit:cover;margin-right:6px;border-radius:4px;background:#111}h3{margin:0 0 6px;color:#0ef}.cast{color:#fc6}</style><h1>Meshy characters — contact sheet</h1><p>front · three-quarter · running · ${SPORT}. Name the hero / rival / crowd per mode under each.</p>${rows.map(tile).join('')}`);
console.log(`sheet: ${OUT}/index.html (${rows.length} bodies)`);
await b.close();
