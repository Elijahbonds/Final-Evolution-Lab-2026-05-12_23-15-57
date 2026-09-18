import { chromium } from 'playwright-core';
import { chromiumExe } from '/Users/elijahbonds/Developer/FEL-swarm/mode-lanes/wt-finish-release/FEL-full-app/scripts/probes/_chromium.mts';
const b = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-gl=angle'] });
const p = await b.newPage();
await p.goto('http://127.0.0.1:3098/dev/mode/skateboard?agent=1', { waitUntil: 'domcontentloaded', timeout: 180000 });
for (let i = 0; i < 120; i++) { if (await p.evaluate(() => !!(window as any).__FEL_DEV__?.hero && !!(window as any).__FEL_DEV__.hero())) break; await p.waitForTimeout(1000); }
await p.waitForTimeout(1500);
const out = await p.evaluate(() => { const s = (window as any).__FEL_DEV__.scene; return s.meshes.filter((m: any) => /spine|pyramid|wallride|wall|bank|solid|fence/i.test(m.name) && m.getTotalVertices() > 0).map((m: any) => { m.computeWorldMatrix(true); const bb = m.getBoundingInfo().boundingBox; const a = bb.minimumWorld, c = bb.maximumWorld; return `${m.name}: x ${a.x.toFixed(1)}..${c.x.toFixed(1)} y ${a.y.toFixed(2)}..${c.y.toFixed(2)} z ${a.z.toFixed(1)}..${c.z.toFixed(1)}`; }); });
console.log(out.join('\n'));
await b.close();
