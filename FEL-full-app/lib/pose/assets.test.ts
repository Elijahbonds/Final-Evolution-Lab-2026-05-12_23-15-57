import { describe, it, expect } from 'vitest';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import {
  AssetResolver, CDN_WASM_BASE, LOCAL_WASM_BASE, LOCAL_WASM_FILES, POSE_MODEL_BYTES, VISION_VERSION, cdnModelUrl,
  headProbe, localModelUrl,
} from './assets';

const root = join(__dirname, '..', '..');
const sha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');

describe('where the pose model and wasm load from', () => {
  it('our copy when it is there, and each URL is asked about once', async () => {
    const asked: string[] = [];
    const r = new AssetResolver(async (u) => { asked.push(u); return true; });
    expect(await r.wasmBase()).toBe(LOCAL_WASM_BASE);
    expect(await r.poseModel('full')).toBe('/pose/models/pose_landmarker_full.task');
    expect(await r.poseModel('full')).toBe(localModelUrl('full'));
    await r.wasmBase();
    expect(asked).toEqual(['/pose/wasm/vision_wasm_internal.js', '/pose/models/pose_landmarker_full.task']);
  });

  it('the CDN only when ours is missing; a probe that fails keeps our copy', async () => {
    const missing = new AssetResolver(async () => false);
    expect(await missing.wasmBase()).toBe(CDN_WASM_BASE);
    expect(await missing.poseModel('lite')).toBe(cdnModelUrl('lite'));
    const broken = new AssetResolver(() => Promise.reject(new Error('offline')));
    expect(await broken.poseModel('lite')).toBe(localModelUrl('lite'));
    expect(await broken.wasmBase()).toBe(LOCAL_WASM_BASE);
  });

  it('the HEAD probe says missing on a 404 or 410 and on nothing else', async () => {
    const real = globalThis.fetch;
    const answer = (status: number, type = 'application/octet-stream') => {
      globalThis.fetch = (async () => new Response(null, { status, headers: { 'content-type': type } })) as typeof fetch;
    };
    try {
      answer(200); expect(await headProbe('/pose/x')).toBe(true);
      answer(404, 'text/html'); expect(await headProbe('/pose/x')).toBe(false);
      answer(410); expect(await headProbe('/pose/x')).toBe(false);
      answer(500); expect(await headProbe('/pose/x')).toBe(true);        // a bad moment on our server, not a missing file
      answer(405); expect(await headProbe('/pose/x')).toBe(true);        // a host that refuses HEAD
      answer(200, 'text/html'); expect(await headProbe('/pose/x')).toBe(true);
      globalThis.fetch = (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch;
      expect(await headProbe('/pose/x')).toBe(true);                     // offline says nothing about our copy
    } finally {
      globalThis.fetch = real;
    }
  });

  it('the CDN fallback is the same wasm build and the same model family', () => {
    expect(CDN_WASM_BASE).toContain(`@mediapipe/tasks-vision@${VISION_VERSION}/wasm`);
    expect(cdnModelUrl('full')).toMatch(/pose_landmarker_full\/float16\/1\/pose_landmarker_full\.task$/);
  });
});

describe('the files in public/pose', () => {
  // The wasm must be the build the JS bundle expects: Next compiles tasks-vision's JS from node_modules, so a package
  // bump without a fresh copy would load a mismatched wasm and break every camera feature at runtime.
  it('the wasm is byte-identical to the installed @mediapipe/tasks-vision', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'node_modules/@mediapipe/tasks-vision/package.json'), 'utf8'));
    expect(pkg.version, 'tasks-vision was upgraded: re-copy its wasm to public/pose/wasm and bump VISION_VERSION').toBe(VISION_VERSION);
    for (const f of LOCAL_WASM_FILES) {
      const ours = join(root, 'public/pose/wasm', f), theirs = join(root, 'node_modules/@mediapipe/tasks-vision/wasm', f);
      expect(existsSync(ours), `public/pose/wasm/${f} is missing (cp node_modules/@mediapipe/tasks-vision/wasm/${f} public/pose/wasm/)`).toBe(true);
      expect(sha(ours), `public/pose/wasm/${f} differs from node_modules`).toBe(sha(theirs));
    }
  });

  it('both models are whole (a short file is a bad download or an LFS pointer)', () => {
    for (const m of ['lite', 'full'] as const) {
      const p = join(root, 'public', localModelUrl(m));
      expect(existsSync(p), `${p} is missing`).toBe(true);
      expect(statSync(p).size).toBe(POSE_MODEL_BYTES[m]);
    }
  });
});
