// COAST & ISLANDS phone rig bundle (lane/coast-islands, 2026-11-18): the REAL zone (MODES.coast_zone through runMode → ModeHarness),
// no React / Next, so ./zone-rig.mts can time it, walk it and count what it draws. The boat's card is drawn as a plain box from the
// same store the page reads (lib/adventure/coast/zoneUi).
// Phase D: the sports spots' and the townsfolk's cards too.
//   ?mode=venice_hub (the same rig on the Venice hub: the same-session control)   ?feel=<json> (feel-panel values, e.g. {"coast.streamOn":0})
import { setAgentRunHooksAllowed } from '@/lib/agentRunHooks';
import { EngineInstrumentation, SceneInstrumentation, type Scene } from '@babylonjs/core';
import { runMode, InputBus } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { zoneUi } from '@/lib/adventure/coast/zoneUi';
import { coastProbe, coastProbeDrive } from '@/lib/babylon/modes/CoastZoneMode';
import { setFeelOverride, setFeelSession, setFeelUser } from '@/lib/feel-panel/feel';

const W = window as unknown as Record<string, unknown>;
setAgentRunHooksAllowed(true);
const q = new URLSearchParams(window.location.search);
if (q.get('feel')) { setFeelUser(true); setFeelSession(null); for (const [k, v] of Object.entries(JSON.parse(q.get('feel')!))) setFeelOverride(k, Number(v)); }
const canvas = document.getElementById('c') as HTMLCanvasElement;
const card = document.getElementById('card') as HTMLDivElement;
// the page's boat card and its "new in your log" note, drawn as plain boxes from the same store (app/play/coast/stage.tsx's stand-in)
zoneUi.subscribe(() => {
  const { spot: s, sighting, log } = zoneUi.getSnapshot();
  W.__spot = s?.id ?? null;
  if (s) { const seen = new Set(String(W.__spotsSeen ?? '').split(',').filter(Boolean)); seen.add(s.id); W.__spotsSeen = [...seen].join(','); }
  W.__log = log.map((e) => `${e.id}:${e.level}`).join(',');
  const fresh = sighting && performance.now() - (W.__noteAt as number ?? 0) < 4000;
  if (sighting && W.__lastNote !== `${sighting.id}:${sighting.level}`) { W.__lastNote = `${sighting.id}:${sighting.level}`; W.__noteAt = performance.now(); }
  card.style.display = s || sighting ? 'block' : 'none';
  const bare = (t: string) => t.replace('[PLACEHOLDER] ', '');
  const x = s as unknown as { kind: string; label: string; game?: string; hello?: string; questId?: string | null } | null;
  // phase D: a sports spot's card (Play <game>) and a townsperson's (their line, Take the quest), as stage.tsx draws them
  if (x?.kind === 'sport') card.innerHTML = `<b>${bare(x.label)}</b><div style="font-weight:400;margin-top:4px">Play ${x.game} here, then come back to this spot.</div><div class="btn">Play ${x.game}</div>`;
  else if (x?.kind === 'person') card.innerHTML = `<b>${bare(x.label)}</b><div style="font-weight:400;margin-top:4px">${x.hello}</div>${x.questId ? '<div class="btn">Take the quest</div>' : ''}`;
  else if (s) card.innerHTML = `<b>${bare(s.label)}</b><div class="btn">Back to Venice</div>`;
  else if (sighting || fresh) card.innerHTML = `<div style="text-align:center">${sighting!.level === 2 ? 'You met' : 'New in your log:'} <b>${sighting!.name.replace('[PLACEHOLDER] ', '')}</b></div>`;
});
W.__coast = coastProbe;
W.__drive = coastProbeDrive;
const bus = new InputBus();
W.__bus = bus;
void runMode(MODES[q.get('mode') ?? 'coast_zone'], {
  canvas, input: bus, guest: true,
  onPhase: (p, d) => {
    W.__phase = p;
    if (p === 'error') W.__err = String(d);
    if (p === 'ready') { W.__readyAt = performance.now(); setTimeout(() => bus.emit({ t: 'button', btn: 'START', pressed: true }), 50); }
    if (p === 'playing' && !W.__ttfp) requestAnimationFrame(() => { W.__ttfp = performance.now(); watchFrames(); });
  },
  onHud: () => {},
  resultSink: async () => {},
}).catch((e) => { W.__err = String(e?.message ?? e); });

/** Phase F-lite: where a long frame's time goes — Babylon's own counters per frame (render, active-mesh evaluation, render targets
 *  such as the shadow map, shader compiles, texture count), and the gap since the last frame (time outside the render loop: async
 *  work such as a body's setup). Frames over 200 ms are kept (window.__longs). */
function watchFrames(): void {
  const dev = (window as unknown as { __FEL_DEV__?: { scene: Scene } }).__FEL_DEV__;
  if (!dev) return;
  const scene = dev.scene, engine = scene.getEngine();
  const si = new SceneInstrumentation(scene);
  si.captureFrameTime = true; si.captureRenderTime = true; si.captureActiveMeshesEvaluationTime = true; si.captureRenderTargetsRenderTime = true; si.captureInterFrameTime = true;
  const ei = new EngineInstrumentation(engine);
  ei.captureShaderCompilationTime = true;
  const longs: unknown[] = [];
  W.__longs = longs;
  let lastCompile = 0, lastCount = 0, lastTex = scene.textures.length, lastMeshes = scene.meshes.length;
  scene.onAfterRenderObservable.add(() => {
    const c = ei.shaderCompilationTimeCounter, compile = c.total - lastCompile, compiles = c.count - lastCount;
    lastCompile = c.total; lastCount = c.count;
    const frame = si.frameTimeCounter.current, inter = si.interFrameTimeCounter.current;
    const tex = scene.textures.length - lastTex, meshes = scene.meshes.length - lastMeshes;
    lastTex = scene.textures.length; lastMeshes = scene.meshes.length;
    if ((frame > 200 || inter > 200) && longs.length < 60) {
      longs.push({ at: Math.round(performance.now()), frame: Math.round(frame), render: Math.round(si.renderTimeCounter.current), eval: Math.round(si.activeMeshesEvaluationTimeCounter.current), targets: Math.round(si.renderTargetsRenderTimeCounter.current), inter: Math.round(inter), compileMs: Math.round(compile), compiles, newTextures: tex, newMeshes: meshes });
    }
  });
}
