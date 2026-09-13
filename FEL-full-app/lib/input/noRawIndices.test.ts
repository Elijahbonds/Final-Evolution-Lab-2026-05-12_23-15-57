// THE ACCEPTANCE GREP, as a test (2026-09-13).
//
// Mission, verbatim: "Zero raw button-index reads outside src/input/. Prove it with a grep audit."
//
// A grep proves it once, on the day someone runs it. This proves it on every commit, which is the only
// version of that promise worth having — the violation this closes took years to appear and would take one
// afternoon to reintroduce.
//
// What counts as a violation: indexing a gamepad's `buttons` or `axes` array with a NUMBER outside the input
// layer. What does not: calling `navigator.getGamepads()` to acquire the pad in the first place (that is
// acquisition, not mapping), and any `buttons[...]` on something that is not a gamepad — the touch overlay's
// scheme is a list of on-screen buttons and has nothing to do with hardware.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { stripComments } from '@/lib/testing/sourceScan';

const ROOT = path.resolve(__dirname, '../..');
const ROOTS = ['lib', 'components', 'app'];
const ALLOWED_DIR = path.join('lib', 'input');

/** `pad.buttons[0]`, `gp.axes[1]`, `p.buttons[i]` — a numeric or variable index into a pad array. */
const RAW_INDEX = /\b\w*(pad|gp|gamepad)\w*\s*[!?]?\.\s*(buttons|axes)\s*\[/i;

function walk(dir: string, out: string[] = []): string[] {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      walk(rel, out);
    } else if (/\.tsx?$/.test(entry.name) && !entry.name.includes('.test.')) {
      out.push(rel);
    }
  }
  return out;
}


describe('ZERO RAW BUTTON-INDEX READS OUTSIDE THE INPUT LAYER', () => {
  it('no file outside lib/input indexes a gamepad array', () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const rel of walk(root)) {
        if (rel.startsWith(ALLOWED_DIR)) continue;
        const src = stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
        src.split('\n').forEach((line, i) => {
          if (RAW_INDEX.test(line)) offenders.push(`${rel}:${i + 1}  ${line.trim().slice(0, 80)}`);
        });
      }
    }
    expect(offenders).toEqual([]);
  });

  it('and the input layer is where the mapping actually lives', () => {
    const profiles = fs.readFileSync(path.join(ROOT, 'lib/input/profiles.ts'), 'utf8');
    expect(profiles).toMatch(/buttons\s*\[/);        // it is allowed to, and it does
    expect(profiles).toMatch(/STANDARD_MAPPING/);
    expect(profiles).toMatch(/SWITCH_PRO_MAPPING/);
  });

  it('every pad consumer goes through readPad', () => {
    // the three that read hardware: the Babylon bus, the Canvas-2D juice, and the scheme bridge
    for (const f of ['lib/babylon/core/InputBus.ts', 'lib/canvas-juice.ts', 'lib/gamepad-bridge.ts']) {
      const src = stripComments(fs.readFileSync(path.join(ROOT, f), 'utf8'));
      expect(src, f).toMatch(/readPad\(/);
    }
  });

  it('NO MODE FILE TOUCHES A GAMEPAD AT ALL', () => {
    // the strongest form of the rule, and the one the audit found already true: every mode is a thin skin
    // over FelInput, and nothing in lib/babylon/modes has ever seen a button index
    const modes = walk(path.join('lib', 'babylon', 'modes'));
    const offenders = modes.filter((rel) => /getGamepads|\.buttons\[|\.axes\[/.test(stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'))));
    expect(offenders).toEqual([]);
  });
});
