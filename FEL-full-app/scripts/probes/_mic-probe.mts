// THE MIC (2026-09-24) — plays a mode on a fake pad and RECORDS WHAT IT SOUNDS LIKE: the game's own output (tapped after the
// limiter, so the MC through the court's PA, the crowd ducking under him, the players, the sound effects), written as an .m4a to
// the outbox next to the mic's log (every cue: who, which clips, played or caption-only) and any page errors.
//
//   BASE=http://127.0.0.1:3011 MODE=dunk COURT=venice SEC=40 TAG=venice node node_modules/tsx/dist/cli.mjs scripts/probes/_mic-probe.mts
//
// MODE=dunk drives attempts (run, jump, a windmill, SLAM on NOW!); the other modes are woken and left to the mic's intro,
// filler and whatever the AI does (MODE=onevone|threevthree|threepoint|carnival|dunkduel).
import { chromium, type Page } from 'playwright-core';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3011';
const MODE = process.env.MODE ?? 'dunk';
const COURT = process.env.COURT ?? 'venice';
const SEC = Number(process.env.SEC ?? 40);
const TAG = process.env.TAG ?? `${MODE}-${COURT}`;
const OUT = `${process.env.HOME}/Claude/outbox/finish-release/mic/probe`;
fs.mkdirSync(OUT, { recursive: true });

const PAD_INIT = `(() => {
  const pad = { index: 0, id: 'fake-dualshock (STANDARD GAMEPAD)', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad; navigator.getGamepads = () => [pad];
  window.__name = window.__name || function (f) { return f; };
})()`;
// the tap: a ScriptProcessor on the limiter's output, copying both channels (downmixed) into chunks the probe pulls
const TAP = `(() => {
  const g = window.__FEL_DEV__ && window.__FEL_DEV__.audio && window.__FEL_DEV__.audio();
  if (!g) return 'no graph';
  if (window.__tap) return 'tapped';
  const sp = g.ctx.createScriptProcessor(4096, 2, 2);
  const T = window.__tap = { chunks: [], rate: g.ctx.sampleRate };
  sp.onaudioprocess = (e) => {
    const a = e.inputBuffer.getChannelData(0), b = e.inputBuffer.numberOfChannels > 1 ? e.inputBuffer.getChannelData(1) : a;
    const m = new Float32Array(a.length); for (let i = 0; i < a.length; i++) m[i] = (a[i] + b[i]) * 0.5; T.chunks.push(m);
  };
  g.out.connect(sp); sp.connect(g.ctx.destination);
  window.__tapTake = () => { const n = T.chunks.reduce((s, c) => s + c.length, 0), i16 = new Int16Array(n); let o = 0;
    for (const c of T.chunks) for (let i = 0; i < c.length; i++) i16[o++] = Math.max(-32768, Math.min(32767, c[i] * 32767));
    T.chunks = []; let s = ''; const u8 = new Uint8Array(i16.buffer); for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  return 'ok ' + g.ctx.state + ' ' + g.ctx.sampleRate;
})()`;

async function padSet(p: Page, js: string): Promise<void> { await p.evaluate(`(() => { const p = window.__PAD; ${js}; p.timestamp = performance.now(); })()`); }
async function tap(p: Page, btn: number, ms = 70): Promise<void> { await padSet(p, `p.buttons[${btn}].pressed = true; p.buttons[${btn}].value = 1`); await p.waitForTimeout(ms); await padSet(p, `p.buttons[${btn}].pressed = false; p.buttons[${btn}].value = 0`); }
const text = async (p: Page): Promise<string> => p.evaluate('document.body.innerText') as Promise<string>;

const b = await chromium.launch({ executablePath: chromiumExe(), args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript(PAD_INIT);
const p = await ctx.newPage();
const errors: string[] = [], bankLoads: string[] = [];
p.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/status of 401|favicon|gamepad/.test(t)) errors.push(t.slice(0, 200)); });
p.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 200)));
p.on('response', (r) => { if (r.url().includes('/audio/voice/')) bankLoads.push(`${r.status()} ${r.url().split('/audio/voice/v1/')[1]}`); });
await p.goto(`${BASE}/dev/mode/${MODE}?location=${COURT}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
await p.waitForSelector('canvas', { timeout: 120000 });
await p.waitForFunction(() => document.body.innerText.includes('· ready'), null, { timeout: 180000 });
console.log('tap:', await p.evaluate(TAP));
await tap(p, 0);   // wake: the first press also unlocks the audio context
await p.waitForFunction(() => document.body.innerText.includes('· playing'), null, { timeout: 30000 });
console.log('tap:', await p.evaluate(TAP));
const t0 = Date.now();
// SNAP=n: a screenshot the first n times the MC's caption is on screen (the lower third, checked by eye)
let snaps = 0, snapBusy = false;
const snapTimer = setInterval(() => {
  if (snaps >= Number(process.env.SNAP ?? 0) || snapBusy) return;
  snapBusy = true;
  void (async () => {
    try {
      const on = await p.evaluate(`(() => { try { const h = JSON.parse(document.querySelector('pre').textContent || '{}'); return typeof h.mic === 'string' && h.mic.length > 0 && !/CROWD/.test(h.micWho || ''); } catch (e) { return false; } })()`);
      if (on) { snaps++; await p.screenshot({ path: `${OUT}/${TAG}-caption-${snaps}.png` }); await p.waitForTimeout(2500); }
    } catch { /* the page is closing */ }
    snapBusy = false;
  })();
}, 250);
if (MODE === 'dunk') {
  await p.waitForTimeout(9000);   // the welcome, Flight Night, tonight's rival
  for (let attempt = 0; attempt < 2 && Date.now() - t0 < SEC * 1000 - 12000; attempt++) {
    { const w0 = Date.now(); while (Date.now() - w0 < 30000 && !/HOLD to run|FINAL ROUND/.test(await text(p))) await p.waitForTimeout(150); }
    await p.waitForTimeout(600);
    await padSet(p, 'p.axes[1] = -1; p.buttons[7].pressed = true; p.buttons[7].value = 1');
    await p.waitForTimeout(1500);
    await padSet(p, 'p.axes[1] = 0; p.buttons[7].pressed = false; p.buttons[7].value = 0');
    await p.waitForTimeout(120);
    await padSet(p, 'p.buttons[12].pressed = true; p.buttons[12].value = 1'); await p.waitForTimeout(80); await tap(p, 0, 60); await padSet(p, 'p.buttons[12].pressed = false; p.buttons[12].value = 0');   // the windmill
    await p.evaluate(`(() => { const t0 = performance.now(); const hud = () => { try { return JSON.parse(document.querySelector('pre').textContent || '{}'); } catch (e) { return {}; } };
      const tick = () => { if (performance.now() - t0 > 4000) return; if (hud().hint !== 'NOW!') { requestAnimationFrame(tick); return; }
        const b = window.__PAD.buttons[0]; b.pressed = true; b.value = 1; window.__PAD.timestamp = performance.now(); setTimeout(() => { b.pressed = false; b.value = 0; window.__PAD.timestamp = performance.now(); }, 60); }; requestAnimationFrame(tick); })()`);
    await p.waitForTimeout(12000);   // the call, the judges, the number, the next one up
  }
}
while (Date.now() - t0 < SEC * 1000) await p.waitForTimeout(500);
clearInterval(snapTimer); while (snapBusy) await p.waitForTimeout(100);
const b64 = await p.evaluate('window.__tapTake ? window.__tapTake() : ""') as string;
const rate = await p.evaluate('window.__tap ? window.__tap.rate : 48000') as number;
const mic = await p.evaluate('window.__FEL_MIC__ || []') as { t: number; cast: string; clips: string[]; caption: string; played: boolean }[];
await b.close();

const pcm = Buffer.from(b64, 'base64');
const wav = Buffer.alloc(44 + pcm.length);
wav.write('RIFF', 0); wav.writeUInt32LE(36 + pcm.length, 4); wav.write('WAVE', 8); wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(pcm.length, 40);
pcm.copy(wav, 44);
const wavPath = `${OUT}/${TAG}.wav`, m4aPath = `${OUT}/${TAG}.m4a`;
fs.writeFileSync(wavPath, wav);
execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '96000', wavPath, m4aPath]);
fs.unlinkSync(wavPath);
let peak = 0, sq = 0; const n = pcm.length / 2; for (let i = 0; i < n; i++) { const v = pcm.readInt16LE(i * 2) / 32768; peak = Math.max(peak, Math.abs(v)); sq += v * v; }
console.log(`── audio: ${(n / rate).toFixed(1)} s at ${rate} Hz, peak ${(20 * Math.log10(peak || 1e-9)).toFixed(1)} dBFS, rms ${(10 * Math.log10(sq / Math.max(1, n) || 1e-12)).toFixed(1)} dBFS → ${m4aPath}`);
console.log(`── banks: ${bankLoads.length} requests, ${bankLoads.filter((x) => !x.startsWith('200')).length} not 200`); for (const x of bankLoads.filter((x) => !x.startsWith('200'))) console.log('  ', x);
console.log(`── the mic: ${mic.length} cues, ${mic.filter((m) => m.played).length} played`);
for (const m of mic) console.log(`   ${m.played ? '♪' : '·'} ${m.cast.padEnd(10)} ${m.caption.slice(0, 110)}`);
console.log('── errors', errors.length ? errors.slice(0, 6) : 'none');
fs.writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify({ mic, bankLoads, errors }, null, 1));
