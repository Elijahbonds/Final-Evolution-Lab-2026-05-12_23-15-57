// top-down (and optional oblique) frame of a mode's venue: swaps in a FreeCamera above the origin after the wake
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';
const BASE = process.env.BASE ?? 'http://127.0.0.1:3061';
const MODE = process.env.MODE ?? 'derby';
const OUT = process.env.OUT ?? `${process.env.HOME}/Claude/outbox/shared-place-floor/scratch`;
const H = Number(process.env.H ?? 60), TZ = Number(process.env.TZ ?? 0), OBL = process.env.OBL ? Number(process.env.OBL) : 0;
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: chromiumExe(), args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto(`${BASE}/dev/mode/${MODE}${process.env.QUERY ? `?${process.env.QUERY}` : ''}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
await p.waitForSelector('canvas', { timeout: 240000 });
await p.waitForTimeout(9000);
await p.keyboard.press('Space'); await p.waitForTimeout(1500);
const info = await p.evaluate(`(() => {
  const s = window.__FEL_DEV__.scene; const old = s.activeCamera; const V = old.position.constructor;
  const Free = s.cameras.find(c => c.getClassName() === 'FreeCamera' || c.getClassName() === 'UniversalCamera');
  let cam;
  const Ctor = Object.getPrototypeOf(old).constructor;
  cam = new Ctor('__top', new V(0, ${H}, ${TZ} - ${OBL}), s);
  if (cam.setTarget) cam.setTarget(new V(0, 0, ${TZ})); else { cam.target = new V(0, 0, ${TZ}); cam.alpha = -Math.PI/2; cam.beta = 0.01; cam.radius = ${H}; }
  cam.maxZ = 5000; cam.minZ = 0.5; cam.fov = 1.0;
  s.activeCamera = cam; window.__topcam = cam;
  s.onBeforeRenderObservable.add(() => { if (s.activeCamera !== cam) s.activeCamera = cam; });
  return old.getClassName();
})()`);
await p.evaluate(`(() => { const c = document.querySelector('canvas'); for (const el of document.body.querySelectorAll('*')) { if (el !== c && !el.contains(c)) el.style.visibility = 'hidden'; } })()`);
await p.waitForTimeout(1500);
const f = `${OUT}/${MODE}${process.env.SUFFIX ?? ''}-top.png`;
await p.screenshot({ path: f });
console.log(info, f);
await b.close();
