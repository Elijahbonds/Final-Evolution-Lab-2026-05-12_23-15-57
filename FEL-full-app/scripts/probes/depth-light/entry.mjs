// DEPTH-LIGHT (lane L, 2026-11-25): the exploration rig's entry — the REAL mode through runMode -> ModeHarness, no React / Next,
// bundled by ../hoops-gap/build.mjs (ENTRY=../depth-light/entry.mjs). For trying a light or shadow setting quickly; the
// before/after pictures that decide a phase come from the production build (./hold.sh, ../depth-audit/depth-walk.mts).
//   ?mode=<registry key>  ?location=canopy|blossom  ?feel=<json {knob: value}>  ?tier=mobile|desktop|high  ?perf=off
// It presses START at READY, and publishes window.__phase / __err / __bus and window.__BJS (Vector3, Matrix: ./look.mts projects the foot points).
import { setAgentRunHooksAllowed } from '@/lib/agentRunHooks';
import { runMode, InputBus } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { readCourtLocation } from '@/lib/babylon/nexus/courtLocations';
import { setFeelUser, setFeelSession, setFeelOverride } from '@/lib/feel-panel/feel';
import { Matrix, Vector3 } from '@babylonjs/core';

const W = window;
W.__BJS = { Matrix, Vector3 };   // ./look.mts projects the foot points with these
setAgentRunHooksAllowed(true);
(async () => {
  const q = new URLSearchParams(window.location.search);
  const key = q.get('mode') ?? 'onevone';
  if (q.get('feel')) { try { const o = JSON.parse(q.get('feel')); setFeelUser(true); setFeelSession(null); for (const [k, v] of Object.entries(o)) setFeelOverride(k, Number(v)); W.__feel = o; } catch (e) { W.__err = 'bad feel ' + String(e); return; } }
  const canvas = document.getElementById('c');
  const bus = new InputBus();
  W.__bus = bus;
  const def = MODES[key];
  if (!def) { W.__err = 'no mode ' + key; return; }
  const pressStart = () => {
    if (W.__phase !== 'ready' || q.get('hold') === '1') return;
    bus.emit({ t: 'button', btn: 'START', pressed: true });
    bus.emit({ t: 'button', btn: 'START', pressed: false });
    setTimeout(pressStart, 600);
  };
  try {
    W.__stop = await runMode(def, {
      canvas, location: readCourtLocation(), input: bus,
      onPhase: (p, d) => { W.__phase = p; if (p === 'error') W.__err = String(d); if (p === 'ready') setTimeout(pressStart, 400); },
      onHud: () => {},
      resultSink: async () => {},
    });
  } catch (e) { W.__err = String((e && e.message) || e); }
})();
