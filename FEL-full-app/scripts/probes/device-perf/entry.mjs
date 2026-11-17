// device-perf rig entry (2026-11-12): the REAL mode through runMode → ModeHarness, no React / Next, with the owner's perf readout.
// Bundled by scripts/probes/hoops-gap/build.mjs (ENTRY=../device-perf/entry.mjs). Query keys:
//   ?mode=onevone|threevthree|…   the registry key
//   ?owner=1                      stand in for the server's "yes" (the feel panel's gate): ?engine=webgpu is honoured only then
//   ?engine=webgpu|webgl          createEngine's trial ask
//   ?readout=1                    open the owner's overlay once the mode is mounted (the PERF tab's tap)
// Publishes window.__phase, __bus, __err, and __readout (the module: the probe samples numbers through it).
import { setAgentRunHooksAllowed } from '@/lib/agentRunHooks';
import { runMode, InputBus } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { readCourtLocation } from '@/lib/babylon/nexus/courtLocations';
import { setFeelUser } from '@/lib/feel-panel/feel';
import * as readout from '@/lib/babylon/core/perfReadout';
import { engineChoice } from '@/lib/babylon/core/createEngine';

const W = window;
W.__readout = readout;
W.__engineChoice = engineChoice;
setAgentRunHooksAllowed(true);
(async () => {
  const q = new URLSearchParams(window.location.search);
  const key = q.get('mode') ?? 'onevone';
  if (q.get('owner') === '1') setFeelUser(true);
  const canvas = document.getElementById('c');
  const bus = new InputBus();
  W.__bus = bus;
  const def = MODES[key];
  if (!def) { W.__err = 'no mode ' + key; return; }
  try {
    W.__stop = await runMode(def, {
      canvas, location: readCourtLocation(), input: bus,
      onPhase: (p, d) => { W.__phase = p; if (p === 'error') W.__err = String(d); },
      resultSink: async () => {},
    });
    if (q.get('readout') === '1') readout.openPerfReadout();
  } catch (e) { W.__err = String((e && e.message) || e); }
})();
