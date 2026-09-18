// DUNK-POSTURE-LEGS diag: which character bodies stand on the dunk floor, where, and what their skin materials are
// (an untextured orange body stood beside the runway in a profile card).
import { chromium } from 'playwright-core';
const PORT = process.env.PORT ?? '3004';
const EXE = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
p.on('console', (m) => { const t = m.text(); if (/FEL-CHAR|FEL-IDENTITY|roster|Roster|texture|Texture|404/.test(t)) console.log('  console:', t.slice(0, 200)); });
await p.goto(`http://localhost:${PORT}/dev/mode/dunk`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 90000 });
await p.waitForFunction(() => !!(window as unknown as { __FEL_DEV__?: { hero: () => unknown } }).__FEL_DEV__?.hero?.(), null, { timeout: 180000 });
await p.waitForTimeout(3000);
// START, then a stick run + a hold-run for 400 ms (the pad is not injected here: use the keyboard — ArrowUp runs at the rim, Enter = A?)
await p.addInitScript(() => {}); // no-op
await p.evaluate(`(() => { const pad = { index: 0, id: 'fake-dualshock (STANDARD GAMEPAD)', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: 0, buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) }; window.__PAD = pad; navigator.getGamepads = () => [pad]; })()`);
const padSet = async (js: string) => { await p.evaluate(`(() => { const p = window.__PAD; ${js}; p.timestamp = performance.now(); })()`); };
await padSet('p.buttons[0].pressed = true; p.buttons[0].value = 1'); await p.waitForTimeout(90); await padSet('p.buttons[0].pressed = false; p.buttons[0].value = 0');
await p.waitForFunction(() => document.body.innerText.includes('· playing'), null, { timeout: 30000 }); await p.waitForTimeout(2500);
await padSet('p.axes[1] = -1'); await p.waitForTimeout(500);
await padSet('p.buttons[7].pressed = true; p.buttons[7].value = 1'); await p.waitForTimeout(380);
const near = await p.evaluate(`(() => {
  const scene = window.__FEL_DEV__.scene, hero = window.__FEL_DEV__.hero(); const hp = hero.getAbsolutePosition();
  const rootOf = (n) => { while (n && n.parent) n = n.parent; return n; };
  const out = [];
  for (const m of scene.meshes) { if (!m.isEnabled() || !m.isVisible || m.getTotalVertices() < 50) continue; const bb = m.getBoundingInfo().boundingBox; const c = bb.centerWorld; const d = Math.hypot(c.x - hp.x, c.z - hp.z); if (d > 6 || rootOf(m) === hero) continue; const ext = bb.extendSizeWorld; if (ext.y < 0.4) continue; out.push(m.name + ' root ' + rootOf(m).name + ' at ' + c.x.toFixed(1) + ',' + c.y.toFixed(1) + ',' + c.z.toFixed(1) + ' h ' + (ext.y * 2).toFixed(1) + ' mat ' + (m.material ? m.material.name : 'none') + ' skel ' + !!m.skeleton); }
  return 'hero at ' + hp.x.toFixed(1) + ',' + hp.z.toFixed(1) + '\\n' + out.join('\\n');
})()`);
console.log(near);
await padSet('p.buttons[7].pressed = false; p.buttons[7].value = 0; p.axes[1] = 0');
const out = await p.evaluate(`(() => {
  const scene = window.__FEL_DEV__.scene, hero = window.__FEL_DEV__.hero();
  const rootOf = (n) => { while (n && n.parent) n = n.parent; return n; };
  const skinned = scene.meshes.filter((m) => m.skeleton && m.isEnabled() && m.isVisible);
  const byRoot = new Map(); for (const m of skinned) { const r = rootOf(m); if (!byRoot.has(r)) byRoot.set(r, []); byRoot.get(r).push(m); }
  const lines = [];
  for (const [r, ms] of byRoot) { const mats = [...new Set(ms.map((m) => (m.material ? m.material.name + (m.material.albedoTexture || m.material.diffuseTexture ? '[tex]' : '[notex]') : 'nomat')))]; const p0 = r.getAbsolutePosition ? r.getAbsolutePosition() : r.position; lines.push((r.name) + (r === hero ? ' (HERO)' : '') + ' pos ' + p0.x.toFixed(2) + ',' + p0.y.toFixed(2) + ',' + p0.z.toFixed(2) + ' meshes ' + ms.length + ' [' + ms.slice(0, 8).map((m) => m.name).join(',') + '] mats ' + mats.slice(0, 10).join(' | ')); }
  return lines.join('\\n') || ('no skinned meshes; meshes ' + scene.meshes.length);
})()`);
console.log(out);
await p.screenshot({ path: process.env.HOME + '/Claude/outbox/dunk-legs-9d14995/_bodies-diag.png' });
await b.close();
