// DUNK-SOFT-OPEN probe: a full GUEST /try contest on the keyboard; per-rendered-frame samples of the hero (and the rival while the
// camera follows it) grade (1) replay yaw, (2) the launch → cinematic clip start (no 0-dt stall / stuck pose), (3) the rival's
// clip chain at its turn end + the claim modal shown ONCE. PORT=<next dev> ROUTE=/try npx tsx scripts/probes/_dunk-soft-open-probe.mts
import { chromium } from 'playwright-core';
const PORT = process.env.PORT ?? '3037', ROUTE = process.env.ROUTE ?? '/try', MAX_S = Number(process.env.MAX_S ?? 240);
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errors: string[] = []; const frames: string[] = []; let attemptPosts = 0;
p.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/status of 401/.test(t)) errors.push(t.slice(0, 200)); if (/FEL-FRAME|MISSING CLIP/.test(t)) frames.push(t.slice(0, 160)); });
p.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 200)));
p.on('request', (r) => { if (r.method() === 'POST' && /\/api\/(challenge\/[^/]+\/attempt|sessions)/.test(r.url())) attemptPosts++; });
await p.goto(`http://localhost:${PORT}${ROUTE}`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 90000 });
await p.waitForFunction(() => !!(window as unknown as { __FEL_DEV__?: { hero: () => unknown } }).__FEL_DEV__?.hero?.(), null, { timeout: 180000 });
await p.waitForTimeout(800);

type Row = { t: number; dt: number; id: number; x: number; z: number; y: number; ry: number; rq: boolean; hx: number; hy: number; hz: number; clips: string[]; ats: number };
type Mark = { t: number; msg: string };
await p.evaluate(`(() => {
  const dev = window.__FEL_DEV__, scene = dev.scene;
  const S = window.__smp = { rows: [], marks: [], roots: [] };
  const oi = console.info.bind(console), ow = console.warn.bind(console);
  console.info = (...a) => { const s = String(a[0]); if (/^\\[(JUICE|HANDS|FEL-DUNK)/.test(s)) S.marks.push({ t: performance.now(), msg: s.slice(0, 90) }); oi(...a); };
  console.warn = (...a) => { const s = String(a[0]); if (/FEL-DUNK/.test(s)) S.marks.push({ t: performance.now(), msg: s.slice(0, 120) }); ow(...a); };
  const rootOf = (n) => { if (n && typeof n.getTransformNode === 'function') n = n.getTransformNode() ?? n; while (n && n.parent) n = n.parent; return n; };
  const hands = new Map();
  scene.onBeforeRenderObservable.add(() => {
    const h = dev.hero(); if (!h) return;
    let id = S.roots.indexOf(h); if (id < 0) { S.roots.push(h); id = S.roots.length - 1; }
    let hand = hands.get(h); if (hand === undefined) { hand = h.getDescendants(false).find((n) => /^RightHand/.test(n.name)) ?? null; hands.set(h, hand); }
    const hp = hand ? hand.getAbsolutePosition() : null, rp = h.getAbsolutePosition();
    const clips = scene.animationGroups.filter((g) => g.isPlaying && g.targetedAnimations[0] && rootOf(g.targetedAnimations[0].target) === h)
      .map((g) => g.name + '@' + (g.animatables[0]?.masterFrame ?? 0).toFixed(1) + '/' + g.to.toFixed(0));
    S.rows.push({ t: performance.now(), dt: scene.getEngine().getDeltaTime(), id, x: h.position.x, z: h.position.z, y: h.position.y, ry: h.rotation.y, rq: !!h.rotationQuaternion,
      hx: hp ? hp.x - rp.x : 0, hy: hp ? hp.y - rp.y : 0, hz: hp ? hp.z - rp.z : 0, clips, ats: scene.animationTimeScale ?? 1 });
  });
})()`);

const start = p.locator('button', { hasText: /TAP TO START/i }).first();
if (await start.count()) await start.click(); else await p.keyboard.press('Space');
await p.waitForFunction(() => /PROP|SLAM|RUN|CHARGE|· playing/.test(document.body.innerText), null, { timeout: 30000 });
await p.waitForTimeout(3000);
const marks = async (): Promise<Mark[]> => p.evaluate('window.__smp.marks') as Promise<Mark[]>;
const modalCount = async (): Promise<number> => p.locator('h2', { hasText: /CONTEST|NICE DUNK/ }).count();   // the verdict modal's heading — one per modal (text= is case-insensitive and also hit the panel's <p>)

const t0 = Date.now(); let n = 0;
while (Date.now() - t0 < MAX_S * 1000 && (await modalCount()) === 0 && n < 8) {
  n++;
  const launchesBefore = (await marks()).filter((m) => /JUICE-SOFT\] launch/.test(m.msg)).length;
  await p.keyboard.down('w'); await p.waitForTimeout(900); await p.keyboard.up('w');
  await p.keyboard.down(' ');
  // the launch fires at the gather line during the hold, or on release
  let launched = false; const h0 = Date.now();
  while (!launched && Date.now() - h0 < 1400) { await p.waitForTimeout(50); launched = (await marks()).filter((m) => /JUICE-SOFT\] launch/.test(m.msg)).length > launchesBefore; }
  await p.keyboard.up(' ');
  const l0 = Date.now(); while (!launched && Date.now() - l0 < 1500) { await p.waitForTimeout(50); launched = (await marks()).filter((m) => /JUICE-SOFT\] launch/.test(m.msg)).length > launchesBefore; }
  if (!launched) { console.log(`attempt ${n}: no launch`); continue; }
  const tl = (await marks()).filter((m) => /JUICE-SOFT\] launch/.test(m.msg)).pop()!.t;
  // slam taps across the window: clipTime 1.25 sits ~1.5 s real after the launch (the hang slow-mo stretches the rise)
  const nowPage = async (): Promise<number> => p.evaluate('performance.now()') as Promise<number>;
  while ((await nowPage()) - tl < 1000) await p.waitForTimeout(30);
  for (let i = 0; i < 14; i++) { await p.keyboard.down('j'); await p.waitForTimeout(35); await p.keyboard.up('j'); await p.waitForTimeout(50); }
  // wait for the next approach (or the modal)
  const w0 = Date.now();
  while (Date.now() - w0 < 40000) {
    await p.waitForTimeout(500);
    const txt = (await p.evaluate('document.body.innerText') as string).replace(/\s+/g, ' ');
    if ((await modalCount()) > 0) break;
    if (/Pick your PROP|HOLD to run|FINAL ROUND/.test(txt) && Date.now() - w0 > 3000) break;   // the final round's hint is the NEED line
  }
  const ms = await marks();
  console.log(`attempt ${n} @${((Date.now() - t0) / 1000).toFixed(0)}s: ${ms.slice(-6).map((m) => m.msg.replace(/^\[[^\]]+\] /, '')).join(' · ')}`);
}
await p.waitForTimeout(1500);
const modals = await modalCount();
const headline = modals ? ((await p.locator('h2').allInnerTexts()).join(' | ')) : '';

const rows = await p.evaluate('window.__smp.rows') as Row[];
const ms = await marks();
const checks: [string, boolean, string][] = [];
const chk = (name: string, ok: boolean, detail: string) => { checks.push([name, ok, detail]); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} — ${detail}`); };
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
const deg = (r: number): string => `${(r * 180 / Math.PI).toFixed(0)}°`;
const heroId = rows[0]?.id ?? 0;

// ── 2: launch → cinematic clip start
const launches = ms.filter((m) => /JUICE-SOFT\] launch/.test(m.msg));
const stalls: string[] = []; const snaps: string[] = []; const zeroDt: string[] = []; const clipStart: string[] = []; const yDips: string[] = [];
for (const L of launches) {
  const win = rows.filter((r) => r.id === heroId && r.t >= L.t - 20 && r.t <= L.t + 600);
  let still = 0;
  for (let i = 1; i < win.length; i++) {
    const a = win[i - 1], r = win[i];
    if (r.dt <= 0) zeroDt.push(`${(r.t - L.t).toFixed(0)}ms`);
    const move = Math.hypot(r.hx - a.hx, r.hy - a.hy, r.hz - a.hz);
    if (move > 0.30) snaps.push(`${(r.t - L.t).toFixed(0)}ms ${(move * 100).toFixed(0)}cm`);
    if (r.t - L.t > 60 && r.t - L.t < 350) { if (move < 0.0005) { still++; if (still === 3) stalls.push(`${(r.t - L.t).toFixed(0)}ms`); } else still = 0; }
    if (r.t - L.t > 30 && r.t - L.t < 500 && r.y < a.y - 0.002) yDips.push(`${(r.t - L.t).toFixed(0)}ms`);
  }
  const first = win.find((r) => r.t >= L.t && r.clips.some((c) => /dunk_launch|dunk_mocap/.test(c)));
  clipStart.push(first ? `${(first.t - L.t).toFixed(0)}ms ${first.clips.filter((c) => /dunk|run|idle|walk/.test(c)).join(',')}` : 'NEVER');
  const early = win.filter((r) => r.t >= L.t).slice(0, 8).map((r) => `${(r.t - L.t).toFixed(0)}ms:${(r.clips.find((c) => /dunk_launch|dunk_mocap/.test(c)) ?? 'none').split('/')[0].replace(/^dunk_/, '')} y${r.y.toFixed(3)}`);
  console.log(`      launch frames: ${early.join(' ')}`);
}
const gaps: string[] = []; let gapFrames = 0;
for (const L of launches) {
  const win = rows.filter((r) => r.id === heroId && r.t >= L.t && r.t <= L.t + 2500);
  const slamAt = ms.find((m) => m.t > L.t && /impact slam|miss clank|impact chair/.test(m.msg))?.t ?? L.t + 2500;
  const flight = win.filter((r) => r.t <= slamAt);
  const noClip = flight.filter((r, i) => i > 0 && !r.clips.some((c) => /dunk_|uppercut|windmill|tomahawk|jump/.test(c)));
  gapFrames += noClip.length;
  const deltas = flight.map((r, i) => i ? Math.hypot(r.hx - flight[i - 1].hx, r.hy - flight[i - 1].hy, r.hz - flight[i - 1].hz) : 0);
  const frozen = flight.filter((r, i) => i > 3 && deltas[i] < 0.0005 && r.t - L.t > 200).length;
  gaps.push(`${noClip.length} no-clip frames${noClip.length ? ` at ${noClip.map((r) => (r.t - L.t).toFixed(0)).join('/')} ms` : ''}, ${frozen} frozen-pose frames, flight ${(slamAt - L.t).toFixed(0)} ms`);
}
chk('2 launch: no frame of the flight with NO clip on the athlete (launch → hang → finish)', gapFrames === 0 && launches.length > 0, gaps.join(' | '));
chk('2 launch: the launch clip is playing on the takeoff frame', launches.length > 0 && clipStart.every((c) => !/NEVER/.test(c) && parseInt(c, 10) <= 40), `${launches.length} launches → ${clipStart.join(' | ')}`);
chk('2 launch: no 0-dt frame in the 600 ms after takeoff', zeroDt.length === 0, zeroDt.length ? zeroDt.slice(0, 5).join(', ') : 'every frame dt > 0');
chk('2 launch: no stuck pose (hand still ≥ 3 frames, 60–350 ms)', stalls.length === 0, stalls.length ? `stalls at ${stalls.join(', ')}` : 'hand moves every frame through the launch clip');
chk('2 launch: no pose snap (> 30 cm hand jump in one frame)', snaps.length === 0, snaps.length ? snaps.slice(0, 5).join(', ') : 'no snap');
chk('2 launch: the root rises monotonically off the floor (30–500 ms)', yDips.length === 0, yDips.length ? `y dips at ${yDips.slice(0, 5).join(', ')}` : 'no dip');
// the launch clip's own length vs the flight (reported, not graded): when does it stop advancing?
for (const L of launches.slice(0, 2)) {
  const win = rows.filter((r) => r.id === heroId && r.t >= L.t && r.t <= L.t + 2500);
  const frs = win.map((r) => { const c = r.clips.find((x) => /dunk_launch|dunk_mocap/.test(x)); return c ? { t: r.t - L.t, f: Number(c.split('@')[1].split('/')[0]), to: Number(c.split('/')[1]) } : null; }).filter(Boolean) as { t: number; f: number; to: number }[];
  const last = frs[frs.length - 1]; const held = frs.find((x, i) => i > 3 && x.f >= x.to - 0.5);
  console.log(`      launch clip: playing ${frs.length ? `${frs[0].t.toFixed(0)}→${last.t.toFixed(0)} ms` : 'never'}${held ? `, reaches its last frame at ${held.t.toFixed(0)} ms (to=${held.to})` : ''}; slow-mo frames ats<1: ${win.filter((r) => r.ats < 0.99).length}`);
}

// ── 1: replay yaw — from the slam to '[HANDS] replay end'
const slams = ms.filter((m) => /impact slam/.test(m.msg)); const replayEnds = ms.filter((m) => /replay end/.test(m.msg));
const yawReport: string[] = []; let yawOk = true, rqCount = 0, afterOk = true;
for (const s of slams) {
  const end = replayEnds.find((e) => e.t > s.t); if (!end) continue;
  const win = rows.filter((r) => r.id === heroId && r.t >= s.t + 100 && r.t <= end.t);
  const air = win.filter((r) => r.y > 0.05);
  const offs = win.map((r) => Math.abs(wrap(r.ry - Math.PI)));
  const worst = Math.max(...offs); rqCount += win.filter((r) => r.rq).length;
  const after = rows.filter((r) => r.id === heroId && r.t >= end.t + 300 && r.t <= end.t + 1500);
  const afterWorst = after.length ? Math.max(...after.map((r) => Math.abs(wrap(r.ry - Math.PI)))) : 0;
  if (worst > 0.61) yawOk = false; if (afterWorst > 0.61) afterOk = false;
  yawReport.push(`replay ${((end.t - s.t) / 1000).toFixed(1)}s: ${win.length} frames (${air.length} airborne), yaw off rim-facing max ${deg(worst)}, after ${deg(afterWorst)}`);
}
chk('1 replay yaw: the hero stays rim-facing through the whole replay (≤ 35° off π)', slams.length > 0 && replayEnds.length > 0 && yawOk, yawReport.join(' | ') || `no make (slams ${slams.length}, replay ends ${replayEnds.length})`);
chk('1 replay yaw: no rotationQuaternion on the root during the replay', rqCount === 0, `rq set on ${rqCount} frames`);
chk('1 replay yaw: feet-down after the replay still faces the rim', afterOk && replayEnds.length > 0, replayEnds.length ? 'yes' : 'no replay');

// ── 3: rival onEnd + claim once
const rivalRows = rows.filter((r) => r.id !== heroId);
const rivalIds = [...new Set(rivalRows.map((r) => r.id))];
const cut: string[] = []; const stints: string[] = [];
for (const id of rivalIds) {
  const rr = rows.filter((r) => r.id === id);
  // each stint = a run of frames where a non-loop rival clip (uppercut / dunk_land_crouch / dunk_launch) is playing
  let cur: { name: string; t0: number; f0: number; fLast: number; to: number } | null = null;
  const flush = (tEnd: number) => { if (!cur) return; const dur = tEnd - cur.t0; const reached = cur.fLast >= cur.to - 2;
    stints.push(`${cur.name} ${dur.toFixed(0)}ms f${cur.f0.toFixed(0)}→${cur.fLast.toFixed(0)}/${cur.to}`);
    if (!reached && dur < 400 && !/dunk_launch/.test(cur.name)) cut.push(`${cur.name} cut after ${dur.toFixed(0)}ms at f${cur.fLast.toFixed(0)}/${cur.to}`); cur = null; };
  for (const r of rr) {
    const c = r.clips.find((x) => /uppercut|dunk_land_crouch|dunk_launch|celebrate/.test(x));
    if (!c) { flush(r.t); continue; }
    const [name, rest] = c.split('@'); const f = Number(rest.split('/')[0]), to = Number(rest.split('/')[1]);
    if (!cur || cur.name !== name || f < cur.fLast - 5) { flush(r.t); cur = { name, t0: r.t, f0: f, fLast: f, to }; } else cur.fLast = f;
  }
  flush(rr[rr.length - 1]?.t ?? 0);
}
const rivalIdle = rivalRows.filter((r) => r.clips.some((c) => /idle/.test(c))).length;
const rivalAir = rivalRows.filter((r) => r.y > 0.05);
const rivalAirIdle = rivalAir.filter((r) => r.clips.some((c) => /idle/.test(c)) && !r.clips.some((c) => /dunk_/.test(c))).length;
const rivalAirNone = rivalAir.filter((r) => r.clips.length === 0).length;
chk('3 rival hop: the rival never idles (or plays nothing) while airborne', rivalAir.length > 50 && rivalAirIdle === 0 && rivalAirNone === 0, `${rivalAir.length} airborne frames · ${rivalAirIdle} in idle · ${rivalAirNone} clip-less · clips seen: ${[...new Set(rivalAir.flatMap((r) => r.clips.map((c) => c.split('@')[0])))].join(',')}`);
const faceErrs: number[] = [];
for (let i = 1; i < rivalRows.length; i++) { const a = rivalRows[i - 1], r = rivalRows[i]; if (r.y < 0.3 || r.id !== a.id) continue; const dx = r.x - a.x, dz = r.z - a.z; if (Math.hypot(dx, dz) < 0.005) continue; faceErrs.push(Math.abs(wrap(r.ry - Math.atan2(dx, dz)))); }
const faceMax = faceErrs.length ? Math.max(...faceErrs) : NaN;
chk('3 rival hop: the rival faces its flight direction (the rim), not the camera', faceErrs.length > 20 && faceMax < 0.35, `${faceErrs.length} moving airborne frames · facing error max ${deg(faceMax || 0)}`);
// settled bench frames: on the floor and not moving for 3 frames either side (the hop's first / last frame carries the rim yaw by design)
const moving = rivalRows.map((r, i) => i > 0 && r.id === rivalRows[i - 1].id && Math.hypot(r.x - rivalRows[i - 1].x, r.z - rivalRows[i - 1].z, r.y - rivalRows[i - 1].y) > 0.001);
const benchYaw = rivalRows.filter((r, i) => r.y <= 0.01 && i > 3 && i < rivalRows.length - 4 && !moving.slice(i - 3, i + 4).some(Boolean)).map((r) => Math.abs(wrap(r.ry)));
chk('3 rival hop: settled at the bench the rival faces the court as spawned (yaw 0)', benchYaw.length > 0 && Math.max(...benchYaw) < 0.05, `${benchYaw.length} settled bench frames · max |yaw| ${deg(benchYaw.length ? Math.max(...benchYaw) : 0)}`);
const rivalNone = rivalRows.filter((r) => r.clips.length === 0).length;
chk('3 rival onEnd: the rival was followed (camera hero swap) during its turns', rivalRows.length > 200, `${rivalRows.length} rival frames over ${rivalIds.length} stints`);
chk('3 rival onEnd: the verdict clip is never cut to idle early', cut.length === 0 && stints.length > 0, cut.length ? cut.join(' | ') : stints.slice(0, 6).join(' | '));
chk('3 rival onEnd: no frame with NO clip on the rival (broken idle)', rivalNone === 0, `${rivalNone} clip-less frames · ${rivalIdle} idle frames`);
const wd = ms.filter((m) => /watchdog/.test(m.msg));
chk('3 rival onEnd: no watchdog trip in rivalTurn / judging', wd.length === 0, wd.length ? wd.map((m) => m.msg.slice(0, 80)).join(' | ') : 'none');
const claimLinks = await p.locator('a[href^="/signup"]', { hasText: /CLAIM YOUR ATHLETE/i }).count();
chk('3 claim: the Contest Over claim modal shows ONCE (BUG-001 KEEP)', modals === 1 && claimLinks === 1, `${modals} verdict modal(s) · ${claimLinks} CLAIM YOUR ATHLETE link(s) · h2 "${headline}" · attempt/session POSTs ${attemptPosts}`);
chk('0 console: 0 errors / 0 FEL-FRAME / 0 MISSING CLIP', errors.length === 0 && frames.length === 0, `${errors.length} errors ${frames.length} frame/clip · ${errors.slice(0, 2).join(' | ')}`);
console.log(`marks: ${ms.map((m) => m.msg.replace(/^\[[^\]]+\] /, '')).join(' · ').slice(0, 1500)}`);
console.log(`${checks.filter((c) => c[1]).length}/${checks.length} PASS · ${rows.length} rows · ${launches.length} launches · ${slams.length} makes`);
if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT });
await b.close();
