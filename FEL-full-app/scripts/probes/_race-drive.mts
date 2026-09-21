// Drive Aero Aces and Velocity Kart with a real pad and write down what actually happens.
// Owner: "fix the aero ace and karting modes, 10 phase visual and mechanics, physics pass" — handling, looks, race, crashes.
import { chromium } from 'playwright-core';
const PORT = process.env.PORT ?? '3011';
const MODE = process.env.MODE ?? 'kart';
const SEAM = MODE === 'kart' ? 'kart' : 'aero';
const SECS = Number(process.env.SECS ?? 70);
const EXE = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle','--use-angle=metal','--enable-webgl','--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 1280, height: 780 } })).newPage();
const errs: string[] = [], warns: string[] = [], logs: string[] = [];
p.on('console', (m) => { const t = m.text().slice(0, 160); if (m.type() === 'error') errs.push(t); else if (m.type() === 'warning') warns.push(t); else if (/\[RACE\]|\[KART\]|\[AERO\]/.test(t)) logs.push(t); });
p.on('pageerror', (e) => errs.push('PAGEERROR ' + String(e).slice(0, 160)));
p.on('requestfailed', (r) => errs.push('REQFAIL ' + r.url().slice(-80)));

await p.goto(`http://localhost:${PORT}/dev/mode/${MODE === 'kart' ? 'velocitykart' : 'aeroaces'}`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 90000 });
await p.waitForFunction((s) => !!(window as any).__FEL_DEV__?.scene?.metadata?.[s], SEAM, { timeout: 180000 }).catch(() => {});
await p.waitForTimeout(2500);

await p.evaluate(`(() => { const pad={index:0,id:'fake (STANDARD GAMEPAD)',connected:true,mapping:'standard',axes:[0,0,0,0],timestamp:0,buttons:Array.from({length:17},()=>({pressed:false,touched:false,value:0}))}; window.__PAD=pad; navigator.getGamepads=()=>[pad];
  window.__S = (s) => { const m = window.__FEL_DEV__?.scene?.metadata?.[s]; return m ? m.state() : null; };
  window.__FPS = () => { const e = window.__FEL_DEV__?.scene?.getEngine?.(); return e ? Math.round(e.getFps()) : 0; };
})()`);
const set = async (js: string) => { await p.evaluate(`(() => { const p=window.__PAD; ${js}; p.timestamp=performance.now(); })()`).catch(()=>{}); };
const st = async (): Promise<any> => p.evaluate(`window.__S(${JSON.stringify(SEAM)})`).catch(() => null);

// START
await set('p.buttons[0].pressed=true;p.buttons[0].value=1'); await p.waitForTimeout(110);
await set('p.buttons[0].pressed=false;p.buttons[0].value=0');
await p.waitForTimeout(2000);

// THROTTLE PINNED, steering follows the line: turn toward the course tangent each sample. A probe that drives
// straight only ever measures the first wall.
const rows: any[] = [];
let steer = 0;
for (let i = 0; i < SECS * 5; i++) {
  const s = await st();
  if (s) {
    // steer toward the line's tangent (both seams report heading and a tangent yaw / vector)
    const tan = s.tangentYaw != null ? s.tangentYaw : (s.tangent ? Math.atan2(s.tangent.x, s.tangent.z) : s.heading);
    let d = tan - s.heading; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    // pull back toward the centre of the corridor as well as toward the tangent
    const lat = s.lateral ?? 0;
    steer = Math.max(-1, Math.min(1, d * 1.8 - lat * 0.25));
    rows.push({ t: +(i / 5).toFixed(1), speed: s.speed, along: s.along, lat: +(lat).toFixed(2), lap: s.lap ?? null,
      place: s.place, onRoad: s.onRoad ?? null, y: s.pos ? +s.pos.y.toFixed(1) : null, fps: await p.evaluate('window.__FPS()') });
  }
  await set(`p.axes[0]=${steer.toFixed(3)};p.buttons[7].pressed=true;p.buttons[7].value=1`);
  await p.waitForTimeout(200);
  if (s && (s.finished || s.done)) { console.log(`finished at t=${(i / 5).toFixed(1)}s`); break; }
}

const num = (k: string) => rows.map((r) => r[k]).filter((v) => typeof v === 'number');
const stat = (k: string) => { const v = num(k); if (!v.length) return 'n/a'; const s = [...v].sort((a, b) => a - b); return `min ${s[0]} p50 ${s[Math.floor(s.length / 2)]} max ${s[s.length - 1]}`; };
console.log(`\n=== ${MODE.toUpperCase()} — ${rows.length} samples over ${(rows.length / 5).toFixed(0)}s`);
console.log(`  speed    ${stat('speed')}`);
console.log(`  fps      ${stat('fps')}`);
console.log(`  lateral  ${stat('lat')}   (corridor half-width is the budget)`);
console.log(`  along    first ${rows[0]?.along} last ${rows[rows.length - 1]?.along}`);
const stuck = rows.filter((r, i) => i > 4 && Math.abs(r.along - rows[i - 1].along) < 0.5);
console.log(`  stalled samples (no progress): ${stuck.length} / ${rows.length}`);
const off = rows.filter((r) => r.onRoad === false).length;
if (rows.some((r) => r.onRoad !== null)) console.log(`  off-road samples: ${off} / ${rows.length}`);
console.log(`  laps seen: ${[...new Set(rows.map((r) => r.lap).filter((v) => v != null))].join(', ') || 'n/a'}`);
console.log(`  place: ${[...new Set(rows.map((r) => r.place))].join(' → ')}`);
console.log(`\n  errors ${errs.length}: ${[...new Set(errs)].slice(0, 6).join(' | ') || 'none'}`);
console.log(`  warns  ${warns.length}: ${[...new Set(warns)].slice(0, 4).join(' | ') || 'none'}`);
console.log(`  race log (last 8): ${logs.slice(-8).join(' | ') || 'none'}`);
await p.screenshot({ path: `/tmp/race-${MODE}.png` });
const final = await st(); console.log('\n  final: ' + JSON.stringify(final).slice(0, 600));
await b.close();
