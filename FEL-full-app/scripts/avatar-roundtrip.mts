// Prove the avatar pipeline end-to-end in a real browser:
//
//   1. /closet renders (editor + Scan My Face + Save Look visible);
//   2. saving a new skinTone round-trips through /api/v1/closet;
//   3. the in-game hero's pixels actually CHANGE (whole-canvas diff between
//      two saved tones — the instrument that caught "identity never reached
//      bare spawns" in the a175035 pass);
//   4. the account is restored to its original look afterwards.
//
//   URL=http://localhost:3001 npx tsx scripts/avatar-roundtrip.mts
//   PLAYTEST_EMAIL=elijah@fel.local PLAYTEST_PASSWORD=owner-local-only … (owner run)

import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

// Probe tones from lib/closet/wearable-catalog.ts SKIN_TONES (inlined: tsx ESM
// can't import the catalog from an .mts entry). Extremes of the range so the
// canvas diff is unmistakable.
const SKIN_TONES = ['#FBE7D3', '#241509'];

const BASE = process.env.URL ?? 'http://localhost:3001';
const EMAIL = process.env.PLAYTEST_EMAIL ?? 'playtest@fel.local';
const PASSWORD = process.env.PLAYTEST_PASSWORD ?? 'playtest-local-only';
const OUT = process.env.OUT_DIR ?? 'docs/shots/play';
mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({
  executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'],
});

let failures = 0;
const check = (ok: boolean, label: string) => {
  console.log(`${ok ? '✅' : '❌'} ${label}`);
  if (!ok) failures++;
};

async function login(p: any): Promise<void> {
  await p.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await p.locator('input[type="email"]').fill(EMAIL);
  await p.locator('input[type="password"]').fill(PASSWORD);
  await p.locator('input[type="password"]').press('Enter');
  await p.waitForURL((u: URL) => !/\/login/.test(u.toString()), { timeout: 30_000 });
  await p.waitForLoadState('networkidle');
}

const closetFetch = (p: any, method: string, body?: unknown) =>
  p.evaluate(
    `fetch('/api/v1/closet', { method: '${method}', headers: { 'Content-Type': 'application/json' }${body ? `, body: '${JSON.stringify(body).replace(/'/g, "\\'")}'` : '' } }).then(async (r) => ({ ok: r.ok, status: r.status, json: await r.json() }))`,
  );

// --- 1. Closet renders ------------------------------------------------------
const p1 = await b.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
const errs: string[] = [];
p1.on('pageerror', (e) => errs.push(e.message));
await login(p1);
await p1.goto(`${BASE}/closet`, { waitUntil: 'networkidle' });
await p1.waitForTimeout(1200);
const closetText: string = await p1.evaluate(`document.body.innerText`);
check(/Closet/.test(closetText), 'closet page renders its heading');
check(await p1.locator('text=Scan My Face').count() > 0, '"Scan My Face" is present (system-scan path)');
check(await p1.locator('text=Save Look').count() > 0, '"Save Look" is present');
await p1.screenshot({ path: `${OUT}/closet.png` });

// --- 2. Save round-trips through the API ------------------------------------
const orig = await closetFetch(p1, 'GET');
check(orig.ok && orig.json?.look?.face?.skinTone, 'GET /api/v1/closet returns a look');
const origTone: string = orig.json.look.face.skinTone;
const newTone = SKIN_TONES.find((t) => t.toLowerCase() !== origTone.toLowerCase()
  && t.toLowerCase() !== (orig.json.look.face.__probeTone ?? '').toLowerCase())!;
const origJersey = orig.json.look.jersey ?? null;
const probeJersey = { number: 23, name: 'ROUNDTRIP' };
const newLook = { ...orig.json.look, face: { ...orig.json.look.face, skinTone: newTone } };
const saved = await closetFetch(p1, 'POST', { face: newLook.face, equipped: newLook.equipped ?? {}, skinCardId: newLook.skinCardId ?? null, jersey: probeJersey });
check(saved.ok, 'POST /api/v1/closet accepts the new tone + jersey');
const reread = await closetFetch(p1, 'GET');
check(reread.json?.look?.face?.skinTone?.toLowerCase() === newTone.toLowerCase(), `saved tone ${newTone} reads back`);
check(reread.json?.look?.jersey?.number === 23 && reread.json?.look?.jersey?.name === 'ROUNDTRIP', 'jersey ID saves and reads back');
// Direct instrument: identity skinning clones the hero's skin materials with a
// `_skin` suffix (playerIdentity.applySkinTone). Reading that material's colour
// from the live scene beats any pixel diff — the dunk arena's crowd/particles
// make same-session frame noise ~80k px, which swamps the signal.
// (Bridge.host is TS-private, not #-private — reachable at runtime.)
async function modeShot(tag: string): Promise<{ shot: string; skinHex: string[]; decals: number }> {
  const p = await b.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  await login(p);
  await p.goto(`${BASE}/dev/mode/dunk?agent=1`, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(`!!window.__NEXUS_AGENT__`, null, { timeout: 60_000 });
  await p.waitForTimeout(6000); // hero spawn + idle anims settle
  // NB: canvas.toDataURL() is blank without preserveDrawingBuffer — the
  // compositor screenshot is the honest pixel instrument.
  const png = await p.screenshot({ path: `${OUT}/avatar-roundtrip-${tag}.png` });
  const probe: { skinHex: string[]; decals: number } = await p.evaluate(
    `(() => {
      const br = window.__NEXUS_AGENT__;
      const scene = br && br.host && br.host.scene;
      if (!scene) return { skinHex: [], decals: 0 };
      return {
        skinHex: scene.materials
          .filter((m) => /_skin$/.test(m.name))
          .map((m) => { const c = m.albedoColor || m.diffuseColor; return c && c.toHexString ? c.toHexString() : null; })
          .filter(Boolean),
        decals: scene.meshes.filter((m) => m.name.startsWith('jersey_decal_')).length,
      };
    })()`,
  );
  await p.close();
  return { shot: `data:image/png;base64,${png.toString('base64')}`, ...probe };
}


const shotNew = await modeShot('newtone');
await closetFetch(p1, 'POST', { face: orig.json.look.face, equipped: orig.json.look.equipped ?? {}, skinCardId: orig.json.look.skinCardId ?? null, jersey: origJersey ?? { number: 0, name: '' } });
const restored = await closetFetch(p1, 'GET');
check(restored.json?.look?.face?.skinTone?.toLowerCase() === origTone.toLowerCase(), 'original look restored');
const shotOrig = await modeShot('origtone');

check(shotNew.shot.length > 10_000 && shotOrig.shot.length > 10_000, 'both mode canvases captured');
console.log(`scene _skin materials — new tone: [${shotNew.skinHex.join(', ')}] | original: [${shotOrig.skinHex.join(', ')}]`);
check(shotNew.skinHex.length > 0, 'hero carries identity-skinned materials in-game');
check(
  shotNew.skinHex.some((h) => h.toLowerCase() === newTone.toLowerCase()),
  `live hero skin material matches the saved tone ${newTone}`,
);
check(
  shotOrig.skinHex.some((h) => h.toLowerCase() === origTone.toLowerCase()),
  `after restore, live hero skin matches the original tone ${origTone}`,
);
console.log(`jersey plates in scene — probe look: ${shotNew.decals} | original look: ${shotOrig.decals}`);
check(shotNew.decals === 1, 'exactly one jersey plate on the hero (double-identity regression guard)');

check(errs.length === 0, `no page errors${errs.length ? ` — ${errs[0]?.slice(0, 120)}` : ''}`);
await b.close();
console.log(failures === 0 ? 'AVATAR ROUNDTRIP PASS' : `AVATAR ROUNDTRIP FAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
