#!/usr/bin/env -S yarn tsx
/**
 * scripts/feedback-parity-tests.ts  (M12.6)
 * =========================================
 * FEEDBACK-PARITY INVARIANT — "no silent scoring".
 *
 * The M12 playtest contract requires that every playable mode makes its
 * scoring FELT by the player, both ways:
 *   - when the PLAYER scores, there is player-visible success feedback
 *     (toast / flash / net-swish / crowd pop / sfx / haptic), and
 *   - when the player MISSES or the RIVAL scores, there is player-visible
 *     failure feedback too (a red toast, a "MISS/BRICK/WHIFF/LOST" call,
 *     or an equivalent negative cue).
 *
 * A mode that mutates a visible score but emits NO feedback would "score from
 * an empty court" — the exact failure this milestone exists to kill. This is a
 * STATIC source invariant (grep-style): it does not render or run a frame, so
 * it is deterministic and cheap, and it pins the contract so a future edit
 * cannot silently delete the feedback that makes a mode playable.
 *
 * Scope: the live, playable mode surfaces (2D + 3D). Pure engines/cores,
 * HUD-only, and controller shims are excluded — they do not own scoring.
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';

const GAMES = path.resolve(__dirname, '..', 'components', 'games');

// Files that are NOT score-owning mode surfaces (engines, HUD, shims).
const NON_SURFACE = new Set([
  'board-hud.tsx',
  'game-shell.tsx',
  'prq-float.tsx',
  'virtual-controller.tsx',
]);

// A score MUTATION looks like one of these in this codebase.
const SCORE_MUT = [
  /\b(?:s|st|sim|state)\.[a-zA-Z]*[Ss]core\s*[+\-]?=/,
  /\b[a-zA-Z]*[Ss]core\s*\+=/,
  /\bsetScore\s*\(/,
  /\bsetPScore\s*\(/,
  /\baddScore\s*\(/,
  /\bsetPoints\s*\(/,
  /\brecorder\.addScore\s*\(/,
];

// ANY player-visible feedback (success OR failure) — broad vocabulary.
const FEEDBACK_ANY = [
  /showMsg\s*\(/,
  /setMsg\s*\(/,
  /setToast\s*\(/,
  /setBanner\s*\(/,
  /setFeedback\s*\(/,
  /setResult\s*\(/,
  /announce\s*\(/,
  /triggerFlash\s*\(/,
  /crowdFlash/,
  /\.swish\s*\(/,
  /RimGlow|rimGlow/,
  /bus\.emit\s*\(/,
  /\bemit\s*\(/,
  /playSfx|playSound/,
  /haptic|vibrate/,
  /pulse/,
  // canvas-rendered mode surfaces feed back via local msg/label/flash/shake
  // state that is drawn each frame (ctx.fillText) rather than a React toast.
  /\bmsg\s*=/,
  /\blabel\s*=/,
  /msgColor|msgTimer/,
  /\.flash\b/,
  /\bshake\b/,
  /\bbanner\b/i,
];

// FAILURE / negative feedback: red color, or an explicit miss/loss word.
const FEEDBACK_FAIL = [
  /#FF3366/i,            // FEL red (miss / rival / loss)
  /#8899aa/i,            // grey whiff
  /\bMISS\b|MISSED/i,
  /\bBRICK\b/i,
  /\bWHIFF/i,
  /\bLOST\b|\bLOSE\b/i,
  /TOO SLOW/i,
  /\bFAIL/i,
  /WIPE ?OUT|WIPEOUT|BAIL/i,
  /AI (?:SCORES|BALL)/i,
  /TRADED/i,
  /BLOCKED|PARRIED/i,
];

// SUCCESS / positive feedback: green/gold/cyan color, or a make/win word.
const FEEDBACK_WIN = [
  /#00FF9D/i,            // green (good)
  /#FFD700/i,            // gold (great)
  /#00E5FF/i,            // cyan (make)
  /#A855F7/i,            // purple (special)
  /\bBUCKET|SWISH|SCORE[!d]|SCORED\b/i,
  /\bWON\b|\bWIN\b/i,
  /\bNICE|CLEAN|PERFECT|GREAT|STUCK\b/i,
  /\bK\.?O\.?\b|HIT!|COMBO/i,
  /\+\d/,               // a "+N" points call-out
];

function anyMatch(src: string, pats: RegExp[]): boolean {
  return pats.some((p) => p.test(src));
}

let passed = 0;
function check(name: string, fn: () => void) { fn(); passed++; console.log('  \u2713 ' + name); }

const files = fs
  .readdirSync(GAMES)
  .filter((f) => f.endsWith('.tsx') && !NON_SURFACE.has(f))
  .sort();

assert.ok(files.length >= 20, `expected >=20 mode surfaces, found ${files.length}`);

const scoreOwning: string[] = [];
for (const f of files) {
  const src = fs.readFileSync(path.join(GAMES, f), 'utf8');
  if (anyMatch(src, SCORE_MUT)) scoreOwning.push(f);
}

check(`found score-owning mode surfaces (${scoreOwning.length})`, () => {
  assert.ok(scoreOwning.length >= 15, `expected >=15 score-owning surfaces, found ${scoreOwning.length}`);
});

// ---- INVARIANT 1: no silent scoring -------------------------------------
check('every score-owning surface emits at least one player-visible feedback', () => {
  const silent: string[] = [];
  for (const f of scoreOwning) {
    const src = fs.readFileSync(path.join(GAMES, f), 'utf8');
    if (!anyMatch(src, FEEDBACK_ANY)) silent.push(f);
  }
  assert.strictEqual(silent.length, 0, `SILENT SCORING in: ${silent.join(', ')}`);
});

// ---- INVARIANT 2: success feedback both ways ----------------------------
check('every score-owning surface has SUCCESS feedback (make/win cue)', () => {
  const missing: string[] = [];
  for (const f of scoreOwning) {
    const src = fs.readFileSync(path.join(GAMES, f), 'utf8');
    if (!anyMatch(src, FEEDBACK_WIN)) missing.push(f);
  }
  assert.strictEqual(missing.length, 0, `no SUCCESS feedback in: ${missing.join(', ')}`);
});

check('every score-owning surface has FAILURE feedback (miss/loss cue)', () => {
  const missing: string[] = [];
  for (const f of scoreOwning) {
    const src = fs.readFileSync(path.join(GAMES, f), 'utf8');
    if (!anyMatch(src, FEEDBACK_FAIL)) missing.push(f);
  }
  assert.strictEqual(missing.length, 0, `no FAILURE feedback in: ${missing.join(', ')}`);
});

console.log(`\nfeedback-parity-tests: ${passed} checks passed across ${scoreOwning.length} score-owning surfaces`);
