// SCREEN-FIX-2 item 1 and amend 1 (Cyber F3, tightened): THE POSE LOADER FAILS CLOSED. There is no CDN fallback of any
// kind. A missing or failing copy of our own wasm or model is a load failure (the camera card and its retry), never a
// request to jsDelivr, Google or any other origin. Driven through the MediaPipe adapter the screen's PoseService uses,
// with tasks-vision stubbed (no wasm in node) and every fetch answering 404.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const tv = vi.hoisted(() => ({ asked: [] as { wasm: string; model?: string }[], missing: false }));
vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: async (wasm: string) => { tv.asked.push({ wasm }); return { wasm }; } },
  PoseLandmarker: {
    createFromOptions: async (fs: { wasm: string }, o: { baseOptions: { modelAssetPath: string } }) => {
      tv.asked.push({ wasm: fs.wasm, model: o.baseOptions.modelAssetPath });
      // our copy is missing: the file answers 404 and the landmarker cannot be built
      if (tv.missing) throw new Error(`Failed to fetch ${o.baseOptions.modelAssetPath}: 404`);
      return { close() {} };
    },
  },
}));

import { MediaPipePoseAdapter } from '@/lib/babylon/nexus/neuro-mirror/pose/mediapipe-adapter';
import { AssetResolver, LOCAL_WASM_BASE, headProbe, localModelUrl, visionAssets } from '@/lib/pose/assets';

const ORIGIN = 'http://screen.test';
let requested: string[] = [];
beforeEach(() => {
  tv.asked = []; tv.missing = false; requested = [];
  // every request answers 404: our copy is not there
  vi.stubGlobal('fetch', vi.fn(async (u: string | URL) => { requested.push(String(u)); return new Response(null, { status: 404 }); }));
});
afterEach(() => { vi.unstubAllGlobals(); });

/** Anything a URL would reach that is not our own site. */
const offsite = (u: string) => new URL(u, ORIGIN).origin !== ORIGIN;

describe('a HEAD 404 on our copy: no off-site URL is ever returned or requested', () => {
  it('the resolver answers our own paths whatever the probe says (404, 410, a throw), and asks nobody', async () => {
    for (const probe of [async () => false, async () => true, () => Promise.reject(new Error('offline'))]) {
      const r = new AssetResolver(probe);
      expect(await r.wasmBase()).toBe(LOCAL_WASM_BASE);
      for (const m of ['lite', 'full'] as const) expect(await r.poseModel(m)).toBe(localModelUrl(m));
    }
    expect(await headProbe('/pose/models/pose_landmarker_full.task')).toBe(false);          // the probe still says "missing"…
    expect(await visionAssets.wasmBase()).toBe('/pose/wasm');                              // …and the page's resolver keeps ours
    expect(await visionAssets.poseModel('full')).toBe('/pose/models/pose_landmarker_full.task');
    expect(requested.filter(offsite)).toEqual([]);
  });

  it('the adapter loads the wasm and the model from our own site only', async () => {
    const a = new MediaPipePoseAdapter({ model: 'full' });
    await a.init();
    expect(tv.asked).toEqual([{ wasm: '/pose/wasm' }, { wasm: '/pose/wasm', model: '/pose/models/pose_landmarker_full.task' }]);
    expect([...requested, ...tv.asked.flatMap((x) => [x.wasm, x.model ?? ''])].filter((u) => u && offsite(u))).toEqual([]);
  });

  it('our model missing: the load fails (the camera card\'s retry), with no second try anywhere else', async () => {
    tv.missing = true;
    const a = new MediaPipePoseAdapter({ model: 'lite' });
    await expect(a.init()).rejects.toThrow(/404/);
    expect(a.ready).toBe(false);
    expect(tv.asked.filter((x) => x.model)).toEqual([{ wasm: '/pose/wasm', model: '/pose/models/pose_landmarker_lite.task' }]);
    expect([...requested, ...tv.asked.flatMap((x) => [x.wasm, x.model ?? ''])].filter((u) => u && offsite(u))).toEqual([]);
    // a retry asks for the very same file again
    await expect(a.init()).rejects.toThrow(/404/);
    expect(tv.asked.filter((x) => x.model).map((x) => x.model)).toEqual(['/pose/models/pose_landmarker_lite.task', '/pose/models/pose_landmarker_lite.task']);
  });

  it('the source holds no CDN address any more', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(__dirname, '../pose/assets.ts'), 'utf8');
    expect(src).not.toMatch(/cdn\.jsdelivr\.net|storage\.googleapis\.com|CDN_WASM_BASE|cdnModelUrl/);
  });
});
