// SHARED-START-UNSTICK probe (2026-09-14) — how long from the FIRST press to a playable mode, per ENABLED arena route.
//
// Wake = one of: `key` (a real CDP Space press), `arrow` (ArrowRight), `stick` (a fake pad's left stick pushed and HELD),
// `tap` (a mouse press on the start card AWAY from its button — the corner), `hold` (Space held 700 ms — training carries
// that hold into its first lift; the `-held.png` frame shows the bar rising). The clock starts in-page on the input itself
// (a capture keydown/pointerdown listener, or the moment the fake pad's axis is written) and stops on the first rAF where:
//   babylon  #fel-ready[data-state=playing]  (the harness's own "loop is running and accepting input" marker)
//   2d       the card text is gone AND the game loop's canvas hook exists (felTiebreak / felTrain — set inside the effect)
// It also stamps the canvas before the wake and checks the SAME element is still there 1.5 s later (no remount / cold boot),
// and with ?agent=1 reads the hero root before/after a held stick (a frozen root does not move).
//
//   BASE=http://127.0.0.1:3000 OUT=… MODES=tiebreak,training WAKES=key,stick,tap npx tsx scripts/probes/_shared-start-unstick-probe.mts
import { chromium, type Page } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3000';
const OUT = process.env.OUT ?? '/Users/elijahbonds/Claude/outbox/shared-start-unstick';
const EMAIL = process.env.PLAYTEST_EMAIL ?? 'playtest@fel.local';
const PASS = process.env.PLAYTEST_PASSWORD ?? 'playtest-local-only';
const LIMIT_MS = 500;
fs.mkdirSync(OUT, { recursive: true });

type Kind = 'babylon' | '2d';
type Spec = { slug: string; path: string; kind: Kind; card?: string; hook?: string };
const ALL: Spec[] = [
  { slug: 'tiebreak', path: '/play/tiebreak', kind: '2d', card: 'FIRST SERVE', hook: 'felTiebreak' },
  { slug: 'training', path: '/play/training', kind: '2d', card: 'CHALK UP', hook: 'felTrain' },
  { slug: 'dunk', path: '/play/dunk?arena=1', kind: 'babylon' },
  { slug: 'try', path: '/try', kind: 'babylon' },
  { slug: 'skateboard', path: '/play/skateboard', kind: 'babylon' },
  { slug: 'karate', path: '/play/karate', kind: 'babylon' },
  { slug: 'threepoint', path: '/play/threepoint', kind: 'babylon' },
  { slug: 'onevone', path: '/play/onevone', kind: 'babylon' },
  { slug: 'threevthree', path: '/play/threevthree', kind: 'babylon' },
  { slug: 'big-air', path: '/play/big-air', kind: 'babylon' },
  { slug: 'golf', path: '/play/golf', kind: 'babylon' },
  { slug: 'baseball', path: '/play/baseball', kind: 'babylon' },
  { slug: 'soccer', path: '/play/soccer', kind: 'babylon' },
  { slug: 'tennis', path: '/play/tennis', kind: 'babylon' },
  { slug: 'freerun', path: '/play/freerun', kind: 'babylon' },
  { slug: 'brain-brawl', path: '/play/brain-brawl', kind: 'babylon' },
  { slug: 'who-scene-it', path: '/play/who-scene-it', kind: 'babylon' },
  { slug: 'surf', path: '/play/surf', kind: 'babylon' },
  { slug: 'snowboard', path: '/play/snowboard', kind: 'babylon' },
  { slug: 'carnival', path: '/play/carnival?carnival=1', kind: 'babylon' },
  { slug: 'football', path: '/play/football', kind: 'babylon' },
  { slug: 'mixedcombat', path: '/play/mixedcombat', kind: 'babylon' },
  { slug: 'dance', path: '/play/dance', kind: 'babylon' },
  { slug: 'volleyball', path: '/play/volleyball', kind: 'babylon' },
  { slug: 'karate-vs', path: '/play/karate-vs', kind: 'babylon' },
  // /play/dunkduel is Prove It (IRL footage, no harness); DunkDuelMode runs only on /dev/mode — BASE must be a `next dev`
  { slug: 'dunkduel', path: '/dev/mode/dunkduel', kind: 'babylon' },
  { slug: 'sprint', path: '/play/sprint', kind: 'babylon' },
  { slug: 'showdown', path: '/play/showdown', kind: 'babylon' },
  { slug: 'duel', path: '/play/duel', kind: 'babylon' },
  { slug: 'aero-aces', path: '/play/aero-aces', kind: 'babylon' },
  { slug: 'velocity-kart', path: '/play/velocity-kart', kind: 'babylon' },
];
const pickModes = (process.env.MODES ?? 'tiebreak,training,dunk,try,skateboard,karate').split(',');
const WAKES = (process.env.WAKES ?? 'key,stick,tap').split(',') as ('key' | 'arrow' | 'stick' | 'tap' | 'hold')[];
const MODES = pickModes[0] === 'all' ? ALL : ALL.filter((m) => pickModes.includes(m.slug));

type Row = {
  slug: string; wake: string; ms: number | null; pass: boolean; sameCanvas: boolean | null;
  heroMoved: number | null; errors: string[]; note: string;
};
const rows: Row[] = [];

const browser = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--window-size=1280,860', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
// tsx keeps function names by wrapping inner functions in __name(); the page has no such helper — give it one.
await ctx.addInitScript('globalThis.__name = (f) => f;');
await ctx.addInitScript(() => {
  const pad = {
    id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)', index: 0, connected: true, mapping: 'standard',
    timestamp: Date.now(), axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
  };
  (window as any).__PAD = pad;
  (navigator as any).getGamepads = () => [pad, null, null, null];
});

// sign in once (the /play routes redirect to /login without a session)
{
  const p = await ctx.newPage();
  await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.waitForTimeout(800);
  if (/\/login/.test(p.url())) {
    await p.fill('input[type="email"]', EMAIL);
    await p.fill('input[type="password"]', PASS);
    await p.click('button[type="submit"]');
    const t0 = Date.now();
    while (Date.now() - t0 < 25000 && /\/login/.test(p.url())) await p.waitForTimeout(300);
  }
  console.log('LOGIN →', p.url());
  await p.close();
}

async function waitReady(p: Page, m: Spec): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < 90000) {
    const ok = await p.evaluate(([kind, card]) => {
      if (kind === '2d') return !!card && document.body.innerText.includes(card) && !!document.querySelector('canvas');
      return document.getElementById('fel-ready')?.dataset.state === 'loaded';
    }, [m.kind, m.card ?? ''] as const).catch(() => false);
    if (ok) return true;
    await p.waitForTimeout(250);
  }
  return false;
}

for (const m of MODES) {
  for (const wake of WAKES) {
    const p = await ctx.newPage();
    const errors: string[] = [];
    p.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));
    const row: Row = { slug: m.slug, wake, ms: null, pass: false, sameCanvas: null, heroMoved: null, errors, note: '' };
    try {
      const url = `${BASE}${m.path}${m.path.includes('?') ? '&' : '?'}agent=1`;
      await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
      if (!(await waitReady(p, m))) { row.note = 'never reached READY/card'; rows.push(row); await p.screenshot({ path: `${OUT}/${m.slug}-${wake}-noready.png` }); await p.close(); continue; }
      await p.waitForTimeout(900);   // settle: the card's own mount timers, the pad poller's first frames
      await p.screenshot({ path: `${OUT}/${m.slug}-${wake}-0-card.png` });

      // stamp + arm the in-page clock
      await p.evaluate(([kind, card, hook]) => {
        const w = window as any;
        const c = document.querySelector('canvas') as any;
        if (c) c.__probeId = 'ssu-' + Math.random().toString(36).slice(2);
        w.__ssuId = c?.__probeId ?? null;
        w.__ssu = { t0: 0, t1: 0 };
        const arm = () => { if (!w.__ssu.t0) w.__ssu.t0 = performance.now(); };
        window.addEventListener('keydown', arm, { capture: true, once: true });
        window.addEventListener('pointerdown', arm, { capture: true, once: true });
        w.__ssuHero0 = w.__NEXUS_AGENT__?.state?.().hero ?? null;
        const tick = () => {
          const s = w.__ssu;
          if (s.t0 && !s.t1) {
            let live = false;
            if (kind === '2d') {
              const cv = document.querySelector('canvas') as any;
              live = !document.body.innerText.includes(card) && !!cv?.[hook];
            } else live = document.getElementById('fel-ready')?.dataset.state === 'playing';
            if (live) s.t1 = performance.now();
          }
          if (!s.t1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }, [m.kind, m.card ?? '', m.hook ?? ''] as const);

      const box = await p.locator('canvas').first().boundingBox();
      if (wake === 'key') await p.keyboard.press('Space');
      else if (wake === 'hold') { await p.keyboard.down('Space'); await p.waitForTimeout(700); await p.screenshot({ path: `${OUT}/${m.slug}-${wake}-held.png` }); await p.keyboard.up('Space'); }
      else if (wake === 'arrow') { await p.keyboard.down('ArrowRight'); await p.waitForTimeout(120); await p.keyboard.up('ArrowRight'); }
      else if (wake === 'tap' && box) await p.mouse.click(box.x + box.width * 0.08, box.y + box.height * 0.9);
      else if (wake === 'stick') {
        await p.evaluate(() => { const w = window as any; w.__ssu.t0 = performance.now(); w.__PAD.axes[0] = 0; w.__PAD.axes[1] = -1; w.__PAD.timestamp = Date.now(); });
      }
      // hold the stick (if that was the wake) for 1.5 s so a live root has time to move
      await p.waitForTimeout(1500);
      const res = await p.evaluate(() => {
        const w = window as any;
        const c = document.querySelector('canvas') as any;
        const h1 = w.__NEXUS_AGENT__?.state?.().hero ?? null;
        const h0 = w.__ssuHero0;
        const moved = h0 && h1 ? Math.hypot(h1.x - h0.x, h1.z - h0.z) : null;
        w.__PAD.axes[1] = 0; w.__PAD.timestamp = Date.now();
        return { t0: w.__ssu.t0, t1: w.__ssu.t1, same: !!c && c.__probeId === w.__ssuId, moved, state: document.getElementById('fel-ready')?.dataset.state ?? null, text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 160) };
      });
      row.ms = res.t0 && res.t1 ? Math.round(res.t1 - res.t0) : null;
      row.pass = row.ms != null && row.ms <= LIMIT_MS;
      row.sameCanvas = res.same;
      row.heroMoved = res.moved == null ? null : Math.round(res.moved * 100) / 100;
      row.note = row.ms == null ? `not in play after 1.5 s (state=${res.state}) · ${res.text}` : `state=${res.state}`;
      await p.screenshot({ path: `${OUT}/${m.slug}-${wake}-1-after.png` });
    } catch (e: any) {
      row.note = `exception ${String(e?.message ?? e).slice(0, 160)}`;
    }
    rows.push(row);
    console.log(JSON.stringify(row));
    await p.close();
  }
}

fs.writeFileSync(`${OUT}/rows-${process.env.TAG ?? 'run'}.json`, JSON.stringify(rows, null, 2));
const fails = rows.filter((r) => !r.pass || r.sameCanvas === false || r.errors.length);
console.log(`\n${rows.length} rows · ${rows.length - fails.length} pass · ${fails.length} fail`);
for (const r of rows) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.slug.padEnd(13)} ${r.wake.padEnd(5)} ${String(r.ms ?? '—').padStart(5)} ms  same=${r.sameCanvas} moved=${r.heroMoved} ${r.errors.length ? 'ERR ' + r.errors[0] : ''} ${r.pass ? '' : r.note}`);
await browser.close();
