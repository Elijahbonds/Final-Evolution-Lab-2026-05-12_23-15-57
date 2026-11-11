// EVERY-SCREEN P6 (owner, 2026-11-11): a notice is left out of the first screen's words only when it is marked, and only an
// approved notice can be marked: every `{...notice(kind)}` in the app renders one of lib/every-screen/notices.ts's
// constants, imported from the module named there, with the kind named there. Nothing guesses from the words.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { APPROVED_NOTICES, notice } from '@/lib/every-screen/notices';

const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  if (statSync(p).isDirectory()) return f === 'node_modules' || f.startsWith('.') ? [] : walk(p);
  return /\.(tsx|ts)$/.test(f) && !/\.test\./.test(f) ? [p] : [];
});
const files = [...walk('app'), ...walk('components')];

describe('approved notices', () => {
  it('the attribute is the kind, nothing else', () => {
    expect(notice('medical')).toEqual({ 'data-notice': 'medical' });
  });
  it('every marked element renders an approved constant, from its module, with its kind', () => {
    let uses = 0;
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/notice\('(\w+)'\)\}[^>]*>\s*\{(\w+)\}/g)) {
        uses++;
        const [, kind, name] = m;
        // the same name can be approved in more than one module (each tool's PRIVACY_LINE): the one this file imports it from
        const importedFrom = (from: string) => new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*'${from.replace(/[/@]/g, (c) => `\\${c}`)}'`).test(src);
        const entry = APPROVED_NOTICES.find((n) => n.name === name && importedFrom(n.from));
        expect(entry, `${f}: ${name} is not an approved notice imported from its module`).toBeTruthy();
        expect(entry!.kind, `${f}: ${name}`).toBe(kind);
      }
      // a use that does not render a constant straight away would escape the check above
      const all = [...src.matchAll(/\{\.\.\.notice\(/g)].length;
      const checked = [...src.matchAll(/notice\('(\w+)'\)\}[^>]*>\s*\{(\w+)\}/g)].length;
      expect(all, `${f}: every notice(...) must render an approved constant as its first child`).toBe(checked);
      expect(/data-notice=/.test(src), `${f}: data-notice is set only through notice()`).toBe(false);
    }
    expect(uses).toBeGreaterThanOrEqual(10);
  });
  it('each approved constant exists in its module, word for word as the screen shows it', async () => {
    for (const n of APPROVED_NOTICES) {
      const mod = await import(n.from.replace('@/', '../../'));
      expect(typeof mod[n.name], `${n.from} ${n.name}`).toBe('string');
    }
  });
});
