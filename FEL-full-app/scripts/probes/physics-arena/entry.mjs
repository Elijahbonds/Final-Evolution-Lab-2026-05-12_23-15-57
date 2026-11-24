// lane/physics-arena rig entry: the REAL mode through runMode -> ModeHarness, no React / Next (bundled by
// ../hoops-gap/build.mjs with ENTRY=../physics-arena/entry.mjs). Starts play as soon as it is ready, publishes the arena's probe seam
// (window.__ARENA__) and the bus (window.__bus); records the phase and the HUD. ?mode=physics_arena|onevone
import { setAgentRunHooksAllowed } from '@/lib/agentRunHooks';
import { runMode, InputBus } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { readCourtLocation } from '@/lib/babylon/nexus/courtLocations';
const W = window;
W.__hudNow = {};
setAgentRunHooksAllowed(true);
(async () => {
  const q = new URLSearchParams(window.location.search);
  const def = MODES[q.get('mode') ?? 'physics_arena'];
  if (!def) { W.__err = 'no mode'; return; }
  const bus = new InputBus();
  W.__bus = bus;
  try {
    W.__stop = await runMode(def, {
      canvas: document.getElementById('c'), location: readCourtLocation(), input: bus, guest: true,
      onPhase: (p, d) => {
        W.__phase = p; (W.__marks ||= []).push([p, performance.now()]);
        if (p === 'error') W.__err = String(d);
        if (p === 'ready') setTimeout(() => { bus.emit({ t: 'button', btn: 'START', pressed: true }); bus.emit({ t: 'button', btn: 'START', pressed: false }); }, 60);
      },
      onHud: (u) => { Object.assign(W.__hudNow, u); },
      resultSink: async () => {},
    });
  } catch (e) { W.__err = String((e && e.message) || e); }
})();
