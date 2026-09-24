// BRAINBRAWL-MAJOR probe (2026-09-24) — one scripted match through the real host (/dev/brainbrawl: the same component
// /play/brain-brawl mounts, the card included), graded per rendered frame and per round.
//
//   solo: begin → five rounds played RIGHT / WRONG / TIME-OUT / RIGHT / RIGHT → the finish → ctx.end
//   duel (PLAYERS=2): P1 on the faces, P2 on the d-pad, a mixed plan — the verdict must not leak before the reveal
//
// Per frame: the phase, the category the HUD shows, the wedge actually under the wheel's pin, each contestant's clips at
// weight and whether its arms are in a T (both hands at shoulder height, out) or it is playing nothing at all (bind), the
// card's box against the stage and the top bar. Per round: the category announced vs the wedge at the pin when the
// wheel stopped, press → LOCKED on screen (ms), what the card shows at the reveal, dead time between answer windows,
// what a face press does in each phase. Console: errors, MISSING CLIP, refused clips.
//
//   PORT=3131 OUT=/tmp/bb PLAYERS=1 npx tsx scripts/probes/_brainbrawl-major-probe.mts      (PLAYERS=2 duel · VW=390 VH=844 phone)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const PORT = process.env.PORT ?? '3131';
const OUT = process.env.OUT ?? '/tmp/brainbrawl-major';
const PLAYERS = Number(process.env.PLAYERS ?? 1) === 2 ? 2 : 1;
// per round: what P1 does (and P2 in a duel). 'right' | 'wrong' | 'time'
const PLAN_P1 = (process.env.PLAN ?? (PLAYERS === 2 ? 'right,wrong,time,right,wrong,right' : 'right,wrong,time,right,right')).split(',');
const PLAN_P2 = (process.env.PLAN2 ?? 'wrong,right,time,right,right,time').split(',');
const MAX_ROUNDS = Number(process.env.ROUNDS ?? (PLAYERS === 2 ? 6 : 5));
fs.mkdirSync(OUT, { recursive: true });

const FACE_BTN = [0, 1, 2, 3];          // A B X Y (standard mapping)
const DPAD_BTN = [12, 15, 13, 14];      // up right down left — P2's answers 0..3 in BrainBrawlMode's DPAD order

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: chromiumExe(), args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
  // VW/VH: a phone is the stage at 358 px wide — the card has to fit it too
  const bctx = await browser.newContext({ viewport: { width: Number(process.env.VW ?? 1280), height: Number(process.env.VH ?? 900) } });
  const p = await bctx.newPage();
  await p.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
  await p.addInitScript(() => {
    const pad: any = { index: 0, id: 'fake-dualshock', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: Date.now(), buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    (window as any).__PAD = pad; (navigator as any).getGamepads = () => [pad];
  });
  const logs: { t: number; s: string }[] = [];
  const t00 = Date.now();
  let missing = 0, errors = 0, ended: string | null = null;
  p.on('console', (m) => {
    const s = m.text();
    if (/MISSING CLIP/.test(s)) missing++;
    if (m.type() === 'error' && !/401|FEL-FRAME|favicon/.test(s)) { errors++; logs.push({ t: (Date.now() - t00) / 1000, s: 'ERR ' + s.slice(0, 240) }); }
    if (/\[dev\] mode ended/.test(s)) ended = s;
    if (/REFUSE|refused|MISSING CLIP|FEL-PARTY|FEL-ANIM\] (refused|request)|BRAIN/i.test(s)) logs.push({ t: (Date.now() - t00) / 1000, s: s.slice(0, 240) });
  });
  p.on('pageerror', (e) => { errors++; logs.push({ t: (Date.now() - t00) / 1000, s: 'PAGEERROR ' + String(e).slice(0, 240) }); });

  await p.goto(`http://127.0.0.1:${PORT}/dev/brainbrawl?agent=1${PLAYERS === 2 ? '&players=2' : ''}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await p.waitForSelector('canvas', { timeout: 300000 });
  const raw = () => p.evaluate(() => (window as any).__FEL_QA__?.rawHud?.() ?? {}).catch(() => ({} as any));
  for (let i = 0; i < 240; i++) {
    const r: any = await raw();
    if (r.phase) break;
    const start = p.locator('text=/^START$/').first(); if (await start.count()) await start.click().catch(() => {});
    // a duel (?players=2) pushes no HUD until it starts: A on the pad is the splash's START too
    await p.evaluate(() => { const g = (window as any).__PAD; g.buttons[0] = { pressed: true, touched: true, value: 1 }; g.timestamp = Date.now(); });
    await p.waitForTimeout(80);
    await p.evaluate(() => { const g = (window as any).__PAD; g.buttons[0] = { pressed: false, touched: false, value: 0 }; g.timestamp = Date.now(); });
    await p.waitForTimeout(420);
  }
  // the recorder
  await p.evaluate(() => {
    const w = window as any, qa = w.__FEL_QA__, scene = qa.scene();
    const CATS = ['LOGIC', 'MEMORY', 'COMPUTE', 'ANALYZE', 'IDENTIFY'];
    const R: any = w.__BB = { rows: [], presses: [], locks: [], t0: performance.now(), cast: [] as any[] };
    R.now = () => +((performance.now() - R.t0) / 1000).toFixed(3);
    // a press is stamped in PAGE time, the same clock the LOCKED observer uses
    R.press = (btn: number, down: boolean, tag: string) => { const g = w.__PAD; g.buttons[btn] = { pressed: down, touched: down, value: down ? 1 : 0 }; g.timestamp = Date.now(); if (down) R.presses.push({ t: R.now(), pt: performance.now(), btn, tag, phase: qa.rawHud().phase }); };
    const seen = { p1: false, p2: false };
    new MutationObserver(() => {
      const txt = document.body.innerText;
      const p1 = /\b(P1 )?LOCKED\b/.test(txt.replace(/P2 LOCKED/g, '')), p2 = /P2 LOCKED/.test(txt);
      if (p1 && !seen.p1) R.locks.push({ who: 1, pt: performance.now() }); if (p2 && !seen.p2) R.locks.push({ who: 2, pt: performance.now() });
      seen.p1 = p1; seen.p2 = p2;
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
    const pin = () => scene.getMeshByName('bb_wheel_pin');
    const wedgeAtPin = () => {
      const pp = pin()?.getAbsolutePosition(); if (!pp) return null;
      let best: string | null = null, bd = 1e9;
      for (const c of CATS) { const m = scene.getMeshByName(`bb_wedge_${c}`); if (!m) continue; m.computeWorldMatrix(true); const q = m.getAbsolutePosition(); const d = Math.hypot(q.x - pp.x, q.y - pp.y); if (d < bd) { bd = d; best = c; } }
      return best;
    };
    R.wedgeAtPin = wedgeAtPin;
    // contestants: the skeleton whose hips stand on a podium spot (the audience arc is 1.3 m+ away from every spot)
    // the podium spots: b6d66d5 stood them at z 5 (solo centred); BRAINBRAWL-MAJOR beside the wheel (P1 at +x, screen-left)
    const SPOT_SETS = (n: number) => (n > 1 ? [[[-2.4, 5.0], [2.4, 5.0]], [[3.0, -2.0], [-3.0, -2.0]]] : [[[0, 5.0]], [[3.0, -2.0]]]);
    const bone = (sk: any, n: string) => { const b = sk.bones.find((bb: any) => bb.name.replace(/^mixamorig:?/, '').replace(/_c\d+$/, '') === n); return b?.getTransformNode() ?? null; };
    const findSeat = ([x, z]: number[]) => {
      for (const sk of scene.skeletons) { const h = bone(sk, 'Hips'); if (!h) continue; const q = h.getAbsolutePosition(); if (Math.hypot(q.x - x, q.z - z) < 0.6) {
        const nodes = new Set(sk.bones.map((b: any) => b.getTransformNode()).filter(Boolean));
        return { sk, nodes, B: Object.fromEntries(['LeftArm', 'RightArm', 'LeftHand', 'RightHand', 'Head', 'Hips'].map((k) => [k, bone(sk, k)])) };
      } }
      return null;
    };
    // …and wherever the mode says its seats are now (they follow the canvas aspect: ±1.3 m on a portrait phone)
    const findCast = (n: number) => { const meta = scene.metadata?.qaSeats as number[][] | undefined; for (const set of [...(meta ? [meta.slice(0, n)] : []), ...SPOT_SETS(n)]) { const seats = set.map(findSeat); if (seats.every(Boolean)) return seats; } return SPOT_SETS(n)[0].map(() => null); };
    let lastCastScan = -1;
    let lastRoll: number | null = null;
    scene.onAfterRenderObservable.add(() => {
      const h = qa.rawHud();
      const now = R.now();
      if (now - lastCastScan > 1 && (!R.cast.length || R.cast.some((c: any) => !c))) { R.cast = findCast(Number(h.players) || 1); lastCastScan = now; }
      const wheel = scene.getTransformNodeByName('bb_wheel'); const roll = wheel ? wheel.rotation.z : 0;
      const turning = lastRoll !== null && Math.abs(roll - lastRoll) > 1e-5; lastRoll = roll;
      const row: any = { t: now, turning, phase: h.phase ?? '', cat: h.category ?? '', pin: h.phase === 'spin' || h.phase === 'expose' || h.phase === 'answer' ? wedgeAtPin() : null, banner: h.banner ?? '' };
      row.bodies = R.cast.map((c: any) => {
        if (!c) return null;
        const groups = scene.animationGroups.filter((g: any) => g.isPlaying && g.targetedAnimations.some((ta: any) => c.nodes.has(ta.target)));
        // the weight a cross-fade actually applies lives on the animatables (setWeightForAllAnimatables), not on group.weight
        const clips = groups.map((g: any) => { const a = g.animatables?.[0]; const wt = a && a.weight >= 0 ? a.weight : (g.weight === undefined || g.weight < 0 ? 1 : g.weight); return { c: g.name, w: +wt.toFixed(2) }; }).filter((x: any) => x.w > 0.05);
        let T = false;
        if (c.B.LeftArm && c.B.LeftHand && c.B.RightArm && c.B.RightHand) {
          const side = (s: string) => { const sh = c.B[s + 'Arm'].getAbsolutePosition(), hd = c.B[s + 'Hand'].getAbsolutePosition(); return { dy: hd.y - sh.y, dh: Math.hypot(hd.x - sh.x, hd.z - sh.z) }; };
          const L = side('Left'), Rr = side('Right');
          T = Math.abs(L.dy) < 0.15 && Math.abs(Rr.dy) < 0.15 && L.dh > 0.4 && Rr.dh > 0.4;
        }
        // on screen: the head AND the hips projected through the live camera land inside the frame, in front of the lens
        let onScreen = false;
        if (c.B.Head && c.B.Hips && scene.activeCamera) {
          const eng = scene.getEngine(), w = eng.getRenderWidth(), hh = eng.getRenderHeight();
          const V = c.B.Head.getAbsolutePosition().constructor, M = scene.getTransformMatrix().constructor;
          const vp = scene.activeCamera.viewport.toGlobal(w, hh);
          const inside = (n: any) => { const q = V.Project(n.getAbsolutePosition(), M.Identity(), scene.getTransformMatrix(), vp); return q.z > 0 && q.z < 1 && q.x >= 0 && q.x <= w && q.y >= 0 && q.y <= hh; };
          onScreen = inside(c.B.Head) && inside(c.B.Hips);
        }
        return { clips, T, bind: clips.length === 0, onScreen };
      });
      // the card against the stage and the top bar
      const stage = document.querySelector('canvas')?.parentElement as HTMLElement | null;
      const card = document.querySelector('[data-bb="card"]') as HTMLElement | null ?? (Array.from(document.querySelectorAll('div')).find((d) => /bottom-3/.test(d.className) && /flex-col/.test(d.className)) as HTMLElement | undefined) ?? null;
      const top = stage?.firstElementChild?.nextElementSibling as HTMLElement | null;
      if (stage && card) {
        const s = stage.getBoundingClientRect(), cr = card.getBoundingClientRect(), tb = top?.getBoundingClientRect();
        row.card = { top: Math.round(cr.top - s.top), h: Math.round(cr.height), overTop: Math.round(Math.max(0, s.top - cr.top)), overBar: tb ? Math.round(Math.max(0, tb.bottom - cr.top)) : 0 };
        row.trunc = Array.from(card.querySelectorAll('button span')).filter((e: any) => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1).length;
      }
      R.rows.push(row);
    });
  });

  const pressP = (btn: number, tag: string) => p.evaluate(([b, t]) => (window as any).__BB.press(b, true, t), [btn, tag] as const);
  const releaseP = (btn: number) => p.evaluate((b) => (window as any).__BB.press(b, false, ''), btn);
  const tap = async (btn: number, tag: string, ms = 60) => { await pressP(btn, tag); await p.waitForTimeout(ms); await releaseP(btn); };
  const waitPhase = async (re: RegExp, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { const r: any = await raw(); if (re.test(String(r.phase ?? ''))) return r; await p.waitForTimeout(25); } return null; };
  const shot = (n: string) => p.locator('canvas').first().evaluate((c) => c.parentElement!.scrollIntoView()).then(() => p.screenshot({ path: `${OUT}/${n}.png` })).catch(() => {});

  const rounds: any[] = [];
  // begin (solo sits on the pick screen; a duel via ?players=2 begins on its own)
  await p.waitForTimeout(1200);
  await shot('00-pick');
  if (PLAYERS === 1) await tap(FACE_BTN[0], 'begin');
  for (let r = 0; r < MAX_ROUNDS; r++) {
    const sp = await waitPhase(/^(spin|done)$/, 20000);
    if (!sp || sp.phase === 'done') break;
    const spinAt = await p.evaluate(() => (window as any).__BB.now());
    await p.waitForTimeout(600);
    await tap(FACE_BTN[0], 'during-spin');
    if (r === 0) await shot('01-spin');
    const ans = await waitPhase(/^(expose|answer|done)$/, 20000);
    if (!ans || ans.phase === 'done') break;
    const landed = await p.evaluate(() => { const w = window as any; return { pin: w.__BB.wedgeAtPin(), cat: w.__FEL_QA__.rawHud().category, t: w.__BB.now() }; });
    const opened = await waitPhase(/^answer$/, 15000);
    const openAt = await p.evaluate(() => (window as any).__BB.now());
    const key = await p.evaluate(() => (window as any).__FEL_QA__.scene()?.metadata?.qaAnswer as number);
    const r1 = await raw();
    const kind = String(r1.prompt ?? '');
    if (r === 0 || r === 2) await shot(`02-question-r${r + 1}`);
    const act = async (plan: string, btns: number[], tag: string) => {
      if (plan === 'time') return;
      await tap(btns[plan === 'right' ? key : (key + 1) % 4], tag);
    };
    await p.waitForTimeout(700);
    await act(PLAN_P1[r] ?? 'right', FACE_BTN, `p1-${PLAN_P1[r]}`);
    let leak: any = null;
    if (PLAYERS === 2) {
      // P1 is locked in, P2 has not answered: what does P1's body say right now?
      await p.waitForTimeout(500);
      leak = await p.evaluate(() => { const w = window as any; const last = w.__BB.rows[w.__BB.rows.length - 1]; return { phase: last.phase, p1: last.bodies?.[0]?.clips?.map((c: any) => c.c) ?? [] }; });
      await act(PLAN_P2[r] ?? 'right', DPAD_BTN, `p2-${PLAN_P2[r]}`);
    }
    const res = await waitPhase(/^(result|done)$/, 20000);
    const resAt = await p.evaluate(() => (window as any).__BB.now());
    await p.waitForTimeout(350);
    const reveal = await p.evaluate(() => {
      const card = document.querySelector('[data-bb="card"]') as HTMLElement | null;
      const btns = card ? Array.from(card.querySelectorAll('[data-bb-opt]')).map((b: any) => ({ state: b.getAttribute('data-bb-opt'), text: b.innerText.replace(/\s+/g, ' ').trim() })) : [];
      const verdicts = Array.from(document.querySelectorAll('[data-bb-verdict]')).map((e: any) => `${e.getAttribute('data-bb-verdict')}:${e.innerText.trim()}`);
      return { cardVisible: !!card && card.getBoundingClientRect().height > 0, options: btns, verdicts, text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 600) };
    });
    if (r < 3) await shot(`03-reveal-r${r + 1}`);
    // a face press in the result: does it move the game on, or is it refused?
    await p.waitForTimeout(700);
    await tap(FACE_BTN[0], 'during-result');
    const nx = await waitPhase(/^(spin|done)$/, 15000);
    const nextAt = await p.evaluate(() => (window as any).__BB.now());
    rounds.push({ round: r + 1, planP1: PLAN_P1[r], planP2: PLAYERS === 2 ? PLAN_P2[r] : undefined, announced: landed.cat, wedgeAtPin: landed.pin, spinToOpen: +(openAt - spinAt).toFixed(2), resultToNext: +(nextAt - resAt).toFixed(2), prompt: kind, key, leak, reveal, next: nx?.phase ?? null, resultBanner: res?.banner ?? null });
  }
  // the finish
  const fin = await waitPhase(/^done$/, 30000);
  await p.waitForTimeout(600); await shot('04-finish');
  const t0 = Date.now(); while (!ended && Date.now() - t0 < 8000) await p.waitForTimeout(100);
  const data = await p.evaluate(() => { const w = window as any; return { rows: w.__BB.rows, presses: w.__BB.presses, locks: w.__BB.locks, qa: w.__FEL_QA__?.summary?.() ?? null, anim: w.__FEL_DEV__?.anim?.() ?? null }; });

  // ── grade ──
  const rows = data.rows as any[];
  const spinRows = rows.filter((r) => r.phase === 'spin');
  // a spoiler: the category is on the HUD and the wheel is STILL turning on the next frame (the landing frame itself is the announcement)
  const spoiler = rows.filter((r, i) => r.phase === 'spin' && r.cat && rows[i + 1]?.turning).length;
  const wheelWrong = rounds.filter((r) => r.announced && r.wedgeAtPin && r.announced !== r.wedgeAtPin).length;
  const lockMs = data.presses.filter((x: any) => /^p1-(right|wrong)$/.test(x.tag)).map((x: any) => { const l = data.locks.find((k: any) => k.who === 1 && k.pt >= x.pt); return l ? Math.round(l.pt - x.pt) : null; });
  const bodyFrames = rows.filter((r) => r.bodies?.length);
  const tFrames = bodyFrames.filter((r) => r.bodies.some((b: any) => b?.T)).length;
  const bindFrames = bodyFrames.filter((r) => r.bodies.some((b: any) => b?.bind)).length;
  const clipsIn = (ph: RegExp) => { const s = new Map<string, number>(); for (const r of bodyFrames) if (ph.test(r.phase)) for (const b of r.bodies) for (const c of b?.clips ?? []) if (c.w > 0.5) s.set(c.c, (s.get(c.c) ?? 0) + 1); return Object.fromEntries([...s].sort((a, b) => b[1] - a[1])); };
  const cardRows = rows.filter((r) => r.card && r.card.h > 0);
  const summary = {
    players: PLAYERS, rounds: rounds.length, ended: ended ? String(ended).slice(0, 300) : null, finishBanner: fin?.banner ?? null,
    wheel: { announcedVsPin: rounds.map((r) => `${r.announced}/${r.wedgeAtPin}`), wrongLandings: wheelWrong, spoilerFramesWhileTurning: spoiler, turningFrames: spinRows.filter((r) => r.turning).length, spinFrames: spinRows.length },
    loop: { spinToAnswerOpen_s: rounds.map((r) => r.spinToOpen), resultToNextSpin_s: rounds.map((r) => r.resultToNext), pressesByPhase: data.presses.reduce((a: any, x: any) => { a[`${x.tag}@${x.phase}`] = (a[`${x.tag}@${x.phase}`] ?? 0) + 1; return a; }, {}) },
    input: { pressToLockedMs: lockMs },
    reveal: rounds.map((r) => ({ round: r.round, plan: r.planP1, plan2: r.planP2, banner: r.resultBanner, cardVisible: r.reveal.cardVisible, marked: r.reveal.options.map((o: any) => o.state).join(','), verdicts: r.reveal.verdicts })),
    duelLeak: rounds.map((r) => r.leak).filter(Boolean),
    anim: { frames: bodyFrames.length, onScreenFrames: bodyFrames.filter((r) => r.bodies.every((b: any) => b?.onScreen)).length, tFrames, bindFrames, answerClips: clipsIn(/^(expose|answer)$/), resultClips: clipsIn(/^result$/), doneClips: clipsIn(/^done$/), refused: data.anim?.refused ?? null, stoodIn: data.anim?.stoodIn ?? null },
    card: { frames: cardRows.length, maxOverTop: Math.max(0, ...cardRows.map((r) => r.card.overTop)), framesOverTopBar: cardRows.filter((r) => r.card.overBar > 0).length, maxOverBar: Math.max(0, ...cardRows.map((r) => r.card.overBar)), framesTruncatedOption: cardRows.filter((r) => r.trunc > 0).length },
    console: { missingClip: missing, errors },
  };
  fs.writeFileSync(`${OUT}/rows.json`, JSON.stringify(rows));
  fs.writeFileSync(`${OUT}/rounds.json`, JSON.stringify(rounds, null, 1));
  fs.writeFileSync(`${OUT}/logs.json`, JSON.stringify(logs, null, 1));
  fs.writeFileSync(`${OUT}/summary.json`, JSON.stringify(summary, null, 1));
  console.log(JSON.stringify(summary, null, 1));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
