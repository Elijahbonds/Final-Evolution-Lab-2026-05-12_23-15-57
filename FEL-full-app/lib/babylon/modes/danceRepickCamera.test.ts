// MUSIC-SUITE P10 FIX (2026-09-29): after a free-dance song, P9's backToPick (DanceMode.ts) hands the pick screen back —
// and the pick branch of update() returns before any applyStageCamera call, so the repick screen kept the song's LAST
// camera frame (the streak-widened ~7 m shot free dance frames as a streak, mid-sway, or 0.89 m high after a freeze)
// until the next count-in. Invisible before P10 (the camera never moved); visible once it did. backToPick now hard-cuts
// the neutral shot load() gives the pick screen. A source pin (the studioWiring pattern: the closure it lives in needs the
// whole room to run). Its own file because backToPick is P9's (free dance): it lands with #46, while the stage-camera
// drive tests (danceStageCameraDrive.test.ts) can land without P9.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('backToPick re-frames the pick screen', () => {
  it('a hard cut to the neutral shot after the run is reset — not the last frame of the song', () => {
    const src = fs.readFileSync(path.join(__dirname, 'DanceMode.ts'), 'utf8');
    const at = src.indexOf('function backToPick(');
    expect(at).toBeGreaterThan(0);
    const body = src.slice(at, src.indexOf('\n  }\n', at));
    const cam = body.indexOf('applyStageCamera(ctx, 0, 0, 0, true);');
    expect(cam).toBeGreaterThan(body.indexOf('currentCategory = null'));
    expect(cam).toBeLessThan(body.indexOf('showPick(ctx);'));
  });
});
