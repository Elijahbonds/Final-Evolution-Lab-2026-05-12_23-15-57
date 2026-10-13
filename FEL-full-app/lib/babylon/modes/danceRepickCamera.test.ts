// MUSIC-SUITE P10 FIX (found in closed PR #46, 2026-09-29; re-landed 2026-10-13 on IMPROVE's GO AGAIN, replayToPick): after a
// run, the pick screen is handed back — and the pick branch of update() returns before any applyStageCamera call, so the
// repick screen kept the song's LAST camera frame (the streak-widened ~7 m shot a streak frames, mid-sway, or 0.89 m high
// after a freeze) until the next count-in. replayToPick called applyStageCamera(ctx, 0, 0, 0): a glide, and a glide is one
// 0.1 lerp step. It now hard-cuts the neutral shot, which load() gives the pick screen. A source pin (the studioWiring
// pattern: the closure it lives in needs the whole room to run); the CameraDirector contract it relies on — setFixed moves
// the camera on `snap` alone — is pinned in danceStageCameraDrive.test.ts on the real class.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('replayToPick re-frames the pick screen', () => {
  const src = fs.readFileSync(path.join(__dirname, 'DanceMode.ts'), 'utf8');
  const at = src.indexOf('function replayToPick(');
  const body = src.slice(at, src.indexOf('\n  }\n', at));

  it('a hard cut to the neutral shot after the run is reset — not the last frame of the song', () => {
    expect(at).toBeGreaterThan(0);
    const cam = body.indexOf('applyStageCamera(ctx, 0, 0, 0, true);');
    expect(cam).toBeGreaterThan(body.indexOf('currentCategory = null'));
    expect(cam).toBeLessThan(body.indexOf('showPick(ctx);'));
  });
  it('and it is the only camera call there (no second, gliding one to undo it)', () => {
    expect(body.match(/applyStageCamera\(/g)?.length).toBe(1);
  });
});
