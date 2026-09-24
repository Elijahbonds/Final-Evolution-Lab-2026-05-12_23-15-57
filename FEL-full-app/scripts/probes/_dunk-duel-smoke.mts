// DUNK MOTION phase 11: Dunk Duel smoke — one right-handed dunk on a fake pad, a 16-frame sheet to the outbox.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import sharp from 'sharp';
import { chromiumExe } from './_chromium.mts';
const OUT = `${process.env.HOME}/Claude/outbox/finish-release/dunkmotion/p11-duel`; fs.mkdirSync(OUT, { recursive: true });
const PAD_INIT = `(() => { const pad = { index: 0, id: 'fake (STANDARD GAMEPAD)', connected: true, mapping: 'standard', axes: [0,0,0,0], timestamp: 0, buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) }; window.__PAD = pad; navigator.getGamepads = () => [pad]; window.__name = window.__name || function (f) { return f; }; })()`;
const b = await chromium.launch({ executablePath: chromiumExe(), args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); await ctx.addInitScript(PAD_INIT);
const p = await ctx.newPage(); const errors: string[] = []; const logs: string[] = [];
p.on('console', (m) => { const t = m.text(); if (/DUNK-HAND|HANDS\] handoff|DUNK-LAUNCH|\[HANDS\]/.test(t)) logs.push(t.slice(0, 160)); if (m.type() === 'error' && !/401|favicon|gamepad/.test(t)) errors.push(t.slice(0, 200)); });
p.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 200)));
const pad = (js: string) => p.evaluate(`(() => { const p = window.__PAD; ${js}; p.timestamp = performance.now(); })()`);
await p.goto('http://127.0.0.1:3011/dev/mode/dunkduel', { waitUntil: 'domcontentloaded', timeout: 180000 });
await p.waitForSelector('canvas', { timeout: 120000 });
await p.waitForFunction(() => document.body.innerText.includes('· ready'), null, { timeout: 180000 });
await pad('p.buttons[0].pressed = true; p.buttons[0].value = 1'); await p.waitForTimeout(80); await pad('p.buttons[0].pressed = false; p.buttons[0].value = 0');
await p.waitForFunction(() => document.body.innerText.includes('· playing'), null, { timeout: 30000 }); await p.waitForTimeout(3000);
await pad('p.axes[1] = -1; p.buttons[7].pressed = true; p.buttons[7].value = 1');
const shots: Buffer[] = []; const sides: string[] = [];
const side = async () => p.evaluate(`(() => { const s = window.__FEL_DEV__.scene, b = s.getMeshByName('duel_ball'), h = window.__FEL_DEV__.hero(); if (!b || !h) return '?'; const bp = b.getAbsolutePosition(); return (bp.x - h.position.x).toFixed(2) + '@' + (b.parent ? b.parent.name.replace(/_c\\d+$/, '') : 'free'); })()`) as Promise<string>;
for (let i = 0; i < 16; i++) { await p.waitForTimeout(220); if (i === 6) await pad('p.axes[1] = 0; p.buttons[7].pressed = false; p.buttons[7].value = 0'); if (i === 10) { await pad('p.buttons[0].pressed = true; p.buttons[0].value = 1'); } if (i === 11) await pad('p.buttons[0].pressed = false; p.buttons[0].value = 0'); sides.push(await side()); shots.push(await sharp(await p.screenshot({ type: 'png' })).resize(400, 250).png().toBuffer()); }
console.log('ball x − body x @ parent (facing the rim, negative = the body\'s RIGHT):', sides.join('  '));
await sharp({ create: { width: 1600, height: 1000, channels: 3, background: '#111' } }).composite(shots.map((input, i) => ({ input, left: (i % 4) * 400, top: Math.floor(i / 4) * 250 }))).png().toFile(`${OUT}/duel-sheet.png`);
console.log(logs.slice(0, 20).join('\n')); console.log('errors', errors.slice(0, 5));
await b.close();
