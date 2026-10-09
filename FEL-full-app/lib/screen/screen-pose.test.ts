// SCREEN-FIX-2 item 7g (Cyber F5): the screen's PoseService never writes fel.pose.model to localStorage. It is the
// app's PoseService with the singleton's own browser deps and ONE swap, a page-memory storage
// (app/play/mirror/assess/_components/screen-pose.ts), and it is the only PoseService the screen uses.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PoseService, poseService, type PoseDeps } from '@/lib/pose/PoseService';
import { MODEL_MEMORY_KEY } from '@/lib/pose/modelChoice';
import { pageMemoryStorage, screenPose } from '@/app/play/mirror/assess/_components/screen-pose';

const depsOf = (s: PoseService) => (s as unknown as { deps: PoseDeps }).deps;
/** A file's code, comments dropped. */
const code = (f: string) => readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
const APP = join(__dirname, '../../app/play/mirror/assess/_components');

afterEach(() => { vi.unstubAllGlobals(); });

describe('the screen\'s PoseService', () => {
  it('is its own instance, built from the singleton\'s browser deps with only the storage swapped', () => {
    const screen = screenPose(), app = poseService();
    expect(screen).toBeInstanceOf(PoseService);
    expect(screen).not.toBe(app);
    expect(screenPose()).toBe(screen);                                     // one per page
    const a = depsOf(app), s = depsOf(screen);
    expect(a, 'PoseService keeps its deps in `deps`: screen-pose.ts reads them there').toBeTruthy();
    for (const k of Object.keys(a) as (keyof PoseDeps)[]) {
      if (k === 'storage') expect(s[k], k).not.toBe(a[k]);
      else expect(s[k], k).toBe(a[k]);
    }
  });

  it('remembers the model choice for the page\'s life only: nothing reaches localStorage', () => {
    const writes: string[] = [];
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: (k: string) => { writes.push(k); }, removeItem: (k: string) => { writes.push(k); } });
    const st = depsOf(screenPose()).storage;
    st.set(MODEL_MEMORY_KEY, '{"model":"lite","detectMs":30,"at":1}');
    expect(st.get(MODEL_MEMORY_KEY)).toBe('{"model":"lite","detectMs":30,"at":1}');
    expect(writes).toEqual([]);
    // the singleton's storage, for contrast, is localStorage
    depsOf(poseService()).storage.set(MODEL_MEMORY_KEY, 'x');
    expect(writes).toEqual([MODEL_MEMORY_KEY]);
    // a fresh page memory starts empty
    expect(pageMemoryStorage().get(MODEL_MEMORY_KEY)).toBeNull();
  });

  it('the screen uses it everywhere and never the app\'s singleton; the QA feed is rebound to it while the page is up', () => {
    const app = code(join(APP, 'assess-app.tsx'));
    expect(app).not.toMatch(/\bposeService\(/);
    expect(app.match(/\bscreenPose\(\)/g)!.length).toBeGreaterThanOrEqual(6);
    expect(app).toMatch(/window\.__FEL_POSE_FEED__ = makeFeedHandle\(screenPose\);/);
    for (const f of ['camera-help.tsx', 'live-hud.tsx', 'results-view.tsx', 'kid-results.tsx', 'gate-steps.tsx']) {
      expect(code(join(APP, f)), f).not.toMatch(/\bposeService\(|lib\/pose\/PoseService/);
    }
  });
});
