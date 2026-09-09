// TRY-ONBOARD GO AGAIN regression (DUNK-BODY-MID, 2026-09-09): the guest's Flight Night on /try, headless, on a fake pad.
//
// The G1/G3/G7 contract landed at c4b86f9 and this tip must not move it: the night's card is a beat INSIDE the running
// mode, not a modal that ends it — one canvas for the whole session, no CONTEST OVER wall, no second boot splash, and
// GO AGAIN puts the guest straight back on the court on the next night's board.
//
//   G1  no CONTEST OVER / WON wall
//   G3  ONE canvas element for the whole session (the mode is never torn down and remounted)
//   G7  ONE boot splash (the cold load's) — a card that remounts the harness runs a second one
//   GO  the card carries GO AGAIN, and pressing it is back on the court on the next night
//
//   PORT=3056 npx tsx scripts/probes/_try-goagain-regress.mts
import { chromium, type Page } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromiumExe } from './_chromium.mts';
const PORT = process.env.PORT ?? '3056', OUT = process.env.OUT_DIR ?? 'docs/shots/try-goagain';
mkdirSync(OUT, { recursive: true });

const PAD_INIT = `(() => {
  const pad = { index: 0, id: 'fake-dualshock (STANDARD GAMEPAD)', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad;
  navigator.getGamepads = () => [pad];
  window.__mounts = 0; window.__splash = 0;
})()`;

const hud = (p: Page) => p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim().slice(0, 1600)) as Promise<string>;
const canvasId = (p: Page) => p.evaluate(() => {
  const c = document.querySelector('canvas') as (HTMLCanvasElement & { __felId?: number }) | null;
  if (!c) return -1;
  const w = window as unknown as { __canvasSeq?: number };
  if (c.__felId == null) { w.__canvasSeq = (w.__canvasSeq ?? 0) + 1; c.__felId = w.__canvasSeq; }
  return c.__felId;
}) as Promise<number>;
async function padSet(p: Page, js: string): Promise<void> { await p.evaluate(`(() => { const p = window.__PAD; if (!p) return; ${js}; p.timestamp = performance.now(); })()`); }
const stick = (p: Page, x: number, y: number) => padSet(p, `p.axes[0] = ${x}; p.axes[1] = ${y}`);
const run = (p: Page, on: boolean) => padSet(p, `p.buttons[7].pressed = ${on}; p.buttons[7].value = ${on ? 1 : 0}`);
const btn = (p: Page, i: number, on: boolean) => padSet(p, `p.buttons[${i}].pressed = ${on}; p.buttons[${i}].value = ${on ? 1 : 0}`);
async function tap(p: Page, i: number, ms = 90): Promise<void> { await btn(p, i, true); await p.waitForTimeout(ms); await btn(p, i, false); }
const isCard = (t: string) => /GO AGAIN|DUNK AGAIN|CLAIM YOUR ATHLETE/i.test(t);

/** One dunk, played the way a guest plays it: hold RUN to the line, then press SLAM WHEN THE CALL COMES UP. `cue` picks
 *  which press this is — 'see' waits for the SLAM read on the HUD (the read now lifts a buffer's width before the window,
 *  so a press on sight is taken), 'blind' is the old fixed 300 ms after the takeoff, which lands around clip 0.3 and is
 *  nowhere near the finish under any version of this mode. */
async function oneDunk(p: Page, cue: 'see' | 'blind' = 'see'): Promise<void> {
  await stick(p, 0, -1);
  await run(p, true);
  await p.waitForTimeout(1500);
  await run(p, false);
  if (cue === 'blind') { await p.waitForTimeout(300); await tap(p, 0, 100); }
  else {
    const t0 = Date.now();
    let seen = false;
    while (Date.now() - t0 < 2400) {
      if (/SLAM!/.test(await hud(p))) { seen = true; await tap(p, 0, 90); break; }
      await p.waitForTimeout(16);
    }
    if (!seen) await tap(p, 0, 90);   // the read never came up — press anyway, and let the card say what happened
  }
  await p.waitForTimeout(2400);
  await stick(p, 0, 0);
}

async function main(): Promise<void> {
  const b = await chromium.launch({ executablePath: chromiumExe(), args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(PAD_INIT);
  const p = await ctx.newPage();
  const errors: string[] = []; let splashes = 0, wall = false;
  p.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' && !/status of 401|favicon/.test(t)) errors.push(t.slice(0, 180));
    if (/FEL-READY\] dunk → loading/.test(t)) splashes++;
  });
  p.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 180)));

  const lines: string[] = [];
  const say = (ok: boolean, what: string) => lines.push(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  await p.goto(`http://localhost:${PORT}/try`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForSelector('canvas', { timeout: 150000 });
  await p.waitForTimeout(1200);
  // the READY gate
  for (let i = 0; i < 20; i++) {
    const t = await hud(p);
    if (!/TAP TO START|READY/i.test(t)) break;
    const b0 = p.getByRole('button', { name: /TAP TO START|READY/i });
    if (await b0.count()) await b0.first().click({ force: true }).catch(() => {}); else await p.mouse.click(640, 480);
    await p.waitForTimeout(500);
  }
  const canvas0 = await canvasId(p);
  await p.screenshot({ path: `${OUT}/00-court.png` });

  // ── night 1: dunk until the card comes up ──
  let card = '', dunks = 0;
  for (let n = 0; n < 16 && !card; n++) {
    const t = await hud(p);
    if (isCard(t)) { card = t; break; }
    await oneDunk(p); dunks++;
    if (/CONTEST OVER|YOU WON|RIVAL WON/i.test(await hud(p))) wall = true;
  }
  if (!card) card = await hud(p);
  const canvasCard = await canvasId(p);
  await p.screenshot({ path: `${OUT}/01-night1-card.png` });
  say(isCard(card), `the night ends on a CARD: ${isCard(card) ? /GO AGAIN|DUNK AGAIN/i.exec(card)?.[0] : 'NO CARD after ' + dunks + ' dunks'}`);
  const tally = /(\d+) dunked · (\d+) missed/.exec(card);
  say(!!tally && Number(tally[1]) >= 3, `a guest pressing SLAM ON SIGHT finishes the night: ${tally ? `${tally[1]} dunked · ${tally[2]} missed` : 'no tally on the card'}`);
  say(/GO AGAIN/i.test(card), `GO AGAIN on the card: ${/GO AGAIN/i.test(card) ? 'yes' : 'MISSING'}`);
  say(canvasCard === canvas0 && canvasCard > 0, `G3 one canvas through the card: #${canvasCard} (was #${canvas0})`);
  say(!wall && !/CONTEST OVER|YOU WON|RIVAL WON/i.test(card), `G1 no CONTEST OVER wall: ${/CONTEST OVER|YOU WON|RIVAL WON/i.exec(card)?.[0] ?? 'clean'}`);

  // ── GO AGAIN → back on the court, next night ──
  const go = p.getByRole('button', { name: /GO AGAIN/i });
  if (await go.count()) await go.first().click({ force: true });
  await p.waitForTimeout(2500);
  const after = await hud(p), canvasAfter = await canvasId(p);
  await p.screenshot({ path: `${OUT}/02-after-goagain.png` });
  say(!isCard(after), `GO AGAIN is back on the court: ${isCard(after) ? 'STILL ON THE CARD' : 'on the court'}`);
  say(canvasAfter === canvas0, `G3 one canvas across GO AGAIN: #${canvasAfter} (was #${canvas0})`);
  say(splashes <= 1, `G7 boot splashes: ${splashes} (1 = the cold load only)`);
  say(errors.length === 0, `console errors: ${errors.length}${errors.length ? ' — ' + errors.slice(0, 3).join(' | ') : ''}`);
  lines.push(`      night 1 card: ${card.slice(0, 240)}`);
  lines.push(`      after GO AGAIN: ${after.slice(0, 200)}`);

  const pass = lines.filter((l) => l.startsWith('PASS')).length, fail = lines.filter((l) => l.startsWith('FAIL')).length;
  const out = [`TRY GO AGAIN regression · port ${PORT} · ${new Date().toISOString()}`, ...lines, '', `TOTAL PASS ${pass} · FAIL ${fail}`].join('\n');
  writeFileSync(`${OUT}/report.txt`, out);
  console.log(out);
  await b.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
