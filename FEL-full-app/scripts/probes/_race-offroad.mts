// What happens when you leave the course? A racer that lets you drive into the void, or strands you there, is a
// killjoy whatever the lap times say. Drive straight off and watch: speed, progress, and whether anything rescues you.
import { chromium } from 'playwright-core';
const PORT = process.env.PORT ?? '3011';
const MODE = process.env.MODE ?? 'kart';
const SEAM = MODE === 'kart' ? 'kart' : 'aero';
const EXE = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle','--use-angle=metal','--enable-webgl','--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 1200, height: 760 } })).newPage();
const logs: string[] = [];
p.on('console', (m) => { const t = m.text().slice(0, 130); if (/\[RACE\]|\[KART\]|\[AERO\]|rescue|reset|OFF/i.test(t)) logs.push(t); });
await p.goto(`http://localhost:${PORT}/dev/mode/${MODE === 'kart' ? 'velocitykart' : 'aeroaces'}`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 90000 });
await p.waitForFunction((s) => !!(window as any).__FEL_DEV__?.scene?.metadata?.[s], SEAM, { timeout: 180000 }).catch(()=>{});
await p.waitForTimeout(2500);
await p.evaluate(`(() => { const pad={index:0,id:'fake (STANDARD GAMEPAD)',connected:true,mapping:'standard',axes:[0,0,0,0],timestamp:0,buttons:Array.from({length:17},()=>({pressed:false,touched:false,value:0}))}; window.__PAD=pad; navigator.getGamepads=()=>[pad];
  window.__S = (s) => { const m = window.__FEL_DEV__?.scene?.metadata?.[s]; return m ? m.state() : null; }; })()`);
const set = async (js: string) => { await p.evaluate(`(() => { const p=window.__PAD; ${js}; p.timestamp=performance.now(); })()`).catch(()=>{}); };
const st = async (): Promise<any> => p.evaluate(`window.__S(${JSON.stringify(SEAM)})`).catch(() => null);

await set('p.buttons[0].pressed=true;p.buttons[0].value=1'); await p.waitForTimeout(110);
await set('p.buttons[0].pressed=false;p.buttons[0].value=0');
await p.waitForTimeout(2500);

console.log('  t     speed  along   lateral  onRoad  y');
const row = async (t: string) => { const s = await st(); if (s) console.log(`${t.padStart(5)}  ${String(s.speed).padStart(5)}  ${String(s.along).padStart(6)}  ${String(s.lateral).padStart(7)}  ${String(s.onRoad ?? '-').padEnd(6)}  ${s.pos ? s.pos.y.toFixed(1) : '-'}`); return s; };
// 4 s on the road
await set('p.buttons[7].pressed=true;p.buttons[7].value=1');
for (let i = 0; i < 4; i++) { await row(`${i}`); await p.waitForTimeout(1000); }
// hard off to the right, throttle still pinned
console.log('  --- steering hard off the course ---');
await set('p.axes[0]=1');
for (let i = 4; i < 12; i++) { await row(`${i}`); await p.waitForTimeout(1000); }
// straighten up and try to keep driving in the void
console.log('  --- straight ahead, off the course ---');
await set('p.axes[0]=0');
for (let i = 12; i < 30; i++) { await row(`${i}`); await p.waitForTimeout(1000); }
console.log('\n  logs: ' + (logs.slice(-10).join(' | ') || 'none'));
await p.screenshot({ path: `/tmp/offroad-${MODE}.png` });
await b.close();
