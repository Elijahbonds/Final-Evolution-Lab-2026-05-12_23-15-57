// DUNK-VENICE-ENV-RENDER — boot /dev/mode/<MODE> (default dunk), wait for the venue to settle, print EVAL's result and the
// console errors. EVAL is an expression string evaluated in the page (`s` is window.__FEL_DEV__.scene). BASE, QUERY, WAIT (ms),
// SHOT (a PNG path for the settled frame).
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';
const BASE = process.env.BASE ?? 'http://localhost:3100';
setTimeout(() => { console.log('EVAL timed out'); process.exit(2); }, 300000);
const b = await chromium.launch({ executablePath: chromiumExe(), args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });   // uncapped: a frame-rate read is a cost read
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs: string[] = [];
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
p.on('pageerror', (e) => errs.push(`pageerror: ${String(e).slice(0, 300)}`));
await p.goto(`${BASE}/dev/mode/${process.env.MODE ?? 'dunk'}${process.env.QUERY ? `?${process.env.QUERY}` : ''}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
await p.waitForFunction('!!(window.__FEL_DEV__ && window.__FEL_DEV__.scene)', undefined, { timeout: 240000 });
await p.waitForFunction('/playing|countdown/.test(document.body.innerText)', undefined, { timeout: 240000 }).catch(() => {});
await p.waitForTimeout(Number(process.env.WAIT ?? 9000));
const out = await p.evaluate(`(() => { const s = window.__FEL_DEV__.scene; return (${process.env.EVAL ?? 's.meshes.length'}); })()`);
console.log(typeof out === 'string' ? out : JSON.stringify(out, null, 1));
if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT });
console.log('--- console errors/warnings:'); for (const e of errs) console.log(e);
await b.close(); process.exit(0);
