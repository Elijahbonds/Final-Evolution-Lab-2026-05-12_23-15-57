// BRAINBRAWL-POLISH-2 probe (2026-09-24) — the eye's polish list on b3d498e (N1–N10, R1), measured through the real host
// (/dev/brainbrawl: the component /play/brain-brawl mounts; `RUN=shell` mounts the real GameShell there too).
//
//   RUN=solo   one pad: the splash's A → a solo match (right / wrong / time / right / right), the finish, REPLAY → round one
//   RUN=duel   ?players=2, P1 faces / P2 d-pad, four rounds
//   RUN=phone  the solo start and two rounds at 390×844 (no regression on the phone's layout)
//   RUN=shell  /dev/brainbrawl?shell=1: the REAL GameShell — a solo match to its results card, then the shell's REPLAY. The
//              shell's server calls are answered HERE (no login, no database, nothing paid): /api/profile, /api/sessions
//              (the eye's paid match: +837 XP, +27 shards, +0 credits, +0.1 PRQ) and /api/v1/wallet/earn (+316 coins).
//
// Per rendered frame (onAfterRender): the bubbles in the DOM per speaker (N1); the host's head, hips and feet through the camera
// against the card (N2); the card's host line against the HUD's (N3); the prompt's rendered lines (N4); the score pops' plates
// against the card and the bubbles (R1); the risers' and lecterns' lowest points against the canvas bottom (N7); every podium
// toe joint over the riser top and the host's over the deck, per playing party clip (N8). Per round: the spinner's line against
// what the wheel could land on (N5), and the card read by BrainBrawlCore.solveCard (the HARD: one right answer).
//
//   PORT=3011 OUT=<dir> RUN=solo node node_modules/tsx/dist/cli.mjs scripts/probes/_brainbrawl-polish2-probe.mts
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';
import * as coreNs from '../../lib/babylon/core/BrainBrawlCore.ts';
const unwrap = <T,>(ns: T): T => ((ns as unknown as { default?: T }).default ?? ns);
const core = unwrap(coreNs);

const PORT = process.env.PORT ?? '3011';
const OUT = process.env.OUT ?? '/tmp/brainbrawl-polish2';
const RUN = (process.env.RUN ?? 'solo') as 'solo' | 'duel' | 'phone' | 'shell';
const PLAYERS = RUN === 'duel' ? 2 : 1;
const PLAN_P1 = PLAYERS === 2 ? ['right', 'wrong', 'time', 'right'] : ['right', 'wrong', 'time', 'right', 'right'];
const PLAN_P2 = ['wrong', 'right', 'right', 'time'];
fs.mkdirSync(OUT, { recursive: true });
const FACE_BTN = [0, 1, 2, 3], DPAD_BTN = [12, 15, 13, 14];
const STUB = { xp: 837, shards: 27, credits: 0, prqDelta: 0.1, prqAfter: 76.1, coins: 316 };

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: chromiumExe(), args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const phone = RUN === 'phone';
  const bctx = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 860 } });
  const p = await bctx.newPage();
  const served: string[] = [];
  if (RUN === 'shell') {
    const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    await p.route('**/api/profile', (r) => r.fulfill(json({ prq: 76, grade: { key: 'PRIMED', label: 'PRIMED', color: '#00E5FF', speedMult: 1.05, hangBonus: 0.15 } })));
    await p.route('**/api/sessions', (r) => { served.push(`sessions ${r.request().postData()?.slice(0, 160)}`); return r.fulfill(json({ ok: true, sessionId: 'probe-polish2', xp: STUB.xp, shards: STUB.shards, credits: STUB.credits, prqDelta: STUB.prqDelta, prqAfter: STUB.prqAfter })); });
    await p.route('**/api/v1/wallet/earn', (r) => { const b = JSON.parse(r.request().postData() ?? '{}'); served.push(`earn ${b.event_type}`); return r.fulfill(json({ granted: { coins: b.event_type === 'mode_session_completed' ? STUB.coins : 0, shards: 0 }, balances: { coins: 43105 + STUB.coins, shards: 111, lc: 1430 } })); });
  }
  await p.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
  await p.addInitScript(() => {
    const pad: any = { index: 0, id: 'fake-dualshock', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: Date.now(), buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    (window as any).__PAD = pad; (navigator as any).getGamepads = () => [pad];
  });
  const t00 = Date.now();
  const logs: string[] = []; let errors = 0, framing = 0, missing = 0; const ended: string[] = [];
  p.on('console', (m) => {
    const s = m.text();
    if (/\[NEXUS\] framing|\[FEL-FRAME\]/.test(s)) { framing++; logs.push(`${((Date.now() - t00) / 1000).toFixed(1)} ${s.slice(0, 200)}`); }
    if (/MISSING CLIP/.test(s)) missing++;
    if (m.type() === 'error' && !/401|favicon|Failed to load resource/.test(s)) { errors++; logs.push('ERR ' + s.slice(0, 240)); }
    if (/\[dev\] mode ended/.test(s)) ended.push(s.slice(0, 300));
  });
  p.on('pageerror', (e) => { errors++; logs.push('PAGEERROR ' + String(e).slice(0, 240)); });

  const url = `http://127.0.0.1:${PORT}/dev/brainbrawl?agent=1${PLAYERS === 2 ? '&players=2' : ''}${RUN === 'shell' ? '&shell=1' : ''}`;
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await p.waitForSelector('canvas', { timeout: 300000 });
  const raw = () => p.evaluate(() => (window as any).__FEL_QA__?.rawHud?.() ?? {}).catch(() => ({} as any));
  const pad = (btn: number, down: boolean) => p.evaluate(([b, d]) => { const g = (window as any).__PAD; g.buttons[b as number] = { pressed: d, touched: d, value: d ? 1 : 0 }; g.timestamp = Date.now(); }, [btn, down] as const);
  const tap = async (btn: number, ms = 70) => { await pad(btn, true); await p.waitForTimeout(ms); await pad(btn, false); };
  const waitFor = async (ok: (r: any) => boolean, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { const r: any = await raw(); if (ok(r)) return r; await p.waitForTimeout(16); } return null; };
  const waitPhase = (re: RegExp, ms = 30000) => waitFor((r) => re.test(String(r.phase ?? '')), ms);
  const shot = (n: string) => p.screenshot({ path: `${OUT}/${n}.png` }).catch(() => {});
  const dom = (n: string) => p.evaluate(() => ({
    bubbles: Array.from(document.querySelectorAll('[data-bb-bubble]')).map((b) => `${b.getAttribute('data-bb-bubble')}: ${(b as HTMLElement).innerText.replace(/\s+/g, ' ').trim()}`),
    pops: Array.from(document.querySelectorAll('[data-bb-pop]')).map((b) => `${b.getAttribute('data-bb-pop')}: ${(b as HTMLElement).innerText}`),
    hostLine: (document.querySelector('[data-bb="host-line"]') as HTMLElement | null)?.innerText ?? null,
    prompt: (document.querySelector('[data-bb="prompt"]') as HTMLElement | null)?.innerText ?? null,
  })).then((d) => { fs.writeFileSync(`${OUT}/${n}.json`, JSON.stringify(d, null, 1)); return d; }).catch(() => null);

  for (let i = 0; i < 600; i++) { if (await p.evaluate(() => /START/.test(document.body.innerText))) break; await p.waitForTimeout(250); }
  await p.waitForTimeout(900);
  await shot('00-splash');
  await tap(FACE_BTN[0]);
  const sp0 = await waitPhase(/^spin$/, 8000);
  console.log('[start]', !!sp0);

  // ── the per-frame recorder ─────────────────────────────────────────────────────────────────────────────────────────
  await p.evaluate(() => {
    const w = window as any, qa = w.__FEL_QA__, scene = qa.scene();
    const R: any = w.__BBP = { t0: performance.now(), frames: 0, cardFrames: 0,
      bubbleMax: {} as Record<string, number>, bubbleStacked: 0,
      host: { cardFrames: 0, hidden: 0, partly: 0, clear: 0, onScreen: 0, samples: [] as any[] },
      hostLine: { frames: 0, mismatch: 0, overflow: 0, truncated: 0, maxLines: 0, seen: new Set<string>() },
      prompt: { seen: {} as Record<string, string[]> },
      pops: { frames: 0, overCard: 0, overBubble: 0, seen: new Set<string>(), style: null as any },
      frame: { riserBottomMax: 0, lecternBottomMax: 0, canvasH: 0, samples: 0 },
      toes: {} as Record<string, { min: number; max: number; n: number }>,
      card: { overWheel: 0, overLectern: 0, frames: 0, minGap: 1e9 },
      spinSays: [] as { round: number; seat: number; text: string }[], lastSayN: [0, 0] };
    const V = scene.activeCamera.position.constructor, M = scene.getTransformMatrix().constructor;
    const eng = scene.getEngine();
    const toCss = () => { const W = eng.getRenderWidth(), H = eng.getRenderHeight(); const cv = eng.getRenderingCanvas().getBoundingClientRect(); return { W, H, cv, sx: cv.width / W, sy: cv.height / H, vp: scene.activeCamera.viewport.toGlobal(W, H) }; };
    const proj = (pt: any, k: any) => { const q = V.Project(pt, M.Identity(), scene.getTransformMatrix(), k.vp); return { x: k.cv.left + q.x * k.sx, y: k.cv.top + q.y * k.sy }; };
    const inRect = (pt: any, r: any) => pt.x >= r.l && pt.x <= r.r && pt.y >= r.t && pt.y <= r.b;
    const overlap = (a: any, b: any) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
    const rectOf = (el: Element) => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
    const skAt = (x: number, z: number) => scene.skeletons.find((sk: any) => { const h = sk.bones.find((b: any) => /Hips$/.test(b.name.replace(/_c\d+$/, ''))); const q = h?.getTransformNode()?.getAbsolutePosition(); return q && Math.hypot(q.x - x, q.z - z) < 0.7; });
    const bonePos = (sk: any, n: string) => sk.bones.find((b: any) => b.name.replace(/_c\d+$/, '').endsWith(n))?.getTransformNode()?.getAbsolutePosition();
    const clipOf = (sk: any) => { const nodes = new Set(sk.bones.map((b: any) => b.getTransformNode()).filter(Boolean)); let best = '', wBest = 0; for (const g of scene.animationGroups) { if (!g.isPlaying || !g.targetedAnimations.some((ta: any) => nodes.has(ta.target))) continue; const wt = g.animatables?.[0]?.weight ?? 1; if (wt > wBest) { wBest = wt; best = g.name.replace(/_c\d+$/, '').replace(/\.\d+$/, ''); } } return best; };
    const wheelRect = (k: any) => { const frame = scene.getTransformNodeByName('bb_wheel_frame'); if (!frame) return null; frame.computeWorldMatrix(true); const wm = frame.getWorldMatrix(); let l = 1e9, t = 1e9, r = -1e9, b = -1e9; for (let i = 0; i < 32; i++) { const a = (i / 32) * Math.PI * 2; const q = proj(V.TransformCoordinates(new V(Math.sin(a) * 1.76, Math.cos(a) * 1.76, -0.12), wm), k); l = Math.min(l, q.x); r = Math.max(r, q.x); t = Math.min(t, q.y); b = Math.max(b, q.y); } return { l, t, r, b }; };
    const meshRect = (names: string[], k: any) => { let l = 1e9, t = 1e9, r = -1e9, b = -1e9, any = false; for (const n of names) { const m = scene.getMeshByName(n); if (!m || !m.isEnabled() || !m.isVisible) continue; m.computeWorldMatrix(true); for (const c of m.getBoundingInfo().boundingBox.vectorsWorld) { const q = proj(c, k); l = Math.min(l, q.x); r = Math.max(r, q.x); t = Math.min(t, q.y); b = Math.max(b, q.y); any = true; } } return any ? { l, t, r, b } : null; };
    scene.onAfterRenderObservable.add(() => {
      R.frames++;
      const h = qa.rawHud(); const k = toCss();
      // N5: a line said DURING the spin (a new sayN while the phase is spin) — the bubble can still hold the last verdict
      for (const i of [0, 1]) { const n = Number(h[`sayN${i + 1}`] ?? 0); if (n !== R.lastSayN[i]) { R.lastSayN[i] = n; if (h.phase === 'spin' && typeof h[`say${i + 1}`] === 'string' && h[`say${i + 1}`]) R.spinSays.push({ round: Number(h.round), seat: i, text: h[`say${i + 1}`] }); } }
      // N1: bubbles per speaker
      const per: Record<string, number> = {};
      for (const b of Array.from(document.querySelectorAll('[data-bb-bubble]'))) { const who = b.getAttribute('data-bb-bubble') ?? '?'; per[who] = (per[who] ?? 0) + 1; }
      for (const [who, n] of Object.entries(per)) { R.bubbleMax[who] = Math.max(R.bubbleMax[who] ?? 0, n); if (n > 1) R.bubbleStacked++; }
      const cardEl = document.querySelector('[data-bb="card"] > div'); const card = cardEl && cardEl.getBoundingClientRect().height > 0 ? rectOf(cardEl) : null;
      const bubbleRects = Array.from(document.querySelectorAll('[data-bb-bubble] > div > div')).map(rectOf);
      // N2: the host against the card
      const hm = scene.metadata?.qaHost; const hsk = hm && skAt(hm[0], hm[1]);
      if (hsk) {
        const pts = ['Head', 'Neck', 'Spine', 'Hips', 'LeftFoot', 'RightFoot', 'LeftHand', 'RightHand'].map((n) => bonePos(hsk, n)).filter(Boolean).map((q: any) => proj(q, k));
        const onScreen = pts.every((q: any) => q.x >= k.cv.left && q.x <= k.cv.right && q.y >= k.cv.top && q.y <= k.cv.bottom);
        if (onScreen) R.host.onScreen++;
        if (card && /^(expose|answer|result)$/.test(h.phase)) {
          R.host.cardFrames++;
          const inside = pts.filter((q: any) => inRect(q, card)).length;
          if (inside === pts.length) R.host.hidden++; else if (inside > 0) R.host.partly++; else R.host.clear++;
          if (R.host.cardFrames % 40 === 1) R.host.samples.push({ phase: h.phase, head: pts[0], feet: pts[4], cardL: Math.round(card.l), cardR: Math.round(card.r), cardT: Math.round(card.t) });
        }
        // N8: the host's toes over the deck
        for (const side of ['Left', 'Right']) { const q = bonePos(hsk, `${side}ToeBase`); if (!q) continue; const key = `host:${clipOf(hsk) || '?'}`; const v = q.y - 0.012; const e = R.toes[key] ??= { min: 9, max: -9, n: 0 }; e.min = Math.min(e.min, v); e.max = Math.max(e.max, v); e.n++; }
      }
      // N8: the podium toes over the riser top (0.552)
      for (const [i, s] of (scene.metadata?.qaSeats ?? []).entries()) {
        const sk = skAt(s[0], s[1]); if (!sk) continue;
        const clip = clipOf(sk) || '?';
        for (const side of ['Left', 'Right']) { const q = bonePos(sk, `${side}ToeBase`); if (!q) continue; const key = `seat${i + 1}:${clip}`; const v = q.y - 0.552; const e = R.toes[key] ??= { min: 9, max: -9, n: 0 }; e.min = Math.min(e.min, v); e.max = Math.max(e.max, v); e.n++; }
      }
      // N3: the host line on the card
      const hl = document.querySelector('[data-bb="host-line"]') as HTMLElement | null;
      if (hl && card && typeof h.hostSay === 'string' && hl.innerText.trim()) {
        R.hostLine.frames++;
        if (hl.innerText.trim() !== `🎙 ${h.hostSay}`) R.hostLine.mismatch++;
        if (hl.scrollWidth > hl.clientWidth + 1 || hl.scrollHeight > hl.clientHeight + 1) R.hostLine.overflow++;
        if (getComputedStyle(hl).textOverflow === 'ellipsis' && getComputedStyle(hl).overflow === 'hidden') R.hostLine.truncated++;
        const lh = parseFloat(getComputedStyle(hl).lineHeight) || 14; R.hostLine.maxLines = Math.max(R.hostLine.maxLines, Math.round(hl.getBoundingClientRect().height / lh));
        R.hostLine.seen.add(hl.innerText.trim());
      }
      // N4: the prompt's rendered lines (characters grouped by their line box)
      const pr = document.querySelector('[data-bb="prompt"]') as HTMLElement | null;
      if (pr && typeof h.prompt === 'string' && h.prompt && !R.prompt.seen[h.prompt]) {
        const lines: Record<number, string> = {};
        const walker = document.createTreeWalker(pr, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) { const tx = n.textContent ?? ''; for (let c = 0; c < tx.length; c++) { const rg = document.createRange(); rg.setStart(n, c); rg.setEnd(n, c + 1); const rr = rg.getClientRects()[0]; if (!rr) continue; const top = Math.round(rr.top / 4) * 4; lines[top] = (lines[top] ?? '') + tx[c]; } }
        R.prompt.seen[h.prompt] = Object.keys(lines).map(Number).sort((a, b) => a - b).map((t) => lines[t].replace(/⁠/g, '').trim());
      }
      // R1: the pops
      const pops = Array.from(document.querySelectorAll('[data-bb-pop] > div')) as HTMLElement[];
      if (pops.length) {
        R.pops.frames++;
        for (const el of pops) {
          const r = rectOf(el); R.pops.seen.add(el.innerText);
          if (card && overlap(r, card) > 0) R.pops.overCard++;
          if (bubbleRects.some((b) => overlap(r, b) > 0)) R.pops.overBubble++;
          if (!R.pops.style) { const cs = getComputedStyle(el); R.pops.style = { color: cs.color, background: cs.backgroundColor, fontSize: cs.fontSize, fontWeight: cs.fontWeight, zIndex: getComputedStyle(el.parentElement!).zIndex, textShadow: cs.textShadow.slice(0, 60) }; }
        }
      }
      // N7: the risers' and lecterns' lowest points against the canvas bottom (every 10th frame)
      if (R.frames % 10 === 0) {
        R.frame.samples++; R.frame.canvasH = k.cv.bottom;
        for (const i of [0, 1]) {
          const rr = meshRect([`bb_riser_${i}`], k); if (rr) R.frame.riserBottomMax = Math.max(R.frame.riserBottomMax, rr.b);
          const lr = meshRect([`bb_lectern_body_${i}`], k); if (lr) R.frame.lecternBottomMax = Math.max(R.frame.lecternBottomMax, lr.b);
        }
      }
      // the HARD card placement stays: not over the wheel or a lectern
      if (card && /^(expose|answer|result)$/.test(h.phase)) {
        R.card.frames++;
        const wr = wheelRect(k); if (wr) { if (overlap(card, wr) > 0) R.card.overWheel++; R.card.minGap = Math.min(R.card.minGap, card.t - wr.b); }
        for (const i of [0, 1]) { const lr = meshRect([`bb_lectern_body_${i}`, `bb_lectern_top_${i}`, `bb_lectern_screen_${i}`], k); if (lr && overlap(card, lr) > 0) { R.card.overLectern++; break; } }
      }
    });
  });

  // ── the match ──────────────────────────────────────────────────────────────────────────────────────────────────────
  const rounds: any[] = [];
  const played: string[] = [];
  const nRounds = RUN === 'phone' ? 2 : PLAN_P1.length;
  for (let r = 0; r < nRounds; r++) {
    const sp = r === 0 ? { phase: 'spin' } : await waitPhase(/^(spin|done)$/, 20000);
    if (!sp || sp.phase === 'done') break;
    // N5: the spinner's line, against what could land (solo: the categories not yet played)
    const spinner = PLAYERS > 1 ? r % 2 : 0;
    const spinSaid = async () => p.evaluate(([rd, st]) => ((window as any).__BBP?.spinSays ?? []).find((x: any) => x.round === rd && x.seat === st)?.text ?? '', [r + 1, spinner] as const);
    let spinLine = '';
    for (let t = Date.now(); !spinLine && Date.now() - t < 3000; await p.waitForTimeout(30)) spinLine = await spinSaid();
    await p.waitForTimeout(500); if (r < 2) await shot(`r${r + 1}-11-midspin`);
    const landed = await waitFor((h) => h.phase !== 'spin' || !!h.category, 6000);
    await p.waitForTimeout(120);
    const stopped = await dom(`r${r + 1}-12-stopped`); await shot(`r${r + 1}-12-stopped`);
    const cat = String(landed?.category ?? '');
    const ex = await waitPhase(/^(expose|answer|done)$/, 20000); if (!ex || ex.phase === 'done') break;
    if (ex.phase === 'expose') { await p.waitForTimeout(350); await shot(`r${r + 1}-15-expose`); await dom(`r${r + 1}-15-expose`); }
    await waitPhase(/^answer$/, 15000);
    await p.waitForTimeout(250);
    const card = await p.evaluate(() => (window as any).__FEL_QA__.scene().metadata.qaCard);
    const right = core.solveCard(card);
    if (r < 3) { await shot(`r${r + 1}-20-question`); await dom(`r${r + 1}-20-question`); }
    const act = async (plan: string, btns: number[]) => { if (plan !== 'time') await tap(btns[plan === 'right' ? card.answer : (card.answer + 1) % 4]); };
    await p.waitForTimeout(500);
    await act(PLAN_P1[r] ?? 'right', FACE_BTN);
    if (PLAYERS === 2) { await p.waitForTimeout(400); await act(PLAN_P2[r] ?? 'right', DPAD_BTN); }
    await waitPhase(/^(result|done)$/, 20000);
    await p.waitForTimeout(450); const reveal = await dom(`r${r + 1}-30-reveal`); await shot(`r${r + 1}-30-reveal`);
    const hudR = await raw();
    const wishNamed = core.CATEGORIES.filter((c: string) => spinLine.includes(c));
    const landable = PLAYERS === 1 ? core.CATEGORIES.filter((c: string) => !played.includes(c)) : null;
    rounds.push({ round: r + 1, plan: PLAN_P1[r], plan2: PLAYERS === 2 ? PLAN_P2[r] : undefined, category: cat, spinLine, landable,
      spinLineOk: landable ? wishNamed.every((c: string) => landable.includes(c)) && !(landable.length === 1 && /^Not /.test(spinLine)) : null,
      stoppedBubbles: stopped?.bubbles, revealBubbles: reveal?.bubbles, pops: reveal?.pops, hostLine: reveal?.hostLine, prompt: card.prompt,
      exactlyOne: right.length === 1 && right[0] === card.answer, verdict: hudR.verdictP1 });
    played.push(cat);
    await p.waitForTimeout(900); await tap(FACE_BTN[0]);   // A moves the result on
  }

  // ── the finish, the end card, REPLAY ────────────────────────────────────────────────────────────────────────────────
  let replay: any = null, endCard: any = null;
  if (RUN === 'solo' || RUN === 'duel' || RUN === 'shell') {
    await waitPhase(/^done$/, 40000);
    await p.waitForTimeout(900); await shot('90-finish'); await dom('90-finish');
    if (RUN === 'shell') {
      // the shell's results card: wait for its reward tiles, then the coins tile
      await p.waitForSelector('text=/BRAWL OVER|BIG BRAIN/', { timeout: 20000 }).catch(() => {});
      await p.waitForSelector('[data-recap="coins"]', { timeout: 10000 }).catch(() => {});
      await p.waitForTimeout(700);
      await shot('91-endcard');
      endCard = await p.evaluate(() => {
        const txt = (document.body.innerText || '').replace(/\s+/g, ' ');
        const coins = document.querySelector('[data-recap="coins"]') as HTMLElement | null;
        return { coinsTile: coins?.innerText.replace(/\s+/g, ' ') ?? null, hasXp: /\+837\s*XP/i.test(txt), hasShards: /\+27\s*SHARDS/i.test(txt), text: txt.slice(txt.indexOf('BRAWL OVER'), txt.indexOf('BRAWL OVER') + 200) };
      });
      endCard.served = served;
    } else {
      const t0 = Date.now(); while (!ended.length && Date.now() - t0 < 8000) await p.waitForTimeout(100);
      await p.waitForTimeout(300); await shot('91-end-card');
    }
    if (RUN === 'solo' || RUN === 'shell') {
      const micBefore = await p.evaluate(() => ((window as any).__FEL_MIC__ ?? []).length);
      if (RUN === 'shell') await p.locator('button:has-text("REPLAY")').first().click();
      else await p.locator('[data-dev="replay"]').click();
      const sp = await waitPhase(/^spin$/, 8000);
      await p.waitForTimeout(300);
      const after = await raw();
      const firstLine = await p.evaluate((n) => ((window as any).__FEL_MIC__ ?? []).slice(n).map((m: any) => m.caption), micBefore);
      await p.waitForTimeout(500); await shot('92-replay-spin'); const d = await dom('92-replay-spin');
      replay = { spun: !!sp, round: after.round, players: after.players, hostLinesAfterReplay: firstLine, bubbles: d?.bubbles, noRoundTwo: firstLine.every((c: string) => !/round two/i.test(c)) };
    }
  }

  const data = await p.evaluate(() => {
    const w = window as any, R = w.__BBP, s = w.__FEL_QA__.scene(), eng = s.getEngine();
    const cam = s.activeCamera;
    return { R: { ...R, hostLine: { ...R.hostLine, seen: [...R.hostLine.seen] }, pops: { ...R.pops, seen: [...R.pops.seen] } },
      fps: eng.getFps(), camera: { pos: [cam.position.x, cam.position.y, cam.position.z].map((v: number) => +v.toFixed(3)), fov: cam.fov },
      mic: (w.__FEL_MIC__ ?? []).map((m: any) => ({ caption: m.caption, played: m.played })), seats: s.metadata?.qaSeats, host: s.metadata?.qaHost,
      meshes: s.meshes.length, stageMeshes: ['bb_wall_centre', 'bb_deck', 'bb_wheel_face', 'bb_gallery_front_l', 'bb_lectern_screen_0', 'bb_riser_0'].filter((n) => !!s.getMeshByName(n)).length };
  });
  const R = data.R;
  const summary = {
    run: RUN, camera: data.camera, seats: data.seats, hostMark: data.host,
    N1_bubbles: { maxPerSpeaker: R.bubbleMax, framesWithTwoOfOneSpeaker: R.bubbleStacked, frames: R.frames },
    N2_host: { cardFrames: R.host.cardFrames, hiddenBehindCard: R.host.hidden, partlyBehindCard: R.host.partly, clearOfCard: R.host.clear, framesFullyOnScreen: R.host.onScreen, samples: R.host.samples.slice(0, 4) },
    N3_hostLine: { frames: R.hostLine.frames, mismatchWithHud: R.hostLine.mismatch, overflowFrames: R.hostLine.overflow, ellipsisStyle: R.hostLine.truncated, maxLines: R.hostLine.maxLines, seen: R.hostLine.seen },
    N4_prompt: R.prompt.seen,
    R1_pops: { frames: R.pops.frames, overCardFrames: R.pops.overCard, overBubbleFrames: R.pops.overBubble, seen: R.pops.seen, style: R.pops.style },
    N5_spinLines: rounds.map((r) => ({ round: r.round, line: r.spinLine, landable: r.landable, ok: r.spinLineOk })),
    N6_wrongLines: rounds.filter((r) => r.verdict === 'wrong').map((r) => r.revealBubbles),
    N7_frame: { canvasBottomPx: Math.round(R.frame.canvasH), riserBottomMaxPx: Math.round(R.frame.riserBottomMax), lecternBottomMaxPx: Math.round(R.frame.lecternBottomMax), marginPx: Math.round(R.frame.canvasH - R.frame.riserBottomMax), samples: R.frame.samples },
    N8_toes_cm: Object.fromEntries(Object.entries(R.toes as Record<string, any>).sort().map(([k, v]) => [k, { min: +(v.min * 100).toFixed(2), max: +(v.max * 100).toFixed(2), n: v.n }])),
    N9_replay: replay, N10_endCard: endCard,
    hard: { exactlyOne: `${rounds.filter((r) => r.exactlyOne).length}/${rounds.length}`, hostVoiced: `${data.mic.filter((m: any) => m.played).length}/${data.mic.length}`, stageMeshes: `${data.stageMeshes}/6`,
      card: { frames: R.card.frames, overWheel: R.card.overWheel, overLectern: R.card.overLectern, minGapToWheelPx: Math.round(R.card.minGap) }, fps: Math.round(data.fps), meshes: data.meshes },
    console: { errors, framingWarnings: framing, missingClip: missing, logs: logs.slice(0, 12) },
    rounds,
  };
  fs.writeFileSync(`${OUT}/summary.json`, JSON.stringify(summary, null, 1));
  console.log(JSON.stringify(summary, null, 1));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
