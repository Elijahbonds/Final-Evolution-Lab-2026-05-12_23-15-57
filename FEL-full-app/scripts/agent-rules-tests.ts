#!/usr/bin/env -S npx tsx
/**
 * scripts/agent-rules-tests.ts — THE OWNER'S RULES ARE ACTUALLY LOADED.
 *
 * docs/AGENT-OPERATING-RULES.md has held the owner's rules since 2026-09-03 — including "wait for sign-off on
 * anything touching physics, the rig, or the shared Profile object" and "never add a dependency without asking".
 * For 860 commits nothing loaded it. There was no CLAUDE.md anywhere in the repo, so every agent session in every
 * worktree started blind to the file, and rules nothing puts in front of you are decoration: tuned skate physics got
 * changed without sign-off, three arenas were edited to satisfy a standard an agent had just invented, and a
 * committed deploy artifact was proposed for deletion — all of it covered, on paper, the whole time.
 *
 * So the mechanism gets a guard, not just the content. /CLAUDE.md is what Claude Code loads from any working
 * directory in this repo (it walks up from cwd), and it must keep pointing at the authority file rather than drifting
 * into a second, competing copy of the rules.
 *
 * Run: npx tsx scripts/agent-rules-tests.ts
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const appDir = path.join(__dirname, '..');
const repoRoot = path.join(appDir, '..');
const RULES_REL = 'FEL-full-app/docs/AGENT-OPERATING-RULES.md';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };

console.log('\nthe agent rules are reachable from a cold session');

ok('/CLAUDE.md exists at the repo root, where every session picks it up', () => {
  const p = path.join(repoRoot, 'CLAUDE.md');
  assert.ok(fs.existsSync(p),
    'CLAUDE.md is missing from the repo root. Claude Code walks UP from the working directory, so a file here is ' +
    'loaded whether a session starts in the repo root or in FEL-full-app. Without it, no session reads the rules.');
  assert.ok(fs.readFileSync(p, 'utf8').length > 400, 'CLAUDE.md is too short to carry the escalation policy');
});

ok('it points at the authority file, and that file is really there', () => {
  const claude = fs.readFileSync(path.join(repoRoot, 'CLAUDE.md'), 'utf8');
  assert.ok(/AGENT-OPERATING-RULES\.md/.test(claude),
    'CLAUDE.md must cite docs/AGENT-OPERATING-RULES.md as the authority rather than restate the rules — two copies ' +
    'of a rule set is how they start disagreeing');
  assert.ok(fs.existsSync(path.join(repoRoot, RULES_REL)),
    `${RULES_REL} is missing, so CLAUDE.md's pointer dangles`);
});

ok('the escalation policy says which way is which', () => {
  const claude = fs.readFileSync(path.join(repoRoot, 'CLAUDE.md'), 'utf8');
  // The two halves of the owner's 2026-09-28 answer. Either one alone is a misreading: "stop before irreversible"
  // without "do anything reversible" reads as ask-about-everything, which would idle an overnight pass for hours.
  assert.ok(/reversible/i.test(claude) && /irreversible/i.test(claude),
    'CLAUDE.md must state both halves: do anything reversible, stop before anything irreversible');
  assert.ok(/\bmain\b/.test(claude), 'CLAUDE.md must say that main is the owner\'s to merge — it is the deploy branch');
});

console.log(`\n✅ agent-rules-tests: ${pass} checks green — the rules load from a cold start`);
