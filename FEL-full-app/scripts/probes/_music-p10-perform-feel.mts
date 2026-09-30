// MUSIC-SUITE P10 (2026-09-29) — WHAT A PERFORM PRESS IS ANSWERED WITH, counted with every source start watched.
//
// The scorecard's Feel for the Academy is 5 × (share of presses answered by a sound or juice beat) + 5 × min(1, juice
// beats a minute / 8) (_scorecard.mts:137-141). Its DOM-room shim (_dom-room.mts) counts a sound only when it is started
// INSIDE the press's own dispatch, and it wraps AudioScheduledSourceNode.prototype.start alone — AudioBufferSourceNode
// has its OWN start() (the P10 mash probe found the same hole: its first run saw 14 sources in 60 s), so a sample
// started by a press would not have been seen. Before a Feel of 0 is reported as the room's, this checks it with the
// hole closed: every start() of AudioBufferSourceNode, OscillatorNode, ConstantSourceNode and the base class is wrapped,
// and a press's window is its keydown / pointerdown dispatch (the same rule the shim uses), plus — reported apart — any
// source started "now" (when ≤ currentTime + 5 ms) in the 150 ms after it, which a press could only have started (the
// groovebox schedules its steps ahead of the clock from its 25 ms timer). What a press is answered with on screen is
// counted too: the pad's verdict flash (data-qa perform-pad-flash) and the status line (data-qa perform-status), with
// their latency from the press.
// Route: /dev/music?stage=perform (the real StudioMode, no GameShell), a fresh device, the P6 probes' plain beat laid,
// ▶ PLAY, then 40 presses 600 ms apart: 20 lane keys (H J K L round the lanes) and 20 pointerdowns on the pads.
// Usage: /opt/homebrew/Cellar/node/26.8.2/bin/node node_modules/tsx/dist/cli.mjs scripts/probes/_music-p10-perform-feel.mts
import { BASE, assertDisk, launch, newPage, writeJson, DESKTOP, type Any } from './_p10-lib.mts';

const OUT = process.env.OUT ?? '/Users/elijahbonds/Claude/outbox/finish-release/musicsuite/p10/live';
const R: Any = { at: new Date().toISOString(), base: BASE, errors: [] as string[] };
const CAL = `try { localStorage.setItem('fel.audioOffsetMs', '0'); localStorage.setItem('fel.audioOffsetMeasuredAt', String(Date.now())); } catch (e) {}`;
const WATCH = `(() => {
  const W = window; W.__FEEL = { starts: [], inPress: null };
  for (const C of [AudioScheduledSourceNode, AudioBufferSourceNode, OscillatorNode, ConstantSourceNode]) {
    const P = C.prototype; if (!Object.prototype.hasOwnProperty.call(P, 'start') || Object.prototype.hasOwnProperty.call(P, '__p10feel')) continue; P.__p10feel = true;
    const o = P.start;
    P.start = function (when, ...rest) {
      try { const c = this.context; W.__FEEL.starts.push({ w: performance.now(), kind: this.constructor.name, when: when ?? 0, now: c.currentTime, inPress: W.__FEEL.inPress }); } catch (e) {}
      return o.call(this, when, ...rest);
    };
  }
  const open = (id) => { W.__FEEL.inPress = id; setTimeout(() => { if (W.__FEEL.inPress === id) W.__FEEL.inPress = null; }, 0); };
  W.__feelPress = { open };
})()`;

R.disk = assertDisk('perform-feel');
const b = await launch();
try {
  const ctx = await b.newContext(DESKTOP);
  for (const s of [CAL, WATCH]) await ctx.addInitScript({ content: s });
  const p = await newPage(ctx, R.errors, 'perform-feel');
  await p.goto(`${BASE}/dev/music?stage=perform&player=p10feel`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  const start = p.getByRole('button', { name: 'TAP TO START' }); await start.waitFor({ timeout: 300000 }); await start.click();
  await p.waitForFunction(() => !!document.querySelector('[data-qa="perform-play"]') && !!document.querySelector('[data-qa="cell"]'), undefined, { timeout: 60000 });
  for (const [row, steps] of [['kick', [0, 4, 8, 12]], ['snare', [4, 12]], ['hat', [0, 2, 4, 6, 8, 10, 12, 14]]] as [string, number[]][]) {
    for (const s of steps) { const c = p.locator(`[data-qa="cell"][data-row="${row}"][data-step="${s}"]`); if (await c.count() && (await c.getAttribute('data-on')) !== '1') await c.click(); }
  }
  await p.locator('[data-qa="perform-play"]').click();
  await p.waitForFunction(() => { const e = (window as Any).__FEL_STUDIO__?.engine(); return !!e && e.running; }, undefined, { timeout: 20000 });
  await p.waitForTimeout(2500);
  R.presses = await p.evaluate(async () => {
    const W = window as Any; const out: Any[] = [];
    const flashes = () => Array.from(document.querySelectorAll('[data-qa="perform-pad-flash"]')).map((x) => x.textContent ?? '');
    const status = () => document.querySelector('[data-qa="perform-status"]')?.textContent ?? '';
    const K = ['h', 'j', 'k', 'l'];
    for (let i = 0; i < 40; i++) {
      const lane = i % 4; const id = `p${i}`;
      const f0 = flashes(); const s0 = status(); const n0 = W.__FEEL.starts.length; const t = performance.now();
      if (i < 20) {
        W.__feelPress.open(id);
        window.dispatchEvent(new KeyboardEvent('keydown', { key: K[lane], bubbles: true }));
        setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { key: K[lane], bubbles: true })), 60);
      } else {
        const pad = document.querySelector(`[data-qa="perform-pad"][data-lane="${lane}"]`) as HTMLElement | null;
        W.__feelPress.open(id);
        pad?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse', isPrimary: true }));
        setTimeout(() => pad?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse', isPrimary: true })), 60);
      }
      let flashAt: number | null = null, statusAt: number | null = null;
      const end = t + 600;
      while (performance.now() < end) {
        if (flashAt === null && flashes().some((x, k) => x !== f0[k] && x !== '')) flashAt = performance.now() - t;
        if (statusAt === null && status() !== s0) statusAt = performance.now() - t;
        await new Promise((r) => setTimeout(r, 4));
      }
      const S = W.__FEEL.starts.slice(n0);
      out.push({ i, via: i < 20 ? 'key' : 'pointer', lane,
        soundsInDispatch: S.filter((s: Any) => s.inPress === id).length,
        soundsStartedNowIn150ms: S.filter((s: Any) => s.w - t <= 150 && s.when <= s.now + 0.005).length,
        songStartsIn600ms: S.length,
        flashMs: flashAt === null ? null : Math.round(flashAt), statusMs: statusAt === null ? null : Math.round(statusAt),
        flash: flashes()[lane] || null });
    }
    return out;
  });
  const P = R.presses as Any[];
  const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
  R.summary = {
    presses: P.length,
    pressesWithASoundInTheirDispatch: P.filter((x) => x.soundsInDispatch > 0).length,
    pressesWithASoundStartedNowWithin150ms: P.filter((x) => x.soundsStartedNowIn150ms > 0).length,
    pressesAnsweredByTheirPadFlash: P.filter((x) => x.flashMs !== null).length, flashMsMedian: med(P.filter((x) => x.flashMs !== null).map((x) => x.flashMs)),
    pressesAnsweredByTheStatusLine: P.filter((x) => x.statusMs !== null).length, statusMsMedian: med(P.filter((x) => x.statusMs !== null).map((x) => x.statusMs)),
    songSourceStartsPerPressWindow: med(P.map((x) => x.songStartsIn600ms)),
    flashesSeen: [...new Set(P.map((x) => x.flash).filter(Boolean))].slice(0, 12),
  };
  R.status = await p.evaluate(() => document.querySelector('[data-qa="perform-status"]')?.textContent ?? '');
  await p.screenshot({ path: `${OUT}/perform-feel.png` });
  R.frame = `${OUT}/perform-feel.png`;
  await ctx.close();
} catch (e) { R.fatal = String((e as Error)?.stack ?? e).slice(0, 1500); }
finally { await b.close(); }
writeJson(`${OUT}/perform-feel.json`, R);
console.log(JSON.stringify({ summary: R.summary, fatal: R.fatal, errors: R.errors.slice(0, 3) }));
process.exit(0);
