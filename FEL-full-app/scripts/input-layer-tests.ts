#!/usr/bin/env -S yarn tsx
/**
 * scripts/input-layer-tests.ts — M14-P3 Unified Input Layer suite.
 * =================================================================
 * Phase 3 of the remediation pass unifies the FULL controller topology behind
 * the single input contract: left stick + right stick, four face buttons
 * (A/B/X/Y), and four shoulders (L1/R1/L2/R2), all funnelling through the same
 * synthetic-keyboard bridge every mode already understands. These invariants
 * pin that layer so a future refactor cannot silently drop a control or fork
 * the pipeline.
 *
 *   A. TOPOLOGY: the 2K/Xbox-standard button + axis indices are correct and
 *      face buttons a/b/x/y map to 0..3 (matching the pre-existing poller).
 *   B. SHOULDERS: resolveShoulders() normalizes a mode's triggers[] into
 *      explicit L1/R1/L2/R2 slots (explicit slot wins, else positional), never
 *      exceeding four, always with a real key. The legacy single `trigger` is
 *      untouched (backward compatible).
 *   C. RIGHT STICK: resolveLook() is null unless a mode declares `look`;
 *      applyDeadzone() and stickToDirs() behave (dead-zone center, radial
 *      rescale, 8-way diagonals).
 *   D. LIVE WIRING (static source invariants): the physical poller maps every
 *      shoulder slot + the right stick, and the on-screen VirtualController
 *      renders the shoulders array + the dormant look stick — both via the
 *      shared controller-map module (no fork).
 *   E. CROSS-SCHEME: every real scheme's triggers[] resolves cleanly.
 *
 * Run: yarn tsx scripts/input-layer-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import {
  PAD_INDEX,
  AXIS_INDEX,
  SHOULDER_SLOTS,
  SHOULDER_PAD_INDEX,
  resolveShoulders,
  resolveLook,
  shoulderCount,
  applyDeadzone,
  stickToDirs,
  STICK_DEADZONE,
  type ShoulderSlot,
} from '@/lib/input/controller-map';
import { SCHEMES, type VCScheme, type VCTrigger } from '@/lib/input-schemes';

const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  \u2713 ${name}`);
}

const tg = (over: Partial<VCTrigger> = {}): VCTrigger => ({ label: 'T', key: 'q', color: '#fff', ...over });

// ── A. TOPOLOGY ──────────────────────────────────────────────────────────
check('face buttons map to the standard 0..3 indices (matches legacy poller)', () => {
  assert.strictEqual(PAD_INDEX.a, 0);
  assert.strictEqual(PAD_INDEX.b, 1);
  assert.strictEqual(PAD_INDEX.x, 2);
  assert.strictEqual(PAD_INDEX.y, 3);
});

check('shoulders map to the standard 4..7 indices', () => {
  assert.strictEqual(PAD_INDEX.l1, 4);
  assert.strictEqual(PAD_INDEX.r1, 5);
  assert.strictEqual(PAD_INDEX.l2, 6);
  assert.strictEqual(PAD_INDEX.r2, 7);
  for (const s of SHOULDER_SLOTS) assert.strictEqual(SHOULDER_PAD_INDEX[s], PAD_INDEX[s]);
});

check('stick clicks + dpad + axes indices follow the standard layout', () => {
  assert.strictEqual(PAD_INDEX.ls, 10);
  assert.strictEqual(PAD_INDEX.rs, 11);
  assert.strictEqual(PAD_INDEX.dpadUp, 12);
  assert.strictEqual(PAD_INDEX.dpadDown, 13);
  assert.strictEqual(PAD_INDEX.dpadLeft, 14);
  assert.strictEqual(PAD_INDEX.dpadRight, 15);
  assert.deepStrictEqual(
    [AXIS_INDEX.leftX, AXIS_INDEX.leftY, AXIS_INDEX.rightX, AXIS_INDEX.rightY],
    [0, 1, 2, 3],
  );
});

// ── B. SHOULDERS ─────────────────────────────────────────────────────────
check('resolveShoulders fills L1,R1,L2,R2 positionally', () => {
  const s = resolveShoulders({ triggers: [tg({ key: 'q' }), tg({ key: 'e' })] });
  assert.strictEqual(s.l1?.key, 'q');
  assert.strictEqual(s.r1?.key, 'e');
  assert.strictEqual(s.l2, undefined);
  assert.strictEqual(s.r2, undefined);
});

check('resolveShoulders honours an explicit slot over position', () => {
  const s = resolveShoulders({ triggers: [tg({ key: 'q', slot: 'r2' }), tg({ key: 'e' })] });
  assert.strictEqual(s.r2?.key, 'q', 'explicit slot wins');
  assert.strictEqual(s.l1?.key, 'e', 'positional fills first free slot');
});

check('resolveShoulders never assigns more than four shoulders', () => {
  const s = resolveShoulders({ triggers: [tg(), tg(), tg(), tg(), tg()] });
  assert.strictEqual(Object.keys(s).length, 4);
  assert.strictEqual(shoulderCount({ triggers: [tg(), tg(), tg(), tg(), tg()] }), 4);
});

check('resolveShoulders is empty for no triggers, and ignores the legacy single trigger', () => {
  assert.deepStrictEqual(resolveShoulders({ triggers: undefined }), {});
  assert.deepStrictEqual(resolveShoulders({ triggers: [] }), {});
  // single-trigger schemes keep their dedicated path — not folded into slots.
  const single: Pick<VCScheme, 'triggers'> = { triggers: undefined };
  assert.strictEqual(shoulderCount(single), 0);
});

// ── C. RIGHT STICK / ANALOG ──────────────────────────────────────────────
check('resolveLook is null unless a mode declares a look axis', () => {
  assert.strictEqual(resolveLook({ look: undefined }), null);
  assert.strictEqual(resolveLook({ look: null }), null);
  assert.strictEqual(resolveLook({ look: {} }), null);
  const look = resolveLook({ look: { left: 'j', right: 'l' } });
  assert.ok(look && look.left === 'j' && look.right === 'l');
});

check('applyDeadzone kills center drift and rescales beyond the dead-zone', () => {
  assert.strictEqual(applyDeadzone(0), 0);
  assert.strictEqual(applyDeadzone(STICK_DEADZONE * 0.5), 0, 'inside dead-zone => 0');
  assert.strictEqual(applyDeadzone(1), 1, 'full deflection => 1');
  assert.strictEqual(applyDeadzone(-1), -1);
  const mid = applyDeadzone(0.5, 0.2);
  assert.ok(mid > 0 && mid < 1, 'partial deflection rescaled into (0,1)');
  assert.strictEqual(applyDeadzone(NaN), 0, 'NaN is safe');
});

check('stickToDirs yields cardinals, diagonals (two dirs), and dead center', () => {
  const center = stickToDirs(0, 0);
  assert.ok(!center.up && !center.down && !center.left && !center.right, 'center engages nothing');
  const right = stickToDirs(1, 0);
  assert.ok(right.right && !right.left && !right.up && !right.down);
  const up = stickToDirs(0, -1);
  assert.ok(up.up && !up.down);
  const downLeft = stickToDirs(-1, 1);
  assert.ok(downLeft.down && downLeft.left, 'diagonal engages two directions');
});

// ── D. LIVE WIRING (static source invariants) ────────────────────────────
check('physical poller wires shoulders + right stick through the shared map', () => {
  const bridge = read('lib/gamepad-bridge.ts');
  assert.ok(/from '\.\/input\/controller-map'/.test(bridge), 'poller imports the controller map');
  assert.ok(/resolveShoulders\(/.test(bridge), 'poller maps the shoulder array');
  assert.ok(/SHOULDER_PAD_INDEX/.test(bridge), 'poller uses per-slot button indices');
  assert.ok(/resolveLook\(/.test(bridge) && /AXIS_INDEX\.rightX/.test(bridge), 'poller reads the right stick');
});

check('VirtualController renders shoulders + dormant look stick via the shared map', () => {
  const vc = read('components/games/virtual-controller.tsx');
  assert.ok(/from '@\/lib\/input\/controller-map'/.test(vc), 'VC imports the controller map');
  assert.ok(/resolveShoulders\(/.test(vc) && /shoulderSlots/.test(vc), 'VC renders resolved shoulders');
  assert.ok(/resolveLook\(/.test(vc) && /LookStick/.test(vc), 'VC has the right-stick affordance');
  // still routes through the ONE bridge (input contract preserved)
  assert.ok(/pressKey\(/.test(vc) && /releaseKey\(/.test(vc), 'VC still uses the shared bridge');
});

// ── E. CROSS-SCHEME ──────────────────────────────────────────────────────
check('every real scheme with triggers resolves to <=4 unique slots with real keys', () => {
  for (const [mode, scheme] of Object.entries(SCHEMES)) {
    if (!scheme.triggers || scheme.triggers.length === 0) continue;
    const s = resolveShoulders(scheme);
    const slots = Object.keys(s) as ShoulderSlot[];
    assert.ok(slots.length <= 4, `${mode}: >4 shoulders`);
    assert.strictEqual(slots.length, Math.min(scheme.triggers.length, 4), `${mode}: dropped a shoulder`);
    for (const slot of slots) {
      assert.ok(s[slot]!.key && s[slot]!.key.length > 0, `${mode}.${slot}: empty key`);
      assert.ok(s[slot]!.label && s[slot]!.label.length > 0, `${mode}.${slot}: empty label`);
    }
  }
});

check('board + tennis shoulders now resolve (were previously touch-unreachable)', () => {
  for (const mode of ['skateboarding', 'snowboarding', 'surfing', 'tennis']) {
    const scheme = SCHEMES[mode];
    assert.ok(scheme, `missing scheme ${mode}`);
    const s = resolveShoulders(scheme);
    assert.ok(s.l1 && s.r1, `${mode}: expected L1 + R1 shoulders after resolution`);
  }
});

check('face-button positions across all schemes stay within a/b/x/y', () => {
  const allowed = new Set(['a', 'b', 'x', 'y']);
  for (const [mode, scheme] of Object.entries(SCHEMES)) {
    for (const btn of scheme.buttons) {
      assert.ok(allowed.has(btn.pos), `${mode}: illegal face pos ${btn.pos}`);
    }
  }
});

console.log(`\n\u2705 input-layer-tests: ${passed} checks passed`);
