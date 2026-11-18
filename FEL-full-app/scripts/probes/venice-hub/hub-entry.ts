// VENICE V1 phone rig bundle (lane/venice-v1, 2026-11-17): the REAL hub (MODES.venice_hub through runMode → ModeHarness), no
// React / Next, so ./hub-rig.mts can time it and count what it draws. The walk-up card is drawn here as a plain box from the
// same store the page reads (lib/adventure/venice/hubUi) — the probe's stand-in for app/play/venice/stage.tsx's card.
//   ?spot=<court> (arrive beside a court)  ?feel=<json> (feel-panel values, e.g. {"perf.veniceSharedCourt":0})
import { setAgentRunHooksAllowed } from '@/lib/agentRunHooks';
import { runMode, InputBus } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { hubUi } from '@/lib/adventure/venice/hubUi';
import { launchChoices } from '@/lib/adventure/venice/hubReturn';
import { setFeelOverride, setFeelSession, setFeelUser } from '@/lib/feel-panel/feel';
import { MODE_INFO } from '@/lib/game-data';

const W = window as unknown as Record<string, unknown>;
setAgentRunHooksAllowed(true);
const q = new URLSearchParams(window.location.search);
if (q.get('feel')) { setFeelUser(true); setFeelSession(null); for (const [k, v] of Object.entries(JSON.parse(q.get('feel')!))) setFeelOverride(k, Number(v)); }
const canvas = document.getElementById('c') as HTMLCanvasElement;
const card = document.getElementById('card') as HTMLDivElement;
const renderWalkup = () => {
  const s = hubUi.getSnapshot().spot;
  W.__spot = s?.id ?? null;
  W.__choices = s ? launchChoices(s, MODE_INFO).map((choice) => choice.mode) : [];
  card.style.display = s ? 'block' : 'none';
  card.replaceChildren();
  if (!s) return;
  const title = document.createElement('b');
  title.textContent = s.label.replace('[PLACEHOLDER] ', '');
  card.append(title);
  for (const choice of launchChoices(s, MODE_INFO)) {
    const btn = document.createElement('div');
    btn.className = 'btn';
    btn.textContent = `\u25b6 Play ${choice.label}`;
    btn.setAttribute('data-mode', choice.mode);
    card.append(btn);
  }
};
hubUi.subscribe(renderWalkup);
renderWalkup();
const bus = new InputBus();
W.__bus = bus;
// ?mode=onevone: the same rig on a shipped mode, as the load-time yardstick
void runMode(MODES[q.get('mode') ?? 'venice_hub'], {
  canvas, input: bus, guest: true,
  onPhase: (p, d) => {
    W.__phase = p;
    if (p === 'error') W.__err = String(d);
    if (p === 'ready') { W.__readyAt = performance.now(); setTimeout(() => bus.emit({ t: 'button', btn: 'START', pressed: true }), 50); }
    if (p === 'playing' && !W.__ttfp) requestAnimationFrame(() => { W.__ttfp = performance.now(); });
  },
  onHud: () => {},
  resultSink: async () => {},
}).catch((e) => { W.__err = String(e?.message ?? e); });
