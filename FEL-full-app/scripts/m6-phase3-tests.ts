/**
 * scripts/m6-phase3-tests.ts
 * ==========================
 * M6 Phase 3 — self-verifying builds + content denylist.
 *
 * Covers:
 *   1. AcceptanceCheck types: html_contains, html_regex, no_console_error_pattern, file_exists.
 *   2. validateBundle() — builtins + architect checks, composite pass/fail.
 *   3. Content denylist — Tencent-restricted keyword gate.
 *   4. BuildPlan schema extension (acceptanceChecks optional, backward compat).
 *
 * Pure logic — no DOM, no network, no LLM credits.
 *
 * Run:  cd nextjs_space && yarn tsx scripts/m6-phase3-tests.ts
 */

import { strict as assert } from 'node:assert';
import {
  runAcceptanceCheck,
  validateBundle,
  type CheckResult,
} from '../lib/cell-files';
import type { AcceptanceCheck, BuildPlan } from '../lib/cell-engine';
import {
  evaluateContent,
  assertContentAllowed,
  ComplianceError,
  CONTENT_RESTRICTED_PROVIDERS,
  DENYLIST_KEYWORDS,
} from '../lib/cell-compliance';

let pass = 0;
const t = (label: string, fn: () => void) => {
  fn();
  pass++;
  console.log(`  ✓ ${label}`);
};

console.log('\n── M6 Phase 3: self-verifying builds + content denylist ──\n');

/* ─── AcceptanceCheck types ────────────────────────── */
console.log('AcceptanceCheck types');

t('html_contains passes when substring is present', () => {
  const c: AcceptanceCheck = { id: 'c1', description: 'has canvas', type: 'html_contains', value: '<canvas' };
  const r = runAcceptanceCheck(c, '<html><body><canvas id="g"></canvas></body></html>', []);
  assert.equal(r.passed, true);
});

t('html_contains fails when substring is absent', () => {
  const c: AcceptanceCheck = { id: 'c1', description: 'has canvas', type: 'html_contains', value: '<canvas' };
  const r = runAcceptanceCheck(c, '<html><body><div>no canvas here</div></body></html>', []);
  assert.equal(r.passed, false);
  assert.ok(r.detail.includes('not found'));
});

t('html_regex passes on match', () => {
  const c: AcceptanceCheck = { id: 'r1', description: 'id starts with game-', type: 'html_regex', value: 'id="game-\\w+"' };
  const r = runAcceptanceCheck(c, '<div id="game-board">x</div>', []);
  assert.equal(r.passed, true);
});

t('html_regex fails on mismatch', () => {
  const c: AcceptanceCheck = { id: 'r1', description: 'id starts with game-', type: 'html_regex', value: 'id="game-\\w+"' };
  const r = runAcceptanceCheck(c, '<div id="app-root">x</div>', []);
  assert.equal(r.passed, false);
});

t('html_regex handles invalid regex gracefully', () => {
  const c: AcceptanceCheck = { id: 'r2', description: 'bad regex', type: 'html_regex', value: '[invalid' };
  const r = runAcceptanceCheck(c, '<html></html>', []);
  assert.equal(r.passed, false);
  assert.ok(r.detail.includes('invalid regex'));
});

t('no_console_error_pattern passes when pattern absent', () => {
  const c: AcceptanceCheck = { id: 'n1', description: 'no eval', type: 'no_console_error_pattern', value: '\\beval\\(' };
  const r = runAcceptanceCheck(c, '<script>console.log("hello")</script>', []);
  assert.equal(r.passed, true);
});

t('no_console_error_pattern fails when pattern present', () => {
  const c: AcceptanceCheck = { id: 'n1', description: 'no eval', type: 'no_console_error_pattern', value: '\\beval\\(' };
  const r = runAcceptanceCheck(c, '<script>eval("alert(1)")</script>', []);
  assert.equal(r.passed, false);
});

t('file_exists passes when file is in tree', () => {
  const c: AcceptanceCheck = { id: 'f1', description: 'index.html', type: 'file_exists', value: 'index.html' };
  const r = runAcceptanceCheck(c, '', ['index.html', 'js/game.js']);
  assert.equal(r.passed, true);
});

t('file_exists fails when file is missing', () => {
  const c: AcceptanceCheck = { id: 'f1', description: 'style.css', type: 'file_exists', value: 'css/style.css' };
  const r = runAcceptanceCheck(c, '', ['index.html']);
  assert.equal(r.passed, false);
});

/* ─── validateBundle composite ──────────────────── */
console.log('\nvalidateBundle');

t('valid HTML with passing checks → passed=true', () => {
  const html = '<!DOCTYPE html><html><body><canvas></canvas><script>var x = 1;</script></body></html>';
  const checks: AcceptanceCheck[] = [{ id: 'has-canvas', description: '', type: 'html_contains', value: '<canvas' }];
  const r = validateBundle(html, ['index.html'], checks);
  assert.equal(r.passed, true);
  assert.equal(r.failures.length, 0);
  assert.ok(r.total >= 4); // 3 builtins + 1 architect
});

t('valid HTML with failing architect check → passed=false', () => {
  const html = '<!DOCTYPE html><html><body><script>var x = 1;</script></body></html>';
  const checks: AcceptanceCheck[] = [{ id: 'needs-svg', description: 'SVG required', type: 'html_contains', value: '<svg' }];
  const r = validateBundle(html, ['index.html'], checks);
  assert.equal(r.passed, false);
  assert.ok(r.failures.some((f) => f.checkId === 'needs-svg'));
});

t('builtin detects missing DOCTYPE', () => {
  const html = '<div>no doctype</div>';
  const r = validateBundle(html, []);
  assert.ok(r.failures.some((f) => f.checkId === '_html-doctype'));
});

t('builtin detects missing script', () => {
  const html = '<!DOCTYPE html><html><body>no script</body></html>';
  const r = validateBundle(html, []);
  assert.ok(r.failures.some((f) => f.checkId === '_has-script'));
});

t('builtin detects undefined dereference', () => {
  const html = '<!DOCTYPE html><html><body><script>undefined.foo = 1;</script></body></html>';
  const r = validateBundle(html, []);
  assert.ok(r.failures.some((f) => f.checkId === '_no-undefined-deref'));
});

t('no architect checks → only builtins run', () => {
  const html = '<!DOCTYPE html><html><body><script>var ok=1;</script></body></html>';
  const r = validateBundle(html, ['index.html']);
  assert.equal(r.total, 3); // 3 builtins only
  assert.equal(r.passed, true);
});

/* ─── Content denylist ────────────────────────── */
console.log('\nContent denylist (Cost Doctrine)');

t('non-restricted providers always pass content check', () => {
  const d = evaluateContent('openai', 'this mentions neuromechanic scoring logic');
  assert.equal(d.allowed, true);
  assert.equal(d.reason, 'provider not content-restricted');
});

t('Tencent is in restricted set', () => {
  assert.ok(CONTENT_RESTRICTED_PROVIDERS.has('tencent'));
});

t('Tencent blocks neuromechanic keyword', () => {
  const d = evaluateContent('tencent', 'Build a Neuromechanic scoring dashboard');
  assert.equal(d.allowed, false);
  assert.equal(d.blockedKeyword, 'neuromechanic');
});

t('Tencent blocks biometricmirror', () => {
  const d = evaluateContent('tencent', 'Integrate with BiometricMirror user video capture');
  assert.equal(d.allowed, false);
  assert.ok(d.blockedKeyword === 'biometricmirror' || d.blockedKeyword === 'user video');
});

t('Tencent blocks EU AI Act', () => {
  const d = evaluateContent('tencent', 'Draft the EU AI Act disclosure document');
  assert.equal(d.allowed, false);
  assert.equal(d.blockedKeyword, 'eu ai act');
});

t('Tencent allows clean prompt', () => {
  const d = evaluateContent('tencent', 'Build a simple basketball game with score tracking');
  assert.equal(d.allowed, true);
});

t('assertContentAllowed throws ComplianceError for blocked content', () => {
  assert.throws(
    () => assertContentAllowed('tencent', 'compute prq delta for the session'),
    ComplianceError
  );
});

t('assertContentAllowed is no-op for clean content on restricted provider', () => {
  assert.doesNotThrow(() => assertContentAllowed('tencent', 'build a card game'));
});

t('keyword denylist has all three categories', () => {
  const kws = DENYLIST_KEYWORDS.join(' ');
  assert.ok(kws.includes('neuromechanic'));
  assert.ok(kws.includes('mocap'));
  assert.ok(kws.includes('eu ai act'));
});

/* ─── BuildPlan backward compat ─────────────────── */
console.log('\nBuildPlan schema');

t('BuildPlan without acceptanceChecks is valid', () => {
  const plan: BuildPlan = {
    projectTitle: 'Test', genre: 'test', summary: 'test',
    lanes: [{ id: 'l1', title: 'L1', description: 'd', role: 'builder', dependencies: [], status: 'pending' }],
    estimatedComplexity: 'low',
  };
  assert.equal(plan.acceptanceChecks, undefined);
});

t('BuildPlan with acceptanceChecks is valid', () => {
  const plan: BuildPlan = {
    projectTitle: 'Test', genre: 'test', summary: 'test',
    lanes: [{ id: 'l1', title: 'L1', description: 'd', role: 'builder', dependencies: [], status: 'pending' }],
    estimatedComplexity: 'low',
    acceptanceChecks: [
      { id: 'has-canvas', description: 'canvas exists', type: 'html_contains', value: '<canvas' },
    ],
  };
  assert.ok(Array.isArray(plan.acceptanceChecks));
  assert.equal(plan.acceptanceChecks!.length, 1);
});

console.log(`\n✅ M6 Phase 3: ${pass} assertions passed\n`);
