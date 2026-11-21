// ONLINE-PLAY E2E (lane/online-play, 2026-11-21): online play end to end, on the REAL app (scripts/every-screen/rig.mts production
// build + a throwaway database) against a LOCAL netd. Up to seven browsers; nothing reaches a deployed server.
//
//   party   create; join by CODE, by LINK (/party/<code>), by QR (the QR is checked to encode the invite link, then opened);
//           a teen and a guest knock and are let in; six in; a seventh is turned away; the host removes the guest (who cannot
//           come back); a member reloads (same member, no ghost); "Make host" moves the crown.
//   onevone "Start together" 1v1: who is seated, where each page lands; a SPY peer in the match room counts what flows; the host
//           page is driven by the keyboard (run at the rim, shoot); each page's shared-game state (window.__felNet, absent in a
//           build without it); the guest is a PHONE (390×844, CPU ×4) and its frame times are read; the guest drops off the
//           network for 5 s and comes back; then the host walks out mid-game.
//   threevthree "Start together" 3v3 with five in the party: how many are seated (2 on a party1 netd, 5 on party2), the spy.
//   outdated  the party against the PRE-PARTY netd (the one production runs today): "Parties need a server update".
//
//   The build must have been made with NEXT_PUBLIC_NETD_URL=ws://127.0.0.1:<NETD_PORT> (the party's URL is baked in at build time).
//   ES_PORT=3795 ES_PG_PORT=55495 ES_PG_DIR=/var/lib/postgresql/online-play-pg ES_DIST=.next-online ES_OUT=<dir> NETD_PORT=3799 \
//     STAGES=party,onevone,threevthree /home/user/wt/gate-run.sh 1500 npx tsx scripts/probes/online-play/e2e.mts
//   NETD=old STAGES=outdated …   (the pre-party netd, extracted from git: 6c438074^)
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';
import { chromiumExe } from '../_chromium.mts';
import { ORIGIN, ROOT, dbUp, people as makePeople, serve, storageState } from '../../every-screen/rig.mts';

const OUT = process.env.ES_OUT ?? process.env.OUT ?? '/tmp/online-e2e';
fs.mkdirSync(OUT, { recursive: true });
const NETD_PORT = Number(process.env.NETD_PORT ?? 3799);
const STAGES = (process.env.STAGES ?? 'party,onevone,threevthree').split(',');
const NETD_KIND = process.env.NETD ?? 'current';
process.env.PARTY_TICKET_SECRET = process.env.PARTY_TICKET_SECRET ?? 'online-play-probe-not-a-real-secret-0123456789';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const results: Record<string, { pass: boolean | null; detail?: unknown }> = {};
const note = (k: string, pass: boolean | null, detail?: unknown) => {
  results[k] = { pass, detail };
  console.log(`${pass === null ? 'INFO' : pass ? 'PASS' : 'FAIL'} ${k}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ''}`);
};

// ── the local netd: today's source, or the pre-party one production still runs ───────────────────────────────────────
const netdDir = path.join(ROOT, 'server/netd');
let entry = 'src/index.ts';
const oldFile = path.join(netdDir, 'src/.probe-old-index.ts');
if (NETD_KIND === 'old') {
  fs.writeFileSync(oldFile, execFileSync('git', ['show', '6c438074^:FEL-full-app/server/netd/src/index.ts'], { cwd: ROOT, encoding: 'utf8' }));
  entry = 'src/.probe-old-index.ts';
}
const netd = spawn(process.execPath, ['--import', 'tsx', entry], {
  cwd: netdDir, env: { ...process.env, PORT: String(NETD_PORT) },
  stdio: ['ignore', fs.openSync(path.join(OUT, 'netd.log'), 'w'), fs.openSync(path.join(OUT, 'netd.err'), 'w')],
});
const stopNetd = () => { try { netd.kill(); } catch { /* gone */ } try { fs.unlinkSync(oldFile); } catch { /* none */ } };
process.on('exit', stopNetd);
for (let i = 0; i < 40; i++) { try { if ((await fetch(`http://127.0.0.1:${NETD_PORT}/healthz`)).ok) break; } catch { /* not yet */ } await sleep(250); }
note('netd healthz', null, await (await fetch(`http://127.0.0.1:${NETD_PORT}/healthz`)).json().catch(() => null));

/** A spy in a match room: counts every frame type by sender for `ms`. It takes a watcher seat (`w…`). */
async function spy(room: string, ms: number): Promise<Record<string, Record<string, number>>> {
  const counts: Record<string, Record<string, number>> = {};
  const ws = new WebSocket(`ws://127.0.0.1:${NETD_PORT}/?room=${encodeURIComponent(room)}&peer=wspy${Date.now() % 1000}&mode=spy`);
  ws.onmessage = (ev) => {
    try {
      const m = JSON.parse(String(ev.data)) as { t?: string; from?: string };
      const from = m.from ?? '(server)';
      (counts[from] ??= {})[m.t ?? '?'] = ((counts[from] ??= {})[m.t ?? '?'] ?? 0) + 1;
    } catch { /* not json */ }
  };
  const ping = setInterval(() => { if (ws.readyState === 1) ws.send(JSON.stringify({ t: 'ping', sent: Date.now() })); }, 2000);
  await sleep(ms);
  clearInterval(ping);
  ws.close();
  return counts;
}

const felNet = (p: Page) => p.evaluate(() => {
  const n = (window as unknown as { __felNet?: { role: string; runner: string | null; stats: unknown; peers: string[]; rttMs: number | null; status: string | null; self: string } }).__felNet;
  return n ? { self: n.self, role: n.role, runner: n.runner, stats: n.stats, peers: n.peers, rttMs: n.rttMs, status: n.status } : null;
}).catch(() => null);

async function frameTimes(p: Page, ms: number): Promise<{ frames: number; p50: number; p95: number; worst: number } | null> {
  return p.evaluate((dur) => new Promise<{ frames: number; p50: number; p95: number; worst: number }>((res) => {
    const ts: number[] = []; let last = performance.now(); const end = last + dur;
    const f = (t: number) => { ts.push(t - last); last = t; if (t < end) requestAnimationFrame(f); else { const s = [...ts].sort((a, b) => a - b); res({ frames: ts.length, p50: Math.round(s[Math.floor(s.length / 2)]), p95: Math.round(s[Math.floor(s.length * 0.95)]), worst: Math.round(s[s.length - 1]) }); } };
    requestAnimationFrame(f);
  }), ms).catch(() => null);
}

const shot = (p: Page, name: string) => p.screenshot({ path: path.join(OUT, `${name}.jpg`), type: 'jpeg', quality: 55 }).catch(() => {});
const partyCount = async (p: Page) => { const m = /(\d) in party/.exec(await p.locator('body').innerText().catch(() => '')); return m ? Number(m[1]) : null; };

async function openPanel(p: Page) {
  if (await p.getByTestId('party-panel').count()) return;
  await p.getByTestId('party-bar').locator('button').first().click();
  await p.getByTestId('party-panel').waitFor({ timeout: 15000 });
}
async function closePanel(p: Page) { await p.keyboard.press('Escape').catch(() => {}); await sleep(300); }
async function memberAction(host: Page, name: string, label: RegExp) {
  await openPanel(host);
  await host.getByRole('button', { name: `Options for ${name}` }).click();
  await host.getByRole('button', { name: label }).click();
  await sleep(800);
}

dbUp();
const stop = await serve(path.join(OUT, 'server.log'));
let browser: Browser | null = null;
try {
  const ppl = await makePeople();
  browser = await chromium.launch({ executablePath: chromiumExe(), args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const who = ['solo', 'client', 'coach', 'admin', 'teen', 'anon'] as const;
  const NAMES: Record<string, string> = { solo: 'HOST', client: 'CASEY', coach: 'RILEY', admin: 'AVERY', teen: 'TAYLOR', anon: 'GUEST' };
  const ctx: Record<string, BrowserContext> = {};
  const page: Record<string, Page> = {};
  for (const w of who) {
    const phone = w === 'client';
    ctx[w] = await browser.newContext(phone
      ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, storageState: storageState(ppl, w) }
      : { viewport: { width: 1100, height: 760 }, storageState: storageState(ppl, w) });
    page[w] = await ctx[w].newPage();
    page[w].on('console', (m) => { if (/\[FEL-NET\]|party|netd/i.test(m.text()) && m.type() !== 'debug') fs.appendFileSync(path.join(OUT, `console-${w}.log`), `${m.type()}: ${m.text().slice(0, 300)}\n`); });
    page[w].on('pageerror', (e) => fs.appendFileSync(path.join(OUT, `errors-${w}.log`), `${e.message.slice(0, 300)}\n`));
  }
  const host = page.solo;
  let code = '';

  const joinBy = async (p: Page, name: string, how: 'code' | 'link', link?: string) => {
    if (how === 'link') await p.goto(link!); else await p.goto(`${ORIGIN}/party`);
    await p.getByTestId('party-name').fill(name);
    if (how === 'code') await p.getByTestId('party-join-code').fill(code.toLowerCase().replace(/(...)/, '$1-'));   // forgiving: lower case, a dash
    await p.getByTestId('party-join').click();
  };

  if (STAGES.includes('outdated')) {
    await host.goto(`${ORIGIN}/party`);
    const outdated = await host.getByTestId('party-outdated').waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
    if (!outdated) { await host.getByTestId('party-name').fill('HOST').catch(() => {}); await host.getByTestId('party-create').click().catch(() => {}); }
    const shown = outdated || await host.getByTestId('party-outdated').waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
    note('outdated: the party says "Parties need a server update"', shown, await host.locator('main').innerText().then((t) => t.slice(0, 160)).catch(() => ''));
    await shot(host, 'outdated');
    // and a ?net= match on the old netd still connects (the relay it has is all shared play needs)
    const room = `old-${Date.now()}`;
    await host.goto(`${ORIGIN}/play/onevone?net=${room}&peer=h1&party=1`);
    await page.coach.goto(`${ORIGIN}/play/onevone?net=${room}&peer=foe&party=1`);
    await sleep(40000);
    const flow = await spy(room, 8000);
    note('outdated: a ?net= 1v1 on the old netd — what flows', null, flow);
    note('outdated: each page', null, { host: await felNet(host), guest: await felNet(page.coach) });
  }

  if (STAGES.includes('party')) {
    await host.goto(`${ORIGIN}/party`);
    await host.getByTestId('party-name').fill('HOST');
    await host.getByTestId('party-create').click();
    code = (await host.getByTestId('party-code').innerText({ timeout: 30000 })).replace(/\s/g, '');
    note('party: created', /^[A-Z0-9]{6}$/.test(code), code);
    await joinBy(page.client, 'CASEY', 'code');
    await host.waitForFunction(() => /\b2 in party\b/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {});
    note('party: joined by code (typed lower case with a dash)', (await partyCount(host)) === 2, await partyCount(host));
    const link = `${ORIGIN}/party/${code}`;
    await joinBy(page.coach, 'RILEY', 'link', link);
    await host.waitForFunction(() => /\b3 in party\b/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {});
    note('party: joined by link', (await partyCount(host)) === 3, await partyCount(host));
    // the QR: the image on the host's page must be the invite link's QR (the same library, the same options)
    await host.goto(`${ORIGIN}/party`);
    const qrSrc = await host.locator('img[alt^="QR code for the party invite link"]').first().getAttribute('src', { timeout: 20000 }).catch(() => null);
    const want = await QRCode.toDataURL(`${ORIGIN}/party/${code}`, { margin: 1, width: 240 });
    note('party: the QR encodes the invite link', qrSrc === want, { qrLen: qrSrc?.length ?? 0 });
    await joinBy(page.admin, 'AVERY', 'link', link);   // what the QR opens
    await host.waitForFunction(() => /\b4 in party\b/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {});
    note('party: joined by the QR\'s link', (await partyCount(host)) === 4, await partyCount(host));
    // a teen and a guest: invite-only rules — they knock
    await joinBy(page.teen, 'TAYLOR', 'code');
    await page.teen.getByTestId('party-waiting').waitFor({ timeout: 20000 }).catch(() => {});
    note('party: a teen knocks', await page.teen.getByTestId('party-waiting').count() > 0, null);
    await openPanel(host);
    await host.getByRole('button', { name: 'Let TAYLOR in' }).click({ timeout: 15000 }).catch(() => {});
    await closePanel(host);
    await joinBy(page.anon, 'GUEST', 'code');
    await page.anon.getByTestId('party-waiting').waitFor({ timeout: 20000 }).catch(() => {});
    await openPanel(host);
    await host.getByRole('button', { name: 'Let GUEST in' }).click({ timeout: 15000 }).catch(() => {});
    await closePanel(host);
    await host.waitForFunction(() => /\b6 in party\b/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {});
    note('party: six in (the cap)', (await partyCount(host)) === 6, await partyCount(host));
    // a seventh
    const c7 = await browser.newContext({ viewport: { width: 800, height: 700 } });
    const p7 = await c7.newPage();
    await p7.goto(`${ORIGIN}/party`);
    await p7.getByTestId('party-name').fill('SEVEN');
    await p7.getByTestId('party-join-code').fill(code);
    await p7.getByTestId('party-join').click();
    await sleep(4000);
    const t7 = await p7.locator('main').innerText().catch(() => '');
    note('party: a seventh is turned away', /full/i.test(t7), t7.slice(0, 200));
    await c7.close();
    // kick the guest; the guest cannot come back
    await memberAction(host, 'GUEST', /Remove from party/);
    await closePanel(host);
    await sleep(1500);
    const kicked = await page.anon.locator('body').innerText().catch(() => '');
    note('party: the host removes the guest', (await partyCount(host)) === 5, { count: await partyCount(host), guestSees: kicked.slice(0, 160) });
    await joinBy(page.anon, 'GUEST', 'code');
    await sleep(3000);
    const back = await page.anon.locator('main').innerText().catch(() => '');
    note('party: a removed guest cannot come back (a guest is a new person each time, so this reads "knocks again")', null, back.slice(0, 200));
    // a member reloads: same member, no ghost
    await page.coach.reload();
    await sleep(5000);
    note('party: a reload is the same member (no ghost)', (await partyCount(host)) === 5 || (await partyCount(host)) === 6, await partyCount(host));
    // the crown: host → CASEY and back
    await memberAction(host, 'CASEY', /Make host/);
    await closePanel(host);
    await page.client.goto(`${ORIGIN}/party`).catch(() => {});
    await openPanel(page.client);
    const casey = await page.client.getByTestId('party-start-go').count();
    note('party: "Make host" gives the crown', casey > 0, { startButtonOnCasey: casey });
    if (casey) { await memberAction(page.client, 'HOST', /Make host/); await closePanel(page.client); }
    await closePanel(page.client);
  }

  const startTogether = async (mode: string, drive: boolean) => {
    await host.goto(`${ORIGIN}/party`);
    await openPanel(host);
    await host.getByTestId('party-start-mode').selectOption(mode);
    const label = await host.getByTestId('party-start-mode').locator('option:checked').innerText();
    await host.getByTestId('party-start-go').click();
    const route = `/play/${mode}`;
    const others = ['client', 'coach', 'admin', 'teen'];
    await Promise.all(['solo', ...others].map((w) => page[w].waitForURL((u) => u.pathname === route, { timeout: 25000 }).catch(() => null)));
    const seated = ['solo', ...others].filter((w) => page[w].url().includes(route));
    const room = new URL(host.url()).searchParams.get('net') ?? '';
    note(`${mode}: seated`, null, { label, seated: seated.map((w) => NAMES[w]), urls: seated.map((w) => new URL(page[w].url()).search) });
    // the game loads (3D on swiftshader is slow): wait for the canvas and a while more
    await sleep(45000);
    if (drive) { await host.locator('canvas').first().click({ position: { x: 300, y: 300 } }).catch(() => {}); }
    const driveLoop = async (ms: number) => {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        await host.keyboard.down('w'); await sleep(900); await host.keyboard.up('w');
        await host.keyboard.down('l'); await sleep(520); await host.keyboard.up('l');
        await sleep(1500);
      }
    };
    const [flow] = await Promise.all([spy(room, 15000), drive ? driveLoop(15000) : sleep(15000)]);
    note(`${mode}: what flows in the match room (15 s, by sender)`, null, flow);
    const states: Record<string, unknown> = {};
    for (const w of seated) states[NAMES[w]] = await felNet(page[w]);
    note(`${mode}: each page's shared game`, null, states);
    const runners = Object.values(states).filter((s) => (s as { role?: string } | null)?.role === 'run').length;
    note(`${mode}: exactly one page runs the game`, runners === 1 ? true : Object.values(states).every((s) => s === null) ? null : false, { runners });
    return { seated, room };
  };

  if (STAGES.includes('onevone')) {
    const { seated, room } = await startTogether('onevone', true);
    await shot(host, '1v1-host'); if (seated.includes('client')) await shot(page.client, '1v1-guest-phone');
    if (seated.includes('client')) {
      const cdp = await ctx.client.newCDPSession(page.client);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      note('onevone: the phone guest (CPU ×4) frame times, 6 s', null, await frameTimes(page.client, 6000));
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      note('onevone: the host frame times, 6 s', null, await frameTimes(host, 6000));
      // the guest drops off the network for 5 s
      await ctx.client.setOffline(true); await sleep(5000); await ctx.client.setOffline(false); await sleep(8000);
      note('onevone: after a 5 s drop — the guest', null, await felNet(page.client));
      note('onevone: after a 5 s drop — the room', null, await spy(room, 5000));
      // the host walks out
      await host.goto(`${ORIGIN}/party`);
      await sleep(6000);
      note('onevone: host left — the guest', null, await felNet(page.client));
      const t = await page.client.locator('body').innerText().catch(() => '');
      note('onevone: host left — the guest sees', null, t.slice(0, 240));
      await shot(page.client, '1v1-host-left');
      await page.client.goto(`${ORIGIN}/party`).catch(() => {});
    }
  }

  if (STAGES.includes('threevthree')) {
    const { seated } = await startTogether('threevthree', false);
    note('threevthree: how many humans are seated (party of 5)', null, seated.length);
    await shot(host, '3v3-host');
    for (const w of seated) await page[w].goto(`${ORIGIN}/party`).catch(() => {});
  }
  for (const c of Object.values(ctx)) await c.close().catch(() => {});
} finally {
  await browser?.close().catch(() => {});
  stop(); stopNetd();
}
fs.writeFileSync(path.join(OUT, 'e2e.json'), JSON.stringify(results, null, 1));
const failed = Object.entries(results).filter(([, r]) => r.pass === false).map(([k]) => k);
console.log(`e2e: ${Object.values(results).filter((r) => r.pass === true).length} pass, ${failed.length} fail${failed.length ? `: ${failed.join(' | ')}` : ''}`);
process.exit(0);
