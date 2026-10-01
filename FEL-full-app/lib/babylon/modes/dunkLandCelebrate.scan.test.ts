// DUNK-LAND-CELEBRATE — DunkMode wiring scan (live absorb, one live celebration, skip, no post-cut celebration).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const DUNK = readFileSync(path.join(__dirname, 'DunkMode.ts'), 'utf8');

describe('DunkMode dunk-land-celebrate wiring', () => {
  it('feet-down plays dunk_land_absorb; pickLanding never returns dunk_celebrate_big', () => {
    expect(DUNK).toMatch(/DUNK_LAND_ABSORB_CLIP/);
    expect(DUNK).toMatch(/function pickLanding\(_total: number\): string \{ return DUNK_LAND_ABSORB_CLIP; \}/);
  });

  it('one live celebration via pickLiveCelebration / startLiveCeleb; none after the triple cut', () => {
    expect(DUNK).toMatch(/pickLiveCelebration/);
    expect(DUNK).toMatch(/function startLiveCeleb/);
    expect(DUNK).not.toMatch(/pickCelebration\(/);
    const cutIdx = DUNK.indexOf('triple cut end');
    const postCut = DUNK.slice(cutIdx);
    expect(postCut).not.toMatch(/playClip\(cz\.clip/);
  });

  it('retry / resetForNextAttempt / goAgain cancel the live celebration', () => {
    expect(DUNK).toMatch(/function cancelLiveCeleb/);
    expect(DUNK).toMatch(/function retryThisDunk[\s\S]*cancelLiveCeleb/);
    expect(DUNK).toMatch(/function resetForNextAttempt[\s\S]*cancelLiveCeleb/);
    expect(DUNK).toMatch(/function goAgain[\s\S]*cancelLiveCeleb/);
  });

  it('skip ends the live hold; no new camera call inside it', () => {
    expect(DUNK).toMatch(/liveLandAt >= 0 && e\.t === 'button'/);
    const holdBlock = DUNK.slice(DUNK.indexOf('function liveLandThenJudge'), DUNK.indexOf('let replayClipNow'));
    expect(holdBlock).not.toMatch(/snapTo|setFixed|cutCamera|camDirector\.mode/);
  });
});
