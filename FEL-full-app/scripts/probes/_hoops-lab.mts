// _hoops-lab — one competent player, N possessions, and everything the mode says about each one.
//
// THE 10-PHASE PASS ON 1v1 AND 3v3 (owner, 2026-09-16). Like the dunk pass, the instrument comes before the opinion.
//
// IT DRIVES THROUGH THE AGENT BRIDGE, AND NOT KNOWING THAT COST A DAY. These modes build their player slot as
//
//     const agentCtl = agentBridge() ? new AgentControlSource() : null;
//     meSlot = new PlayerSlot('me', agentCtl ?? localSource, true);
//
// so the moment the agent bridge is on — and every probe here turns it on, via `sessionStorage.NEXUS_AGENT` — LOCAL
// INPUT IS DELIBERATELY BYPASSED. A synthetic gamepad is adopted by InputBus, logs `[PAD] P1 adopted slot 0`, and
// reaches nothing: measured by holding the left trigger and watching the mode's own `post().brace` stay false. Dunk
// never showed this because DunkMode reads the raw input stream; 1v1 and 3v3 read the slot.
//
// So the pad is not the instrument here. `window.__NEXUS_AGENT__` is, and it is the designed one — its own comment
// says the intent it pushes is "the SAME Intent shape the human input path produces, so agent play exercises real game
// code". `do('shoot', { charge })` holds `actionHeld` for 600·charge ms and releases with `action`, which means CHARGE
// IS THE RELEASE POINT and is the A/B rig this pass needs.
//
// WHAT IT PLAYS. Each possession is a named PLAY, so a mechanic can be aimed at rather than hoped for:
//
//   jumper   shoot from where the reset puts me (outside the floater band)
//   layup    drive in, release inside 2.2 m — classifyShot's layup band
//   dunk     drive in holding TURBO (R2) so speed, range and the turbo gate all agree — the 2K dunk
//   defence  mirror the driver, hand up, and BLOCK ON HIS GATHER — the mode's own `attackPhase()` says when
//
// The defensive brain runs IN THE PAGE, on a 16 ms interval, because a block has to be thrown inside the gather and a
// round trip to node is most of that window. It reads the dev seam (`scene.metadata.onevone` / `.threevthree`), which
// only exists under `next dev` — hence BASE pointing at the dev server for this pass.
//
//   BASE=http://127.0.0.1:3098 MODE=onevone POSSESSIONS=8 PLAY=mix CHARGE=0.8 npx tsx scripts/probes/_hoops-lab.mts
//   HANDLE=100 unlocks the whole dribble vocabulary (the mode reads ?handle=)
//   PLAY=jumper|layup|dunk|mix|handle|trick|defence|charge|screen    CHARGE=0.45|0.8|1.0 (early / green / late)    MODE=onevone|threevthree
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';
import { analyseBallPath, printVerdicts, type Outcome } from './_ballpath.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3098';
const MODE = process.env.MODE ?? 'onevone';
const POSSESSIONS = Number(process.env.POSSESSIONS ?? 8);
const CHARGE = Number(process.env.CHARGE ?? 0.8);
const PLAY = process.env.PLAY ?? 'mix';
const TAG = process.env.TAG ?? `${MODE}-${PLAY}-c${CHARGE}`;
const OUT = `${process.env.HOME}/Claude/outbox/finish-release/hoops`;
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--window-size=1280,860', '--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript({ content: "try { window.sessionStorage.setItem('NEXUS_AGENT', '1'); } catch {}" });
const page = await ctx.newPage();
const log: string[] = []; const outcomes: Outcome[] = []; let recT0 = 0;
page.on('console', (m) => { const t = m.text(); if (/\[1V1|\[3V3|\[REF|\[LAB/.test(t)) log.push(`${Date.now()} ${t.slice(0, 200)}`);
  const now = Date.now() - recT0; if (recT0 && /-RIM\] /.test(t)) outcomes.push({ t: now, kind: 'miss', label: t.replace(/^.*-RIM\] /, '').slice(0, 26) });
  if (recT0 && /-NET\] /.test(t)) outcomes.push({ t: now, kind: 'make', label: t.replace(/^.*-NET\] /, '').slice(0, 26) }); });

{ // LOGIN, AND CHECK IT TOOK (a click before hydration makes no POST and every /play answers 307 for the whole run)
  const lp = await ctx.newPage();
  for (let attempt = 0; attempt < 3; attempt++) {
    await lp.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 180000 });
    if (await lp.evaluate(`fetch('/api/auth/session').then((r) => r.json()).then((j) => !!(j && j.user)).catch(() => false)`)) break;
    // …and an already-authed session is BOUNCED OFF /login to the hub, where `button[type=submit]` is some other
    // page's control sitting under a venue image — which is how this timed out for 60 s on a session that was fine.
    if (!/\/login/.test(lp.url())) break;
    await lp.waitForSelector('button[type="submit"]', { timeout: 120000 });
    await lp.waitForTimeout(1200);   // dev: a click before hydration makes no POST at all
    await lp.fill('input[type="email"]', process.env.PLAYTEST_EMAIL ?? 'playtest@fel.local');
    await lp.fill('input[type="password"]', process.env.PLAYTEST_PASSWORD ?? 'playtest-local-only');
    await Promise.all([
      lp.waitForResponse((r) => /\/api\/auth\/(callback|signin)/.test(r.url()), { timeout: 60000 }).catch(() => null),
      // ENTER, not a click: the login page's own venue collage sits over the submit button often enough that a
      // normal click retries for its whole timeout ("<img src=/venues/surfbreak.jpg> intercepts pointer events").
      lp.press('input[type="password"]', 'Enter'),
    ]);
    const t = Date.now();
    while (Date.now() - t < 45000) {
      if (await lp.evaluate(`fetch('/api/auth/session').then((r) => r.json()).then((j) => !!(j && j.user)).catch(() => false)`)) break;
      await lp.waitForTimeout(400);
    }
  }
  await lp.close();
}
const HANDLE = process.env.HANDLE ? `&handle=${Number(process.env.HANDLE)}` : '';
await page.goto(`${BASE}/play/${MODE}?agent=1${HANDLE}${process.env.QS ?? ''}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
{ const t = Date.now(); let st = '';
  while (Date.now() - t < 300000) { st = await page.evaluate(() => document.getElementById('fel-ready')?.dataset.state ?? '').catch(() => '') as string; if (st === 'loaded' || st === 'playing') break; await page.waitForTimeout(500); }
  if (st !== 'loaded' && st !== 'playing') console.log(`[LAB] the mode never became ready (state "${st}", url ${page.url()})`); }

// THE HUD TAP, THE METER SAMPLER, AND THE DEFENSIVE BRAIN.
await page.evaluate(`(() => {
  const MODE = ${JSON.stringify(MODE)};
  window.__hudNow = () => { const q = window.__FEL_QA__; return q && q.rawHud ? q.rawHud() : {}; };
  window.__dev = () => { const q = window.__FEL_QA__; const s = q && q.scene ? q.scene() : null; return (s && s.metadata && s.metadata[MODE]) || null; };
  window.__meter = { peak: 0, frames: 0 };
  window.__def = { jumps: 0, gathers: 0, lastPhase: '', block: true, charge: false, driverPeak: 0, plantedMs: 0, closestWhilePlanted: 99 };
  // ONE QUEUE, ONE DRIVER. AgentControlSource is a SERIAL queue: every push waits its turn. The page-side defensive
  // brain pushing a 130 ms move every 120 ms therefore sits in front of whatever the node side asks for next, so an
  // offence play's squeeze arrived seconds late (or behind a possession change) and read as "the layup did nothing".
  // The brain only runs when this run is measuring DEFENCE.
  window.__brain = false;
  setInterval(() => {
    const m = window.__hudNow().shotMeterT;
    if (typeof m === 'number' && m > 0) { window.__meter.frames++; if (m > window.__meter.peak) window.__meter.peak = m; }
    // DID THE PLANT EVER GO DOWN, AND HOW CLOSE DID HE COME TO IT? "charges 0" on its own cannot tell a probe that
    // never planted from a mode that will not call one — these two numbers do.
    const dv = window.__dev();
    if (dv && typeof dv.takingCharge === 'function' && dv.takingCharge()) {
      window.__def.plantedMs += 16;
      const hn3 = window.__FEL_QA__.hero(); const mp = hn3 && (hn3.position || hn3);
      const hp = dv.foeRoot && dv.foeRoot.position;
      if (mp && hp) { const g = Math.hypot(mp.x - hp.x, mp.z - hp.z); if (g < window.__def.closestWhilePlanted) window.__def.closestWhilePlanted = g; }
    }
  }, 16);

  // THE DEFENSIVE BRAIN, in the page because a block lives inside the gather (GATHER_SEC 0.32) and a round trip to
  // node is most of that. It does the three things the mode's own hint asks for: stay in front, hand up, go on the
  // gather.
  const d = window.__def;
  setInterval(() => {
    const dev = window.__dev(); const a = window.__NEXUS_AGENT__;
    if (!window.__brain || !dev || !a) return;
    const onD = MODE === 'onevone' ? dev.possession && dev.possession() === 'defense' : dev.carrier && dev.carrier() === 'foeTeam';
    if (!onD) { d.lastPhase = ''; return; }
    const phase = dev.attackPhase ? dev.attackPhase() : '';
    // A JUMP CANCELS A PLANT — you cannot be in the air and taking a charge at once, and the mode says so
    // (takingCharge requires myJumpAge === Infinity). With the block always armed, the charge play could never
    // hold: six gathers, six jumps, zero charges. The block is off for the charge run.
    if (phase === 'gather' && d.lastPhase !== 'gather') { d.gathers++; if (d.block) { d.jumps++; if (typeof dev.block === 'function') dev.block(); else a.do('block'); } }   // the seam's block is immediate; the bridge's waits behind the steer queue (measured: jumps landing at driveK 1.00)
    d.lastPhase = phase;
  }, 16);

  // ONE STEERING HELPER FOR BOTH SIDES. The mode runs every stick through camRel, so a world direction has to be
  // resolved in the ACTIVE CAMERA's floor basis — this is the inverse of what the mode does, and it is the only way
  // a probe can say "go there" rather than "push forward and hope the camera agrees".
  window.__steer = (tx, tz, ms) => {
    const q = window.__FEL_QA__; const a = window.__NEXUS_AGENT__;
    const scene = q && q.scene ? q.scene() : null; const cam = window.__eyeCam ? window.__eyeCam.prev : (scene && scene.activeCamera);   // the mode maps sticks through the DIRECTOR's camera, eye or no eye
    // hero() hands back the ROOT NODE, not a point — reading .x off it gives undefined, every wish comes out NaN,
    // (and no backtick in this comment: it lives inside a template literal, which one would end — a trap this repo
    // has now sprung three times)
    // and AgentControlSource's clamp turns a NaN stick into 0. That is a probe that steers perfectly and never moves:
    // both drive plays shot a JUMPER from the spawn while reporting a clean run.
    const hn = q && q.hero ? q.hero() : null;
    const me = hn && (hn.position || hn);
    if (!cam || !me || !a || typeof me.x !== 'number') return false;
    const wx = tx - me.x, wz = tz - me.z;
    const wl = Math.hypot(wx, wz);
    if (wl < 0.2) return false;
    const f = cam.getForwardRay ? cam.getForwardRay().direction : null;
    if (!f) return false;
    const fl = Math.hypot(f.x, f.z) || 1; const fx = f.x / fl, fz = f.z / fl;
    a.do('move', { x: (wx * fz - wz * fx) / wl, y: (wx * fx + wz * fz) / wl, ms: ms || 130 });
    return true;
  };

  // STAY IN FRONT. Without this the brain only jumped, and a block also needs to be WITHIN RANGE (1.2 m on a jumper,
  // BLOCK_RANGE on a layup) — eight jumps on eight gathers converted two, mostly because nobody was near him. The
  // wish is "the point a metre off him on the rim side"; the stick is camera-relative (the mode runs every stick
  // through camRel), so the world wish is resolved in the ACTIVE CAMERA's basis — the inverse of what the mode does.
  setInterval(() => {
    const dev = window.__dev();
    if (!window.__brain || !dev || !dev.foeRoot) return;
    const onD = MODE === 'onevone' ? dev.possession && dev.possession() === 'defense' : dev.carrier && dev.carrier() === 'foeTeam';
    if (!onD) return;
    const him = dev.foeRoot.position;
    if (typeof dev.driveSpeed === 'function') { const v = dev.driveSpeed(); if (v > window.__def.driverPeak) window.__def.driverPeak = v; }
    // TAKING A CHARGE IS A PLACE, NOT A BUTTON. Planting early just means he drives round the spot: the node side
    // held it for 2.2 s from the start of the possession and drew nothing in six tries, with the driver hitting
    // 5.0 m/s past a body that was no longer in the way. The decision belongs where the positions are — plant only
    // once he is close AND still coming, which is the read a player makes.
    if (window.__def.charge) {
      const hn2 = window.__FEL_QA__.hero(); const meP = hn2 && (hn2.position || hn2);
      const gap = meP ? Math.hypot(meP.x - him.x, meP.z - him.z) : 99;
      const v = typeof dev.driveSpeed === 'function' ? dev.driveSpeed() : 0;
      // PLANT ON PROXIMITY, NOT ON A SPEEDOMETER. This gated on driveSpeed (no backticks: this comment lives in a
      // template literal, and one would end it — the FOURTH time in this session), which is the quantity the
      // GAME stopped trusting in 3v3 (a clocked drive's velocity vector is a by-product; it hovers 0.8-1.4 m/s) —
      // so the probe's own gate sat in that noise and two identical runs reported planted 0.4s / charges 1 and
      // planted 0.0s / charges 0. A defender deciding to plant does not consult a speedometer: he sees a man
      // coming. The game still judges the CLOSING RATE, which is the half that should be strict.
      if (gap <= 2.6) { window.__NEXUS_AGENT__.do('charge', { ms: 420 }); return; }
      void v;
    }
    // the point a metre off him on the rim side: stay in FRONT, which is also the only way to be inside the block's
    // range (1.2 m on a jumper) when his gather comes
    const tx = him.x - him.x * 0, tz = him.z;
    const dx = 0 - him.x, dz = -0.6 - him.z;
    const dl = Math.hypot(dx, dz) || 1;
    // PROTECT THE RIM ON A 3v3 DRIVE (suite pass, 2026-09-16). The team game's drive BENDS 1.6 m around whoever is in
    // front of it (DriveLine), so "a metre off him on the rim side" is a spot he no longer passes through: ten jumps
    // on ten gathers, ten open dunks at contest 0.00, zero stops. A defender who is beaten to the middle does what a
    // real one does — drops to the rim and meets the flight there. The spot is a metre off the iron on his side.
    const ph = typeof dev.attackPhase === 'function' ? dev.attackPhase() : '';
    // …and in 3v3 he plays DROP COVERAGE from the start of the possession (2026-09-17): the drive is 0.8 s, and a
    // defender who only starts dropping when it begins arrives 4–6 m late (measured). Sit at the spot, let it come.
    if (MODE === 'threevthree' && ph !== '') {
      const rl = Math.hypot(him.x - 0, him.z + 0.6) || 1;
      window.__steer(0 + ((him.x - 0) / rl) * 1.0, -0.6 + ((him.z + 0.6) / rl) * 1.0, 130);
      return;
    }
    window.__steer(tx + (dx / dl) * 1.0, tz + (dz / dl) * 1.0, 130);
  }, 120);
})()`);

const agent = async (expr: string) => page.evaluate(`(async () => { const a = window.__NEXUS_AGENT__; if (!a) return 'no bridge'; return await (${expr}); })()`);
const hud = async () => page.evaluate('window.__hudNow()') as Promise<Record<string, unknown>>;

const EYE = process.env.EYE === '1';
const EYE_TARGET = process.env.EYE_TARGET ?? 'hero';   // 'foe' frames the rival (in 1v1: the defender while I attack)
const EYE_OUT = `${OUT}/seq`; if (EYE) fs.mkdirSync(EYE_OUT, { recursive: true });
if (EYE) await page.evaluate(`(() => { const q = window.__FEL_QA__; const s = q && q.scene ? q.scene() : null; const hn = q.hero ? q.hero() : null; const p = hn && (hn.position || hn); if (!s || !p) return 'no scene';
  const V = p.constructor; const prev = s.activeCamera; const C = prev.constructor; const off = [${process.env.SIDE ?? '3.6,1.3,0.4'}];
  const cam = new C('eye_cam', new V(p.x + off[0], p.y + off[1], p.z + off[2]), s); cam.minZ = 0.05; cam.fov = prev.fov;
  const tgt = () => { if (${JSON.stringify(EYE_TARGET)} === 'foe') { const d = window.__dev && window.__dev(); const fr = d && (typeof d.driverRoot === 'function' ? d.driverRoot() : d.foeRoot); if (fr && fr.position) return fr.position; } return hn.position || hn; };
  const obs = s.onBeforeRenderObservable.add(() => { const pp = tgt(); cam.position.set(pp.x + off[0], pp.y + off[1], pp.z + off[2]); cam.setTarget(new V(pp.x, pp.y + 1.0, pp.z)); });
  s.activeCamera = cam; window.__eyeCam = { cam, prev, obs }; return 'on'; })()`).then((r) => console.log('[LAB] eye cam', r));
// SMOOTH=1 (polish pass, 2026-09-17): a per-RENDERED-FRAME recorder — hero and rival root / hands / head, the camera, the
// ball, the clips playing — so a pop (a hand that moved 0.3 m in one frame), a teleport, a camera cut or a clip that
// flip-flops can be counted and located instead of felt.
const SMOOTH = process.env.SMOOTH === '1';
if (SMOOTH) recT0 = Date.now();
if (SMOOTH) await page.evaluate(`(() => { const q = window.__FEL_QA__; const s = q && q.scene ? q.scene() : null; if (!s) return 'no scene';
  const MODE = ${JSON.stringify(MODE)};
  const skOf = (n) => { const st = [n]; while (st.length) { const x = st.pop(); if (x.skeleton) return x.skeleton; for (const c of (x.getChildren ? x.getChildren() : [])) st.push(c); } return null; };
  const bone = (sk, name) => { const b = sk ? sk.bones.find((b) => b.name.indexOf(name) === 0) : null; return b && b.getTransformNode ? b.getTransformNode() : null; };
  const rig = (root) => { const sk = skOf(root); return { root, sk, rh: bone(sk, 'RightHand'), lh: bone(sk, 'LeftHand'), head: bone(sk, 'Head') }; };
  const clipsOf = (r) => (s.animationGroups || []).filter((g) => g.isPlaying && g.targetedAnimations && g.targetedAnimations.some((ta) => r.sk && r.sk.bones.some((b) => b.getTransformNode && b.getTransformNode() === ta.target))).map((g) => g.name);
  const P = (n) => { if (!n) return null; const p = n.getAbsolutePosition ? n.getAbsolutePosition() : n.position; return [+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3)]; };
  const hero = rig(q.hero());
  let foe = null;
  const bodies = () => s.meshes.filter((m) => m.name.startsWith('__root__') && m !== hero.root && skOf(m)).map((m) => m.position);
  const rows = []; window.__smooth = rows; const t0 = performance.now(); window.__smoothT0 = t0;
  s.onAfterRenderObservable.add(() => {
    if (!foe) { const d = s.metadata && s.metadata[MODE]; const fr = d && (typeof d.driverRoot === 'function' ? d.driverRoot() : d.foeRoot); if (fr) foe = rig(fr); }
    const ball = s.getMeshByName('ball'); const cam = s.activeCamera;
    const clips = (s.animationGroups || []).filter((g) => g.isPlaying).map((g) => g.name);
    // BEHIND THE BACK: a hand in the body frame with z < -0.22 (behind the hips' plane) between the waist and the head
    const behind = (r) => { if (!r || !r.root) return ''; const m = r.root.getWorldMatrix().clone().invert(); const out = []; for (const [k, n] of [['rh', r.rh], ['lh', r.lh]]) { if (!n) continue; const w = n.getAbsolutePosition(); const l = w.constructor.TransformCoordinates(w, m); const z = Math.abs(l.z) > 20 ? l.z / 100 : l.z; if (z < -0.22 && l.y > 0.6 && l.y < 1.6) out.push(k); } return out.join('+'); };
    rows.push({ t: Math.round(performance.now() - t0), h: [P(hero.root), P(hero.rh), P(hero.lh), P(hero.head)], f: foe ? [P(foe.root), P(foe.rh), P(foe.lh), P(foe.head)] : null, cam: P(cam), ball: ball && ball.isEnabled() ? P(ball) : null, clips, hc: clipsOf(hero), fc: foe ? clipsOf(foe) : [], hb: behind(hero), fb: behind(foe), gap: +Math.min(99, ...bodies().map((b) => Math.hypot(b.x - hero.root.position.x, b.z - hero.root.position.z))).toFixed(2) });
  });
  return 'recording'; })()`).then((r) => console.log('[LAB] smooth', r));
const started = await agent('a.start(30000)');
console.log('[LAB] bridge start →', JSON.stringify(started));
await page.waitForTimeout(1500);

interface Poss {
  n: number; possession: string; play: string; charge: number;
  meterPeak: number; shotType?: string; scored: number; conceded: number;
  beats: string[]; trace?: string[];
}
const rows: Poss[] = [];
const paceMarks: { t: number; label: string }[] = [];   // DRIBBLE PACE: recorder-clock marks of the pace play's steps
let logMark = 0;
const PLAYS = ['jumper', 'layup', 'dunk'];

// EVERY POSSESSION IS THE ONE I ASKED FOR. The first run of this loop measured one offensive possession and then
// eight straight defensive ones, because make-it-take-it is the rule and a lab that cannot stop the rival never gets
// the ball back — 1 shot per game is not a sample. Both modes already expose `offense()` / `defend()` on the dev seam
// for exactly this (they exist "so a probe can reach either possession deterministically"), so the lab uses them and
// the SIDE under test is chosen by PLAY rather than by who happens to be winning.
// CHARGE is a defensive possession too — you are standing in his way waiting to wear it.
const wantDefence = PLAY === 'defence' || PLAY === 'charge';
const PLAYS_ALL = ['jumper', 'layup', 'dunk', 'handle', 'trick', 'screen', 'pace', 'rstick', 'posthook', 'pausin'];   // what PLAY can name
await page.evaluate(`(() => { window.__brain = ${wantDefence}; window.__def.block = ${PLAY !== 'charge'}; window.__def.charge = ${PLAY === 'charge'}; })()`);

/**
 * Drive at the rim until it is `stop` metres away (or 2.5 s go by), going AROUND the defender.
 *
 * Driving straight down the middle is how the first version of this lost the ball on most of its layup
 * possessions: the mode strips a carrier who comes within 1.6 m of a defender with his hands live, which is correct
 * basketball and a bad probe. So when he is inside 2.2 m the target slides to whichever side of the rim I am
 * already on — a drive with an angle on it, which is what a player does.
 */
async function driveToRim(stop: number): Promise<void> {
  const t0 = Date.now();
  while (Date.now() - t0 < 2500) {
    const done = await page.evaluate(`(() => {
      const q = window.__FEL_QA__; const d = window.__dev();
      const hn = q && q.hero ? q.hero() : null;
      const me = hn && (hn.position || hn);
      if (!me || typeof me.x !== 'number') return true;
      const RX = 0, RZ = -0.6;
      if (Math.hypot(me.x - RX, me.z - RZ) <= ${stop}) return true;
      let tx = RX, tz = RZ;
      const him = d && d.foeRoot ? d.foeRoot.position : null;
      if (him && Math.hypot(me.x - him.x, me.z - him.z) < 2.2) tx = RX + (me.x >= him.x ? 1.3 : -1.3);
      window.__steer(tx, tz, 140);
      return false;
    })()`);
    if (done) return;
    await page.waitForTimeout(130);
  }
}
for (let n = 0; n < POSSESSIONS; n++) {
  await page.evaluate(`(() => { const d = window.__dev(); if (!d) return; ${wantDefence ? 'd.defend && d.defend()' : 'd.offense && d.offense()'}; })()`);
  // …and the possession has to have STARTED: a squeeze thrown during the reset (or the 3-2-1) is eaten, which is what
  // made the first run's jumper report a meter peak of 0.00 with no gather beat and no rim contact anywhere in the log.
  { const t = Date.now();
    while (Date.now() - t < 6000) {
      const ready = await page.evaluate(`(() => { const d = window.__dev(); if (!d) return false; return ${wantDefence ? "d.possession ? d.possession() === 'defense' : d.carrier && d.carrier() === 'foeTeam'" : '!!(d.post && d.post().carrying)'}; })()`);
      if (ready) break;
      await page.waitForTimeout(150);
    } }
  const before = await hud();
  await page.evaluate('(() => { window.__meter = { peak: 0, frames: 0 }; })()');

  const onOffence = !wantDefence;
    const eyeP = EYE ? (async () => {   // frames of the sequence, armed BEFORE the play (it polls while the play runs)
      const t0 = Date.now(); let fired = false;
      while (Date.now() - t0 < 4500 && !fired) {
        const go = await page.evaluate(`(() => { const d = window.__dev(); const p = d && d.post ? d.post() : {}; const fk = d && d.flightK ? d.flightK() : -1; const ja = d && d.myJumpAge ? d.myJumpAge() : Infinity; return !!(p.shooting || p.finish || p.gather || fk >= 0 || ja < 0.3); })()`).catch(() => false);
        if (go) { fired = true; for (let i = 0; i < 8; i++) { const held = await page.evaluate(`(() => { const d = window.__dev(); const p = d && d.post ? d.post() : {}; const h = window.__hudNow(); const hn = window.__FEL_QA__.hero(); const y = hn && (hn.position || hn).y; return (p.held || '-') + ' ' + (h.shotType || '') + ' ' + (h.banner || '') + ' y=' + (typeof y === 'number' ? y.toFixed(2) : '?'); })()`).catch(() => '?'); await page.screenshot({ path: `${EYE_OUT}/${TAG}-p${n}-${i}.png`, clip: { x: 360, y: 90, width: 560, height: 620 } }); console.log(`[EYE] p${n} #${i} ${held}`); await page.waitForTimeout(110); } }
        else await page.waitForTimeout(50);
      }
      if (!fired) console.log(`[EYE] p${n} nothing to frame`);
    })() : null;
  const play = onOffence ? (PLAY === 'mix' ? PLAYS[n % PLAYS.length] : PLAY) : 'defence';
  let trace: string[] = [];
  if (onOffence) {
    // THE THREE FINISHES, aimed rather than hoped for. Distance is bought with drive time: classifyShot's layup band
    // is 2.2 m planar, the floater band runs to FLOATER_RANGE, and checkDriveDunk additionally wants speed and turbo —
    // which is what `sprint` buys, and why the dunk play never releases the stick before the squeeze.
    if (play === 'handle') {
      // THROW THE HANDLE. A dribble move is not a button here — the mode reads a hard stick REVERSAL (within
      // DribbleController.REVERSAL_WINDOW_SEC, 0.25 s) as a crossover and a pull-BACK as a hesi, and
      // `moveFromContext` picks which move of the twelve that reversal becomes from the situation. So the probe
      // does what a thumb does: shove one way, snap the other, and let the mode decide what it was.
      // MOVE PACE: HANDLE_TURBO=1 throws the moves on the turbo (R2 held). The bridge's `move` still infers sprint above magnitude
      // 0.85 (the slot itself reads R2), so the OFF-turbo shove is 0.8 — past the crossover's 0.6 commit, under the bridge's sprint.
      const verb = process.env.HANDLE_TURBO ? 'turbo' : 'move'; const amp = process.env.HANDLE_TURBO ? 1 : 0.8;
      for (let i = 0; i < 5; i++) {
        const sx = i % 2 === 0 ? amp : -amp;
        await agent(`a.do('${verb}', { x: ${sx}, y: 0.15, ms: 170 })`);
        await agent(`a.do('${verb}', { x: ${-sx}, y: 0.15, ms: 170 })`);   // the reversal — this is the crossover
        if (i === 2) { await agent(`a.do('move', { x: 0, y: -1, ms: 200 })`); }   // …and a pull-back for the hesi
      }
    }
    else if (play === 'trick') {
      // THE FLICK IS TIMED IN THE PAGE, off the mode's own flight clock. Timed from node it landed at k 0.88-0.93
      // every single attempt — the flight is 550 ms and a page.evaluate round trip under a loaded headed browser is
      // most of it, so "wait 190 ms then flick" measured the round trip, not the player. Same lesson as the block,
      // which had to move in-page for the same reason: a window this short cannot be hit across a socket.
      //
      // THE RIGHT STICK IS NOT ON THE SLOT either — the mode reads look/trick off the RAW stream, so the agent
      // bridge cannot reach it. No new seam needed: InputBus.emit is public (the touch overlay calls it) and
      // ModeHarness publishes the bus on `__FEL_DEV__.input`, so this is the real path a thumb uses.
      await page.evaluate(`(() => {
        const bus = window.__FEL_DEV__ && window.__FEL_DEV__.input;
        const dev = window.__dev();
        if (!bus || !dev || typeof dev.flightK !== 'function') return 'no seam';
        const AIM = ${Number(process.env.FLICK_AT ?? 0.4)};   // where in the flight to throw it
        const id = setInterval(() => {
          const k = dev.flightK();
          if (k < 0) return;                       // not airborne
          if (k >= AIM) {
            clearInterval(id);
            bus.emit({ t: 'stick', side: 'R', x: 0, y: -1 });   // UP = tomahawk
            setTimeout(() => bus.emit({ t: 'stick', side: 'R', x: 0, y: 0 }), 100);
          }
        }, 8);
        setTimeout(() => clearInterval(id), 3000);
        return 'armed';
      })()`);
      // …and only THEN the dunk, so the watcher is already polling when the feet leave.
      await driveToRim(2.4);
      await agent(`a.act({ moveX: 0, moveY: 1, sprint: true, turbo: true, actionHeld: ${CHARGE} }, ${Math.round(600 * CHARGE)})`);
      await agent(`a.act({ moveX: 0, moveY: 1, sprint: true, turbo: true, actionHeld: 0, action: true }, 60)`);
    }
    else if (play === 'rstick') {
      // STICK HANDLE (2K17): the right stick thrown IN-PAGE (the mode reads it off the raw stream — the bridge cannot reach it)
      // while the left stick jogs at the defender: momentum spam (right/left/right/left), a hold (pausin') and its release,
      // a half-circle sweep (the steezo roll), a down flick (momentum behind the back / hesi). Counted off [X-STICK] / [X-HANDLE].
      const mark = async (label: string) => { const t = await page.evaluate('performance.now() - (window.__smoothT0 || 0)') as number; paceMarks.push({ t: Math.round(t), label }); };
      await mark('stick');
      await page.evaluate(`(() => {
        const bus = window.__FEL_DEV__ && window.__FEL_DEV__.input; if (!bus) return 'no bus';
        const R = (x, y) => bus.emit({ t: 'stick', side: 'R', x, y });
        const flick = (at, x, y) => { setTimeout(() => R(x, y), at); setTimeout(() => R(x * 0.9, y * 0.9), at + 30); setTimeout(() => R(0, 0), at + 90); };
        flick(350, 1, 0); flick(700, -1, 0); flick(1050, 1, 0); flick(1400, -1, 0);      // the momentum spam
        setTimeout(() => R(1, 0.1), 1900); setTimeout(() => R(0.95, 0.1), 2000); setTimeout(() => R(0.95, 0.1), 2200); setTimeout(() => R(0, 0), 2450);   // pausin' … release
        for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 + (i / 8) * Math.PI; setTimeout(() => R(Math.cos(a) * 0.95, Math.sin(a) * 0.95), 2800 + i * 28); }   // the sweep: the steezo roll
        setTimeout(() => R(0, 0), 3100);
        flick(3500, 0.2, 1);                                                              // down: momentum behind the back (hesi when slow)
        flick(3900, 1, 0); flick(4200, -1, 0);                                            // out of it: two more
        return 'armed';
      })()`);
      await agent(`a.act({ moveX: 0, moveY: 0.6 }, 1500)`);
      await agent(`a.act({ moveX: 0, moveY: 0.35 }, 1300)`);
      await agent(`a.act({ moveX: 0, moveY: 0.6 }, 1700)`);
      await mark('end');
      await agent(`a.do('shoot', { charge: ${CHARGE} })`);
    }
    else if (play === 'posthook') {
      // POST HOOK (2K20): drive in, post up (L2 via the bridge's postup), then the R stick up-right HELD in-page and let go
      await driveToRim(3.4);
      await page.evaluate(`(() => { const bus = window.__FEL_DEV__ && window.__FEL_DEV__.input; if (!bus) return; const R = (x, y) => bus.emit({ t: 'stick', side: 'R', x, y });
        setTimeout(() => R(0.7, -0.7), 500); setTimeout(() => R(0.72, -0.7), 700); setTimeout(() => R(0.72, -0.7), 900); setTimeout(() => R(0, 0), 1150); })()`);
      await agent(`a.do('postup', { ms: 1600 })`);
      await page.waitForTimeout(600);
    }
    else if (play === 'pausin') {
      // PAUSIN' (2K21): the drive with the turbo, the sweep thrown in-page at ~5 m — the drop step, then the spin into the dunk
      await driveToRim(6.0);
      await page.evaluate(`(() => { const bus = window.__FEL_DEV__ && window.__FEL_DEV__.input; if (!bus) return; const R = (x, y) => bus.emit({ t: 'stick', side: 'R', x, y });
        for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 + (i / 8) * Math.PI; setTimeout(() => R(Math.cos(a) * 0.95, Math.sin(a) * 0.95), 260 + i * 26); } setTimeout(() => R(0, 0), 520); })()`);
      await agent(`a.act({ moveX: 0, moveY: 1, sprint: true, turbo: true }, 1400)`);
      await page.waitForTimeout(900);
    }
    else if (play === 'pace') {
      // DRIBBLE PACE: walk, jog, stop (−x), then jog, turbo, let off, press again (the change of pace), stop (+x) — the speed
      // profile is read off the smoothness recorder's hero root afterwards (paceMarks: recorder-clock ms at each step).
      // Sideways so the run stays on the court; the bridge's `move` SPRINTS above magnitude 0.85, so the jog is 0.75.
      const mark = async (label: string) => { const t = await page.evaluate('performance.now() - (window.__smoothT0 || 0)') as number; paceMarks.push({ t: Math.round(t), label }); };
      await mark('walk');    await agent(`a.do('move', { x: -0.3, y: 0, ms: 800 })`);
      await mark('jog');     await agent(`a.do('move', { x: -0.75, y: 0, ms: 700 })`);
      await mark('jogstop'); await agent(`a.do('move', { x: 0, y: 0, ms: 700 })`);
      await mark('jog2');    await agent(`a.do('move', { x: 0.75, y: 0, ms: 500 })`);
      await mark('turbo');   await agent(`a.do('turbo', { x: 1, y: 0, ms: 550 })`);
      await mark('off');     await agent(`a.do('move', { x: 0.75, y: 0, ms: 260 })`);
      await mark('press');   await agent(`a.do('turbo', { x: 1, y: 0, ms: 400 })`);
      await mark('stop');    await agent(`a.do('move', { x: 0, y: 0, ms: 800 })`);
      await mark('end');
    }
    else if (play === 'screen') {
      // CALL FOR A SCREEN, then drive off it. 3v3 only — 1v1 answers the press with NO TEAMMATE TO SCREEN, which is
      // itself the thing worth seeing.
      await agent(`a.do('screen')`);
      await page.waitForTimeout(400);
      await driveToRim(3.2);
      await agent(`a.do('shoot', { charge: ${CHARGE} })`);
    }
    else if (play === 'jumper') await agent(`a.do('shoot', { charge: ${CHARGE} })`);   // from the reset spot, no drive
    else if (play === 'dunk') {
      // THE STICK IS STILL DOWN WHEN THE TRIGGER GOES. `do('sprint')` then `do('shoot')` is TWO queued intents, and
      // the second one lets go of the stick — so by the squeeze the sprint is over, `sprintOk` is false and the
      // gate (correctly, now) reads a layup. A thumb does not work that way: it holds the drive AND squeezes. So
      // this play holds moveY/sprint through both halves of the shot, which is the only way to ask for a dunk.
      // ANGLE THE DRIVE on alternate trips. Straight down the middle into the defender is the poster/tomahawk
      // branch every single time — ten dunks, three logged, all TOMAHAWK, all correct for a drive shape the probe
      // never varied. A dunk vocabulary you only ever see one page of is not measured, so half the trips swing out
      // to the wing first and attack ACROSS the face of the rim, which is the windmill's shape.
      if (n % 2 === 1) {
        const side = n % 4 === 1 ? 3.0 : -3.0;
        const t0 = Date.now();
        while (Date.now() - t0 < 1400) {
          const there = await page.evaluate(`window.__steer(${side}, 2.4, 140) === false`);
          if (there) break;
          await page.waitForTimeout(130);
        }
      }
      await driveToRim(2.4);
      await agent(`a.act({ moveX: 0, moveY: 1, sprint: true, turbo: true, actionHeld: ${CHARGE} }, ${Math.round(600 * CHARGE)})`);
      await agent(`a.act({ moveX: 0, moveY: 1, sprint: true, turbo: true, actionHeld: 0, action: true }, 80)`);
    }
    else if (play === 'showtime') {   // SHOWTIME: R2 + the right stick held BACK into the rim, SQUARE timed at the flush (in-page, off flightK)
      await page.evaluate(`(() => {
        const dev = window.__dev(); const bus = window.__FEL_DEV__ && window.__FEL_DEV__.input; if (!dev || !bus) return 'no bus';
        bus.emit({ t: 'stick', side: 'R', x: 0, y: 1 });   // back, and held
        let pressed = false; const t0 = Date.now();
        const id = setInterval(() => { const k = dev.flightK(); if (k >= ${Number(process.env.PRESS_K ?? 0.53)} && !pressed) { pressed = true; bus.emit({ t: 'button', btn: 'X', pressed: true }); setTimeout(() => bus.emit({ t: 'button', btn: 'X', pressed: false }), 60); }
          if (pressed || Date.now() - t0 > 6000) { clearInterval(id); bus.emit({ t: 'stick', side: 'R', x: 0, y: 0 }); } }, 8);
        return 'armed'; })()`);
      await driveToRim(2.4);
      await agent(`a.act({ moveX: 0, moveY: 1, sprint: true, turbo: true, actionHeld: ${CHARGE} }, ${Math.round(600 * CHARGE)})`);
      await agent(`a.act({ moveX: 0, moveY: 1, sprint: true, turbo: true, actionHeld: 0, action: true }, 80)`);
    }
    else if (play === 'standing') {   // DEFENSE-LOOK: walk in under the rim, stop, R2 + Square with no run-up
      await page.evaluate(`(() => { const d = window.__dev(); return d && d.standing ? d.standing() : false; })()`);   // the seam sets the geometry (a steered walk-in got stripped or never arrived)
      await page.waitForTimeout(350);
      await agent(`a.act({ moveX: 0, moveY: 0.25, sprint: true, turbo: true, actionHeld: ${CHARGE} }, ${Math.round(600 * CHARGE)})`);
      await agent(`a.act({ moveX: 0, moveY: 0.25, sprint: true, turbo: true, actionHeld: 0, action: true }, 80)`);
    }
    else if (play === 'baseline') {   // DEFENSE-LOOK: to the corner beside the rim, then along the baseline at it
      const t0 = Date.now();
      while (Date.now() - t0 < 3200) { const there = await page.evaluate(`window.__steer(4.2, -0.4, 140) === false`); if (there) break; await page.waitForTimeout(130); }
      await agent(`a.act({ moveX: 0, moveY: 0 }, 200)`);
      const t1 = Date.now();
      while (Date.now() - t1 < 1100) { const there = await page.evaluate(`window.__steer(1.4, -0.6, 140) === false`); if (there) break; await page.waitForTimeout(100); }
      await agent(`a.act({ moveX: -1, moveY: 0, sprint: true, turbo: true, actionHeld: ${CHARGE} }, ${Math.round(600 * CHARGE)})`);
      await agent(`a.act({ moveX: -1, moveY: 0, sprint: true, turbo: true, actionHeld: 0, action: true }, 80)`);
    }
    else if (play === 'layup') {
      // DRIVE, THEN GATHER. A full-stick drive is a SPRINT — AgentControlSource derives sprint from the stick
      // magnitude (`hypot > 0.85`), exactly as LocalInputSource does — so arriving at the rim at full speed with
      // turbo in hand satisfies checkDriveDunk and the squeeze becomes a DUNK, never a layup. Measured: four
      // "layup" possessions, four zero meters, not one `[1V1-MOVE] finish` in the log. A layup is taken off a
      // gathered stride, so the last beat comes off the gas.
      // …and the drive is measured, not timed: a fixed 1200 ms put me anywhere from the block to past the baseline
      // depending on what the defender did, which is most of the variance between two runs of the same play.
      await driveToRim(2.6);
      await agent(`a.act({ moveX: 0, moveY: 0.45, actionHeld: ${CHARGE} }, ${Math.round(600 * CHARGE)})`);
      await agent(`a.act({ moveX: 0, moveY: 0.45, actionHeld: 0, action: true }, 80)`);
    }

    // WHAT DID THE SQUEEZE ACTUALLY DO? A possession that reports "meter 0.00, no beats, no points" is not evidence of
    // a bad layup — it is the absence of a shot, and the mode's own seam says which. Sampled to feet-down.
    if (eyeP) await eyeP;
    trace = await page.evaluate(`(async () => {
      const seen = []; const t0 = Date.now();
      while (Date.now() - t0 < 3200) {
        const d = window.__dev(); const p = d && d.post ? d.post() : null;
        if (p) {
          const k = [p.carrying ? 'ball' : '-', p.shooting ? 'shoot' : '-', p.finish ? 'finish' : '-', p.gather ? 'gather' : '-', window.__hudNow().shotType || ''].join('/');
          if (k !== seen[seen.length - 1]) seen.push(k);
        }
        await new Promise((r) => setTimeout(r, 60));
      }
      return seen.slice(0, 12);
    })()`) as string[];
  } else if (play === 'charge') {
    // the page brain plants the feet when he is actually coming (see __def.charge); here we just let it happen
    await page.waitForTimeout(1600);
  } else {
    // the brain above is already mirroring and blocking; hold the grounded hand-up under it
    await agent(`a.do('contest', { ms: 1400 })`);
  }
  await page.waitForTimeout(2600);   // the arc, the board, the whistle

  const after = await hud();
  const meter = await page.evaluate('window.__meter') as { peak: number; frames: number };
  const fresh = log.slice(logMark); logMark = log.length;
  const p: Poss = {
    n: n + 1,
    possession: onOffence ? 'offence' : 'defence',
    play,
    charge: CHARGE,
    meterPeak: +(meter?.peak ?? 0).toFixed(3),
    shotType: String(after.shotType ?? '') || undefined,
    scored: Number(after.score ?? 0) - Number(before.score ?? 0),
    conceded: Number(after.foeScore ?? 0) - Number(before.foeScore ?? 0),
    beats: fresh.map((l) => l.replace(/^\d+ /, '')).slice(0, 10),
    trace,
  };
  rows.push(p);
  const shot = p.beats.find((b) => /\[1V1-MOVE\] (finish|gather)|\[1V1-RIM\]|\[3V3/.test(b)) ?? '';
  console.log(`#${String(p.n).padStart(2)} ${p.play.padEnd(8)} meter ${p.meterPeak.toFixed(2)} +${p.scored}/-${p.conceded}  ${String(after.score ?? '?')}-${String(after.foeScore ?? '?')}  ${(trace.join(' > ') || shot).slice(0, 120)}`);
  if (n < 3) await page.screenshot({ path: `${OUT}/${TAG}-p${p.n}.png` });
}

const def = await page.evaluate('window.__def') as { jumps: number; gathers: number; driverPeak: number; plantedMs: number; closestWhilePlanted: number };
// the ref owns the call now, so the log line is `[1V1-REF] charge ...` — this grepped the mode's old hand-rolled
// "charge taken" text and reported 0 while five were being called, which is a summary lying about a working game.
const chargesTaken = log.filter((l) => /REF\] charge |charge taken/.test(l)).length;
const handleMoves = log.filter((l) => /HANDLE\] move /.test(l)).map((l) => (l.match(/move (\w+) (\w+) → (\S+)/) ?? []).slice(1).join(' '));
const tricks = log.filter((l) => /trick \w+ (green|early|late)/.test(l));
// EVERY REF CALL, kept out of the `log` tail. `log` is sliced to the last 200 lines in the JSON below, so a call
// early in a run vanishes from it — which is how a run that drew a charge could report `chargesTaken 1` from the
// full log and show nothing at all when the saved slice was read back. Anything a summary counts must be saved
// beside the count, not left to a window that may have scrolled past it.
if (SMOOTH) {
  const rows = await page.evaluate('window.__smooth || []') as { t: number; h: (number[] | null)[]; f: (number[] | null)[] | null; cam: number[] | null; ball: number[] | null; clips: string[]; hc: string[]; fc: string[]; hb: string; fb: string; gap: number }[];
  const dist = (a: number[] | null, b: number[] | null) => (a && b ? Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) : 0);
  const stat = (name: string, pick: (r: typeof rows[number]) => (number[] | null)[] | null) => {
    const pops: { t: number; part: string; d: number; clips: string[]; prev: string[] }[] = []; let maxD = 0; let teleports = 0; let ySnaps = 0;
    for (let i = 1; i < rows.length; i++) {
      const a = pick(rows[i - 1]), b = pick(rows[i]); if (!a || !b) continue;
      const dt = Math.max(1, rows[i].t - rows[i - 1].t) / 1000; if (dt > 0.1) continue;   // a stall is not a pop
      const dRoot = dist(a[0], b[0]); if (dRoot / dt > 14) teleports++;
      if (a[0] && b[0] && Math.abs(a[0][1] - b[0][1]) > 0.3) ySnaps++;
      for (const [k, part] of [[1, 'rh'], [2, 'lh'], [3, 'head']] as const) {
        const d = dist(a[k], b[k]) - dRoot * 0; const rel = Math.abs(d - dRoot);   // the hand's move beyond the body's own travel
        if (rel > maxD) maxD = rel;
        if (rel > 0.22) pops.push({ t: rows[i].t, part, d: +rel.toFixed(2), clips: rows[i].clips.filter((c) => !/idle_stand|^run$|^walk$/.test(c)), prev: rows[i - 1].clips.filter((c) => !/idle_stand|^run$|^walk$/.test(c)) });
      }
    }
    return { name, frames: rows.length, pops: pops.length, maxHandJump: +maxD.toFixed(2), teleports, ySnaps, worst: pops.sort((x, y) => y.d - x.d).slice(0, 8) };
  };
  const hero = stat('hero', (r) => r.h), foe = stat('foe', (r) => r.f);
  let camCuts = 0, camMax = 0; const camCutAt: { t: number; d: number; clips: string[] }[] = [];
  for (let i = 1; i < rows.length; i++) { const d = dist(rows[i - 1].cam, rows[i].cam); const dt = Math.max(1, rows[i].t - rows[i - 1].t) / 1000; if (dt > 0.1) continue; if (d > camMax) camMax = d; if (d > 0.6) { camCuts++; if (camCutAt.length < 6) camCutAt.push({ t: rows[i].t, d: +d.toFixed(2), clips: rows[i].clips.slice(0, 3) }); } }
  // clip flip-flops: A → B → A within 4 frames
  let flips = 0; const flipAt: string[] = [];
  for (const who of ['hc', 'fc'] as const) { const key = (r: typeof rows[number]) => (r[who] || []).filter((c) => !/idle_stand|^run$|^walk$/.test(c)).sort().join('+');
    for (let i = 4; i < rows.length; i++) { const a = key(rows[i - 4]), b = key(rows[i - 2]), c = key(rows[i]); if (a && b && a !== b && c === a) { flips++; if (flipAt.length < 6) flipAt.push(`${who === 'hc' ? 'hero' : 'foe'} ${rows[i].t}ms ${a} ↔ ${b}`); } } }
  const ballPopAt: { t: number; d: number; y: number; clips: string[] }[] = [];
  for (let i = 1; i < rows.length; i++) { const a = rows[i - 1], b = rows[i]; if (a.ball && b.ball && b.t - a.t < 100 && dist(a.ball, b.ball) > 0.9) ballPopAt.push({ t: b.t, d: +dist(a.ball, b.ball).toFixed(2), y: b.ball[1], clips: b.clips.filter((c) => !/idle_stand|^run$|^walk$|defend_stance/.test(c)).slice(0, 4) }); }
  const ballPops = ballPopAt.length;
  // behind-the-back episodes: runs of consecutive frames with a hand behind the plane, with the clips playing
  const behindEp: { who: string; part: string; t: number; frames: number; clips: string }[] = [];
  for (const who of ['hb', 'fb'] as const) { let run: { part: string; t: number; n: number; clips: string } | null = null;
    for (const r of rows) { const v = r[who] || ''; if (v && run && run.part === v) run.n++; else { if (run && run.n >= 3) behindEp.push({ who: who === 'hb' ? 'hero' : 'foe', part: run.part, t: run.t, frames: run.n, clips: run.clips }); run = v ? { part: v, t: r.t, n: 1, clips: (who === 'hb' ? r.hc : r.fc).filter((c) => !/idle_stand|^run$|^walk$|defend_stance/.test(c)).join('+') } : null; } }
    if (run && run.n >= 3) behindEp.push({ who: who === 'hb' ? 'hero' : 'foe', part: run.part, t: run.t, frames: run.n, clips: run.clips }); }
  const summary = { hero, foe, camCuts, camMax: +camMax.toFixed(2), camCutAt, clipFlips: flips, flipAt, ballPops, behindEpisodes: behindEp.length, behindEp: behindEp.sort((a, b) => b.frames - a.frames).slice(0, 10) };
  fs.writeFileSync(`${OUT}/smooth-${TAG}.json`, JSON.stringify({ summary, rows }, null, 0));
  console.log(`SMOOTH ${TAG}: hero pops ${hero.pops} (max ${hero.maxHandJump} m) teleports ${hero.teleports} ySnaps ${hero.ySnaps} · foe pops ${foe.pops} (max ${foe.maxHandJump}) teleports ${foe.teleports} · cam cuts ${camCuts} (max ${camMax.toFixed(2)} m/frame) · clip flips ${flips} · ball pops ${ballPops} · ${rows.length} frames`);
  for (const w of hero.worst) console.log(`  hero pop ${w.part} ${w.d} m @${w.t}ms  ${w.prev.join('+') || '-'} → ${w.clips.join('+') || '-'}`);
  for (const w of foe.worst.slice(0, 4)) console.log(`  foe pop ${w.part} ${w.d} m @${w.t}ms  ${w.prev.join('+') || '-'} → ${w.clips.join('+') || '-'}`);
  for (const c of camCutAt) console.log(`  cam cut ${c.d} m @${c.t}ms ${c.clips.join('+')}`);
  for (const f of flipAt) console.log(`  clip flip ${f}`);
  for (const b of ballPopAt.slice(0, 8)) console.log(`  ball pop ${b.d} m @${b.t}ms y ${b.y} ${b.clips.join('+')}`);
  printVerdicts(TAG, analyseBallPath(rows, outcomes));
  if (paceMarks.some((x) => x.label === 'stick')) {   // STICK HANDLE: the hero's speed through each stick possession, 100 ms bins
    const sp: { t: number; v: number }[] = [];
    for (let i = 1; i < rows.length; i++) { const a = rows[i - 1].h?.[0], b = rows[i].h?.[0]; const dt = (rows[i].t - rows[i - 1].t) / 1000; if (!a || !b || dt <= 0 || dt > 0.1) continue; sp.push({ t: rows[i].t, v: Math.hypot(b[0] - a[0], b[2] - a[2]) / dt }); }
    const starts = paceMarks.filter((x) => x.label === 'stick').map((x) => x.t);
    for (const t0 of starts.slice(0, 3)) { const line: string[] = []; for (let t = t0; t <= t0 + 4600; t += 100) { const w = sp.filter((s) => Math.abs(s.t - t) <= 50 && s.v < 12).map((s) => s.v).sort((a, b) => a - b); line.push(w.length ? w[w.length >> 1].toFixed(1) : '-'); } console.log(`STICK ${TAG} @${t0}: ${line.join(' ')}`); }
  }
  // DRIBBLE PACE: the hero's ground speed through the pace play, 50 ms bins, with the step marks — top speeds per gear,
  // time to 95 % of the sprint after the press, the stop's length from the sprint and from the jog
  if (paceMarks.length && paceMarks.some((x) => x.label === 'walk')) {
    const sp: { t: number; v: number }[] = [];
    for (let i = 1; i < rows.length; i++) { const a = rows[i - 1].h?.[0], b = rows[i].h?.[0]; const dt = (rows[i].t - rows[i - 1].t) / 1000; if (!a || !b || dt <= 0 || dt > 0.1) continue; sp.push({ t: rows[i].t, v: Math.hypot(b[0] - a[0], b[2] - a[2]) / dt }); }
    const at = (t: number) => sp.filter((s) => Math.abs(s.t - t) <= 40).map((s) => s.v).sort((a, b) => a - b)[Math.floor(sp.filter((s) => Math.abs(s.t - t) <= 40).length / 2)] ?? NaN;
    const m = Object.fromEntries(paceMarks.map((x) => [x.label, x.t]));
    const line: string[] = [];
    for (let t = m.walk; t <= m.end; t += 50) { const v = at(t); const lab = paceMarks.find((x) => Math.abs(x.t - t) < 25)?.label; line.push(`${lab ? lab + ':' : ''}${Number.isFinite(v) ? v.toFixed(1) : '-'}`); }
    console.log(`PACE ${TAG}: ${line.join(' ')}`);
    const peak = (from: number, to: number) => Math.max(0, ...sp.filter((s) => s.t >= from && s.t < to && s.v < 12).map((s) => s.v));   // a reset's teleport is not a speed
    const reach = (from: number, to: number, target: number) => { const f = sp.find((s) => s.t >= from && s.t < to && s.v >= target); return f ? f.t - from : -1; };
    const stopLen = (from: number, to: number) => { const f = sp.find((s) => s.t >= from + 60 && s.t < to && s.v < 0.3); return f ? f.t - from : -1; };
    console.log(`PACE ${TAG}: walk peak ${peak(m.walk, m.jog).toFixed(1)} · jog peak ${peak(m.jog, m.jogstop).toFixed(1)} · stop from jog ${stopLen(m.jogstop, m.jog2)} ms · sprint peak ${peak(m.turbo, m.off).toFixed(1)} (6.0 in ${reach(m.turbo, m.off, 6.0)} ms) · off-the-turbo low ${Math.min(...sp.filter((s) => s.t >= m.off + 100 && s.t < m.press).map((s) => s.v)).toFixed(1)} · press peak ${peak(m.press, m.stop).toFixed(1)} · stop from sprint ${stopLen(m.stop, m.end)} ms`);
  }
  // BODY OVERLAP: frames with another body's root inside OVERLAP_M of the hero's (two 0.55 m bodies cannot be closer than 1.1 m without passing through each other)
  const OVERLAP_M = 0.7; const over = rows.filter((r) => typeof r.gap === 'number' && r.gap < OVERLAP_M); const minGap = Math.min(...rows.map((r) => (typeof r.gap === 'number' ? r.gap : 99)));
  const overEp: { t: number; n: number; gap: number; clips: string }[] = []; let run: { t: number; n: number; gap: number; clips: string } | null = null;
  for (const r of rows) { if (typeof r.gap === 'number' && r.gap < OVERLAP_M) { if (run) { run.n++; run.gap = Math.min(run.gap, r.gap); } else run = { t: r.t, n: 1, gap: r.gap, clips: r.hc.filter((c) => !/idle_stand|^run$|^walk$/.test(c)).join('+') }; } else if (run) { overEp.push(run); run = null; } }
  if (run) overEp.push(run);
  console.log(`  body overlap: ${over.length} frames under ${OVERLAP_M} m (closest ${minGap.toFixed(2)} m), ${overEp.length} episodes`); for (const e of overEp.sort((a, b) => b.n - a.n).slice(0, 6)) console.log(`  overlap ${e.n} frames from @${e.t}ms closest ${e.gap.toFixed(2)} m ${e.clips || '-'}`);
  console.log(`  behind-the-back episodes ${behindEp.length}`); for (const e of summary.behindEp) console.log(`  behind ${e.who} ${e.part} ${e.frames} frames @${e.t}ms ${e.clips || '-'}`);
}
const refCalls = log.filter((l) => /-REF\]/.test(l)).map((l) => l.replace(/^\d+ /, ''));
const screensCalled = log.filter((l) => /screen called/.test(l)).length;
const off = rows.filter((r) => r.possession === 'offence');
const made = off.filter((r) => r.scored > 0).length;
const defence = rows.filter((r) => r.possession === 'defence');
const stops = defence.filter((r) => r.conceded === 0).length;
const byPlay = PLAYS.map((k) => { const s = off.filter((r) => r.play === k); return { play: k, n: s.length, made: s.filter((r) => r.scored > 0).length }; });
const final = await hud();
const out = {
  tag: TAG, mode: MODE, charge: CHARGE, play: PLAY,
  possessions: rows.length,
  offence: off.length, made, makePct: off.length ? Math.round((made / off.length) * 100) : null,
  byPlay,
  defence: defence.length, stops, stopPct: defence.length ? Math.round((stops / defence.length) * 100) : null,
  blockJumps: def?.jumps ?? 0, gathersSeen: def?.gathers ?? 0,
  handleMoves, tricks, refCalls, chargesTaken, screensCalled, driverPeakSpeed: +(def?.driverPeak ?? 0).toFixed(2),
  plantedMs: def?.plantedMs ?? 0, closestWhilePlanted: +(def?.closestWhilePlanted ?? 99).toFixed(2),
  finalScore: [final.score ?? null, final.foeScore ?? null], target: final.target ?? null,
  rows, log: log.slice(-200),
  defLog: log.filter((l) => /-DEF\]|-DUNK\]|-REF\]|-SHOT\]|-MOVE\]|-STICK\]|-HANDLE\]|-PACE\]|-CONTACT\]/.test(l)).map((l) => l.replace(/^\d+ /, '')),   // suite pass: the release diagnostics, unsliced
};
fs.writeFileSync(`${OUT}/hoops-lab-${TAG}.json`, JSON.stringify(out, null, 1));
console.log(`\n${MODE} charge ${CHARGE} · offence ${made}/${off.length}${out.makePct !== null ? ` (${out.makePct}%)` : ''} · ${byPlay.map((b) => `${b.play} ${b.made}/${b.n}`).join(' · ')}`);
console.log(`defence: stops ${stops}/${defence.length} · block jumps ${out.blockJumps} on ${out.gathersSeen} gathers · charges ${chargesTaken} (driver peak ${(def?.driverPeak ?? 0).toFixed(1)} m/s vs 4.2 needed) · planted ${((def?.plantedMs ?? 0) / 1000).toFixed(1)}s, closest ${(def?.closestWhilePlanted ?? 99).toFixed(2)}m (CHARGE_RANGE is BODY_STANDOFF + 0.5) · screens ${screensCalled} · score ${String(final.score)}-${String(final.foeScore)} to ${String(final.target)}`);
console.log(`→ ${OUT}/hoops-lab-${TAG}.json`);
await browser.close();
