// THE MIC, 3PT BY PLAYING (2026-09-24) — _mic-probe.mts for the shootout, but the run SHOOTS: a fake pad plays a whole 60 s
// qualifying run off the meter (the HUD's `meter` 0..1, the sweet spot SHOT_TARGET with its perfect/good bands) — mostly on the
// sweet spot, badly on purpose where the plan says so — so makes, misses, money balls, streaks, a cold spell, the last rack, the
// ten-second call and (when the timing allows) a buzzer beater all happen. It records the game's own output (.m4a, tapped after
// the limiter), every mic cue the page played (the page's __FEL_MIC__ ring only holds 80, so it is copied as it fills), the
// mode's own [3PT-*] console beats on the page clock, and then checks the calls against the play:
//   - each shot's call, decided at the release and spoken AT THE RIM (the landing beat), is the one micShotCall would pick
//     for that shot (the make/miss, the streak, the miss run, the money ball);
//   - the rack, last-rack, money-ball-up, clock, results and advance/out calls each came where the play put them;
//   - an expected call that is missing is classed: the booth was busy with an equal/bigger call (the director's rule — let
//     it go / queue it) or the booth was FREE (a defect);
//   - every cue played (not caption-only), no page errors.
//
//   BASE=http://127.0.0.1:3011 MODE=threepoint COURT=orbit SEC=75 SNAP=2 TAG=3pt-orbit-shoot node node_modules/tsx/dist/cli.mjs scripts/probes/_mic-3pt-probe.mts
//
// PLAN=GGGGGBBBGG… overrides the per-shot plan (G = on the sweet spot, B = early, a brick). The last seconds are played for
// the buzzer: with 2 s on the clock a sweet-spot shot waits for the last second so a make is in the air at the horn.
import { chromium, type Page } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3011';
const MODE = process.env.MODE ?? 'threepoint';
const COURT = process.env.COURT ?? 'orbit';
const SEC = Number(process.env.SEC ?? 75);
const TAG = process.env.TAG ?? `3pt-${COURT}-shoot`;
const OUT = `${process.env.HOME}/Claude/outbox/finish-release/mic/probe`;
const VOICE = path.join(process.cwd(), 'public/audio/voice/v1');
fs.mkdirSync(OUT, { recursive: true });
if (MODE !== 'threepoint') throw new Error('this probe plays the shootout only (MODE=threepoint)');

// The shots, in order: rack 1 clean (streak, streak, fire — under the welcome), rack 2 opens with three bricks (the cold
// spell) then two makes (the money ball), rack 3 runs the streak to five again (fire) then a brick and a money make, rack 4
// mixes (a bricked money ball: the groan), rack 5 clean. Spares after 25 in case a press is lost.
const PLAN = (process.env.PLAN ?? 'GGGGG' + 'BBBGG' + 'GGGBG' + 'GBGGB' + 'GGGGG' + 'GGGGG').toUpperCase();
const T = 0.72;   // core/shootoutHud SHOT_TARGET (the bands: perfect ±0.06, good ±0.16)

const PAD_INIT = `(() => {
  const pad = { index: 0, id: 'fake-dualshock (STANDARD GAMEPAD)', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad; navigator.getGamepads = () => [pad];
  window.__name = window.__name || function (f) { return f; };
  // the mode's own beats on the page clock: [3PT-RIM] ring (the release decided), [3PT-JUICE] (the ball at the rim), [3PT-SHOT]
  // (the release frame, with the signed meter error), [MIC] (a cue started)
  const EVT = window.__EVT = [];
  const info = console.info.bind(console);
  console.info = (...a) => {
    try {
      const s = String(a[0] ?? '');
      if (/^\\[(3PT|MIC)/.test(s)) {
        const t = Math.round(performance.now());
        EVT.push({ t, m: s.slice(0, 180) });
        const D = window.__DRV;
        if (D && s.startsWith('[3PT-RIM] ring')) {   // a press became a shot
          const p = D.pending || {};
          D.shots.push({ ...p, tFire: t, made: /ring YES/.test(s) });
          D.fired++; D.pending = null; D.armed = false;
        }
        const e = D && /^\\[3PT-SHOT\\] follow-through .*\\(err (-?[0-9.]+)\\)/.exec(s);
        if (e) {   // the release frame: where the bar was at the press, so the lead is learnt from the game's own grade
          const last = D.shots[D.shots.length - 1];
          if (last && last.err === undefined) {
            last.err = Number(e[1]); last.barAtFire = ${T} + last.err;
            let d = last.barAtFire - last.m; if (d < -0.5) d += 1; if (d > 0.5) d -= 1;
            if (Math.abs(d) < 0.15) D.lead = D.lead * 0.6 + d * 0.4;
          }
        }
      }
    } catch (e) { /* never break the page's logging */ }
    return info(...a);
  };
  // the mic's ring (80 cues) is copied as it fills
  window.__MICALL = [];
  const seen = new WeakSet();
  setInterval(() => { for (const c of (window.__FEL_MIC__ || [])) if (!seen.has(c)) { seen.add(c); window.__MICALL.push(c); } }, 100);
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
// the shooter: every frame, reads the HUD; while a ball is loaded (meter non-null) it presses A where the plan says — the bar
// where the press will LAND is the meter plus a lead learnt from the game's own error readout (the pad is polled a frame on)
const DRIVER = `(() => {
  const T = ${T}, PLAN = ${JSON.stringify(PLAN)};
  const D = window.__DRV = { shots: [], hev: [], lead: 0.02, pending: null, fired: 0, stop: false, holds: 0, armed: true };
  const hud = () => { try { return JSON.parse(document.querySelector('pre').textContent || '{}'); } catch (e) { return null; } };
  const btn = (on) => { const b = window.__PAD.buttons[0]; b.pressed = on; b.value = on ? 1 : 0; window.__PAD.timestamp = performance.now(); };
  let last = {}, posted = false;
  const tick = () => {
    if (D.stop) return;
    const h = hud(), t = Math.round(performance.now());
    if (h) {
      const m = typeof h.meter === 'number' ? h.meter : null;
      if ((m !== null) !== !!last.on) D.hev.push({ t, k: m !== null ? 'up' : 'down', rack: h.rackIdx, ball: h.ballIdx, money: h.money, clock: h.clock, streak: h.streak });
      if (h.clock !== last.clock) D.hev.push({ t, k: 'clock', v: h.clock });
      if (h.banner && h.banner !== last.banner) D.hev.push({ t, k: 'banner', v: h.banner });
      if (h.round !== last.round) D.hev.push({ t, k: 'round', v: h.round });
      const board = Array.isArray(h.board) ? h.board : null;
      if (board && !posted && board.every((f) => f.score !== '—')) { posted = true; D.hev.push({ t, k: 'posted', v: board.map((f) => f.name + ' ' + f.score + ' ' + f.line).join(' | ') }); }
      if (!board) posted = false;
      last = { on: m !== null, clock: h.clock, banner: h.banner, round: h.round };
      if (m === null) D.armed = true;   // one press per loaded ball: the HUD's meter outlives the release by a render
      if (m !== null && !D.pending && D.armed) {
        const kind = PLAN[D.fired] || 'G';
        const p = m + D.lead;   // where the bar will be when the game reads the press
        let go = false;
        if (kind === 'B') go = p > 0.2 && p < 0.45;   // early: a brick (outside the good band, 4 % make)
        else {
          const waitForHorn = h.clock === 2;   // 1 < clock <= 2: hold, so the make is in the air at the horn
          if (waitForHorn && p >= T - 0.02 && p <= T + 0.04) D.holds++;
          go = !waitForHorn && p >= T - 0.02 && p <= T + 0.04;
        }
        if (go) { btn(true); D.pending = { t, m, kind, i: D.fired, lead: Number(D.lead.toFixed(3)), clock: h.clock, rack: h.rackIdx, ball: h.ballIdx, money: h.money, streakBefore: h.streak, round: h.round }; setTimeout(() => btn(false), 70); }
      }
      if (D.pending && t - D.pending.t > 500) { D.hev.push({ t, k: 'press-lost', v: JSON.stringify(D.pending) }); D.pending = null; }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return 'driver on, plan ' + PLAN;
})()`;

type Shot = { t: number; m: number; kind: string; i: number; lead: number; clock: number; rack: number; ball: number; money: boolean; streakBefore: number; round?: string; tFire: number; made: boolean; err?: number; barAtFire?: number };
type Hev = { t: number; k: string; v?: unknown; rack?: number; ball?: number; money?: boolean; clock?: number; streak?: number };
type Cue = { t: number; cast: string; clips: string[]; caption: string; played: boolean };
type RunData = { tPlaying: number; plan: string; mic: Cue[]; shots: Shot[]; hev: Hev[]; evt: { t: number; m: string }[]; holds: number; lead: number; loads: number; bankLoads: string[]; errors: string[]; audio: string };

async function padSet(p: Page, js: string): Promise<void> { await p.evaluate(`(() => { const p = window.__PAD; ${js}; p.timestamp = performance.now(); })()`); }
async function tap(p: Page, btn: number, ms = 70): Promise<void> { await padSet(p, `p.buttons[${btn}].pressed = true; p.buttons[${btn}].value = 1`); await p.waitForTimeout(ms); await padSet(p, `p.buttons[${btn}].pressed = false; p.buttons[${btn}].value = 0`); }

async function play(): Promise<RunData> {
  const b = await chromium.launch({ executablePath: chromiumExe(), args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(PAD_INIT);
  const p = await ctx.newPage();
  const errors: string[] = [], bankLoads: string[] = [];
  let loads = 0;
  p.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/status of 401|favicon|gamepad/.test(t)) errors.push(t.slice(0, 200)); });
  p.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 200)));
  p.on('load', () => { loads++; });   // a reload (HMR, a crash) would restart the run under the probe
  p.on('response', (r) => { if (r.url().includes('/audio/voice/')) bankLoads.push(`${r.status()} ${r.url().split('/audio/voice/v1/')[1]}`); });
  await p.goto(`${BASE}/dev/mode/${MODE}?location=${COURT}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await p.waitForSelector('canvas', { timeout: 120000 });
  await p.waitForFunction(() => document.body.innerText.includes('· ready'), null, { timeout: 180000 });
  console.log('tap:', await p.evaluate(TAP));
  await tap(p, 0);   // wake: the first press starts the clock and unlocks the audio context
  await p.waitForFunction(() => document.body.innerText.includes('· playing'), null, { timeout: 30000 });
  const tPlaying = await p.evaluate('Math.round(performance.now())') as number;
  console.log('tap:', await p.evaluate(TAP));
  await p.waitForTimeout(250);   // the wake press is released before the first shot
  console.log(await p.evaluate(DRIVER));
  const t0 = Date.now();
  // SNAP=n: a screenshot the first n times the MC's caption is on screen (the lower third, checked by eye)
  let snaps = 0, snapBusy = false;
  const snapTimer = setInterval(() => {
    if (snaps >= Number(process.env.SNAP ?? 0) || snapBusy) return;
    snapBusy = true;
    void (async () => {
      try {
        const on = await p.evaluate(`(() => { try { const h = JSON.parse(document.querySelector('pre').textContent || '{}'); return typeof h.mic === 'string' && h.mic.length > 0 && !/CROWD/.test(h.micWho || '') && typeof h.meter === 'number'; } catch (e) { return false; } })()`);
        if (on) { snaps++; await p.screenshot({ path: `${OUT}/${TAG}-caption-${snaps}.png` }); await p.waitForTimeout(6000); }
      } catch { /* the page is closing */ }
      snapBusy = false;
    })();
  }, 250);
  while (Date.now() - t0 < SEC * 1000) {
    await p.waitForTimeout(5000);
    const s = await p.evaluate('(() => { const D = window.__DRV; return D ? D.fired + " shots, " + D.shots.filter((x) => x.made).length + " made, lead " + D.lead.toFixed(3) : "no driver"; })()').catch(() => 'page gone');
    console.log(`  +${((Date.now() - t0) / 1000).toFixed(0)} s: ${s}`);
  }
  clearInterval(snapTimer); while (snapBusy) await p.waitForTimeout(100);
  await p.evaluate('window.__DRV && (window.__DRV.stop = true)');
  await p.waitForTimeout(150);   // the last copy of the mic ring
  const b64 = await p.evaluate('window.__tapTake ? window.__tapTake() : ""') as string;
  const rate = await p.evaluate('window.__tap ? window.__tap.rate : 48000') as number;
  const mic = await p.evaluate('window.__MICALL || []') as Cue[];
  const evt = await p.evaluate('window.__EVT || []') as { t: number; m: string }[];
  const drv = await p.evaluate('window.__DRV ? { shots: window.__DRV.shots, hev: window.__DRV.hev, holds: window.__DRV.holds, lead: window.__DRV.lead } : null') as
    { shots: Shot[]; hev: Hev[]; holds: number; lead: number } | null;
  await b.close();

  // ── the recording ─────────────────────────────────────────────────────────────────────────────────────────────────────
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
  const audio = `${(n / rate).toFixed(1)} s at ${rate} Hz, peak ${(20 * Math.log10(peak || 1e-9)).toFixed(1)} dBFS, rms ${(10 * Math.log10(sq / Math.max(1, n) || 1e-12)).toFixed(1)} dBFS → ${m4aPath}`;
  return { tPlaying, plan: PLAN, mic, shots: drv?.shots ?? [], hev: drv?.hev ?? [], evt, holds: drv?.holds ?? 0, lead: drv?.lead ?? 0, loads, bankLoads, errors, audio };
}

// ANALYZE=<a saved .json> re-checks a finished run (no browser); otherwise play one
const RUN: RunData = process.env.ANALYZE ? JSON.parse(fs.readFileSync(process.env.ANALYZE, 'utf8')) as RunData : await play();
const { tPlaying, mic, evt, bankLoads, errors } = RUN;

// ── the calls against the play ────────────────────────────────────────────────────────────────────────────────────────
// the rendered lines (moment + length) behind every clip id '<cast>/<line id>'
const LINES = new Map<string, { moment: string; sec: number }>();
for (const cast of fs.readdirSync(VOICE)) for (const f of fs.readdirSync(path.join(VOICE, cast)).filter((x) => x.endsWith('.json'))) {
  const j = JSON.parse(fs.readFileSync(path.join(VOICE, cast, f), 'utf8')) as { lines: { id: string; moment: string; sec: number }[] };
  for (const l of j.lines) LINES.set(`${cast}/${l.id}`, { moment: l.moment, sec: l.sec });
}
const MC = ({ venice: 'boardwalk', blossom: 'unclejune', orbit: 'nova', canopy: 'moss', rooftop: 'velvet' } as Record<string, string>)[COURT] ?? 'nova', SIDE = 'scoop';   // cast.ts MC_BY_COURT, SIDEKICK
// the priority each booth moment is said at in ThreePointMode (the sidekick's reply goes one lower)
const PRIO: Record<string, number> = { 'intro.court': 2, 'three.intro': 2, 'three.go': 3, 'three.rack': 1, 'three.lastrack': 2, 'three.money': 0, 'three.make': 1,
  'three.make.money': 2, 'three.miss': 1, 'three.streak': 2, 'three.fire': 2, 'three.cold': 2, 'three.clock': 2, 'three.buzzer': 3, 'three.results': 2,
  'three.advance': 3, 'three.out': 3, 'three.final': 2, 'three.clinch': 3, 'three.champion': 3, 'outro.loss': 3 };
const QUEUE_WAIT = 1.2, GAP = 0.18;
const rel = (t: number): number => Number(((t - tPlaying) / 1000).toFixed(2));
type Heard = { t: number; rt: number; cast: string; moment: string; sec: number; prio: number; played: boolean; caption: string; channel: 'booth' | 'crowd' };
const heard: Heard[] = mic.map((c) => {
  const ls = c.clips.map((id) => LINES.get(id));
  const moment = ls[0]?.moment ?? c.clips[0]?.split('/')[1]?.replace(/\.\d+$/, '') ?? '?';
  const sec = ls.reduce((a, l) => a + (l?.sec ?? 0), 0) + GAP * Math.max(0, ls.length - 1);
  const booth = c.cast === MC || c.cast === SIDE;
  const prio = !booth ? 0 : moment.startsWith('filler.') ? 0 : c.cast === SIDE ? Math.max(0, (PRIO[moment] ?? 1) - 1) : (PRIO[moment] ?? 1);
  return { t: c.t, rt: rel(c.t), cast: c.cast, moment, sec, prio, played: c.played, caption: c.caption, channel: booth ? 'booth' : 'crowd' };
});
const booth = heard.filter((h) => h.channel === 'booth');
const crowd = heard.filter((h) => h.channel === 'crowd');

// the shots: release (the ring decided), then the ball at the rim (the first landing beat after it, before the next release)
const shots = RUN.shots;
const landings = evt.filter((e) => /^\[3PT-JUICE\] (make|miss clank)/.test(e.m));
const hev = RUN.hev;
const runEnd = hev.find((h) => h.k === 'banner' && /RESULTS/.test(String(h.v)));
type Expect = { what: string; moment: string; prio: number; t: number; shot?: number; note?: string };
const expects: Expect[] = [];
let streak = 0, missRun = 0;
const shotRows: string[] = [];
shots.forEach((s, k) => {
  if (k > 0 && s.round !== shots[k - 1].round) { streak = 0; missRun = 0; }   // a fresh run (the final) starts its counts again
  const next = shots[k + 1]?.tFire ?? Infinity;
  const land = landings.find((l) => l.t > s.tFire && l.t < next);
  if (s.made) { streak++; missRun = 0; } else { streak = 0; missRun++; }
  // micShotCall, from the counts this shot set (qualifying: no clinch)
  const moment = !s.made ? (missRun === 3 ? 'three.cold' : 'three.miss')
    : streak >= 5 && streak % 5 === 0 ? 'three.fire' : s.money ? 'three.make.money' : streak === 3 || streak === 4 ? 'three.streak' : 'three.make';
  const madeLand = land ? /make/.test(land.m) === s.made : null;
  if (land) expects.push({ what: `shot ${k + 1} (rack ${s.rack + 1} ball ${s.ball + 1}${s.money ? ' MONEY' : ''}) ${s.made ? 'make' : 'miss'}`, moment, prio: PRIO[moment], t: land.t, shot: k });
  else if (runEnd && s.tFire < runEnd.t) expects.push({ what: `shot ${k + 1} in the air at the horn (${s.made ? 'make' : 'miss'})`, moment: s.made ? 'three.buzzer' : '(none)', prio: s.made ? 3 : 0, t: runEnd.t, shot: k });
  shotRows.push(`   ${String(k + 1).padStart(2)} r${s.rack + 1}b${s.ball + 1}${s.money ? '$' : ' '} ${s.kind} press@${s.m.toFixed(2)} bar@${s.barAtFire?.toFixed(3) ?? '?'} ${s.made ? 'MAKE' : 'miss'} streak ${streak} missRun ${missRun}  fire ${rel(s.tFire)} s → rim ${land ? rel(land.t) + ' s' : '—'}${madeLand === false ? '  (!! landing beat disagrees with the ring)' : ''}  expect ${moment}`);
});
// the other calls, where the play put them
const firstPlaying = tPlaying;
expects.push({ what: 'the welcome', moment: 'intro.court', prio: 2, t: firstPlaying });
for (const h of hev) {
  if (h.k === 'up' && h.ball === 0 && (h.rack ?? 0) >= 1) expects.push({ what: `arrived at rack ${(h.rack ?? 0) + 1}`, moment: h.rack === 4 ? 'three.lastrack' : 'three.rack', prio: h.rack === 4 ? 2 : 1, t: h.t, note: h.rack === 4 ? 'then()' : undefined });   // the last rack waits for the booth
  if (h.k === 'up' && h.ball === 4) expects.push({ what: `money ball up (rack ${(h.rack ?? 0) + 1})`, moment: 'three.money', prio: 0, t: h.t });   // priority 0: now or never, never late
  if (h.k === 'clock' && h.v === 10) expects.push({ what: 'ten seconds', moment: 'three.clock', prio: 2, t: h.t, note: 'then()' });   // waits for the booth
}
if (runEnd) expects.push({ what: 'the run is over (then: the field posts)', moment: 'three.results', prio: 2, t: runEnd.t, note: 'then()' });
const posted = hev.find((h) => h.k === 'posted');
if (posted) {   // the board's line for YOU says which call is due
  const adv = /ADVANCES/.test(String(posted.v).split(' | ').find((x) => x.startsWith('YOU ')) ?? '');
  expects.push({ what: `the last number is up (${adv ? 'through' : 'out'})`, moment: adv ? 'three.advance' : 'three.out', prio: 3, t: posted.t, note: 'then()' });
}
expects.sort((a, b) => a.t - b.t);

// match: the first unmatched booth cue of that moment from the event (a queued call waits up to QUEUE_WAIT + a clip; then() waits for the booth)
const used = new Set<Heard>();
type Row = Expect & { heard?: Heard; verdict: string };
const rows: Row[] = expects.map((e) => {
  if (e.moment === '(none)') return { ...e, verdict: 'no call (a miss at the horn)' };
  const ok = (h: Heard): boolean => h.cast === MC && !used.has(h) && e.moment.split('|').includes(h.moment);
  const win = e.note === 'then()' ? 12 : e.moment === 'intro.court' ? 3 : 4;
  const before = e.moment === 'intro.court' ? 1500 : 250;   // the welcome goes out on the first live frame; the probe sees '· playing' a render later
  const h = booth.find((x) => ok(x) && x.t >= e.t - before && x.t <= e.t + win * 1000);
  if (h) {
    used.add(h);
    const d = (h.t - e.t) / 1000, flags: string[] = [];
    if (e.shot !== undefined && d > 0.5) flags.push('LATE at the rim');
    const next = booth[booth.indexOf(h) + 1];
    const cut = next ? (h.t + h.sec * 1000 - next.t) / 1000 : 0;
    if (cut > 0.12) flags.push(`cut after ${((next.t - h.t) / 1000).toFixed(2)} of ${h.sec.toFixed(2)} s by ${next.moment}`);
    if (e.moment === 'three.money') {   // the gold ball is up: said before it leaves the hand?
      const ms = shots.find((s) => s.money && s.tFire >= e.t - 50 && s.tFire < e.t + 4000);
      if (ms && h.t > ms.tFire) flags.push(`STALE: started ${((h.t - ms.tFire) / 1000).toFixed(2)} s after the money ball was released`);
    }
    return { ...e, heard: h, verdict: `HEARD +${d.toFixed(2)} s${flags.length ? '  !! ' + flags.join('; ') : ''}` };
  }
  // not heard: what held the booth at that moment?
  const busy = booth.filter((x) => x.t <= e.t + 30 && x.t + x.sec * 1000 > e.t).pop();
  if (!busy) return { ...e, verdict: 'MISSING — the booth was FREE' };
  const left = (busy.t + busy.sec * 1000 - e.t) / 1000;
  const why = busy.prio > e.prio ? `a bigger call (${busy.moment} p${busy.prio}) had the booth: let go by rule`
    : busy.prio === e.prio ? (Math.abs(left - QUEUE_WAIT) < 0.1 ? `an equal call (${busy.cast} ${busy.moment}) had ${left.toFixed(2)} s left, on the ${QUEUE_WAIT} s queue line (the HUD sees the event a render late): let go by rule, borderline`
      : left > QUEUE_WAIT ? `an equal call (${busy.cast} ${busy.moment}) had ${left.toFixed(1)} s left (> ${QUEUE_WAIT} s): let go by rule` : `an equal call (${busy.cast} ${busy.moment}) had ${left.toFixed(2)} s left: should have QUEUED`)
    : `a smaller call (${busy.moment} p${busy.prio}) had the booth: should have CUT IN`;
  return { ...e, verdict: `not heard — ${why}` };
});
// the booth cues nothing expected (filler, the sidekick, a call on a beat the probe did not model)
const extra = booth.filter((h) => !used.has(h));
// booth overlaps: the next booth cue started before the last one's audio ended (VoiceKit stops the booth channel for every cue)
const cuts: string[] = [];
for (let i = 1; i < booth.length; i++) { const a = booth[i - 1], c = booth[i]; const over = a.t + a.sec * 1000 - c.t; if (over > 120) cuts.push(`${a.cast} ${a.moment} @${a.rt} s (${a.sec.toFixed(2)} s) cut ${(over / 1000).toFixed(2)} s early by ${c.cast} ${c.moment} @${c.rt} s`); }
// shot calls vs the release and the rim
const callDelays = rows.filter((r) => r.shot !== undefined && r.heard && r.moment !== 'three.buzzer').map((r) => {
  const s = shots[r.shot!]; return { rim: (r.heard!.t - r.t) / 1000, release: (r.heard!.t - s.tFire) / 1000 };
});
const med = (xs: number[]): number => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const earlyCalls = rows.filter((r) => r.shot !== undefined && r.heard && r.heard.t < r.t - 30);

const momentsHeard = [...new Set(booth.filter((h) => h.cast === MC).map((h) => h.moment))];
const WANT = ['intro.court', 'three.intro', 'three.rack', 'three.lastrack', 'three.money', 'three.make', 'three.make.money', 'three.miss', 'three.streak', 'three.fire', 'three.cold', 'three.clock', 'three.results'];
const crowdBy: Record<string, number> = {}; for (const c of crowd) crowdBy[c.moment] = (crowdBy[c.moment] ?? 0) + 1;

console.log(`── audio: ${RUN.audio ?? '(not in this saved run)'}`);
console.log(`── banks: ${bankLoads.length} requests, ${bankLoads.filter((x) => !x.startsWith('200')).length} not 200`); for (const x of bankLoads.filter((x) => !x.startsWith('200'))) console.log('  ', x);
console.log(`── the run: ${shots.length} shots, ${shots.filter((s) => s.made).length} made, lead ${RUN.lead?.toFixed(3)}, horn holds ${RUN.holds}, run over at ${runEnd ? rel(runEnd.t) + ' s' : '—'}, page loads ${RUN.loads}`);
for (const r of shotRows) console.log(r);
console.log(`── the mic: ${mic.length} cues (${booth.length} booth, ${crowd.length} crowd), ${mic.filter((m) => m.played).length} played, ${mic.filter((m) => !m.played).length} caption-only`);
for (const h of heard) console.log(`   ${h.played ? '♪' : '·'} ${String(h.rt).padStart(6)} s ${h.cast.padEnd(8)} ${h.moment.padEnd(17)} ${h.caption.slice(0, 80)}`);
console.log('── expected vs heard');
for (const r of rows) console.log(`   ${String(rel(r.t)).padStart(6)} s ${r.moment.padEnd(22)} ${r.what.padEnd(44)} ${r.verdict}`);
console.log('── booth cues nothing expected:', extra.length ? '' : 'none'); for (const h of extra) console.log(`   ${h.rt} s ${h.cast} ${h.moment}`);
console.log(`── shot calls: ${callDelays.length} heard; from the rim median ${med(callDelays.map((d) => d.rim)).toFixed(2)} s (min ${Math.min(...callDelays.map((d) => d.rim)).toFixed(2)}, max ${Math.max(...callDelays.map((d) => d.rim)).toFixed(2)}); from the release median ${med(callDelays.map((d) => d.release)).toFixed(2)} s (min ${Math.min(...callDelays.map((d) => d.release)).toFixed(2)}); before the rim: ${earlyCalls.length}`);
console.log('── MC moments heard:', momentsHeard.join(' '));
console.log('── wanted and NOT heard:', WANT.filter((w) => !momentsHeard.includes(w)).join(' ') || 'none');
console.log('── crowd answers:', JSON.stringify(crowdBy));
console.log('── booth cut short:', cuts.length ? '' : 'none'); for (const c of cuts) console.log('  ', c);
console.log('── errors', errors.length ? errors.slice(0, 8) : 'none');
if (!process.env.ANALYZE) {
  fs.writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify({ ...RUN, heard, rows, extra: extra.map((h) => h.rt + ' ' + h.cast + ' ' + h.moment), cuts }, null, 1));
  console.log('── wrote', `${OUT}/${TAG}.json`);
}
