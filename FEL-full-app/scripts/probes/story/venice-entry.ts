// STORY rig, the Venice side (lane/story, 2026-11-21): the REAL Venice hub (MODES.venice_hub through runMode → ModeHarness), no React /
// Next, with the walk-up card drawn as a plain box from the same store the page reads (lib/adventure/venice/hubUi) — the story gate's
// card says what app/play/venice/stage.tsx says ("Play the story"). ./story-rig.mts walks the hub's probe seam (window.__VENICE__) to
// the story gate, and loads it with ?spot=story.gate to see where the story's way back lands.
import { setAgentRunHooksAllowed } from '@/lib/agentRunHooks';
import { runMode, InputBus } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { hubUi } from '@/lib/adventure/venice/hubUi';
import { STORY_SPOT_ID, storyEntryHref } from '@/lib/adventure/venice/storyDoor';

const W = window as unknown as Record<string, unknown>;
setAgentRunHooksAllowed(true);
const canvas = document.getElementById('c') as HTMLCanvasElement;
const card = document.getElementById('card') as HTMLDivElement;
hubUi.subscribe(() => {
  const s = hubUi.getSnapshot().spot;
  W.__spot = s?.id ?? null;
  card.style.display = s ? 'block' : 'none';
  if (s?.id === STORY_SPOT_ID) card.innerHTML = `<b>${s.label.replace('[PLACEHOLDER] ', '')}</b><a class="btn" data-testid="venice-story" href="${storyEntryHref()}">Play the story</a>`;
  else if (s) card.innerHTML = `<b>${s.label.replace('[PLACEHOLDER] ', '')}</b>`;
});
const bus = new InputBus();
void runMode(MODES.venice_hub, {
  canvas, input: bus, guest: true,
  onPhase: (p, d) => { W.__phase = p; if (p === 'error') W.__err = String(d); if (p === 'ready') setTimeout(() => bus.emit({ t: 'button', btn: 'START', pressed: true }), 50); },
  onHud: () => {},
  resultSink: async () => {},
}).catch((e) => { W.__err = String(e?.message ?? e); });
