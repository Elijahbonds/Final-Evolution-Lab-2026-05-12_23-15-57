// dunk-flagship rig (rebuilt 2026-11-10): the real ModeHarness, no React/Next, esbuild bundle. Mirrors app/dev/mode/[key]/loader.tsx's
// text ("DEV · <mode> · <phase>" and the HUD as JSON) so the probes read the same page.
import { setAgentRunHooksAllowed } from '@/lib/agentRunHooks';
import { runMode, InputBus } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { readCourtLocation } from '@/lib/babylon/nexus/courtLocations';
import { setFeelUser, setFeelSession, setFeelOverride } from '@/lib/feel-panel/feel';
import { OVER_RING } from '@/lib/babylon/core/DunkOverRing';

declare global { interface Window { __bus?: InputBus; __phase?: string; __err?: string; __stop?: () => void; __hudObj?: Record<string, unknown> } }

(async () => {
  const q = new URLSearchParams(window.location.search);
  const key = q.get('mode') ?? 'dunk';
  if (q.get('agent') === '1') setAgentRunHooksAllowed(true);
  const feelQ = q.get('feel');
  if (feelQ) { setFeelUser(true); setFeelSession(null); for (const kv of feelQ.split(',')) { const [id, v] = kv.split(':'); console.info('[RIG-FEEL]', id, setFeelOverride(id, Number(v))); } }
  // P11 tuning (the rig only): ?ovr=jamLiftM:0.2,clearM:0.03 writes the over-the-ring finish's numbers before the mode boots
  const ovrQ = q.get('ovr');
  if (ovrQ) for (const kv of ovrQ.split(',')) { const [k, v] = kv.split(':'); if (k in OVER_RING && Number.isFinite(Number(v))) { (OVER_RING as Record<string, number>)[k] = Number(v); console.info('[RIG-FEEL] ovr', k, v); } }
  const def = MODES[key];
  const canvas = document.getElementById('c') as HTMLCanvasElement;
  const label = document.getElementById('l')!, pre = document.getElementById('h')!;
  const bus = new InputBus(); window.__bus = bus;
  const hud: Record<string, unknown> = {}; window.__hudObj = hud;
  let dirty = false;
  const setPhase = (p: string) => { window.__phase = p; label.textContent = `DEV · ${key} · ${p}${window.__err ? ' · ' + window.__err : ''}`; };
  setPhase('loading');
  setInterval(() => { if (dirty) { dirty = false; pre.textContent = JSON.stringify(hud, null, 1); } }, 30);
  if (!def) { window.__err = 'no mode ' + key; setPhase('error'); return; }
  try {
    window.__stop = await runMode(def, {
      canvas, location: readCourtLocation(), input: bus, continuous: q.get('continuous') === '1',
      onPhase: (p: string, d: unknown) => { if (p === 'error') window.__err = String(d); setPhase(p); },
      onHud: (h: Record<string, unknown>) => { Object.assign(hud, h); dirty = true; },
      resultSink: async (r: unknown) => console.log('[dev] result', JSON.stringify(r).slice(0, 400)),
    } as never);
  } catch (e) { window.__err = String((e as Error)?.message ?? e); setPhase('error'); }
})();
