// QA P1-25 (2026-09-27): Brain Brawl's PLAYERS pick ignored Enter. InputBus maps no Enter (and is the movement lane's input
// seam), and the pick starts on a face button (BrainBrawlMode onInput: `else if (face) begin(ctx, S)`), so the host hands
// Enter to the mode as that A press while — and only while — the pick is up. Pad A already started it and still does.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { stripComments } from '@/lib/testing/sourceScan';
import { lobbyKeyPress } from './brainbrawl-babylon';

const host = stripComments(readFileSync(path.resolve(__dirname, 'brainbrawl-babylon.tsx'), 'utf8'));
const mode = stripComments(readFileSync(path.resolve(__dirname, '../../lib/babylon/modes/BrainBrawlMode.ts'), 'utf8'));

describe('Brain Brawl\'s lobby takes Enter', () => {
  it('Enter is the A press and its release; any other key is nothing', () => {
    expect(lobbyKeyPress('Enter')).toEqual([{ t: 'button', btn: 'A', pressed: true }, { t: 'button', btn: 'A', pressed: false }]);
    for (const k of ['a', ' ', 'Escape', 'ArrowRight', 'j']) expect(lobbyKeyPress(k), k).toBeNull();
  });

  it('the host listens only while the harness is playing and the mode\'s HUD says pick, and emits into the bus', () => {
    expect(host).toContain("if (phase !== 'playing' || hud.phase !== 'pick') return;");
    expect(host).toMatch(/const presses = lobbyKeyPress\(e\.key\); if \(!presses \|\| e\.repeat\) return; e\.preventDefault\(\); for \(const p of presses\) emit\(p\);/);
    expect(host).toContain("window.removeEventListener('keydown', onKey);");
  });

  it('on the pick, a face button (pad A, or the host\'s Enter) begins the match; the pick publishes phase: \'pick\'', () => {
    const pick = mode.slice(mode.indexOf("if (S.phase === 'pick') {", mode.indexOf('onInput(ctx: ModeContext, e: FelInput)')));
    // the release's pick (2026-10-06) reads the face press inline: FACE.includes(e.btn) — the same A the host's Enter emits
    expect(pick.slice(0, 700)).toMatch(/else if \(e\.t === 'button' && e\.pressed && FACE\.includes\(e\.btn as 'A'\)\) begin\(ctx, S\);/);
    expect(mode).toMatch(/players: S\.players, prompt: '', display: '', board: null, boardTitle: '', phase: 'pick',/);
    expect(readFileSync(path.resolve(__dirname, '../../lib/babylon/core/InputBus.ts'), 'utf8')).not.toMatch(/\benter:/i);   // the seam is unchanged
  });
});
