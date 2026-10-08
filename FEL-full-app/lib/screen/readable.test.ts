// SCREEN-JUMP-ONLY: body text on /screen and the assess route stays at least 16px, and no label drops under 14.
// A class smaller than 14px fails here. text-xs is 12px and fails too.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../..');

function files(): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.tsx') && !name.includes('.test.')) out.push(p);
    }
  };
  walk(join(ROOT, 'app/screen'));
  walk(join(ROOT, 'app/play/mirror/assess'));
  return out;
}

describe('readable type on /screen and /play/mirror/assess', () => {
  it('no text class under 14px, and no text-xs', () => {
    const bad: string[] = [];
    for (const f of files()) {
      const src = readFileSync(f, 'utf8');
      if (/text-xs\b/.test(src)) bad.push(`${f}: text-xs`);
      for (const m of src.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)) {
        if (Number(m[1]) < 14) bad.push(`${f}: text-[${m[1]}px]`);
      }
    }
    expect(bad).toEqual([]);
  });
});
