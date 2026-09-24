// BRAINBRAWL-RESIDUAL probe (2026-09-24) — the eye's HARD 1–3 and the extras on 252548b, measured through the real host
// (/dev/brainbrawl: the component /play/brain-brawl mounts, card included, plus the shell's REPLAY seam).
//
//   RUN=solo   one pad: the splash's A → a solo match (right / wrong / time / right / right), the finish, REPLAY → round one
//   RUN=duel   ?players=2, P1 faces / P2 d-pad, four rounds
//   RUN=nopad  no pad: the splash, then the PLAYERS pick must WAIT on 1P (no timer) and A ('j') must start at once
//   RUN=phone  the solo start and two rounds at 390×844
//
// Before the browser: the pure sweep — every category × tier over thousands of seeds through BrainBrawlCore.solveCard, the
// reader that answers a card from its prompt, display and options alone. In the browser, every card that reaches the stage is
// read the same way (the card on scene.metadata.qaCard is checked against what the HUD showed) and must have EXACTLY one right
// option, and it must be the key.
//
//   PORT=3011 OUT=/tmp/bbr RUN=solo node node_modules/tsx/dist/cli.mjs scripts/probes/_brainbrawl-residual-probe.mts
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';
import * as coreNs from '../../lib/babylon/core/BrainBrawlCore.ts';
import * as rosterNs from '../../lib/babylon/core/athleteRoster.ts';
const unwrap = <T,>(ns: T): T => ((ns as unknown as { default?: T }).default ?? ns);   // the app's modules load as CommonJS under tsx
const core = unwrap(coreNs), roster = unwrap(rosterNs);

const PORT = process.env.PORT ?? '3011';
const OUT = process.env.OUT ?? '/tmp/brainbrawl-residual';
const RUN = (process.env.RUN ?? 'solo') as 'solo' | 'duel' | 'nopad' | 'phone';
const PLAYERS = RUN === 'duel' ? 2 : 1;
const PLAN_P1 = PLAYERS === 2 ? ['right', 'wrong', 'time', 'right'] : ['right', 'wrong', 'time', 'right', 'right'];
const PLAN_P2 = ['wrong', 'right', 'right', 'time'];
fs.mkdirSync(OUT, { recursive: true });
const FACE_BTN = [0, 1, 2, 3], DPAD_BTN = [12, 15, 13, 14];

// ── the pure sweep ──────────────────────────────────────────────────────────────────────────────────────────────────
function sweep() {
  let cards = 0; const faults: string[] = []; const negative: string[] = [];
  for (let seed = 1; seed <= 2000; seed++) {
    const rnd = core.mulberry32(seed * 104729 + 7);
    for (const cat of core.CATEGORIES) for (const tier of [1, 2, 3] as const) {
      const c = core.drawChallenge(cat, tier, rnd); cards++;
      const right = core.solveCard(c);
      if (right.length !== 1 || right[0] !== c.answer) faults.push(`${c.prompt} | ${c.options.join(' / ')} | key ${c.options[c.answer]} | reads ${right.length}`);
      for (const f of core.cardFaults(c)) faults.push(f);
      if (/^How many|^Solve it/.test(c.prompt) && c.options.some((o: string) => Number(o) < 0)) negative.push(c.options.join(' / '));
    }
  }
  return { cards, exactlyOneRight: cards - faults.length, faults: faults.slice(0, 5), negativeOptions: negative.length };
}

async function main() {
  const pure = sweep();
  console.log('[sweep]', JSON.stringify(pure));
  const browser = await chromium.launch({ headless: true, executablePath: chromiumExe(), args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const phone = RUN === 'phone';
  const bctx = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 860 } });
  const p = await bctx.newPage();
  await p.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
  await p.addInitScript((noPad: boolean) => {
    const pad: any = { index: 0, id: 'fake-dualshock', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: Date.now(), buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    (window as any).__PAD = pad; (navigator as any).getGamepads = () => (noPad ? [] : [pad]);
  }, RUN === 'nopad');
  const t00 = Date.now();
  const logs: { t: number; s: string }[] = [];
  const mic: string[] = []; let framing = 0, acc = 0, errors = 0, missing = 0; const ended: string[] = []; const replays: string[] = [];
  p.on('console', (m) => {
    const s = m.text(), t = (Date.now() - t00) / 1000;
    if (/^\[MIC\]/.test(s)) mic.push(s);
    if (/\[NEXUS\] framing/.test(s)) framing++;
    if (/\[FEL-ACC\].*kept the reference sizes/.test(s)) acc++;
    if (/MISSING CLIP/.test(s)) missing++;
    if (m.type() === 'error' && !/401|FEL-FRAME|favicon/.test(s)) { errors++; logs.push({ t, s: 'ERR ' + s.slice(0, 240) }); }
    if (/\[dev\] mode ended/.test(s)) ended.push(s.slice(0, 400));
    if (/\[dev\] replay/.test(s)) replays.push(s);
  });
  p.on('pageerror', (e) => { errors++; logs.push({ t: (Date.now() - t00) / 1000, s: 'PAGEERROR ' + String(e).slice(0, 240) }); });

  await p.goto(`http://127.0.0.1:${PORT}/dev/brainbrawl?agent=1${PLAYERS === 2 ? '&players=2' : ''}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await p.waitForSelector('canvas', { timeout: 300000 });
  await p.evaluate(() => { (document.querySelector('canvas') as any).__probeId = 'bb-residual-1'; });
  const raw = () => p.evaluate(() => (window as any).__FEL_QA__?.rawHud?.() ?? {}).catch(() => ({} as any));
  const pad = (btn: number, down: boolean) => p.evaluate(([b, d]) => { const g = (window as any).__PAD; g.buttons[b as number] = { pressed: d, touched: d, value: d ? 1 : 0 }; g.timestamp = Date.now(); }, [btn, down] as const);
  const tap = async (btn: number, ms = 70) => { await pad(btn, true); await p.waitForTimeout(ms); await pad(btn, false); };
  const waitPhase = async (re: RegExp, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { const r: any = await raw(); if (re.test(String(r.phase ?? ''))) return r; await p.waitForTimeout(20); } return null; };
  const shot = (n: string) => p.locator('canvas').first().evaluate((c) => c.parentElement!.scrollIntoView()).then(() => p.screenshot({ path: `${OUT}/${n}.png` })).catch(() => {});

  // the splash: wait for it, then ONE press (the pad's A, or a click + keyboard for the no-pad run)
  for (let i = 0; i < 600; i++) { if (await p.evaluate(() => /START/.test(document.body.innerText))) break; await p.waitForTimeout(250); }
  await p.waitForTimeout(900);
  await shot('00-splash');
  const startAt = Date.now();
  const start: any = { run: RUN };
  if (RUN === 'nopad') {
    await p.locator('text=/START/').first().click().catch(() => {});
    await p.waitForTimeout(300);
    const pick0 = await raw();
    await p.waitForTimeout(7500);   // the old pick auto-began at 6 s; it must still be waiting
    const pick1 = await raw();
    await shot('01-pick-waiting');
    const t1 = Date.now();
    await p.keyboard.down('j'); await p.waitForTimeout(60); await p.keyboard.up('j');
    const sp = await waitPhase(/^spin$/, 5000);
    Object.assign(start, { pickBanner: pick0.banner, stillPickAfter7_5s: pick1.phase === 'pick', aToSpinMs: sp ? Date.now() - t1 : null });
  } else if (PLAYERS === 1) {
    await tap(FACE_BTN[0]);
    const sp = await waitPhase(/^spin$/, 8000);
    start.splashAToSpinMs = sp ? Date.now() - startAt : null;
    start.pickEverShown = /SOLO/.test(String(sp?.banner ?? ''));
  } else {
    await tap(FACE_BTN[0]);
    const sp = await waitPhase(/^spin$/, 8000);
    start.splashAToSpinMs = sp ? Date.now() - startAt : null;
  }
  console.log('[start]', JSON.stringify(start));

  // the recorder: per frame, the card against the wheel and the lecterns; the bubbles; the talk; the flapper
  await p.evaluate(() => {
    const w = window as any, qa = w.__FEL_QA__, scene = qa.scene();
    const R: any = w.__BBR = { rows: [], bubbles: new Map<string, number>(), t0: performance.now(), flapMax: 0, clips: {} as Record<string, number> };
    const V = scene.activeCamera.position.constructor, M = scene.getTransformMatrix().constructor;
    const rectOf = (names: string[]) => {
      const eng = scene.getEngine(), W = eng.getRenderWidth(), H = eng.getRenderHeight(); const vp = scene.activeCamera.viewport.toGlobal(W, H);
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, any = false;
      for (const n of names) { const m = scene.getMeshByName(n); if (!m || !m.isEnabled() || !m.isVisible) continue; m.computeWorldMatrix(true);
        for (const c of m.getBoundingInfo().boundingBox.vectorsWorld) { const q = V.Project(c, M.Identity(), scene.getTransformMatrix(), vp); x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); any = true; } }
      if (!any) return null;
      const cv = scene.getEngine().getRenderingCanvas().getBoundingClientRect(); const sx = cv.width / W, sy = cv.height / H;
      return { l: cv.left + x0 * sx, t: cv.top + y0 * sy, r: cv.left + x1 * sx, b: cv.top + y1 * sy };
    };
    const overlap = (a: any, b: any) => (a && b ? Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t)) : 0);
    R.rectOf = rectOf;
    // the wheel's TRUE outline: 32 points on the static marquee ring (its outermost edge, R + 0.31 m) through the frame's world
    // matrix — a spinning torus's bounding box swells by up to √2 as it turns, which is not what the eye sees
    R.wheelRect = () => {
      const frame = scene.getTransformNodeByName('bb_wheel_frame'); if (!frame) return null;
      frame.computeWorldMatrix(true); const wm = frame.getWorldMatrix();
      const eng = scene.getEngine(), W = eng.getRenderWidth(), H = eng.getRenderHeight(); const vp = scene.activeCamera.viewport.toGlobal(W, H);
      const cv = eng.getRenderingCanvas().getBoundingClientRect(); const sx = cv.width / W, sy = cv.height / H;
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (let k = 0; k < 32; k++) { const a = (k / 32) * Math.PI * 2; const pt = V.TransformCoordinates(new V(Math.sin(a) * 1.76, Math.cos(a) * 1.76, -0.12), wm); const q = V.Project(pt, M.Identity(), scene.getTransformMatrix(), vp); x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
      return { l: cv.left + x0 * sx, t: cv.top + y0 * sy, r: cv.left + x1 * sx, b: cv.top + y1 * sy };
    };
    const nodesOf = (sk: any) => new Set(sk.bones.map((b: any) => b.getTransformNode()).filter(Boolean));
    const hipsAt = (x: number, z: number) => scene.skeletons.find((sk: any) => { const h = sk.bones.find((b: any) => /Hips$/.test(b.name.replace(/_c\d+$/, ''))); const n = h?.getTransformNode(); if (!n) return false; const q = n.getAbsolutePosition(); return Math.hypot(q.x - x, q.z - z) < 0.6; });
    scene.onAfterRenderObservable.add(() => {
      const h = qa.rawHud(); const now = +((performance.now() - R.t0) / 1000).toFixed(3);
      const row: any = { t: now, phase: h.phase };
      const card = document.querySelector('[data-bb="card"] > div') as HTMLElement | null;
      if (card && card.getBoundingClientRect().height > 0) {
        const cr = card.getBoundingClientRect(); const c = { l: cr.left, t: cr.top, r: cr.right, b: cr.bottom };
        const wheel = R.wheelRect();
        const lect = [0, 1].map((i) => rectOf([`bb_lectern_body_${i}`, `bb_lectern_top_${i}`, `bb_lectern_screen_${i}`]));
        row.card = { top: Math.round(c.t), wheelBottom: wheel ? Math.round(wheel.b) : null, overWheel: Math.round(overlap(c, wheel)), overLectern: lect.map((l) => Math.round(overlap(c, l))) };
      }
      for (const b of Array.from(document.querySelectorAll('[data-bb-bubble]'))) {
        const k = `${b.getAttribute('data-bb-bubble')}: ${(b as HTMLElement).innerText.replace(/\s+/g, ' ').trim()}`; R.bubbles.set(k, (R.bubbles.get(k) ?? 0) + 1);
        const box = b.querySelector(':scope > div > div') as HTMLElement | null; if (box) R.bubbleOverflow = Math.max(R.bubbleOverflow ?? 0, box.scrollWidth - box.clientWidth);   // text past its bubble
      }
      const flap = scene.getTransformNodeByName('bb_wheel_flap'); if (flap) R.flapMax = Math.max(R.flapMax, Math.abs(flap.rotation.z));
      // the talk: which bodies are playing party_talk / party_present at weight (host at centre, seats beside)
      for (const [who, x, z] of [['host', 0, -2.4], ...(scene.metadata?.qaSeats ?? []).map((s: number[], i: number) => [`seat${i + 1}`, s[0], s[1]])] as [string, number, number][]) {
        const sk = hipsAt(x, z); if (!sk) continue; const nodes = nodesOf(sk);
        for (const g of scene.animationGroups) if (g.isPlaying && /^party_(talk|present)/.test(g.name) && g.targetedAnimations.some((ta: any) => nodes.has(ta.target))) { const a = g.animatables?.[0]; if (!a || a.weight > 0.3) { const k = `${who}:${g.name}`; R.clips[k] = (R.clips[k] ?? 0) + 1; } }
      }
      R.rows.push(row);
    });
  });

  // the match
  const rounds: any[] = [];
  const nRounds = RUN === 'phone' ? 2 : RUN === 'nopad' ? 1 : PLAN_P1.length;
  for (let r = 0; r < nRounds; r++) {
    const sp = r === 0 ? { phase: 'spin' } : await waitPhase(/^(spin|done)$/, 20000);
    if (!sp || sp.phase === 'done') break;
    await p.waitForTimeout(700); if (r < 2) await shot(`r${r + 1}-10-spin`);
    const ex = await waitPhase(/^(expose|answer|done)$/, 20000); if (!ex || ex.phase === 'done') break;
    const shown = String((await raw()).display ?? '');   // what the player SAW (a memory grid hides once the answers come up)
    await waitPhase(/^answer$/, 15000);
    await p.waitForTimeout(250);
    const q = await p.evaluate(() => { const w = window as any; const m = w.__FEL_QA__.scene().metadata; const h = w.__FEL_QA__.rawHud(); const seq = document.querySelector('[data-bb="sequence"]'); const tops = seq ? new Set(Array.from(seq.children).map((c: any) => Math.round(c.getBoundingClientRect().top))).size : null; return { card: m.qaCard, hud: { prompt: h.prompt, options: [h.optA, h.optB, h.optX, h.optY], display: h.display }, sequenceLines: tops }; });
    const card = q.card;
    const right = core.solveCard(card);
    const read = { prompt: card.prompt, options: card.options, key: card.options[card.answer], rightOptions: right.map((i: number) => card.options[i]), exactlyOne: right.length === 1 && right[0] === card.answer, faults: core.cardFaults(card),
      hudMatches: q.hud.prompt === card.prompt && q.hud.options.join('|') === card.options.join('|') && (shown || q.hud.display) === card.display.join('\n'), sequenceLines: q.sequenceLines };
    if (r < 3) await shot(`r${r + 1}-20-question`);
    const act = async (plan: string, btns: number[]) => { if (plan !== 'time') await tap(btns[plan === 'right' ? card.answer : (card.answer + 1) % 4]); };
    await p.waitForTimeout(500);
    await act(PLAN_P1[r] ?? 'right', FACE_BTN);
    if (PLAYERS === 2) { await p.waitForTimeout(400); await act(PLAN_P2[r] ?? 'right', DPAD_BTN); }
    if (r === 0) { await p.waitForTimeout(200); await shot('r1-21-locked'); }
    await waitPhase(/^(result|done)$/, 20000);
    await p.waitForTimeout(650); if (r < 3) await shot(`r${r + 1}-30-reveal`);
    rounds.push({ round: r + 1, plan: PLAN_P1[r], plan2: PLAYERS === 2 ? PLAN_P2[r] : undefined, read });
    await p.waitForTimeout(700); await tap(FACE_BTN[0]);   // A moves the result on
  }

  // the finish, the card, and GO AGAIN in place (solo)
  let replay: any = null;
  if (RUN === 'solo' || RUN === 'duel') {
    const fin = await waitPhase(/^done$/, 40000);
    await p.waitForTimeout(700); await shot('90-finish');
    const t0 = Date.now(); while (!ended.length && Date.now() - t0 < 8000) await p.waitForTimeout(100);
    await p.waitForTimeout(300); await shot('91-end-card');
    if (RUN === 'solo') {
      const before = await p.evaluate(() => ({ id: (document.querySelector('canvas') as any)?.__probeId ?? null, splash: /TAP TO START|^START$/m.test(document.body.innerText) }));
      // REPLAY pressed IN the page and timed there to the first frame the mode reports the spin (the driver's own click wait
      // is not the game's latency)
      const tR = Date.now();
      const inPage = await p.evaluate(() => new Promise<number>((res) => {
        const w = window as any; const t0 = performance.now();
        (document.querySelector('[data-dev="replay"]') as HTMLElement).click();
        const tick = () => { if (w.__FEL_QA__.rawHud().phase === 'spin') res(Math.round(performance.now() - t0)); else if (performance.now() - t0 > 8000) res(-1); else requestAnimationFrame(tick); };
        tick();
      }));
      const sp = await waitPhase(/^spin$/, 8000);
      const after = await p.evaluate(() => ({ id: (document.querySelector('canvas') as any)?.__probeId ?? null, h: (window as any).__FEL_QA__.rawHud() }));
      await p.waitForTimeout(800); await shot('92-replay-spin');
      replay = { finishBanner: fin?.banner ?? null, endedCards: ended.length, replayLog: replays, sameCanvas: before.id === 'bb-residual-1' && after.id === 'bb-residual-1', splashAfter: /TAP TO START/.test(await p.evaluate(() => document.body.innerText)),
        clickToSpinMs: sp ? Date.now() - tR : null, pressToSpinFrameMs: inPage, round: after.h.round, players: after.h.players, phase: after.h.phase };
      // play the replayed round one to its reveal: the stage still answers
      await waitPhase(/^answer$/, 15000); const k = await p.evaluate(() => (window as any).__FEL_QA__.scene().metadata.qaAnswer as number); await tap(FACE_BTN[k]);
      const res = await waitPhase(/^result$/, 15000); replay.roundOneAfterReplay = res ? { banner: res.banner, verdict: res.verdictP1 } : null;
      await p.waitForTimeout(600); await shot('93-replay-reveal');
    }
  }

  const data = await p.evaluate(() => { const w = window as any, R = w.__BBR, s = w.__FEL_QA__.scene(), eng = s.getEngine();
    const mats = ['bb_wall_centre', 'bb_wall_brain', 'bb_wall_brawl', 'bb_deck', 'bb_wheel_face', 'bb_gallery_front_l', 'bb_gallery_front_r', 'bb_lectern_screen_0', 'bb_riser_0', 'bb_lectern_body_0']
      .map((n) => { const m = s.getMeshByName(n); const mat = m?.material; return { n, mesh: !!m, textured: !!(mat?.albedoTexture || mat?.emissiveTexture), ready: mat ? mat.isReady(m) : false }; });
    const galleryBodies = s.skeletons.filter((sk: any) => { const h = sk.bones.find((b: any) => /Hips$/.test(b.name.replace(/_c\d+$/, ''))); const q = h?.getTransformNode()?.getAbsolutePosition(); return q && Math.abs(q.x) > 3.2 && q.z < -5; }).length;
    return { rows: R.rows, bubbles: Object.fromEntries(R.bubbles), bubbleOverflow: R.bubbleOverflow ?? 0, flapMax: R.flapMax, clips: R.clips, mic: (w.__FEL_MIC__ ?? []).map((m: any) => ({ caption: m.caption, played: m.played })), set: mats, galleryBodies, fps: eng.getFps(), meshes: s.meshes.length, activeMeshes: s.getActiveMeshes().length };
  });

  // size of the contestant: the live body (new geometry) against the 252548b geometry, through the SAME live camera
  const size = await p.evaluate(() => {
    const w = window as any, s = w.__FEL_QA__.scene(), cam = s.activeCamera, eng = s.getEngine(), W = eng.getRenderWidth(), H = eng.getRenderHeight(), vp = cam.viewport.toGlobal(W, H);
    const V = cam.position.constructor, M = s.getTransformMatrix().constructor;
    const py = (x: number, y: number, z: number) => V.Project(new V(x, y, z), M.Identity(), s.getTransformMatrix(), vp).y;
    const seat = (s.metadata?.qaSeats ?? [])[0]; if (!seat) return null;
    const sk = s.skeletons.find((k: any) => { const h = k.bones.find((b: any) => /Hips$/.test(b.name.replace(/_c\d+$/, ''))); const q = h?.getTransformNode()?.getAbsolutePosition(); return q && Math.hypot(q.x - seat[0], q.z - seat[1]) < 0.6; });
    if (!sk) return null;
    const pos = (n: string) => sk.bones.find((b: any) => b.name.replace(/_c\d+$/, '').endsWith(n))?.getTransformNode()?.getAbsolutePosition();
    const head = pos('Head'), foot = pos('LeftFoot');
    const crown = s.getMeshByName('bb_lectern_top_0'); crown.computeWorldMatrix(true); const ct = crown.getBoundingInfo().boundingBox.maximumWorld;
    const riser = Number(s.getMeshByName('bb_riser_top_0')?.getAbsolutePosition().y ?? 0);
    // the same body model for both (feet on the riser, the top of the head 1.82 m over them), through the SAME live camera.
    // 252548b: the seat at (3.0, 0.8, −2.0), its lectern's front top edge 1.0 over the riser at z −1.32
    const nowBody = py(seat[0], riser, seat[1]) - py(seat[0], riser + 1.82, seat[1]);
    const nowVisible = py(ct.x, ct.y, ct.z) - py(seat[0], riser + 1.82, seat[1]);
    const oldBody = py(3.0, 0.8, -2.0) - py(3.0, 0.8 + 1.82, -2.0);
    const oldVisible = py(3.0, 1.8, -1.32) - py(3.0, 0.8 + 1.82, -2.0);
    const liveBones = { ankleToHeadBone: Math.round(py(foot.x, foot.y, foot.z) - py(head.x, head.y, head.z)) };
    return { renderH: H, body_px: { was: Math.round(oldBody), now: Math.round(nowBody), x: +(nowBody / oldBody).toFixed(2) }, visibleAboveLectern_px: { was: Math.round(oldVisible), now: Math.round(nowVisible), x: +(nowVisible / oldVisible).toFixed(2) }, liveBones };
  });

  // ── grade ──
  const rows = data.rows as any[];
  const cardRows = rows.filter((r) => r.card && /^(expose|answer|result)$/.test(r.phase));
  const summary = {
    run: RUN, pureSweep: pure, start,
    hard1_oneRightAnswer: { liveCards: rounds.length, exactlyOne: rounds.filter((r) => r.read.exactlyOne).length, hudMatchesCard: rounds.filter((r) => r.read.hudMatches).length, faults: rounds.flatMap((r) => r.read.faults), cards: rounds.map((r) => `${r.read.prompt} → ${r.read.rightOptions.join('/')} (key ${r.read.key})`) },
    hard2_set: { framingWarnings: framing, set: data.set, galleryBodies: data.galleryBodies, flapperMaxRad: +data.flapMax.toFixed(3), fps: Math.round(data.fps), meshes: data.meshes, activeMeshes: data.activeMeshes },
    hard3_talk: { hostLines: data.mic.length, hostVoiced: data.mic.filter((m: any) => m.played).length, hostCaptions: data.mic.map((m: any) => m.caption), micConsole: mic.length, bubbles: data.bubbles, bubbleOverflowPx: data.bubbleOverflow, talkClipFrames: data.clips },
    card: { frames: cardRows.length, framesOverWheel: cardRows.filter((r) => r.card.overWheel > 0).length, framesOverLectern: cardRows.filter((r) => r.card.overLectern.some((v: number) => v > 0)).length, minGapToWheel_px: Math.min(...cardRows.filter((r) => r.card.wheelBottom !== null).map((r) => r.card.top - r.card.wheelBottom)) },
    logicSequenceLines: rounds.filter((r) => r.read.sequenceLines !== null).map((r) => r.read.sequenceLines),
    contestantSize: size,
    p2Body: PLAYERS === 2 ? roster.rosterUrlFor(roster.DEFAULT_HERO_URL, '#8b1e2d', 'brainbrawl') : undefined,
    accessoryMisfits: acc, replay,
    console: { errors, missingClip: missing, ended: ended.map((e) => e.slice(0, 200)) },
  };
  fs.writeFileSync(`${OUT}/summary.json`, JSON.stringify(summary, null, 1));
  fs.writeFileSync(`${OUT}/rounds.json`, JSON.stringify(rounds, null, 1));
  fs.writeFileSync(`${OUT}/logs.json`, JSON.stringify({ logs, mic }, null, 1));
  console.log(JSON.stringify(summary, null, 1));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
