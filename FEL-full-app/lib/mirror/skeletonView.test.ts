// The skeleton-only preference (MIRROR-COACH P9, 2026-09-30): kept in this browser's localStorage and nowhere else, read
// as off unless a '1' is stored, and never throwing — a private window or blocked site data reads the default and the
// switch still works for the visit (lib/mirror/skeletonView.ts).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  SKELETON_ONLY_KEY, readSkeletonOnly, skeletonToggleLabel, stageLayers, writeSkeletonOnly, type PrefStore,
} from './skeletonView';

const memory = (): PrefStore & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); } };
};
const throwing: PrefStore = {
  getItem: () => { throw new Error('SecurityError: storage blocked'); },
  setItem: () => { throw new Error('QuotaExceededError'); },
};

describe('the preference', () => {
  it('off by default; on after it is saved on; off again after it is saved off — one versioned key', () => {
    const s = memory();
    expect(readSkeletonOnly(s)).toBe(false);
    expect(writeSkeletonOnly(true, s)).toBe(true);
    expect(s.data.get(SKELETON_ONLY_KEY)).toBe('1');
    expect(readSkeletonOnly(s)).toBe(true);
    expect(writeSkeletonOnly(false, s)).toBe(true);
    expect(readSkeletonOnly(s)).toBe(false);
    expect([...s.data.keys()]).toEqual(['fel.mirror.skeletonOnly.v1']);
  });

  it('anything but a stored "1" is off (a stale or foreign value never hides the camera by surprise)', () => {
    for (const v of ['true', 'on', '0', '', 'null']) {
      const s = memory(); s.setItem(SKELETON_ONLY_KEY, v);
      expect(readSkeletonOnly(s), v).toBe(false);
    }
  });

  it('no store, or a store that throws, reads off and reports the write was not kept — and never throws', () => {
    expect(readSkeletonOnly(null)).toBe(false);
    expect(writeSkeletonOnly(true, null)).toBe(false);
    expect(() => readSkeletonOnly(throwing)).not.toThrow();
    expect(readSkeletonOnly(throwing)).toBe(false);
    expect(writeSkeletonOnly(true, throwing)).toBe(false);
  });

  it('in node (no window) the default store is null, not a crash', () => {
    expect(readSkeletonOnly()).toBe(false);
    expect(writeSkeletonOnly(true)).toBe(false);
  });

  it('it is a browser preference only: the module sends nothing anywhere', () => {
    const src = readFileSync('lib/mirror/skeletonView.ts', 'utf8').replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(/fetch\(|XMLHttpRequest|sendBeacon|\/api\//);
  });
});

describe('what the stage paints', () => {
  it('skeleton only: no camera image — the overlay, the skeleton and every number stay', () => {
    expect(stageLayers(true)).toEqual({ cameraImage: false, overlay: true, skeleton: true, numbers: true });
    expect(stageLayers(false)).toEqual({ cameraImage: true, overlay: true, skeleton: true, numbers: true });
  });

  it('the switch says what pressing it does', () => {
    expect(skeletonToggleLabel(false)).toBe('Skeleton only: hide the camera picture');
    expect(skeletonToggleLabel(true)).toBe('Show the camera picture');
  });
});
