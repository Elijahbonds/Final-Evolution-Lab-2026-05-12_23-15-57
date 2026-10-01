// HOOPS-10 Phase 2: the 3PT standings window does not freeze the hero (V:3pt N5 — "update() returns before
// the bio/posture block and the camera, so the hero stands frozen for 4 s or more"). The fix keeps the hero's
// BeatOwner alive through the standings hold: a one-shot reaction to the posted score (celebrate a big one,
// flinch a poor one — the same threshold the rival reveal uses), settling into the watch idle. This pins the
// wiring structurally: the standings hold must touch the hero's beats, and the reaction must key off the score.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { stripComments } from '@/lib/testing/sourceScan';

const ROOT = path.resolve(__dirname, '../../..');
const src = stripComments(fs.readFileSync(path.join(ROOT, 'lib/babylon/modes/ThreePointMode.ts'), 'utf8'));

// The standings block is the full `if (S.phase === 'standings') { … }` inside update() — brace-balanced, so
// the reveal sub-block's `return` and the readable hold below it are both inside the capture.
const standingsBlock = (() => {
  const start = src.indexOf("if (S.phase === 'standings') {");
  if (start < 0) return '';
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  return '';
})();

describe('3PT standings: the hero stays alive (HOOPS-10 phase 2)', () => {
  it('the standings hold drives the hero beats (no frozen statue)', () => {
    expect(standingsBlock).not.toBe('');
    expect(standingsBlock).toContain('beats');
    expect(standingsBlock).toContain('S.heroReacted');
  });

  it('the hero answers their posted score — celebrate a big one, flinch a poor one (the reveal\'s own threshold)', () => {
    expect(standingsBlock).toMatch(/S\.pts >= 16 \? SPORT_CLIP\.scoreCelebrate : 'bball_contact_react'/);
    expect(standingsBlock).toContain("beats.loop(WATCH_IDLE)");
  });

  it('the reaction is once per standings window (the flag resets with the rest of the run state)', () => {
    // the flag is declared, reset alongside revealQueue, and consumed in the block
    expect(src).toContain('heroReacted: false');
    expect(src).toMatch(/S\.standingsT = 0;\s*\n\s*S\.heroReacted = false;/);
  });
});
