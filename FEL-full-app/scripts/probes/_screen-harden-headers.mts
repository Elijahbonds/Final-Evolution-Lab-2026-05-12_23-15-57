// SCREEN-HARDEN header probe (2026-09-30): kid and adult runs through /screen?src=qr to results on a next start
// build. Records Permissions-Policy and CSP-Report-Only on every response, CSP console violations (expect 0),
// camera start, pose model load, and permissionsPolicy.allowsFeature where exposed.
//
// Run from FEL-full-app with the server up:
//   SCREEN_BASE=http://127.0.0.1:3251 node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.json scripts/probes/_screen-harden-headers.mts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page, Response } from 'playwright-core';
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.SCREEN_BASE ?? 'http://127.0.0.1:3251';
const ORIGIN = new URL(BASE).origin;
const OUT = process.env.SCREEN_HARDEN_SHOTS ?? '/opt/cursor/artifacts/SCREEN-HARDEN-shots';
mkdirSync(OUT, { recursive: true });

const R = await import('../../lib/assess/replay.ts');
const replay = ((R as unknown as { default?: typeof R }).default ?? R);
type Frame = { t: number; present: boolean; image: { x: number; y: number; z: number; v: number }[]; world?: unknown };
const strip = (fs: readonly Frame[]): Frame[] => fs.map((f) => ({ t: f.t, present: f.present, image: f.image, ...(f.world ? { world: f.world } : {}) }));
const STAND = strip(replay.standFront(0.4).frames);
const TAKES: Record<string, Frame[]> = {
  'T1-front': strip(replay.ohsFront({}).frames), 'T1-side': strip(replay.ohsSide().frames),
  'T2-left': strip(replay.kneeWall('left', { tibiaMax: 44 }).frames), 'T2-right': strip(replay.kneeWall('right', { tibiaMax: 44 }).frames),
  'T3-left': strip(replay.singleLegSquat('left').frames), 'T3-right': strip(replay.singleLegSquat('right').frames),
  T5: strip(replay.cmj([{ heightM: 0.4 }, { heightM: 0.45 }, { heightM: 0.42 }]).frames),
};

type Json = Record<string, unknown>;
const report: Json = { base: BASE, date: new Date().toISOString(), runs: {} };

function headerFields(res: Response, name: string): string[] {
  const raw = res.headers()[name.toLowerCase()];
  if (!raw) return [];
  return raw.split(/,\s*(?=[\w-]+:)/).map((v) => v.trim());
}

async function runBand(page: Page, band: 'under-13' | '18+', tag: string): Promise<Json> {
  const out: Json = { band, responses: [] as Json[], cspViolations: [] as string[], cameraStarted: false, modelLoaded: false };
  page.on('console', (m) => {
    const t = m.text();
    if (/violates the following Content Security Policy/i.test(t)) out.cspViolations.push(t);
  });
  page.on('response', (res) => {
    const path = res.url().replace(ORIGIN, '');
    if (!path.startsWith('/screen') && !path.startsWith('/play/mirror/assess')) return;
    out.responses.push({
      path,
      status: res.status(),
      permissionsPolicy: headerFields(res, 'permissions-policy'),
      cspReportOnly: headerFields(res, 'content-security-policy-report-only'),
    });
  });

  await page.goto(`${BASE}/screen?src=qr&agent=1`);
  await page.waitForSelector('[data-step="start"]');
  await page.evaluate('window.__FEL_POSE_FEED__ && window.__FEL_POSE_FEED__.begin()');
  await page.click('[data-step="start"] [data-primary]');
  await page.waitForSelector('[data-step="age"]');
  await page.click(`[data-age="${band}"]`);
  await page.waitForSelector('[data-step="grown-up"], [data-step="consent"], [data-step="pain"]');
  if (await page.locator('[data-step="grown-up"]').count()) {
    await page.check('[data-grown-up-box]');
    await page.click('[data-step="grown-up"] [data-primary]');
  }
  if (await page.locator('[data-step="consent"]').count()) {
    await page.check('[data-consent-box]');
    await page.click('[data-step="consent"] [data-primary]');
  }
  await page.waitForSelector('[data-step="pain"]');
  await page.click('[data-pain="no"]');
  if (await page.locator('[data-step="camera-info"]').count()) {
    await page.click('[data-step="camera-info"] [data-primary]');
  }
  for (let i = 0; i < 40; i++) {
    await page.evaluate((fs) => window.__FEL_POSE_FEED__!.play(fs as never), STAND);
    if (await page.locator('[data-step="camera"] [data-primary]:not([disabled])').count()) break;
  }
  out.cameraStarted = (await page.locator('[data-step="camera"] [data-primary]:not([disabled])').count()) > 0;
  await page.click('[data-step="camera"] [data-primary]');

  const play = (fs: Frame[]) => page.evaluate((f) => window.__FEL_POSE_FEED__!.play(f as never), fs);
  const view = () => page.evaluate(() => window.__FEL_ASSESS__?.view() ?? null) as Promise<Json | null>;
  const t0 = Date.now();
  while (Date.now() - t0 < 180_000) {
    const v = await view();
    if (!v) { await play(STAND); continue; }
    if (v.step === 'active' && v.part && TAKES[v.part as string]) await play(TAKES[v.part as string]);
    else await play(STAND);
    const body = await page.locator('body').innerText();
    if (body.includes('model loaded') || body.match(/pose model.*loaded/i)) out.modelLoaded = true;
    if (body.includes('The pose model did not load')) out.modelLoaded = false;
    if (v.step === 'done' || v.step === 'stopped') break;
  }
  await page.waitForURL(/\/play\/mirror\/assess\/results/, { timeout: 60_000 }).catch(() => {});
  out.permissionsPolicyApi = await page.evaluate(`(() => {
    const p = document.permissionsPolicy;
    if (!p) return null;
    return { camera: p.allowsFeature('camera'), microphone: p.allowsFeature('microphone') };
  })()`);
  return out;
}

const browser = await chromium.launch({
  executablePath: chromiumExe(),
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'],
});

try {
  for (const [band, tag] of [['under-13', 'kid'], ['18+', 'adult']] as const) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    (report.runs as Json)[tag] = await runBand(page, band, tag);
    await ctx.close();
  }
} finally {
  await browser.close();
}

writeFileSync(join(OUT, 'headers.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  kid: { violations: (report.runs as Json).kid?.cspViolations?.length, modelLoaded: (report.runs as Json).kid?.modelLoaded },
  adult: { violations: (report.runs as Json).adult?.cspViolations?.length, modelLoaded: (report.runs as Json).adult?.modelLoaded },
}, null, 2));
