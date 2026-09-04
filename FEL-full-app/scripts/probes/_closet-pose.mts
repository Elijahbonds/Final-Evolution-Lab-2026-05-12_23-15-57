// One-off: what is the Closet preview playing, and how do the arms sit? (dev-only ?hero=)
import { chromium } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:3000', OUT = process.env.OUT_DIR ?? 'docs/shots/tones', HERO = process.env.HERO ?? '';
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 } });
const rc = ctx.request; const csrf = (await (await rc.get(`${BASE}/api/auth/csrf`)).json()).csrfToken as string;
await rc.post(`${BASE}/api/auth/callback/credentials`, { form: { csrfToken: csrf, email: 'playtest@fel.local', password: 'playtest-local-only', json: 'true' } });
const p = await ctx.newPage();
const q = [HERO ? `hero=${HERO}` : '', process.env.TONE ? `tone=${process.env.TONE}` : ''].filter(Boolean).join('&');
await p.goto(`${BASE}/closet${q ? '?' + q : ''}`, { waitUntil: 'networkidle', timeout: 120000 });
await p.waitForSelector('canvas', { timeout: 60000 }); await p.waitForTimeout(4000);
const info = await p.evaluate(`(() => { const s = window.__FEL_PREVIEW__?.spawned; if (!s) return 'no preview'; const a = s.animator; const groups = s.scene ? [] : []; const playing = a && a.groups ? [...a.groups.values()].filter((g) => g.isPlaying).map((g) => g.name) : (a && (a.currentName || (a.current && a.current.name))) || null; const sk = s.skeleton; const P = (n) => { const bn = sk && sk.bones.find((b) => b.name.replace(/^mixamorig:?/, '').replace(/_c\\d+$/, '') === n); const t = bn && bn.getTransformNode(); if (!t) return null; t.computeWorldMatrix(true); const v = t.getAbsolutePosition(); return [v.x, v.y, v.z].map((x) => +x.toFixed(2)); }; return JSON.stringify({ playing, RightArm: P('RightArm'), RightHand: P('RightHand'), LeftHand: P('LeftHand'), Head: P('Head'), registered: a && a.groups ? a.groups.size : null }); })()`);
console.log(`${HERO ? 'cand' : 'ship'}:`, info);
const canvas = await p.$('canvas'); await canvas!.screenshot({ path: `${OUT}/${HERO ? 'cand' : 'ship'}-pose${process.env.TONE ? '-' + process.env.TONE : ''}.png` });
console.log('canvas', await canvas!.boundingBox());
await b.close();
