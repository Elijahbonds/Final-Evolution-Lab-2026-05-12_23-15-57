// MUSIC-SUITE P5 (2026-09-25), "The Flip, for real": the IP rule, held by a test.
//
// All audio the Academy ships is FEL-generated, public-domain with a signed note, or the player's own — never third-party.
// Before this phase the rule lived in comments (Flip.ts:4-6). Now every file under the MUSIC roots must have a record
// that says where it came from, and the record is checked against the bytes:
//   · every file has exactly one PROVENANCE entry (the root's PROVENANCE.json), whose sha256 matches the file;
//   · every entry's licence is 'FEL original, generated';
//   · no entry points outside the repo: files are paths inside their root, generator scripts are repo paths (never an
//     absolute path on somebody's machine), and each script — and every module on its render path — is the exact file
//     in the repo that made the audio (sha256), so the pack can be rebuilt from here (scripts/music/flip-pack/README.md);
//   · MUSIC-SUITE P5 FIX PASS (2026-09-25): the render path is RECOMPUTED here (scripts/music/flip-pack/renderPath.ts,
//     the finisher's sys.path: songgen/ then flippack/) and must equal the record. It followed songgen/ only, so
//     flippack/onsets_check.py — every chop's resample and envelope — was on no record, and the repo copy had been edited
//     after the renders; now it is on every entry, keyed by repo path, and is the file that rendered (install-pack.ts
//     checks it against the pack folder's copy the renders imported);
//   · an entry for a file that isn't there fails too (a record that outlived its file).
// Index files the root's PROVENANCE.json names in `indexFiles` (the Flip pack's pack.json, whose themeDefault line is the
// owner's one-line theme switch) are not hashed; pack.json's items are instead checked one by one against the record.
//
// SCOPE: the MUSIC sources only — public/audio/flip/** now, public/audio/songs/** when phase 7 brings the six songs (the
// same rules; the test starts holding it the day the folder exists). Never public/audio/voice/**: other lanes render
// the MC and coach voices there, under their own records.

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderPath, sortedPath } from '../../../scripts/music/flip-pack/renderPath';

const APP = path.resolve(__dirname, '../../..');
const MUSIC_ROOTS = ['public/audio/flip', 'public/audio/songs'];
const LICENCE = 'FEL original, generated';

type Obj = Record<string, unknown>;
interface Entry extends Obj { file?: string; path?: string; sha256?: string; licence?: string; script?: string; scriptSha256?: string; renderPath?: Record<string, string>; dsp?: { script?: string; sha256?: string } }
const sha = (p: string): string => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
const inside = (root: string, p: string): boolean => { const r = path.relative(root, p); return !!r && !r.startsWith('..') && !path.isAbsolute(r); };
/** Every string in a JSON value, with where it is. */
const strings = (v: unknown, at = '$'): [string, string][] =>
  typeof v === 'string' ? [[at, v]] : Array.isArray(v) ? v.flatMap((x, i) => strings(x, `${at}[${i}]`))
    : v && typeof v === 'object' ? Object.entries(v).flatMap(([k, x]) => strings(x, `${at}.${k}`)) : [];
/**
 * A string that names a place on a machine rather than in the repo. MUSIC-SUITE P5 FIX PASS: a home-relative path too
 * (`~/…` — the public record shipped kokoroLocal.dir = "~/.cache/fel-kokoro", and this check let it through).
 */
const machinePath = (s: string): boolean => /^\//.test(s) || /^[A-Za-z]:[\\/]/.test(s) || /(^|\/)\.\.(\/|$)/.test(s) || /\/(Users|home)\//.test(s) || /(^|\s)~[\\/]/.test(s);

const roots = MUSIC_ROOTS.filter((r) => fs.existsSync(path.join(APP, r)));

describe('music provenance: the roots it covers', () => {
  it('covers the Flip pack today (and the songs folder when it arrives), never the voice folder', () => {
    expect(roots).toContain('public/audio/flip');
    expect(MUSIC_ROOTS.some((r) => r.includes('voice'))).toBe(false);
  });
});

describe.each(roots)('music provenance: %s', (root) => {
  const dir = path.join(APP, root);
  const recPath = path.join(dir, 'PROVENANCE.json');
  const rec = fs.existsSync(recPath) ? JSON.parse(fs.readFileSync(recPath, 'utf8')) as Obj & { files?: Entry[]; indexFiles?: Obj } : null;
  const entries = rec?.files ?? [];
  const index = new Set(['PROVENANCE.json', ...Object.keys(rec?.indexFiles ?? {})]);
  const fileOf = (e: Entry): string => String(e.file ?? e.path ?? '');

  it('has a PROVENANCE.json with entries', () => {
    expect(rec, `${root}/PROVENANCE.json is missing`).not.toBeNull();
    expect(entries.length).toBeGreaterThan(0);
  });

  it('every file has exactly one entry whose sha256 matches, licensed "FEL original, generated"', () => {
    const files = walk(dir).map((f) => path.relative(dir, f).split(path.sep).join('/')).filter((f) => !index.has(f) && !f.endsWith('.DS_Store'));
    const bad: string[] = [];
    for (const f of files) {
      const mine = entries.filter((e) => fileOf(e) === f);
      if (mine.length !== 1) { bad.push(`${f}: ${mine.length} entries`); continue; }
      if (mine[0].sha256 !== sha(path.join(dir, f))) bad.push(`${f}: sha256 does not match the file`);
      if (mine[0].licence !== LICENCE) bad.push(`${f}: licence ${JSON.stringify(mine[0].licence)}`);
    }
    expect(bad).toEqual([]);
    expect(files.length).toBe(entries.length);   // and no entry without its file
  });

  it('no entry points outside the repo: files inside the root, scripts repo paths that exist and made the audio', () => {
    const bad: string[] = [];
    for (const e of entries) {
      const f = fileOf(e);
      if (machinePath(f) || !inside(dir, path.join(dir, f)) || !fs.existsSync(path.join(dir, f))) bad.push(`${f}: file outside the root or missing`);
      const scripts: [string | undefined, string | undefined][] = [[e.script, e.scriptSha256], [e.dsp?.script, e.dsp?.sha256]];
      for (const [s, want] of scripts) {
        if (s === undefined && want === undefined) continue;
        if (typeof s !== 'string' || machinePath(s) || !inside(APP, path.join(APP, s)) || !fs.existsSync(path.join(APP, s))) { bad.push(`${f}: script ${String(s)} is not a file in the repo`); continue; }
        if (sha(path.join(APP, s)) !== want) bad.push(`${f}: ${s} is not the script that rendered it`);
        // MUSIC-SUITE P5 FIX PASS: render-path keys are REPO paths (resolved from the app root, not beside the script)
        for (const [mod, h] of Object.entries(s === e.script ? e.renderPath ?? {} : {})) {
          const p = path.join(APP, mod);
          if (machinePath(mod) || !inside(APP, p)) { bad.push(`${f}: render-path module ${mod} is not a repo path`); continue; }
          if (!fs.existsSync(p) || sha(p) !== h) bad.push(`${f}: render-path module ${mod} is not in the repo as it was`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('the render path is complete: recomputed along the finisher\'s sys.path, it is exactly the record', () => {
    const bad: string[] = [];
    for (const e of entries) {
      if (typeof e.script !== 'string' || !e.renderPath) continue;
      const now = JSON.stringify(sortedPath(renderPath(e.script, APP)));
      if (now !== JSON.stringify(sortedPath(e.renderPath))) bad.push(`${fileOf(e)}: recorded ${JSON.stringify(sortedPath(e.renderPath))} vs now ${now}`);
    }
    expect(bad).toEqual([]);
  });

  it('the record and the index files name no place on a machine', () => {
    const texts = [...index].filter((f) => fs.existsSync(path.join(dir, f))).map((f) => [f, JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))] as const);
    const bad = texts.flatMap(([f, json]) => strings(json).filter(([, s]) => machinePath(s)).map(([at, s]) => `${f} ${at}: ${s}`));
    expect(bad).toEqual([]);
  });
});

describe('the Flip pack index agrees with its record', () => {
  const dir = path.join(APP, 'public/audio/flip');
  const pack = JSON.parse(fs.readFileSync(path.join(dir, 'pack.json'), 'utf8')) as { licence: string; items: (Obj & { id: string; file: string; provenance: Entry })[] };
  const rec = JSON.parse(fs.readFileSync(path.join(dir, 'PROVENANCE.json'), 'utf8')) as { files: (Entry & { id: string })[] };

  it('the same items, and for each the same file, hash, script, seed and licence', () => {
    expect(pack.licence).toBe(LICENCE);
    expect(pack.items.map((i) => i.id).sort()).toEqual(rec.files.map((f) => f.id).sort());
    for (const it of pack.items) {
      const e = rec.files.find((f) => f.id === it.id)!;
      expect({ id: it.id, file: it.file, sha256: it.provenance.sha256, script: it.provenance.script, seed: it.provenance.seed, licence: it.provenance.licence })
        .toEqual({ id: e.id, file: e.file, sha256: e.sha256, script: e.script, seed: e.seed, licence: e.licence });
    }
  });

  it('every chop voice is Kokoro run locally (Apache-2.0 weights), with the words it says on record', () => {
    for (const e of rec.files.filter((f) => f.id.startsWith('chop_'))) {
      const k = e.kokoro as Obj | undefined;
      expect(k?.model, e.id).toMatch(/Kokoro-82M .*Apache-2\.0/);
      expect(typeof k?.text, e.id).toBe('string');
    }
  });

  // MUSIC-SUITE P5 FIX PASS (2026-09-25): the pack statement promises the chops voice "no real person" (decision #19's
  // lens depends on it), and only the TYPE of the words was checked — a re-render that voiced a name would pass. The words
  // are pinned: a new one needs a deliberate change here.
  it('the chops say only FEL\'s own words (nothing voiced names a person)', () => {
    const WORDS = new Set(['hey', 'uh', 'yeah', 'go', "let's", 'one', 'two', 'check', 'it', 'f', 'e', 'l', 'ooh']);
    const bad: string[] = [];
    for (const e of rec.files.filter((f) => f.id.startsWith('chop_'))) {
      const text = String((e.kokoro as Obj | undefined)?.text ?? '');
      for (const segment of text.split('|')) {
        for (const w of segment.toLowerCase().replace(/[^a-z'\s]/g, ' ').split(/\s+/).filter(Boolean)) if (!WORDS.has(w)) bad.push(`${e.id}: "${w}"`);
      }
    }
    expect(bad).toEqual([]);
    expect(rec.files.filter((f) => f.id.startsWith('chop_'))).toHaveLength(39);
  });
});
