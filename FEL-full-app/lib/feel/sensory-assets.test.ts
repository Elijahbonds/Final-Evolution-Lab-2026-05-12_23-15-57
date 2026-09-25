// HOTFIX (2026-09-24): every audio URL the feel cores reference has to be a real file under public/.
//
// Twelve preset tables in lib/feel/cores, plus KARATE_SFX and DUNK_SENSORY_SFX, pointed at six /audio/sfx_*.mp3
// files that were never in the repo, under a SensoryBus header that said the app ships them. Only KARATE_SFX was
// ever handed to a bus as a map, and the bus swallowed its failed fetch; the preset tables were never fetched at
// all, because they put a URL where the bus wants a map NAME. Either way the game was silent and nothing said so.
// This file is the guard: it loads every module in lib/feel/cores, walks what each one exports, and fails on any
// audio URL that does not resolve under public/. A second pass reads the source of the whole app (app/, components/,
// lib/, hooks/), so a URL buried inside a function (never exported), or a host outside lib/feel that builds its own
// bus map, is caught too.

import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const APP = join(__dirname, '..', '..');
const PUBLIC = join(APP, 'public');
const FEEL = __dirname;
const CORES = join(FEEL, 'cores');
/** Every source root the app ships from (scripts/ and the archive are not the app). */
const SOURCE_ROOTS = ['app', 'components', 'lib', 'hooks'].map((d) => join(APP, d)).filter((d) => existsSync(d));

const AUDIO_EXT = /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|webm)$/i;

/** A string that is a site-relative audio URL (the only kind the bus can fetch from public/). */
function isAudioUrl(s: string): boolean {
  return s.startsWith('/') && AUDIO_EXT.test(s.split('?')[0]);
}

/** Where a site-relative URL lands on disk, or null when it is not a public/ file. */
function publicFile(url: string): string {
  return join(PUBLIC, url.split('?')[0].replace(/^\/+/, ''));
}

/** Every string reachable from a module's exports, with the path it was found at. */
function collectStrings(value: unknown, where: string, out: { where: string; value: string }[], seen = new Set<unknown>()): void {
  if (typeof value === 'string') { out.push({ where, value }); return; }
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) collectStrings(v, `${where}.${k}`, out, seen);
}

/** The audio URLs among them, and which of those are missing from public/. */
function audit(strings: { where: string; value: string }[]): { urls: { where: string; value: string }[]; missing: string[] } {
  const urls = strings.filter((s) => isAudioUrl(s.value) || (/\.sfx$/.test(s.where) && s.value.startsWith('/')));
  const missing = urls.filter((u) => !existsSync(publicFile(u.value))).map((u) => `${u.where} → ${u.value}`);
  return { urls, missing };
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(name) && !/\.test\.[jt]sx?$/.test(name)) out.push(p);
  }
  return out;
}

describe('the audit itself is not vacuous', () => {
  it('finds a dead URL and passes a real one', () => {
    // A real file in public/ (the 808 kit) and one of the six that never existed.
    expect(existsSync(join(PUBLIC, 'audio', 'kits', '808', 'kick.wav'))).toBe(true);
    const found: { where: string; value: string }[] = [];
    collectStrings({ SENSORY: { land: { sfx: '/audio/sfx_punch_impact.mp3', shake: 0.1 } }, KIT: ['/audio/kits/808/kick.wav'] }, 'fixture', found);
    const r = audit(found);
    expect(r.urls.map((u) => u.value).sort()).toEqual(['/audio/kits/808/kick.wav', '/audio/sfx_punch_impact.mp3']);
    expect(r.missing).toEqual(['fixture.SENSORY.land.sfx → /audio/sfx_punch_impact.mp3']);
  });

  it('treats an extension-less path in an sfx field as a URL too', () => {
    const found: { where: string; value: string }[] = [];
    collectStrings({ P: { hit: { sfx: '/audio/nowhere' } } }, 'fixture', found);
    expect(audit(found).missing).toEqual(['fixture.P.hit.sfx → /audio/nowhere']);
  });
});

describe('every audio URL the feel cores reference exists under public/', () => {
  const coreFiles = readdirSync(CORES).filter((f) => /\.ts$/.test(f) && !/\.test\.ts$/.test(f)).sort();

  // The anti-slip property is the export audit below importing EVERY file in cores/; this only proves there is
  // something for it to audit (16 *-constants.ts files today).
  it('at least 15 constants modules exist to audit', () => {
    expect(coreFiles.filter((f) => f.endsWith('-constants.ts')).length).toBeGreaterThanOrEqual(15);
  });

  it('what the cores EXPORT: no preset, map or table names a file that is not there', async () => {
    const strings: { where: string; value: string }[] = [];
    for (const f of coreFiles) {
      const mod = (await import(join(CORES, f))) as Record<string, unknown>;
      collectStrings(mod, f.replace(/\.ts$/, ''), strings);
    }
    expect(strings.length).toBeGreaterThan(0);
    expect(audit(strings).missing).toEqual([]);
  });

  it('what the app SOURCE says: no quoted audio path in app/, components/, lib/ or hooks/ points at a missing file', () => {
    const literal = /(['"`])(\/[^'"`\s]*\.(?:mp3|wav|ogg|oga|m4a|aac|flac|opus|webm))\1/gi;
    const missing: string[] = [];
    let scanned = 0;
    let feelScanned = 0;
    let found = 0;
    for (const root of SOURCE_ROOTS) {
      for (const file of sourceFiles(root)) {
        scanned++;
        if (file.startsWith(FEEL)) feelScanned++;
        readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
          if (/^\s*(\/\/|\/?\*)/.test(line)) return;   // a comment may quote a dead or glob path to explain it
          for (const m of line.matchAll(literal)) {
            // a template built at runtime, or a glob, names no single file
            if (m[2].includes('${') || m[2].includes('*')) continue;
            found++;
            if (!existsSync(publicFile(m[2]))) missing.push(`${relative(APP, file)}:${i + 1} → ${m[2]}`);
          }
        });
      }
    }
    expect(feelScanned).toBeGreaterThan(40);   // lib/feel is inside the sweep, not skipped by a path slip
    expect(scanned).toBeGreaterThan(500);
    expect(found).toBeGreaterThan(0);          // the 808 kit literals (music mode, KitPulse) are real matches
    expect(missing).toEqual([]);
  });
});
