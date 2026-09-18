// _vram-diag — per-mode texture memory: every texture the ENGINE holds on the GPU (engine._internalTexturesCache),
// counted once each at width×height×4 (×1.33 when mipmapped, ×6 for a cube), render targets and shadow/depth maps
// excluded. Grouped by the largest offenders.
//   URL=http://localhost:3000/dev/mode/dunk npx tsx scripts/probes/_vram-diag.mts            one mode, one tier (TIER=mobile for the phone tier)
//   MODES=dunk,karate TIERS=desktop,mobile OUT=lib/babylon/config/textureBudget.json BASE=http://localhost:3005 npx tsx scripts/probes/_vram-diag.mts
//     — the phase 9 sweep: every listed registry key on every listed tier, written in the frozen textureBudget.json
//       schema (docs/CONTRACTS-PASS4-RUN.md). MODES=all reads the enabled list from lib/babylon/modes/registry.ts.
// Why the engine cache and not scene.textures (the basis until 2026-09-04): an AssetContainer's textures are
// uploaded at load but sit OUTSIDE scene.textures, so the hero GLB's fifteen maps (96 MB) were invisible in every
// mode — karate read 40 MB with 215 MB on the GPU; and Material.clone() (identity tints) pushes texture clones that
// SHARE one GPU texture into scene.textures, so dunk read the hero twice. The HUD's "vram ~" (PerfMonitor) counts
// the same way now. Render targets are the quality tier's business, not a mode's, so they are left out of the total.
// BASIS=scene reproduces the old number. WAIT_MS (default 12000) is how long a mode gets to load and spawn before the
// count; RETRIES (default 1) re-runs a mode whose page never produced __FEL_DEV__.
import { chromium, type Browser, type Page } from 'playwright-core';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

type Tier = 'desktop' | 'mobile';
interface Row { mode: string; tier: string; textures: number; totalMB: number; renderTargetsMB: number; top: string[] }

const WAIT_MS = Number(process.env.WAIT_MS ?? 12000);
const CHROME = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

async function newPage(b: Browser, tier: Tier): Promise<Page> {
  // TIER=mobile mirrors scripts/capture-mode-play.mts: a phone-shaped, touch-capable context so detectQualityTier picks 'mobile'
  return tier === 'mobile'
    ? (await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36' })).newPage()
    : b.newPage({ viewport: { width: 1280, height: 800 } });
}

const BASIS = process.env.BASIS === 'scene' ? 'scene' : 'engine';
const MEASURE = `(() => { const d = window.__FEL_DEV__; if (!d) return 'no __FEL_DEV__'; const s = d.scene;
  const tier = (s.metadata && s.metadata.felTier) || document.documentElement.dataset.felTier || (innerWidth < 900 ? 'mobile?' : 'desktop?');
  const rows = []; let total = 0; let rt = 0;
  if ('${BASIS}' === 'scene') {
    for (const t of s.textures) { const sz = t.getSize ? t.getSize() : { width: 0, height: 0 }; const mip = t.noMipmap === false || t.generateMipMaps ? 1.33 : 1; const bytes = sz.width * sz.height * 4 * mip * (t.isCube ? 6 : 1); total += bytes; rows.push([bytes, (t.name || t.url || t.getClassName()).toString().split('/').pop().slice(0, 48), sz.width + 'x' + sz.height + (t.isCube ? ' cube' : '')]); }
  } else {
    const e = s.getEngine(); const cache = e._internalTexturesCache || [];
    // InternalTextureSource: 5 RenderTarget, 6 MultiRenderTarget, 12 DepthStencil, 14 Depth — the pipeline's, not the mode's
    const RT = new Set([5, 6, 12, 14]);
    const names = new Map();
    for (const t of s.textures) { const it = t.getInternalTexture && t.getInternalTexture(); if (it && !names.has(it)) names.set(it, t.name || t.url); }
    for (const it of cache) {
      const bytes = it.width * it.height * 4 * (it.generateMipMaps ? 1.33 : 1) * (it.isCube ? 6 : 1) * (it.is3D ? Math.max(1, it.depth) : 1);
      if (RT.has(it.source)) { rt += bytes; continue; }
      total += bytes;
      rows.push([bytes, String(names.get(it) || it.url || it.label || ('internal#' + it.uniqueId)).split('/').pop().slice(0, 48), it.width + 'x' + it.height + (it.isCube ? ' cube' : '')]);
    }
  }
  rows.sort((a, b) => b[0] - a[0]);
  return JSON.stringify({ mode: d.modeId, tier, textures: rows.length, totalMB: +(total / 1048576).toFixed(1), renderTargetsMB: +(rt / 1048576).toFixed(1), top: rows.slice(0, 8).map((r) => (r[0] / 1048576).toFixed(1) + 'MB ' + r[1] + ' ' + r[2]) }); })()`;

async function measure(b: Browser, url: string, tier: Tier): Promise<Row | string> {
  const p = await newPage(b, tier);
  try {
    await p.goto(url, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('canvas', { timeout: 60000 });
    await p.waitForTimeout(WAIT_MS);
    const out = await p.evaluate<string>(MEASURE);
    return out.startsWith('{') ? (JSON.parse(out) as Row) : out;
  } finally { await p.context().close().catch(() => {}); }
}

const b = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
try {
  if (!process.env.MODES) {
    // single-mode form — the original output, one JSON line
    const tier: Tier = process.env.TIER === 'mobile' ? 'mobile' : 'desktop';
    const r = await measure(b, process.env.URL ?? 'http://localhost:3000/dev/mode/dunk', tier);
    console.log(typeof r === 'string' ? r : JSON.stringify(r));
  } else {
    const BASE = process.env.BASE ?? 'http://localhost:3005';
    const tiers = (process.env.TIERS ?? 'desktop,mobile').split(',').map((t) => t.trim()).filter((t): t is Tier => t === 'desktop' || t === 'mobile');
    const modes = process.env.MODES === 'all' ? enabledModes() : process.env.MODES.split(',').map((m) => m.trim()).filter(Boolean);
    const RETRIES = Number(process.env.RETRIES ?? 1);
    const table: Record<string, { median: number; modes: Record<string, { totalMB: number; textures: number; top: string[] }> }> = {};
    for (const tier of tiers) {
      const perMode: Record<string, { totalMB: number; textures: number; top: string[] }> = {};
      for (const mode of modes) {
        let r: Row | string = 'not run';
        for (let attempt = 0; attempt <= RETRIES; attempt++) {
          r = await measure(b, `${BASE}/dev/mode/${mode}`, tier).catch((e) => String(e?.message ?? e).slice(0, 120));
          if (typeof r !== 'string') break;
        }
        if (typeof r === 'string') { console.error(`${tier.padEnd(7)} ${mode.padEnd(16)} FAILED: ${r}`); continue; }
        if (r.tier !== tier) console.warn(`${tier.padEnd(7)} ${mode.padEnd(16)} page reports tier "${r.tier}" — check detectQualityTier`);
        perMode[mode] = { totalMB: r.totalMB, textures: r.textures, top: r.top };
        console.log(`${tier.padEnd(7)} ${mode.padEnd(16)} ${String(r.totalMB).padStart(6)} MB  ${String(r.textures).padStart(3)} tex  (+${r.renderTargetsMB} MB render targets)  ${r.top[0] ?? ''}`);
      }
      table[tier] = { median: median(Object.values(perMode).map((m) => m.totalMB)), modes: perMode };
      const gate = 2 * table[tier].median;
      const over = Object.entries(perMode).filter(([, m]) => m.totalMB > gate).map(([k, m]) => `${k} ${m.totalMB}`);
      console.log(`${tier}: median ${table[tier].median} MB, 2× gate ${gate.toFixed(1)} MB, over: ${over.length ? over.join(', ') : 'none'}`);
    }
    const doc = {
      measuredAt: new Date().toISOString().slice(0, 10), probe: 'scripts/probes/_vram-diag.mts',
      budgetRule: 'mobile: no mode above 2x tierMedian',
      basis: BASIS === 'engine'
        ? 'engine._internalTexturesCache, each GPU texture once, width*height*4*1.33 (mip) *6 (cube); render targets/shadow/depth maps excluded'
        : 'scene.textures, width*height*4*1.33 (mip) — the pre-2026-09-04 basis (misses AssetContainer textures, double-counts clones)',
      tiers: table,
      ...(process.env.OUT && existingExtras(process.env.OUT)),
    };
    if (process.env.OUT) { mkdirSync(dirname(process.env.OUT), { recursive: true }); writeFileSync(process.env.OUT, JSON.stringify(doc, null, 2) + '\n'); console.log(`wrote ${process.env.OUT}`); }
    else console.log(JSON.stringify(doc, null, 2));
  }
} finally { await b.close(); }

function median(xs: number[]): number { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return +(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2).toFixed(1); }
/** The enabled registry keys, read off the source so the sweep cannot drift from ENABLED_BABYLON_MODES. */
function enabledModes(): string[] {
  const src = readFileSync('lib/babylon/modes/registry.ts', 'utf8');
  const block = /ENABLED_BABYLON_MODES = new Set<string>\(\[([\s\S]*?)\]\)/.exec(src)?.[1] ?? '';
  return [...block.replace(/\/\/.*$/gm, '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}
/** Keep fields other steps wrote to the same file (the throttle rows) when the sweep rewrites the table. */
function existingExtras(path: string): Record<string, unknown> {
  try { const prev = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>; const { measuredAt, probe, budgetRule, tiers, ...rest } = prev; void measuredAt; void probe; void budgetRule; void tiers; return rest; }
  catch { return {}; }
}
