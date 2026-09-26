// _combat-body-live — movement play P7's live check (2026-09-26): the fight read on the real combat modes, driven by the
// body alone. No camera: frames go in through window.__FEL_POSE_FEED__ (the feed moves each frame's capture time onto the
// page clock and keeps its arrival lag), the Body button is __FEL_BODY__.start(). From _body-seam-live.mts.
//
// The offline gates (lib/pose/fightGate.test.ts, lib/babylon/combat/bodyFight.gate.test.ts) replay the same chain in node;
// this proves the page runs it — the reader's events reach the harness, the harness hands the CLAIMED kinds to the mode's
// onBody past the START latch, the mode takes them (QA's `body:<kind>` press is logged only when onBody did not return
// false) and acts (its own `[X-STORM] link …` / `[X-BODY]` / `[X-DEF]` lines) — on /dev/mode/<key>?agent=1, per mode and
// per latency (LAT, default 80 and 200 ms):
//   L1 READY    a still stand keeps READY;
//   L2 START    the hands-up hold → playing, and nothing taken while the START latch holds;
//   L6 MENUS    (Mixed's loadout, Duel's weapon pick) a stream of strikes takes nothing, and never starts the round —
//               the probe then starts it with a pad A, as a player would;
//   L3 QUIET    the owner's stand, a fight stance (guard held, bobbing), a jog, two waves, two stretches (CMU), and the
//               review's out-of-sample gestures (2026-09-26: claps, a wave in front of the face, arm swings, the guard
//               raised one hand after the other from a low guard — scripted, their paths drawn for seed 4): nothing taken
//               (a guard held up in the stance is its state, not a misfire; a stretch and claps count blows and kicks; the
//               low guard's raise is a guard, so it counts blows and kicks);
//   L4 STRIKES  a scripted jab-cross-hook (×4, real spacing) and the scripted singles: the mode's own link lines name every
//               strike, in order (truth: the take's labels), and the jab-cross-hook strings are called;
//   L5 DEFENCE  the rival's hits on a body player, resolved at impact against the body (the mode's `[X-DEF] body …`
//               lines): a guard held (blocked) and the hands down (a hit), with how late each resolved;
//   L7 LOST     a 2 s dropout pauses a body-driven game; both hands up resumes it;
//   L9 COST     the seam's cost per fed frame WITH the fight reader (median; the budget is under 1 ms);
//   the page's measured lag per event kind (QA bodyLog: now − the event's capture instant).
// Duel and The Hundred are behind false flags (lib/babylon/combat/bodyFightFlags): the probe opens them with the dev-only
// switch ?bodyfight=<key> so their misfires can decide the flag.
//
//   BASE=http://localhost:3096 MODES=karate_vs,mixedcombat PATH=/opt/homebrew/bin:$PATH \
//     node node_modules/tsx/dist/cli.mjs scripts/probes/_combat-body-live.mts
//   LAT=80 … one latency · SHOTS=<dir> … screenshots · HEADED=1 … a visible browser
//   PAD=1 … L8 instead: the PAD path on the same page (a woken game, the body idle): 36 A presses at the deliberate 420 ms
//            cadence through the input bus, every one a swing or eaten (the mode's own link lines), and the press → link
//            latency — the live half of "pad play is unchanged" (lib/babylon/combat/padEquivalence.test.ts is the proof)
// It needs a `next dev` of the tree under test (no .env: /dev/mode needs no database and no login).
import { chromium, type Page } from 'playwright-core';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromiumExe } from './_chromium.mts';
import * as synNs from '../../lib/pose/synth.ts';
import * as kitNs from '../../lib/pose/streamKit.ts';
import * as gradeNs from '../../lib/pose/fightGrade.ts';
import * as takesNs from '../../lib/pose/fightTakes.ts';
import * as fkNs from '../../lib/pose/fightKit.ts';
import * as readerNs from '../../lib/pose/BodyReader.ts';
import type { PoseFrame } from '../../lib/pose/landmarks.ts';

const unwrap = <T,>(ns: T): T => ((ns as unknown as { default?: T }).default ?? ns);
const { restPose, synthesize } = unwrap(synNs);
const { script, hold, armsSwing, dropout } = unwrap(kitNs);
const G = unwrap(gradeNs), T = unwrap(takesNs), K = unwrap(fkNs);
const { BodyReader } = unwrap(readerNs);
type FightTake = gradeNs.FightTake;

const BASE = (process.env.BASE ?? 'http://localhost:3096').replace(/\/$/, '');
const MODES = (process.env.MODES ?? 'karate_vs,mixedcombat,showdown,duel,karate').split(',').map((s) => s.trim()).filter(Boolean);
const LATS = (process.env.LAT ?? '80,200').split(',').map(Number);
const HEADLESS = process.env.HEADED !== '1';
const SHOTS = process.env.SHOTS ?? '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = async (p: Page, name: string) => { if (SHOTS) await p.screenshot({ path: join(SHOTS, `${name}.png`) }).catch(() => {}); };
const BEHIND_FLAG = new Set(['duel', 'karate']);
const TAG: Record<string, string> = { karate_vs: 'KVS', mixedcombat: 'MC', showdown: 'SD', duel: 'DL', karate: 'KE' };

// ── the streams ──────────────────────────────────────────────────────────────────────────────────────────────────
interface Stream { name: string; frames: PoseFrame[]; t0: number; gt: gradeNs.FightStream['gt'] }
const R0 = restPose(), ARMS_UP = armsSwing(R0, 1);
function scripted(name: string, beats: ReturnType<typeof hold>[], lat: number, seed: number, gap?: [number, number]): Stream {
  const syn = synthesize(script(beats), { seed, latencyMs: lat });
  const frames = gap ? dropout(syn.frames, syn.frames[0].t + gap[0], syn.frames[0].t + gap[1]) : syn.frames;
  return { name, frames, t0: frames[0].t, gt: [] };
}
const fdir = join(process.cwd(), 'lib/pose/__fixtures__/fight');
const REAL = Object.fromEntries(readdirSync(fdir).filter((f) => f.endsWith('.json') && f !== 'index.json')
  .map((f) => { const t = T.takeOfFixture(JSON.parse(readFileSync(join(fdir, f), 'utf8'))); return [t.name, t]; })) as Record<string, FightTake>;
const KIT = T.scriptedTakes(4, 'L');
const kit = (prefix: string) => KIT.find((t) => t.name.startsWith(prefix))!;
function comboTake(): FightTake {
  const fb = new K.FightBody('L'), rng = K.mulberry32(401);
  const items = [K.stanceItem(fb, 1.0, rng)];
  for (let k = 0; k < 4; k++) items.push(K.comboItem(fb, ['jab', 'cross', 'hook'], rng, [0.3 + rng() * 0.08, 0.3 + rng() * 0.08], ['L', 'R', 'L']), K.stanceItem(fb, 1.0 + rng() * 0.3, rng));
  return T.scriptTake('live_jab_cross_hook', 'positive', items);
}
/** Three singles (jab, cross, hook) off a fight stance: ~4 s. */
function shortBlows(): FightTake {
  const fb = new K.FightBody('L'), rng = K.mulberry32(77);
  return T.scriptTake('live_three_singles', 'positive', [K.stanceItem(fb, 0.6, rng), K.blowItem(fb, 'jab', rng, 'L'), K.stanceItem(fb, 0.5, rng), K.blowItem(fb, 'cross', rng, 'R'), K.stanceItem(fb, 0.5, rng), K.blowItem(fb, 'hook', rng, 'L'), K.stanceItem(fb, 0.6, rng)]);
}
/** A still fight stance, guard up, for `sec` (a body that stays in frame between the takes). */
const still = (sec: number, lat: number): Stream => {
  const fb = new K.FightBody('L'), rng = K.mulberry32(5);
  const { clip } = K.fightScript([K.stanceItem(fb, sec, rng)], 60);
  const syn = synthesize(clip, { seed: 5, latencyMs: lat });
  return { name: 'still', frames: syn.frames, t0: syn.frames[0].t, gt: [] };
};
const fstream = (take: FightTake, lat: number, seed = 4): Stream => {
  const st = G.fightStream(take, { fps: 30, latencyMs: lat, noise: 1, blur: false, seed, holes: false });
  return { name: take.name, frames: st.frames, t0: st.frames[0].t, gt: st.gt };
};

// ── the page ─────────────────────────────────────────────────────────────────────────────────────────────────────
const browser = await chromium.launch({ executablePath: chromiumExe(), headless: HEADLESS, args: ['--use-angle=metal'] });
const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 } });
await ctx.addInitScript('window.__name = (f) => f;');
interface Tap { logs: { at: number; text: string }[]; phases: { at: number; phase: string }[]; banners: { at: number; text: string }[]; events: { at: number; kind: string; t: number }[] }

async function open(p: Page, key: string): Promise<void> {
  const q = BEHIND_FLAG.has(key) ? `&bodyfight=${key}` : '';
  await p.goto(`${BASE}/dev/mode/${key}?agent=1${q}`, { waitUntil: 'domcontentloaded', timeout: 300_000 });
  await p.waitForFunction(() => {
    const w = window as any;
    return !!w.__FEL_POSE_FEED__ && !!w.__FEL_BODY__ && !!w.__FEL_DEV__?.input && !!w.__FEL_QA__
      && document.getElementById('fel-ready')?.dataset.state === 'loaded';
  }, null, { timeout: 300_000, polling: 250 });
  await p.evaluate(async () => {
    const w = window as any;
    const tap: Tap = { logs: [], phases: [], banners: [], events: [] };
    w.__FEL_DEV__.input.onBody((pk: any) => { const at = performance.now(); for (const ev of pk.events) if (['blow', 'legKick', 'guard', 'evade', 'fightStep'].includes(ev.kind)) tap.events.push({ at, kind: ev.kind, t: ev.t }); });
    w.__CB = tap;
    const orig = console.info.bind(console);
    console.info = (...a: unknown[]) => { try { const t = String(a[0] ?? ''); if (/^\[(KVS|MC|SD|DL|KE)-(STORM|BODY|DEF)\]/.test(t)) tap.logs.push({ at: performance.now(), text: t.slice(0, 200) }); } catch { /* */ } orig(...a); };
    let last = '', lastBanner = '';
    setInterval(() => {
      const m = /DEV · \S+ · (\w+)/.exec(document.body.innerText); if (m && m[1] !== last) { last = m[1]; tap.phases.push({ at: performance.now(), phase: last }); }
      const b = String(w.__FEL_QA__?.hud?.().banner ?? ''); if (b !== lastBanner) { lastBanner = b; if (b) tap.banners.push({ at: performance.now(), text: b }); }
    }, 20);
    w.__FEL_POSE_FEED__.begin();
    await w.__FEL_BODY__.start({ autoCalibrate: true });
  });
}
/** THE BODY STAYS IN FRAME BETWEEN THE TAKES (the gate, 2026-09-26): once a stream is played, its last frame is held — pushed
 *  every 33 ms on the page clock, its own arrival lag kept — until the next stream starts, as a player standing still in
 *  front of the camera would. Without it the probe's own gap (the settle, the reads, the next stream's transfer and its
 *  latency) ran past the stall watchdog (BodySession STALL_MS: 1 s with no packet) and paused a body-driven game before the
 *  next take's first frame arrived, so the take played on a paused game (measured: Showdown at 200 ms, the pause 96 and
 *  185 ms into the play, before the first frame). A held still frame moves nothing, so the reader tells nothing from it. */
async function play(p: Page, s: Stream): Promise<{ from: number; to: number }> {
  return p.evaluate(async (frames) => {
    const w = window as any, feed = w.__FEL_POSE_FEED__;
    clearInterval(w.__CB_HOLD);
    const from = performance.now();
    await feed.play(frames);
    const last = frames[frames.length - 1], lag = (last.arrive ?? last.t) - last.t;
    if (last.present) w.__CB_HOLD = setInterval(() => { const now = performance.now(); feed.push({ ...last, t: now - lag, arrive: now }); }, 33);
    await new Promise((r) => setTimeout(r, 400));   // the last frames' deferred hits and ticks
    return { from, to: performance.now() };
  }, s.frames);
}
/** Stop holding the last frame (before Body off, a timed push run, or the end of a latency's run). */
const unhold = (p: Page) => p.evaluate(() => { const w = window as any; clearInterval(w.__CB_HOLD); w.__CB_HOLD = null; });
async function newBody(p: Page): Promise<void> {
  await p.evaluate(async () => { const w = window as any; clearInterval(w.__CB_HOLD); w.__CB_HOLD = null; w.__FEL_BODY__.stop(); w.__FEL_POSE_FEED__.begin(); await w.__FEL_BODY__.start({ autoCalibrate: true }); });
}
const tapOf = (p: Page) => p.evaluate(() => (window as any).__CB as Tap);
/** Play a measured take on the current body: if the game is paused anyway (the hold in play() keeps the body in frame
 *  between takes, so this is the fallback), the hands-up puts it back in play first (a scripted take's body is the rest
 *  pose's proportions). */
async function playLive(p: Page, s: Stream, lat: number): Promise<{ from: number; to: number }> {
  const ph = (await tapOf(p)).phases.at(-1)?.phase ?? 'ready';
  if (ph === 'paused') await play(p, scripted('hands up to play', [hold(R0, 1.0), hold(ARMS_UP, 1.2), hold(R0, 1.0)], lat, 43));
  return play(p, s);
}
/** A new body starts paused (Body off is a lost body to the session): both hands up puts the game back in play, as a
 *  player would — made from the TAKE's own body (its stand frame, its arms raised), so the new reader calibrates on the
 *  body that then plays the take (a reader calibrated on one body and fed another reads the other's feet as steps).
 *  Returns whether it is playing. */
async function ensurePlaying(p: Page, lat: number, take?: FightTake): Promise<boolean> {
  const now = async () => (await tapOf(p)).phases.at(-1)?.phase ?? 'ready';
  if ((await now()) === 'playing') return true;
  const stand = take && take.source !== 'scripted' ? take.clip.frames[G.standIndex(take.clip, 30)] : R0;
  const clip = script([hold(stand, 1.2), hold(armsSwing(stand, 1), 1.2), hold(stand, 1.0)]);
  const syn = synthesize(take?.clip.foot ? { ...clip, foot: take.clip.foot } : clip, { seed: 41, latencyMs: lat });
  await play(p, { name: 'hands up to play', frames: syn.frames, t0: syn.frames[0].t, gt: [] });
  return (await now()) === 'playing';
}
const qaOf = (p: Page) => p.evaluate(() => (window as any).__FEL_QA__.events(8000) as { t: number; kind: string; key: string }[]);
const phaseAt = (t: Tap, at: number) => { let ph = 'ready'; for (const x of t.phases) { if (x.at > at) break; ph = x.phase; } return ph; };
const firstPhase = (t: Tap, phase: string, after: number) => t.phases.find((x) => x.at >= after && x.phase === phase)?.at ?? null;
const padTap = (p: Page, btn: string) => p.evaluate(async (b) => {
  const bus = (window as any).__FEL_DEV__.input;
  bus.emit({ t: 'button', btn: b, pressed: true }); await new Promise((r) => setTimeout(r, 80)); bus.emit({ t: 'button', btn: b, pressed: false });
}, btn);
/** Taken body verbs (QA) in a window, by kind. */
const taken = (qa: { t: number; kind: string; key: string }[], w: { from: number; to: number }) => {
  const out: Record<string, number> = {};
  for (const e of qa) if (e.kind === 'press' && e.key.startsWith('body:') && e.t >= w.from && e.t <= w.to) out[e.key.slice(5)] = (out[e.key.slice(5)] ?? 0) + 1;
  return out;
};
const linesIn = (t: Tap, w: { from: number; to: number }, re: RegExp) => t.logs.filter((l) => l.at >= w.from && l.at <= w.to && re.test(l.text)).map((l) => l.text);

const report: Record<string, unknown> = {};
const page = await ctx.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));

const PAD = process.env.PAD === '1';
for (const key of PAD ? MODES : []) {
  const tag = TAG[key] ?? key;
  try {
    // the pad's own path: woken by a press (the body plays no part: no frame is fed), past the intro / the loadout
    await open(page, key);
    await padTap(page, 'A'); await page.waitForTimeout(1500);
    if (key === 'mixedcombat' || key === 'duel') { await padTap(page, 'A'); await page.waitForTimeout(1500); }
    await page.waitForTimeout(2500);
    const r = await page.evaluate(async (tagRe) => {
      const w = window as any, bus = w.__FEL_DEV__.input, cb = w.__CB, re = new RegExp(tagRe);
      const presses: number[] = [];
      for (let i = 0; i < 36; i++) { presses.push(performance.now()); bus.emit({ t: 'button', btn: 'A', pressed: true }); await new Promise((q) => setTimeout(q, 70)); bus.emit({ t: 'button', btn: 'A', pressed: false }); await new Promise((q) => setTimeout(q, 350)); }
      await new Promise((q) => setTimeout(q, 800));
      const links = cb.logs.filter((l: any) => re.test(l.text) && l.at >= presses[0]).map((l: any) => l.at);
      // each press's answer: the first link after it and before the next press + 400 ms (the queue's life)
      const lat: number[] = [];
      presses.forEach((p0, i) => { const nx = presses[i + 1] ?? Infinity; const a = links.find((x: number) => x >= p0 && x < nx + 400); if (a !== undefined) lat.push(a - p0); });
      lat.sort((a, b) => a - b);
      return { presses: presses.length, swings: links.length, answered: lat.length, latencyMs: lat.length ? { med: Math.round(lat[lat.length >> 1]), p90: Math.round(lat[Math.floor(lat.length * 0.9)]) } : null };
    }, `^\\[${tag}-STORM\\] link`);
    report[key] = { L8: r };
  } catch (e) { report[key] = { error: String((e as Error)?.message ?? e).slice(0, 300) }; }
  console.log(JSON.stringify({ [key]: report[key] }, null, 1));
}
for (const key of PAD ? [] : MODES) {
  const row: Record<string, unknown> = {};
  const tag = TAG[key] ?? key;
  try {
    for (const lat of LATS) {
      const L: Record<string, unknown> = {};
      const start = scripted('stand, hands up', [hold(R0, 2.0), hold(ARMS_UP, 1.2), hold(R0, 1.2)], lat, 17);
      /** A fresh match on a fresh page, woken by the body (and past its menu with a pad A, as a player would). */
      const fresh = async (menuFirst?: (w0: { from: number; to: number }) => Promise<void>) => {
        await open(page, key);
        const w0 = await play(page, start);
        if (menuFirst) await menuFirst(w0);
        // the body stays in frame while the mode's intro (or, after a pad A, its round start) passes: a feed that goes quiet
        // for longer than the loss grace pauses a body-driven game
        if (key === 'mixedcombat' || key === 'duel') await padTap(page, 'A');
        await play(page, still(key === 'duel' ? 1.8 : key === 'mixedcombat' ? 1.2 : 2.6, lat));
        return w0;
      };
      // L1 + L2, then L6 (the mode's own menu, the same body that woke it: a new one would pause the game)
      const w0 = await fresh(async (w) => {
        const t = await tapOf(page);
        const upAt = w.from + 2000, woke = firstPhase(t, 'playing', w.from);
        L.L1 = { keptOnStand: phaseAt(t, upAt - 50) === 'ready' };
        L.L2 = { woke: woke != null, afterArmsUpMs: woke != null ? Math.round(woke - upAt) : null, takenWhileLatched: taken(await qaOf(page), { from: w.from, to: woke ?? w.to }) };
        await shot(page, `${key}-${lat}-1-woken`);
        if (key === 'mixedcombat' || key === 'duel') {
          const wm = await play(page, fstream(shortBlows(), lat));
          const tk = taken(await qaOf(page), wm);
          const t2 = await tapOf(page);
          L.L6 = { menu: key === 'mixedcombat' ? 'loadout' : 'weaponSelect', takenInMenu: tk, linksInMenu: linesIn(t2, wm, new RegExp(`^\\[${tag}-STORM\\] (link|body )`)).length, verdict: Object.keys(tk).length ? 'TOOK (must not)' : 'TOOK NOTHING' };
        }
      });
      void w0;
      // L4 STRIKES — on the body the START woke (a scripted take's body is the rest pose's proportions: no new body)
      const strikes: Record<string, unknown> = {};
      const l4 = (lat === LATS[0] ? [comboTake(), kit('kit_blows')] : [comboTake()]).map((take) => ({ take, s: fstream(take, lat) }));
      for (const { take, s } of l4) {
        const w = await playLive(page, s, lat);
        const t = await tapOf(page);
        const links = linesIn(t, w, new RegExp(`^\\[${tag}-STORM\\] (link|body )`)).map((x) => { const b = / body (\w+) age/.exec(x), m = /link (\w+)/.exec(x); return b ? b[1] : m ? m[1] : x; });
        const truth = s.gt.filter((g) => g.kind === 'blow' && g.onset > 300).sort((a, b) => a.onset - b.onset).map((g) => g.name);
        const calls = t.banners.filter((b) => b.at >= w.from && b.at <= w.to && /^COMBO:/.test(b.text)).map((b) => b.text.slice(7));
        const lag = t.events.filter((e) => e.at >= w.from && e.at <= w.to && e.kind === 'blow').map((e) => e.at - e.t).sort((a, b) => a - b);
        // what the reader TOLD the page (the page's own events) next to what the mode took and linked: a strike told while the
        // fighter is staggered by the rival's hit is refused (onBody → false), as a press would be
        const told = t.events.filter((e) => e.at >= w.from && e.at <= w.to && e.kind === 'blow').length;
        const stunned = linesIn(t, w, new RegExp(`^\\[${tag}-DEF\\] body`)).filter((l) => /→ (hit|guardBreak)/.test(l)).length;
        if (process.env.DEBUGPH === '1') strikes[`${take.name}:phases`] = t.phases.slice(-8).map((x) => `${Math.round(x.at - w.from)}:${x.phase}`);
        strikes[take.name] = { truth: truth.join(' '), told, read: links.join(' '), taken: taken(await qaOf(page), w), combos: calls, rivalHitsTaken: stunned, phase: phaseAt(t, w.to), blowLagMs: lag.length ? { med: Math.round(lag[lag.length >> 1]), p90: Math.round(lag[Math.floor(lag.length * 0.9)]) } : null };
      }
      L.L4 = strikes;
      await shot(page, `${key}-${lat}-2-strikes`);
      // L5 DEFENCE — a fresh match, the same body: a guard held, then the hands down; the rival's hits resolved at impact
      await fresh();
      const defence: Record<string, unknown> = {};
      const l5 = ([['guard held', kit('kit_idle')], ['hands down', kit('kit_rest')]] as const).map(([name, take]) => ({ name, s: fstream(take, lat) }));
      for (const { name, s } of l5) {
        const w = await playLive(page, s, lat);
        const t = await tapOf(page);
        const lines = linesIn(t, w, new RegExp(`^\\[${tag}-DEF\\] body`));
        const outcomes: Record<string, number> = {}; const late: number[] = [];
        for (const l of lines) { const m = /body (?:dodge )?(\w+)(?: → (\w+))?/.exec(l); const k = m ? (m[2] ?? m[1]) : l; outcomes[k] = (outcomes[k] ?? 0) + 1; const lm = /\((-?\d+) ms late\)/.exec(l); if (lm) late.push(+lm[1]); }
        late.sort((a, b) => a - b);
        defence[name] = { hits: lines.length, outcomes, lateMs: late.length ? { med: late[late.length >> 1], max: late[late.length - 1] } : null, phase: phaseAt(t, w.to) };
      }
      L.L5 = defence;
      // L7 LOST → RESUME — a fresh match; a body strike first (so the body is the one playing: P3 Z5), then 2 s gone
      if (lat === LATS[0]) {
        await fresh();
        const fb = new K.FightBody('L'), rng = K.mulberry32(9);
        const lostTake = T.scriptTake('live_lost', 'positive', [K.stanceItem(fb, 0.8, rng), K.blowItem(fb, 'jab', rng, 'L'), K.stanceItem(fb, 4.6, rng)]);
        const ls = fstream(lostTake, lat);
        const gapAt = ls.frames.find((f) => f.t >= 2200)!.t;
        const lost: Stream = { ...ls, frames: dropout(ls.frames, gapAt, gapAt + 2000) };
        const wl = await play(page, lost);
        let t = await tapOf(page);
        const gapPage = wl.from + (gapAt - lost.t0);
        const pausedAt = firstPhase(t, 'paused', wl.from);
        const resume = scripted('hands up to resume', [hold(R0, 1.0), hold(ARMS_UP, 1.2), hold(R0, 1.0)], lat, 41);
        const wr = pausedAt != null ? await play(page, resume) : null;
        t = await tapOf(page);
        L.L7 = { bodyStruck: Object.keys(taken(await qaOf(page), { from: wl.from, to: gapPage })).length > 0, paused: pausedAt != null, afterGapMs: pausedAt != null ? Math.round(pausedAt - gapPage) : null, resumed: wr ? firstPhase(t, 'playing', wr.from) != null : null };
        // L9 COST: one frame at a time through the feed, timed around the push (the reader, the fight read, the harness)
        await unhold(page);
        L.L9 = await page.evaluate((frames) => {
          const feed = (window as any).__FEL_POSE_FEED__;
          const base = performance.now() + 50, t0 = frames[0].t, ms: number[] = [];
          for (const f of frames) { const tt = base + (f.t - t0); const at = performance.now(); feed.push({ ...f, t: tt, arrive: tt + 66 }); ms.push(performance.now() - at); }
          ms.sort((a, b) => a - b);
          return { median: +ms[ms.length >> 1].toFixed(3), p90: +ms[Math.floor(ms.length * 0.9)].toFixed(3), frames: ms.length };
        }, fstream(comboTake(), 66).frames);
      }
      // L3 QUIET — last (a rival beats a fighter who stands through them): each take on its own new body, calibrated on
      // its own stand, then a liveness check (three strikes on the same body must be taken: the dispatch was live)
      const quiet: Record<string, unknown> = {};
      const QUIET: [string, FightTake][] = [
        ['owner stand', REAL.neg_stand_owner], ['fight stance', kit('kit_idle')], ['jog', REAL.neg_jog],
        ['wave 143_25', REAL.neg_wave_143_25], ['wave 141_16', REAL.neg_wave_141_16], ['stretch 141_13', REAL.neg_stretch_141_13], ['stretch 143_30', REAL.neg_stretch_143_30],
        // the review's out-of-sample negatives (2026-09-26)
        ['claps', kit('kit_clap')], ['wave in front', kit('kit_wavefront')], ['arm swings', kit('kit_armswing')], ['low guard raised', kit('kit_guardlow')],
      ];
      for (const [name, take] of lat === LATS[0] ? QUIET : QUIET.filter(([n]) => /jog|wave/.test(n))) {
        await fresh();
        await newBody(page);
        const playing = await ensurePlaying(page, lat, take);
        const w = await play(page, fstream(take, lat));
        const tk = taken(await qaOf(page), w);
        let t = await tapOf(page);
        const guards = linesIn(t, w, new RegExp(`^\\[${tag}-BODY\\] guard`));
        // MISFIRES (PLAN-P7 §5): every verb taken — but a stretch counts only blows and kicks, and in the fight stance a
        // guard's STATE (up, down) is the stance itself; a RAISE there is a misfire
        const stretch = /stretch|claps|low guard/.test(name), stance = name === 'fight stance';
        const raises = guards.filter((g) => /raise/.test(g)).length;
        const bad = Object.entries(tk).reduce((a, [k, n]) => a + (stretch ? (k === 'blow' || k === 'legKick' ? n : 0) : k === 'guard' ? (stance ? raises : n) : n), 0);
        const told = t.events.filter((e) => e.at >= w.from && e.at <= w.to).length;
        const wl = await play(page, fstream(shortBlows(), lat));
        const live = taken(await qaOf(page), wl);
        t = await tapOf(page);
        quiet[name] = { playing, taken: tk, misfires: bad, fightEventsTold: told, phase: phaseAt(t, w.to), liveAfter: live.blow ?? 0 };
      }
      L.L3 = quiet;
      await unhold(page);
      await page.evaluate(() => (window as any).__FEL_BODY__.stop());
      row[`lat${lat}`] = L;
    }
  } catch (e) {
    row.error = String((e as Error)?.message ?? e).slice(0, 300);
  }
  report[key] = row;
  console.log(JSON.stringify({ [key]: row }, null, 1));
}

// node side: the reader's own cost per frame (the fight read included) on the combo stream
const nodeCost = (() => { const r = new BodyReader(), ms: number[] = []; for (const f of fstream(comboTake(), 66).frames) { const t = performance.now(); r.read(f); ms.push(performance.now() - t); } ms.sort((a, b) => a - b); return { median: +ms[ms.length >> 1].toFixed(4), p90: +ms[Math.floor(ms.length * 0.9)].toFixed(4) }; })();
console.log(JSON.stringify({ base: BASE, nodeCostMs: nodeCost, pageErrors: errors.slice(0, 20) }, null, 1));
await browser.close();
