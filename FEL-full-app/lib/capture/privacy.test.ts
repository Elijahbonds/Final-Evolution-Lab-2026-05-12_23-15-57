import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { cameraMayStart, gameClipMayLeave, selfVideoMayLeave, VIDEO_TRAINING_USE, videoDestination, videoMayLeave } from './privacy';
import { dunkPoseAssetUrls, poseAssetsStayLocal } from '@/lib/dunk-film/poseGuard';

const ROOT = path.resolve(__dirname, '../..');

describe('video stays on the device unless the player taps Share or Export', () => {
  it('keep, analyze and save-numbers stay; share and export leave; train throws', () => {
    expect(videoDestination('keep')).toBe('stay');
    expect(videoDestination('analyze')).toBe('stay');
    expect(videoDestination('save-numbers')).toBe('stay');
    expect(videoMayLeave('share')).toBe(true);
    expect(videoMayLeave('export')).toBe(true);
    expect(videoMayLeave('keep')).toBe(false);
    expect(() => videoDestination('train')).toThrow(/never used for training/i);
  });

  it('video is never used for training', () => {
    expect(VIDEO_TRAINING_USE).toBe(false);
  });

  it('a game clip may be shared at any age; it is not a video of the player', () => {
    expect(gameClipMayLeave()).toBe(true);
  });
});

describe('the grown-up step before a camera, and before a video of the player leaves', () => {
  it('under 18 and unknown age cannot start the camera until a grown-up is ticked', () => {
    for (const age of ['under-13', '13-17', 'unknown'] as const) {
      expect(cameraMayStart(age, false), age).toBe(false);
      expect(cameraMayStart(age, true), age).toBe(true);
    }
  });

  it('no age yet never starts the camera', () => {
    expect(cameraMayStart(null, false)).toBe(false);
    expect(cameraMayStart(null, true)).toBe(false);
  });

  it('18 or older starts the camera without the grown-up step', () => {
    expect(cameraMayStart('18+', false)).toBe(true);
  });

  it('a minor or an unknown age cannot export or share a video of themselves without the grown-up step', () => {
    for (const age of ['under-13', '13-17', 'unknown'] as const) {
      expect(selfVideoMayLeave(age, false), age).toBe(false);
      expect(selfVideoMayLeave(age, true), age).toBe(true);
    }
    expect(selfVideoMayLeave(null, true)).toBe(false);
    expect(selfVideoMayLeave('18+', false)).toBe(true);
  });
});

describe('the pose model loads only from /pose', () => {
  it('the dunk film assets are the local copies and nothing else', () => {
    const urls = dunkPoseAssetUrls();
    expect(urls).toEqual([
      '/pose/wasm',
      '/pose/models/pose_landmarker_lite.task',
      '/pose/models/pose_landmarker_full.task',
    ]);
    expect(poseAssetsStayLocal(urls)).toBe(true);
    expect(poseAssetsStayLocal(['https://cdn.jsdelivr.net/pose/model.task'])).toBe(false);
    expect(poseAssetsStayLocal(['/models/pose.task'])).toBe(false);
  });

  it('capture and dunk-film source never names another pose host', () => {
    const dirs = ['lib/capture', 'lib/dunk-film', 'components/capture'].map((d) => path.join(ROOT, d));
    const banned = /jsdelivr|storage\.googleapis|cdn\.jsdelivr|mediapipe\.google|https?:\/\/[^/\s]*pose/i;
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) continue;
      for (const name of fs.readdirSync(dir)) {
        if (!/\.(ts|tsx)$/.test(name) || /\.test\.(ts|tsx)$/.test(name)) continue;
        const text = fs.readFileSync(path.join(dir, name), 'utf8');
        expect(text, name).not.toMatch(banned);
      }
    }
  });
});
