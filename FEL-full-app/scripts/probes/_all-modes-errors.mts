// EVERY MODE, BOOTED, LISTENING FOR TROUBLE (owner: "fix any error or killjoy during gameplay for all game modes").
//
// Boots each registered mode in the dev harness, waits for it to come up, drives a few seconds of input, and
// reports what the page complained about. A killjoy is not only an exception: a mode that never boots, a texture
// that 404s, a WebGL warning storm, or a mode that boots and then does nothing are all things a player feels.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

/** Read the enabled list from the registry's SOURCE — importing it pulls the whole engine into node. */
function enabledModes(): string[] {
  const src = readFileSync(new URL('../../lib/babylon/modes/registry.ts', import.meta.url), 'utf8');
  const block = src.slice(src.indexOf('ENABLED_BABYLON_MODES'));
  const body = block.slice(block.indexOf('['), block.indexOf(']'));
  return [...body.matchAll(/'([a-zA-Z0-9_-]+)'/g)].map((m) => m[1]);
}

const PORT = process.env.PORT ?? '3011';
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const EXE = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

const modes = (ONLY ?? enabledModes()).sort();
const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle','--use-angle=metal','--enable-webgl','--ignore-gpu-blocklist'] });

interface Row { mode: string; booted: boolean; errors: string[]; warns: string[]; missing: string[]; note: string }
const rows: Row[] = [];

for (const mode of modes) {
  const ctx = await b.newContext({ viewport: { width: 1100, height: 700 } });
  const p = await ctx.newPage();
  const errors: string[] = [], warns: string[] = [], missing: string[] = [];

  p.on('pageerror', (e) => errors.push(String(e).split('\n')[0].slice(0, 150)));
  p.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error') {
      if (/status of 401|Unauthorized/.test(t)) return;   // see the response handler: no session in /dev/mode
      errors.push(t.slice(0, 150));
    }
    else if (m.type() === 'warning' && !/DevTools|source map|Download the React/i.test(t)) warns.push(t.slice(0, 120));
  });
  // A 401 is the dev harness having no session, not a broken mode — /dev/mode boots without signing in, so the
  // season, closet and scan calls are expected to be refused. Anything else is real.
  p.on('response', (r) => {
    if (r.status() < 400 || r.status() === 401 || /favicon/.test(r.url())) return;
    missing.push(`${r.status()} ${r.url().split('/').slice(-1)[0].slice(0, 60)}`);
  });

  let booted = false, note = '';
  try {
    await p.goto(`http://localhost:${PORT}/dev/mode/${mode}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForSelector('canvas', { timeout: 60000 });
    booted = await p.waitForFunction(() => !!(window as any).__FEL_DEV__?.hero?.() || !!document.querySelector('canvas'), null, { timeout: 60000 }).then(() => true).catch(() => false);
    await p.waitForTimeout(2500);

    // a few seconds of real input, because plenty of trouble only shows once something moves
    await p.evaluate(`(() => { const pad={index:0,id:'fake (STANDARD GAMEPAD)',connected:true,mapping:'standard',axes:[0,0,0,0],timestamp:0,buttons:Array.from({length:17},()=>({pressed:false,touched:false,value:0}))}; window.__PAD=pad; navigator.getGamepads=()=>[pad]; })()`);
    const set = async (js: string) => { await p.evaluate(`(() => { const p=window.__PAD; ${js}; p.timestamp=performance.now(); })()`).catch(()=>{}); };
    await set('p.buttons[0].pressed=true;p.buttons[0].value=1'); await p.waitForTimeout(100);
    await set('p.buttons[0].pressed=false;p.buttons[0].value=0'); await p.waitForTimeout(1500);
    await set('p.axes[1]=-1'); await p.waitForTimeout(1200);
    await set('p.buttons[7].pressed=true;p.buttons[7].value=1'); await p.waitForTimeout(900);
    await set('p.buttons[0].pressed=true;p.buttons[0].value=1'); await p.waitForTimeout(120);
    await set('p.buttons[0].pressed=false;p.buttons[0].value=0'); await p.waitForTimeout(1600);
    await set('p.axes[1]=0;p.buttons[7].pressed=false;p.buttons[7].value=0');

    const txt = await p.evaluate(`document.body.innerText.slice(0, 200)`).catch(() => '');
    if (/went wrong|recovery|Something broke/i.test(txt)) note = 'ERROR BOUNDARY';
    else if (!/playing|READY|· /i.test(txt)) note = 'no HUD text';
  } catch (e) {
    note = 'boot failed: ' + String(e).split('\n')[0].slice(0, 80);
  }

  const uniq = (a: string[]) => [...new Set(a)];
  rows.push({ mode, booted, errors: uniq(errors).slice(0, 4), warns: uniq(warns).slice(0, 2), missing: uniq(missing).slice(0, 3), note });
  const bad = errors.length + missing.length;
  console.log(`${bad || note ? '✗' : '·'} ${mode.padEnd(18)} ${booted ? 'boot' : 'NOBOOT'}  err ${String(uniq(errors).length).padStart(2)}  404 ${String(uniq(missing).length).padStart(2)}  ${note}`);
  await ctx.close();
}

console.log('\n================ TROUBLE ================');
for (const r of rows) {
  if (!r.errors.length && !r.missing.length && !r.note && r.booted) continue;
  console.log(`\n${r.mode}${r.booted ? '' : '  [DID NOT BOOT]'}${r.note ? '  [' + r.note + ']' : ''}`);
  r.errors.forEach((e) => console.log('   err  ' + e));
  r.missing.forEach((m) => console.log('   404  ' + m));
  r.warns.forEach((w) => console.log('   warn ' + w));
}
const clean = rows.filter((r) => r.booted && !r.errors.length && !r.missing.length && !r.note).length;
console.log(`\n${clean}/${rows.length} modes clean.`);
await b.close();
