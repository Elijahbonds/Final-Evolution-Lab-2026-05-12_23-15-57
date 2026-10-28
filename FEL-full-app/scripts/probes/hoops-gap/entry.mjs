// hoops-audit rig entry (lane/hoops-audit, 2026-10-27): the REAL 1v1 / 3v3 through runMode -> ModeHarness, no React / Next.
// Bundled by ./build.mjs with esbuild. A DEV bundle (NODE_ENV=development) publishes the hoops dev seams
// (scene.metadata.onevone / .threevthree) that ./page.js reads; a PROD bundle is what ./perf.mjs times.
// Records, for the in-page recorder: every phase change and every HUD update (banner, score, meter) on the game clock.
//   ?mode=onevone|threevthree  ?tier=rookie|pro|elite (core/Difficulty readTier)
import { setAgentRunHooksAllowed } from '@/lib/agentRunHooks';
import { runMode, InputBus } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { readCourtLocation } from '@/lib/babylon/nexus/courtLocations';
import { setFeelUser, setFeelSession, setFeelOverride } from '@/lib/feel-panel/feel';

const W = window;
W.__hud = []; W.__hudNow = {};
setAgentRunHooksAllowed(true);
(async () => {
  const q = new URLSearchParams(window.location.search);
  const key = q.get('mode') ?? 'onevone';
  // hoops-p01: ?feel=<json {knob id: value}> plays the run on those feel-panel values (what the owner's panel does on a playtest run)
  if (q.get('feel')) { try { const o = JSON.parse(q.get('feel')); setFeelUser(true); setFeelSession(null); for (const [k, v] of Object.entries(o)) setFeelOverride(k, Number(v)); W.__feel = o; } catch (e) { W.__err = 'bad feel ' + String(e); return; } }
  const canvas = document.getElementById('c');
  const bus = new InputBus();
  W.__bus = bus;
  const def = MODES[key];
  if (!def) { W.__err = 'no mode ' + key; return; }
  try {
    W.__stop = await runMode(def, {
      canvas, location: readCourtLocation(), input: bus,
      onPhase: (p, d) => { W.__phase = p; if (p === 'error') W.__err = String(d); },
      onHud: (u) => {
        try {
          Object.assign(W.__hudNow, u);
          const keep = {}; let any = false;
          for (const k of ['banner', 'score', 'foeScore', 'myScore', 'theirScore', 'shotType', 'playerState', 'time', 'shotClock']) if (k in u) { keep[k] = u[k]; any = true; }
          if (any && W.__hud.length < 20000) W.__hud.push({ t: performance.now(), f: W.__frameNo || 0, ...keep });
        } catch (e) { /* the recorder never breaks the game */ }
      },
      resultSink: async () => {},
    });
  } catch (e) { W.__err = String((e && e.message) || e); }
})();
