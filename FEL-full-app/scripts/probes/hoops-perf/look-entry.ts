// hoops-perf: the kit-glitch rig's browser half (its real spawn: CharacterLibrary.spawn, applyKit, the body mask, applyIdentity with
// a Creator doc — shape morphs on the body AND every garment, code-built clothes, kit packs) plus a same-frame merge diff.
import '../kit-glitch/rig-entry';

type KGApi = { run(src: string): unknown; pose(clip: string, frac: number): Promise<string | null>; unfreeze(): void; clipNames(): string[] };
const KG = (): KGApi => (window as unknown as { __KG: KGApi }).__KG;

/** Animate (the loop is the rig's), wait for every body to merge, then draw the SAME frame merged and with its parts. */
async function mergeDiff(): Promise<Record<string, unknown>> {
  const scene = KG().run('return scene') as { getEngine(): any; render(a?: boolean, b?: boolean): void; __felBodyMerge?: any; meshes: any[] };
  const bm = scene.__felBodyMerge;
  if (!bm) return { error: 'no __felBodyMerge' };
  // the clip plays; give the body its settle frames and its shaders
  for (let i = 0; i < 240 && bm.stats().swapped < bm.stats().groups || i < 60; i++) await new Promise((r) => requestAnimationFrame(r));
  const engine = scene.getEngine();
  // hold a pose (the rig's own: the clip paused mid-run, a few frames drawn, then its loop stops) — a merge holds through it
  const names = KG().clipNames();
  const clip = ['run_forward', 'run', 'jog', 'idle_stand'].map((c) => names.find((n) => n === c) ?? names.find((n) => n.includes(c))).find(Boolean) ?? names[0];
  const posed = await KG().pose(clip, 0.37);
  await new Promise((r) => setTimeout(r, 100));
  const w = engine.getRenderWidth(), h = engine.getRenderHeight();
  const grab = async (): Promise<Uint8Array> => { engine._deltaTime = 0; scene.render(true, true); const px = await engine.readPixels(0, 0, w, h, true, true); return new Uint8Array(px.buffer.slice(px.byteOffset, px.byteOffset + w * h * 4)); };
  const diff = (a: Uint8Array, b: Uint8Array) => { let n = 0, max = 0; for (let i = 0; i < a.length; i += 4) { const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])); if (d > 0) { n++; if (d > max) max = d; } } return { px: n, maxStep: max }; };
  const statsA = bm.stats(); const detail = bm.detail();
  const morphs = scene.meshes.filter((m) => m.name.startsWith('__felBody_') && m.layerMask !== 0).map((m) => ({ name: m.name, subs: m.subMeshes.length, morph: m.morphTargetManager ? m.morphTargetManager.numTargets : 0, infl: m.morphTargetManager ? [...Array(m.morphTargetManager.numTargets)].map((_, i) => +m.morphTargetManager.getTarget(i).influence.toFixed(3)) : [] }));
  const A = await grab(); const A2 = await grab();
  bm.setMode('off');
  const B = await grab(); const B2 = await grab();
  let victim: any = null; for (const m of scene.meshes) if (m.skeleton && m.isEnabled() && m.isVisible && m.layerMask !== 0 && !m.name.startsWith('__felBody_') && (!victim || m.getTotalVertices() > victim.getTotalVertices())) victim = m;
  let C = B; if (victim) { victim.isVisible = false; C = await grab(); victim.isVisible = true; }
  bm.setMode('auto'); KG().unfreeze();
  const delta = (a: Uint8Array, b: Uint8Array) => { const o = new Uint8Array(a.length); let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1; for (let i = 0, p = 0; i < a.length; i += 4, p++) { const d = a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]; if (d) { o[i] = 255; const x = p % w, y = h - 1 - Math.floor(p / w); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } else { o[i] = a[i] >> 2; o[i + 1] = a[i + 1] >> 2; o[i + 2] = a[i + 2] >> 2; } o[i + 3] = 255; } return { o, box: x1 < 0 ? null : [x0, y0, x1, y1] }; };
  const dl = delta(A, B);
  const shot = (px: Uint8Array) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d')!; const img = g.createImageData(w, h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const s = ((h - 1 - y) * w + x) * 4, d = (y * w + x) * 4; img.data[d] = px[s]; img.data[d + 1] = px[s + 1]; img.data[d + 2] = px[s + 2]; img.data[d + 3] = 255; } g.putImageData(img, 0, 0); return c.toDataURL('image/jpeg', 0.85); };
  return { w, h, clip: posed, statsA, detail, merged: morphs, noiseMerged: diff(A, A2), noiseParts: diff(B, B2), mergeVsParts: diff(A, B), control: diff(B, C), victim: victim?.name, shotMerged: shot(A), shotParts: shot(B), shotDelta: shot(dl.o), deltaBox: dl.box };
}
(window as unknown as { __BM: unknown }).__BM = { mergeDiff };
