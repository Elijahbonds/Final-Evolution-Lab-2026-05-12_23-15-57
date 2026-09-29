// MUSIC-SUITE P5 (2026-09-25): install a built FEL Flip pack into the app (public/audio/flip), in its repo form.
//
// A pack is built OUTSIDE the repo (README.md: the producers + build_pack.py write <pack>/audio/*.mp3 and pack.json,
// each item's provenance naming the absolute path of the script that rendered it). What the app ships must not point
// outside the repo (provenance.test.ts), so this step:
//   1. reads <pack>/pack.json and refuses it unless lib/babylon/music/flipPack.ts parseFlipPack takes every item and
//      bank with no problem (the app's own reader — what ships is what the app reads);
//   2. checks every audio file against its provenance sha256, and every generator against the repo copy under
//      scripts/music/flip-pack/songgen (scriptSha256, fel_synth librarySha256, flip_pack finisherSha256, the chop DSP) —
//      a pack rendered by code the repo doesn't hold is refused, so "rebuild it from the repo" stays true;
//   3. writes public/audio/flip/audio/<id>.mp3 (names kept; any other file there is removed), pack.json with each
//      provenance `script` rewritten to its repo path and `themeDefault` set (owner decision #25: theme_a_sunday_tape),
//      and PROVENANCE.json: one entry per audio file (sha256, script + scriptSha256, seed, date, licence, the library
//      and finisher hashes, `renderPath` = the hash of every local module the script imports, LAME fields, Kokoro
//      voice details for chops). When <pack>/PROVENANCE.json exists (the outbox pack has one), every entry built here
//      must agree with it on the file hash and the render path.
//
// MUSIC-SUITE P5 FIX PASS (2026-09-25): THE RENDER PATH FOLLOWS THE FINISHER'S sys.path (renderPath.ts). It followed
// imports inside songgen/ only, so flippack/onsets_check.py — imported by songgen/flip_pack.py, and on the path of every
// chop (resample, energy_envelope, GATE, MIN_GAP_MS) — was on no record, while the repo copy had been edited after the
// renders. Keys are repo paths now (scripts/music/flip-pack/…), resolved from the app root. The outbox record names
// songgen modules by file name and misses flippack/ (its generator had the same gap): its entries must match ours; a
// flippack module it lacks must be byte-identical to the copy in the pack folder — the file the renders imported
// (flip_pack.py's _REAL_PACK is <songgen>/../flippack). kokoroLocal no longer carries `dir` (a place on a machine; the
// model and voices sha256 identify the weights).
//
//   node node_modules/tsx/dist/cli.mjs scripts/music/flip-pack/install-pack.ts --from <pack dir> [--theme <id>] [--check]
//
// --check verifies without writing. Exit 0 = installed (or would install); 1 = refused, with the reasons.

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseFlipPack } from '@/lib/babylon/music/flipPack';
import { RENDER_DIRS, renderPath, sortedPath } from './renderPath';

const APP = path.resolve(__dirname, '..', '..', '..');
const SONGGEN = path.join(APP, 'scripts/music/flip-pack/songgen');
const REPO_SONGGEN = 'scripts/music/flip-pack/songgen';
const DEFAULT_THEME = 'theme_a_sunday_tape';

type Obj = Record<string, unknown>;
const sha = (p: string): string => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const arg = (name: string): string | undefined => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };

const REPO_FLIPPACK = RENDER_DIRS[1];

function main(): number {
  const from = arg('--from') ?? process.env.FLIPPACK_DIR;
  if (!from) { console.error('usage: install-pack.ts --from <pack dir> [--theme <id>] [--check]'); return 1; }
  const check = process.argv.includes('--check');
  const to = path.join(APP, 'public/audio/flip');
  const fails: string[] = [];

  const raw = JSON.parse(fs.readFileSync(path.join(from, 'pack.json'), 'utf8')) as Obj & { items: Obj[]; themeCandidates: string[] };
  const parsed = parseFlipPack(raw);
  if (!parsed.ok) { console.error('refused: the app cannot read this pack:', parsed.problems.join('; ')); return 1; }
  if (parsed.problems.length) fails.push(...parsed.problems.map((p) => `pack.json: ${p}`));

  // the theme default: --theme, else what the app ships today, else the pack's, else decision #25
  let current: string | null = null;
  try { current = (JSON.parse(fs.readFileSync(path.join(to, 'pack.json'), 'utf8')) as Obj).themeDefault as string | null; } catch { /* first install */ }
  const theme = arg('--theme') ?? current ?? (raw.themeDefault as string | null) ?? DEFAULT_THEME;
  if (!raw.themeCandidates.includes(theme)) fails.push(`--theme ${theme} is not a theme candidate`);

  const outside = fs.existsSync(path.join(from, 'PROVENANCE.json')) ? JSON.parse(fs.readFileSync(path.join(from, 'PROVENANCE.json'), 'utf8')) as { files: Obj[]; kokoroLocal?: Obj } : null;
  const repoScript = (abs: unknown, want: unknown, what: string): string | null => {
    if (typeof abs !== 'string') { fails.push(`${what}: no script`); return null; }
    const base = path.basename(abs);
    const local = path.join(SONGGEN, base);
    if (!fs.existsSync(local)) { fails.push(`${what}: ${base} is not in ${REPO_SONGGEN}`); return null; }
    if (sha(local) !== want) fails.push(`${what}: ${REPO_SONGGEN}/${base} is not the script that rendered it (sha256 differs)`);
    return `${REPO_SONGGEN}/${base}`;
  };
  const libSha = sha(path.join(SONGGEN, 'fel_synth.py'));
  const finSha = sha(path.join(SONGGEN, 'flip_pack.py'));

  const items = raw.items.map((it): Obj & { provenance: Obj } => {
    const prov = { ...(it.provenance as Obj) };
    const file = path.join(from, it.file as string);
    if (!fs.existsSync(file)) fails.push(`${String(it.id)}: ${String(it.file)} is missing`);
    else if (sha(file) !== prov.sha256) fails.push(`${String(it.id)}: audio sha256 differs from its provenance`);
    if (prov.librarySha256 !== libSha) fails.push(`${String(it.id)}: fel_synth.py differs from the one that rendered it`);
    if (prov.finisherSha256 !== finSha) fails.push(`${String(it.id)}: flip_pack.py differs from the one that rendered it`);
    prov.script = repoScript(prov.script, prov.scriptSha256, String(it.id));
    if (prov.dsp && typeof prov.dsp === 'object') {
      const dsp = { ...(prov.dsp as Obj) };
      dsp.script = repoScript(dsp.script, dsp.sha256, `${String(it.id)} dsp`);
      prov.dsp = dsp;
    }
    return { ...it, provenance: prov };
  });

  const entries = items.map((it) => {
    const prov = it.provenance as Obj;
    const script = path.basename(String(prov.script));
    const e: Obj = {
      id: it.id, file: it.file, kind: it.kind, title: it.title,
      bytes: fs.existsSync(path.join(from, it.file as string)) ? fs.statSync(path.join(from, it.file as string)).size : 0,
      samples: it.samples, sha256: prov.sha256, script: prov.script, scriptSha256: prov.scriptSha256, seed: prov.seed,
      date: prov.date, licence: prov.licence, library: prov.library, librarySha256: prov.librarySha256,
      finisher: prov.finisher, finisherSha256: prov.finisherSha256, renderPath: renderPath(`${REPO_SONGGEN}/${script}`, APP), tools: prov.tools, lame: it.lame,
      ...(prov.kokoro ? { kokoro: prov.kokoro } : {}),
      ...(prov.dsp ? { dsp: prov.dsp } : {}),
    };
    const was = outside?.files.find((f) => f.id === it.id);
    if (outside && !was) fails.push(`${String(it.id)}: not in the pack's own PROVENANCE.json`);
    if (was && was.sha256 !== e.sha256) fails.push(`${String(it.id)}: PROVENANCE.json names another file hash`);
    const ours = e.renderPath as Record<string, string>;
    // the pack's record names songgen modules by file name: each must be on our path with the same hash
    for (const [mod, h] of Object.entries((was?.renderPath ?? {}) as Record<string, string>)) {
      const key = mod.includes('/') ? mod : `${REPO_SONGGEN}/${mod}`;
      if (ours[key] !== h) fails.push(`${String(it.id)}: render-path module ${mod} differs from the pack's record`);
    }
    // a flippack module the record lacks (its gap): the repo copy must be the one the renders imported, the pack folder's
    for (const [key, h] of sortedPath(ours)) {
      if (!key.startsWith(`${REPO_FLIPPACK}/`)) continue;
      const rendered = path.join(from, path.basename(key));
      if (!fs.existsSync(rendered)) fails.push(`${String(it.id)}: ${key} is on the render path but the pack folder has no ${path.basename(key)} to check it against`);
      else if (sha(rendered) !== h) fails.push(`${String(it.id)}: ${key} is not the ${path.basename(key)} the pack was rendered with (sha256 differs)`);
    }
    e.renderPath = Object.fromEntries(sortedPath(ours));
    return e;
  });

  const pack = { ...raw, themeDefault: theme, items };
  const counts: Record<string, number> = {};
  for (const e of entries) counts[e.kind as string] = (counts[e.kind as string] ?? 0) + 1;
  const kokoro = outside?.kokoroLocal ?? null;
  const provenance = {
    pack: raw.pack, version: raw.version, date: raw.date, licence: raw.licence, statement: raw.statement,
    installedBy: 'scripts/music/flip-pack/install-pack.ts',
    indexFiles: {
      'pack.json': 'the pack index the app reads (flipPack.ts). Not hashed here: its themeDefault line is the owner\'s one-line theme switch; provenance.test.ts checks every item in it against this record instead.',
      'PROVENANCE.json': 'this record',
    },
    counts, audioBytes: entries.reduce((a, e) => a + (e.bytes as number), 0),
    ...(kokoro ? { kokoroLocal: Object.fromEntries(Object.entries(kokoro).filter(([k]) => k !== 'dir')) } : {}),
    note: 'Every file is rendered by its script with its seed. Scripts live in scripts/music/flip-pack/songgen (byte-identical to the ones that rendered the pack: install-pack.ts refuses otherwise). renderPath hashes every local module the script imports along the finisher\'s sys.path (songgen/, then flippack/ — so flippack/onsets_check.py, whose resample and envelope every chop goes through), keyed by repo path; lib/babylon/music/provenance.test.ts recomputes it.',
    files: entries,
    banks: raw.banks,
  };

  if (fails.length) { console.error(`refused (${fails.length}):\n  ${fails.join('\n  ')}`); return 1; }
  const text = (o: unknown): string => `${JSON.stringify(o, null, 1)}\n`;
  if (check) { console.log(`ok: ${entries.length} files would install, theme default ${theme}`); return 0; }

  fs.mkdirSync(path.join(to, 'audio'), { recursive: true });
  const keep = new Set(items.map((it) => path.basename(it.file as string)));
  for (const f of fs.readdirSync(path.join(to, 'audio'))) if (!keep.has(f)) fs.rmSync(path.join(to, 'audio', f));
  let copied = 0;
  for (const it of items) {
    const src = path.join(from, it.file as string), dst = path.join(to, it.file as string);
    if (fs.existsSync(dst) && sha(dst) === (it.provenance as Obj).sha256) continue;
    fs.copyFileSync(src, dst); copied++;
  }
  fs.writeFileSync(path.join(to, 'pack.json'), text(pack));
  fs.writeFileSync(path.join(to, 'PROVENANCE.json'), text(provenance));
  console.log(`installed: ${entries.length} files (${copied} copied), ${provenance.audioBytes} audio bytes, theme default ${theme} → ${path.relative(APP, to)}`);
  return 0;
}

process.exit(main());
