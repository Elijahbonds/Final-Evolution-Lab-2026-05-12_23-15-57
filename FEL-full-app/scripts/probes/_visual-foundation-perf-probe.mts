// _visual-foundation-perf-probe — what the shared look COSTS on the phone tier (visual-foundation phase 2, 2026-10-06).
//
// For each mode and each variant (a query string), mounts /dev/mode/<key> in a phone-shaped page (portrait, DPR 2,
// touch + coarse pointer → the mobile tier on its own), presses START, lets play settle, then measures over a window:
//   shadow   draws per shadow-map render (the engine's own draw counter, read around the map's bind/unbind), and the
//            ShadowCache's state (statics baked / casters drawn per frame / bakes)
//   post     every post-process on the camera: its target size, so the fill of the post chain is a pixel count, not a
//            guess (SwiftShader cannot time a GPU; pixels and taps are what a phone's GPU pays for)
//   frame    total draws per frame (SceneInstrumentation) and the mean rendered-frame interval
// and saves one frame. Variants share one build, so `?shadowcache=0` / `?mobilepost=0` A/B the change and nothing else.
//   PORT=3200 OUT=/tmp/vf MODES=dunk,velocitykart,karate VARIANTS='shadowcache=0&mobilepost=0,' SWIFT=1 \
//     npx tsx scripts/probes/_visual-foundation-perf-probe.mts
// A variant of '' is the current look. VIEW=1920x1080 measures a big screen instead (no touch).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const PORT = process.env.PORT ?? '3200', OUT = process.env.OUT ?? '/tmp/visual-foundation-perf';
const MODES = (process.env.MODES ?? 'dunk,velocitykart,karate').split(',');
const VARIANTS = (process.env.VARIANTS ?? 'shadowcache=0&mobilepost=0,').split(',');
const SETTLE_MS = Number(process.env.SETTLE_MS ?? 12000);
const WINDOW_MS = Number(process.env.WINDOW_MS ?? 6000);
const [VW, VH] = (process.env.VIEW ?? '390x844').split('x').map(Number);
const PHONE = VW < 900;
const SAMPLE = process.env.SAMPLE ?? '';   // a mesh-name regex: print those meshes' world positions over a few frames
const DPR = Number(process.env.DPR ?? (PHONE ? 2 : 1));   // DPR=1 for draw counts only: SwiftShader at 1.3 Mpx is slow
fs.mkdirSync(OUT, { recursive: true });
const GL = process.env.SWIFT ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] : ['--use-gl=angle', '--ignore-gpu-blocklist'];
const b = await chromium.launch({ executablePath: chromiumExe(), args: GL });
const rows: string[] = [];
const t0 = Date.now();
const step = (s: string) => console.log(`  [${((Date.now() - t0) / 1000).toFixed(0)}s] ${s}`);
const within = <T,>(ms: number, p: Promise<T>, fallback: T): Promise<T> => Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);

async function measure(key: string, variant: string): Promise<void> {
  const ctx = await b.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: DPR, isMobile: PHONE, hasTouch: PHONE });
  const p = await ctx.newPage();
  const log: string[] = [];
  p.on('console', (m) => { const t = m.text(); if (/\[FEL-(TIER|SHADOW|POST|CANVAS)\]|GL_INVALID|WebGL: |shader/i.test(t)) log.push(t.slice(0, 220)); });
  p.on('pageerror', (e) => log.push('PAGEERROR ' + e.message.slice(0, 200)));
  const q = variant ? `?${variant}` : '';
  const url = `http://localhost:${PORT}/dev/mode/${key}${q}`;
  step(`${key} [${variant || 'current'}]: goto`);
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 300000 });
  const readPhase = () => within(20000, p.evaluate(() => (document.body.innerText.match(/· (loading|ready|countdown|playing|paused|ended|error)/) || [])[1] || ''), '?');
  let phase = '';
  for (let i = 0; i < 150; i++) {
    phase = await readPhase();
    if (phase === 'ready' || phase === 'playing' || phase === 'error') break;
    await p.waitForTimeout(2000);
  }
  if (phase === 'ready') await within(30000, p.locator('text=/^START$/').first().click({ timeout: 25000 }).catch(() => {}), undefined);
  await p.waitForTimeout(SETTLE_MS);
  step(`${key} [${variant || 'current'}]: measuring (${phase})`);
  const m = await within(WINDOW_MS + 90000, p.evaluate(async ([windowMs, sampleRe]) => {
    type AnyObj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    const dev = (window as unknown as { __FEL_DEV__?: AnyObj }).__FEL_DEV__;
    if (!dev) return null;
    const scene = dev.scene as AnyObj;
    const eng = scene.getEngine();
    const sun = scene.getLightByName('fel_sun');
    const gen = sun?.getShadowGenerator?.();
    const map = gen?.getShadowMap?.();
    let shadowDraws = 0, shadowRenders = 0, d0 = 0;
    const o1 = map?.onBeforeBindObservable.add(() => { d0 = eng._drawCalls.current; });
    const o2 = map?.onAfterUnbindObservable.add(() => { shadowDraws += eng._drawCalls.current - d0; shadowRenders++; });
    const inst = dev.instrument();
    let frames = 0; const tStart = performance.now();
    const o3 = scene.onAfterRenderObservable.add(() => { frames++; });
    await new Promise((r) => setTimeout(r, windowMs));
    const dt = performance.now() - tStart;
    const draws = { current: inst.drawCallsCounter.current, avg: Math.round(inst.drawCallsCounter.lastSecAverage) };
    inst.dispose();
    map?.onBeforeBindObservable.remove(o1); map?.onAfterUnbindObservable.remove(o2); scene.onAfterRenderObservable.remove(o3);
    let samples: string[] = [];
    if (sampleRe) {
      const re = new RegExp(sampleRe);
      const ms = (scene.meshes as AnyObj[]).filter((x) => re.test(x.name)).slice(0, 6);
      // (no named closures in here: tsx's keepNames wraps them in a __name() the page does not have)
      for (let i = 0; i < 4; i++) {
        if (i) await new Promise((r) => scene.onAfterRenderObservable.addOnce(r));
        samples.push(ms.map((x) => { const t = x.getWorldMatrix().m; return `${x.name}@${t[12].toFixed(3)},${t[13].toFixed(3)},${t[14].toFixed(3)} f${x.getWorldMatrix().updateFlag} p=${x.parent?.name ?? '-'}`; }).join(' ; '));
      }
    }
    const cam = scene.activeCamera;
    const pps = ((cam?._postProcesses ?? []) as AnyObj[]).filter(Boolean).map((pp) => ({ name: pp.name as string, w: pp.width as number, h: pp.height as number }));
    const cache = scene.metadata?.felShadowCache?.stats?.() ?? null;
    const movingByName = scene.metadata?.felShadowCache?.movingByName?.() ?? null;
    const casters = map?.renderList?.length ?? 0;
    return {
      shadowPerRender: shadowRenders ? +(shadowDraws / shadowRenders).toFixed(1) : null, shadowRenders, casters,
      frames, frameMs: frames ? +(dt / frames).toFixed(1) : null, draws, pps, cache, movingByName, samples,
      backing: `${eng.getRenderWidth()}x${eng.getRenderHeight()}`, mapSize: map?.getRenderSize?.() ?? null,
    };
  }, [WINDOW_MS, SAMPLE] as const), null);
  const file = `${OUT}/${key}-${(variant || 'current').replace(/[^a-z0-9=]+/gi, '_')}.jpg`;
  await p.screenshot({ path: file, type: 'jpeg', quality: 85, timeout: 180000 }).catch((e) => step(`screenshot failed: ${String(e).slice(0, 120)}`));
  // each pass WRITES into the next pass's target (Babylon sizes a post-process by its input), the last into the canvas:
  // the post chain's fill is every target after the scene's own, plus the backing buffer
  const [bw, bh] = (m?.backing ?? '0x0').split('x').map(Number);
  const fill = (m?.pps.slice(1).reduce((a, pp) => a + pp.w * pp.h, 0) ?? 0) + bw * bh;
  const line = `${key.padEnd(13)} ${(variant || 'current').padEnd(28)} phase=${phase} backing=${m?.backing} shadow/render=${m?.shadowPerRender} (renders ${m?.shadowRenders}, list ${m?.casters}, map ${m?.mapSize}) draws=${m ? `${m.draws.current} (avg ${m.draws.avg})` : 'n/a'} frameMs=${m?.frameMs} cache=${JSON.stringify(m?.cache)}\n` +
    (m?.samples?.length ? m.samples.map((x) => `    sample: ${x}\n`).join('') : '') +
    (m?.movingByName ? `    drawn per frame: ${JSON.stringify(m.movingByName)}\n` : '') +
    `    post passes=${m?.pps.length} fill=${(fill / 1e6).toFixed(2)} Mpx: ${m?.pps.map((pp) => `${pp.name} ${pp.w}x${pp.h}`).join(' | ')}\n    ${file}`;
  rows.push(line, ...log.map((l) => `    ${l}`));
  console.log(line); for (const l of log) console.log('    ' + l);
  await ctx.close();
}

for (const key of MODES) for (const v of VARIANTS) await measure(key, v);
fs.writeFileSync(`${OUT}/perf-probe.txt`, rows.join('\n') + '\n');
await b.close();
