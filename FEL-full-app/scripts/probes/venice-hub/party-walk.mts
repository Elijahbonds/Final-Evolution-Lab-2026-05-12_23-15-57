// VENICE PARTY WALK (lane/venice-v1, improvement pass phase 2, 2026-11-17): "Play with your party" from Court 1 and Court 2 with three
// real browsers in one party, on the REAL app (scripts/every-screen/rig.mts production build + throwaway database) and a LOCAL netd
// (server/netd, started here on NETD_PORT with a throwaway PARTY_TICKET_SECRET; nothing reaches a deployed server).
// The build must have been made with NEXT_PUBLIC_NETD_URL=ws://127.0.0.1:<NETD_PORT> (the party's URL is baked in at build time).
//
//   host   (the rig's "solo" adult)    makes the party on /party, then walks /play/venice?agent=1 to the court and taps "Play with your party"
//   member (the rig's "client" adult)  joins by code and waits on /party: the countdown seats them (1v1 and 3v3 seat two humans today)
//   third  (the rig's "admin" adult)   joins too: no seat left, stays in the party (the decided rule)
// Every SEATED member's game must open with the Venice return (from=venice&spot=<court>), and leaving the game must land each of them
// on /play/venice?spot=<court>. Party-only: no stranger is ever in it.
//
//   NETD_PORT=3749 ES_OUT=<dir> /home/user/wt/gate-run.sh 1500 npx tsx scripts/probes/venice-hub/party-walk.mts
import { chromium, type BrowserContext, type Page } from 'playwright-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromiumExe } from '../_chromium.mts';
import { ORIGIN, ROOT, dbUp, people as makePeople, serve, storageState } from '../../every-screen/rig.mts';

const OUT = process.env.OUT ?? process.env.ES_OUT ?? '/tmp/venice-party';
fs.mkdirSync(OUT, { recursive: true });
const NETD_PORT = Number(process.env.NETD_PORT ?? 3749);
const COURTS = (process.env.COURTS ?? 'court.ones,court.run').split(',');
const ROUTE: Record<string, string> = { 'court.ones': '/play/onevone', 'court.run': '/play/threevthree' };
process.env.PARTY_TICKET_SECRET = process.env.PARTY_TICKET_SECRET ?? 'venice-party-probe-not-a-real-secret-0123456789';

// the local party server
const netd = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
  cwd: path.join(ROOT, 'server/netd'), env: { ...process.env, PORT: String(NETD_PORT) }, stdio: ['ignore', fs.openSync(path.join(OUT, 'netd.log'), 'w'), fs.openSync(path.join(OUT, 'netd.err'), 'w')],
});
const stopNetd = () => { try { netd.kill(); } catch { /* gone */ } };
process.on('exit', stopNetd);
for (let i = 0; i < 40; i++) { try { if ((await fetch(`http://127.0.0.1:${NETD_PORT}/healthz`)).ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 250)); }

dbUp();
const stop = await serve(path.join(OUT, 'server.log'));
const report: Record<string, unknown>[] = [];
let failed = 0;
const log = (s: string) => console.log(s);
try {
  const ppl = await makePeople();
  const browser = await chromium.launch({ executablePath: chromiumExe(), args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const ctxs: BrowserContext[] = [];
    const pages: Page[] = [];
    for (const who of ['solo', 'client', 'admin'] as const) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, storageState: storageState(ppl, who) });
      ctxs.push(ctx); pages.push(await ctx.newPage());
    }
    const [host, member, third] = pages;
    for (const [i, p] of pages.entries()) p.on('console', (m) => { if (/party|netd|ws|socket|error/i.test(m.text())) console.log(`  (page ${i}) ${m.type()}: ${m.text().slice(0, 160)}`); });
    // the party: the host makes it, the others join by its code
    await host.goto(`${ORIGIN}/party`);
    await host.getByTestId('party-name').fill('HOST');
    await host.getByTestId('party-create').click();
    const code = (await host.getByTestId('party-code').innerText({ timeout: 30000 })).replace(/\s/g, '');
    log(`party ${code}`);
    for (const [p, n] of [[member, 'MEMBER'], [third, 'THIRD']] as const) {
      await p.goto(`${ORIGIN}/party`);
      await p.getByTestId('party-name').fill(n);
      await p.getByTestId('party-join-code').fill(code);
      await p.getByTestId('party-join').click();
    }
    try {
      // the party pill's count (the member list itself is inside "Open party")
      await host.waitForFunction(() => /\b3 in party\b/.test(document.body.innerText), null, { timeout: 30000 });
    } catch (e) {
      for (const [i, p] of pages.entries()) await p.screenshot({ path: path.join(OUT, `party-setup-${i}.jpg`), type: 'jpeg', quality: 60 }).catch(() => {});
      throw e;
    }
    log('three in the party');
    for (const court of COURTS) {
      const row: Record<string, unknown> = { court };
      try {
        // the others wait on /party; the host goes to Venice (the party resumes across the reload)
        for (const p of [member, third]) if (!p.url().endsWith('/party')) await p.goto(`${ORIGIN}/party`);
        await host.goto(`${ORIGIN}/play/venice?agent=1`);
        await host.waitForFunction(() => !!(window as unknown as { __VENICE__?: unknown }).__VENICE__, null, { timeout: 120000 });
        await host.evaluate((id) => (window as unknown as { __VENICE__: { walkTo(i: string): boolean } }).__VENICE__.walkTo(id), court);
        await host.getByTestId('venice-party').waitFor({ timeout: 90000 });
        await host.getByTestId('venice-party').click();
        log(`[${court}] host tapped "Play with your party"`);
        const route = ROUTE[court];
        const seated: Page[] = [host];
        // within the countdown (5 s + a beat), the seated members' pages go to the game
        await Promise.all([host, member, third].map((p) => p.waitForURL((u) => u.pathname === route, { timeout: 20000 }).catch(() => null)));
        if (member.url().includes(route)) seated.push(member);
        const thirdSeated = third.url().includes(route);
        if (thirdSeated) seated.push(third);
        const urls = seated.map((p) => new URL(p.url()));
        row.seated = urls.length; row.thirdStayed = !thirdSeated;
        for (const u of urls) if (u.searchParams.get('from') !== 'venice' || u.searchParams.get('spot') !== court) throw new Error(`a seated member's game opened without the Venice return: ${u.pathname}${u.search}`);
        log(`[${court}] ${urls.length} seated, each with from=venice&spot=${court}${thirdSeated ? '' : '; the third stayed in the party'}`);
        // each seated member leaves the game: each must land beside the court
        for (const [i, p] of seated.entries()) {
          await p.getByTestId('game-header-back').waitFor({ timeout: 120000 });
          await p.waitForFunction(() => /\/play\/venice/.test(document.querySelector('a[data-testid="game-header-back"]')?.getAttribute('href') ?? ''), null, { timeout: 15000 });
          await p.getByTestId('game-header-back').click();
          await p.waitForURL((u) => u.pathname === '/play/venice' && u.searchParams.get('spot') === court, { timeout: 30000 });
          log(`[${court}] seated member ${i + 1} is back at /play/venice?spot=${court}`);
        }
        row.ok = true;
      } catch (e) {
        failed++; row.ok = false; row.error = String((e as Error).message ?? e).slice(0, 300); log(`[${court}] FAIL ${row.error}`);
        for (const [i, p] of pages.entries()) await p.screenshot({ path: path.join(OUT, `party-fail-${court}-${i}.jpg`), type: 'jpeg', quality: 60 }).catch(() => {});
      }
      report.push(row);
    }
    for (const c of ctxs) await c.close();
  } finally { await browser.close(); }
} finally { stop(); stopNetd(); }
fs.writeFileSync(path.join(OUT, 'party-walk.json'), JSON.stringify(report, null, 1));
console.log(`party-walk: ${report.length - failed} of ${report.length} courts brought every seated member back`);
process.exit(failed ? 1 : 0);
