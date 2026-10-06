// import-voices: a provider's rendered takes → the voice bank (IMPROVE 2026-10-06). Provider-neutral: any service that can
// export one audio file per script row, named by the row's id.
//
//   node node_modules/tsx/dist/cli.mjs tools/voice/import-voices.mts <rendered folder> [options]
//
//   --script <dir>        the script CSVs (default tools/voice/script)
//   --only <voice,...>    import only these voices' rows
//   --check               plan only: which files are there, missing, unexpected (converts nothing; runs anywhere)
//   --allow-missing       import what is there even when some rows have no file (default: stop and list them)
//   --export <voice>      write tools/voice/script/revoice/<voice>.csv: every EXISTING line of that voice, to re-voice it whole
//
// What an import does (every step is reported):
//   1. reads every row of the script, matches the folder's files to the rows' ids (case and extension aside), and stops if any
//      expected id is missing, doubled or misspelt — unless --allow-missing;
//   2. decodes each take to 24 kHz mono (afconvert on a Mac, else ffmpeg), trims the silence a provider leaves at the ends and
//      fades 8 ms (render-mic.py's level()), measures its loudness with tools/voice/measure-loudness.py (ITU-R BS.1770) and levels
//      it to -19 LUFS (loudness.ts TARGET_LUFS) with peaks under -1 dBFS;
//   3. encodes AAC in .m4a like every other clip (32 kbps; 24 for the crowd), decodes it again and measures the result: that
//      `lufs` / `peak` / `sec` is what goes in the bank index;
//   4. rebuilds each touched bank (public/audio/voice/v1/<voice>/<group>.<hash>.bin + <group>.json): a re-voiced id is replaced
//      in place, a new id appended, every other clip untouched;
//   5. adds the line to the voice's script JSON (lib/babylon/audio/mic/script/<voice>.json) so a Kokoro re-render keeps it, keeps
//      the levelled take in the takes store (FEL_VOICE_TAKES, default ~/.cache/fel-voice/takes/<voice>/<line id>.m4a; build-mic.mts
//      passes it to the renderer, so a re-render plays the provider's take, not Kokoro), and writes each touched voice's median
//      loudness into lib/babylon/audio/voice/loudness.ts (MEASURED_CAST_LUFS);
//   6. prints the report: what was imported, replaced and added, every take over its max seconds or far from the target, and the
//      hand steps (a Brain Brawl host line must also be added to lib/babylon/party/brainBrawlLines.ts).
// No network. No new dependency: node's fs / crypto / child_process, and the measure-loudness.py venv (numpy, soundfile) the
// renderer already uses (KOKORO_HOME/.venv, or VOICE_PYTHON).
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, copyFileSync, unlinkSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import * as scriptNs from '../../lib/babylon/audio/voice/voiceScript.ts';
import * as castNs from '../../lib/babylon/audio/mic/cast.ts';
import * as loudNs from '../../lib/babylon/audio/voice/loudness.ts';
import type { ScriptFile } from '../../lib/babylon/audio/mic/scriptRules.ts';
import type { BankIndexFile, ScriptRow, Take } from '../../lib/babylon/audio/voice/voiceScript.ts';
// the app's modules load as CommonJS under tsx: the named exports sit on the default
const unwrap = <T,>(ns: T): T => ((ns as unknown as { default?: T }).default ?? ns);
const S = unwrap(scriptNs);
const { CAST } = unwrap(castNs);
const { TARGET_LUFS, MAX_CLIP_TRIM_DB } = unwrap(loudNs);

const args = process.argv.slice(2);
const opt = (k: string): string | undefined => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const APP = process.cwd();
const SCRIPT_DIR = join(APP, opt('--script') ?? 'tools/voice/script');
const only = opt('--only') ? new Set(opt('--only')!.split(',')) : null;
const KOKORO = process.env.KOKORO_HOME ?? join(homedir(), '.cache/fel-kokoro');
const TAKES = process.env.FEL_VOICE_TAKES ?? join(homedir(), '.cache/fel-voice/takes');
const LOUDNESS_TS = join(APP, 'lib/babylon/audio/voice/loudness.ts');
const die = (msg: string): never => { console.error(msg); process.exit(1); };
const have = (bin: string): boolean => spawnSync('sh', ['-c', `command -v ${bin}`], { encoding: 'utf8' }).status === 0;
const hash10 = (b: Uint8Array): string => createHash('sha1').update(b).digest('hex').slice(0, 10);

function readScript(): ScriptRow[] {
  if (!existsSync(SCRIPT_DIR)) die(`no script folder at ${SCRIPT_DIR}`);
  const rows: ScriptRow[] = [];
  for (const f of readdirSync(SCRIPT_DIR).filter((x) => x.endsWith('.csv')).sort()) rows.push(...S.rowsFromCsv(readFileSync(join(SCRIPT_DIR, f), 'utf8'), f));
  const seen = new Set<string>();
  for (const r of rows) { if (seen.has(r.id.toLowerCase())) die(`the script has ${r.id} twice`); seen.add(r.id.toLowerCase()); }
  return only ? rows.filter((r) => only.has(r.voice)) : rows;
}
const indexPath = (voice: string, group: string): string => join(APP, S.VOICE_ROOT, voice, `${group}.json`);
function loadIndex(voice: string, group: string): { index: BankIndexFile; blob: Uint8Array } {
  const p = indexPath(voice, group);
  if (!existsSync(p)) return { index: { cast: voice, group, bank: '', lines: [] }, blob: new Uint8Array(0) };
  const index = JSON.parse(readFileSync(p, 'utf8')) as BankIndexFile;
  const bin = index.bank ? join(dirname(p), index.bank) : '';
  return { index, blob: bin && existsSync(bin) ? new Uint8Array(readFileSync(bin)) : new Uint8Array(0) };
}

// ── --export <voice> ─────────────────────────────────────────────────────────────────────────────────────────────────
if (opt('--export')) {
  const voice = opt('--export')!;
  const dir = join(APP, S.VOICE_ROOT, voice);
  if (!existsSync(dir)) die(`no voice ${voice} under ${S.VOICE_ROOT}`);
  const indexes = readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as BankIndexFile);
  const persona = CAST.find((c) => c.id === voice)?.name ?? voice.toUpperCase();
  const rows = S.exportRows(voice, persona, () => '(as today)', indexes);
  const out = join(SCRIPT_DIR, 'revoice', `${voice}.csv`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, S.scriptToCsv(rows));
  console.log(`${rows.length} lines → ${out}. Render them all with ONE provider voice, then import with --script ${dirname(out)}.`);
  process.exit(0);
}

// ── plan ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
const VALUED = new Set(['--script', '--only', '--export']);
const folder = args.find((a, i) => !a.startsWith('--') && !(i > 0 && VALUED.has(args[i - 1])));
if (!folder || !existsSync(folder)) die('usage: import-voices.mts <rendered folder> [--script dir] [--only voices] [--check] [--allow-missing] | --export <voice>');
const rows = readScript();
for (const r of rows) {
  const t = S.parseTarget(r.target), id = S.splitFileId(r.id);
  if (!t || !id || t.voice !== r.voice || id.voice !== r.voice || t.lineId !== id.lineId) die(`${r.id}: its id and target (${r.target}) disagree`);
}
const plan = S.planImport(rows, readdirSync(folder!));
console.log(`script: ${rows.length} lines in ${SCRIPT_DIR}; folder: ${plan.found.length} found, ${plan.missing.length} missing, ${plan.unexpected.length} unexpected, ${plan.duplicates.length} doubled`);
const problems = S.planProblems(plan);
for (const p of problems) console.log(p);
if (args.includes('--check')) process.exit(plan.missing.length || plan.duplicates.length || plan.unexpected.length ? 1 : 0);
if (plan.duplicates.length) die('fix the doubled files first');
if (plan.missing.length && !args.includes('--allow-missing')) die('stopping: some lines have no file (render them, or pass --allow-missing to import the rest)');
if (!plan.found.length) die('nothing to import');

// ── convert, level, measure ──────────────────────────────────────────────────────────────────────────────────────────
const tool = have('afconvert') ? 'afconvert' : have('ffmpeg') ? 'ffmpeg' : die('needs afconvert (macOS) or ffmpeg to convert audio');
const py = process.env.VOICE_PYTHON ?? (existsSync(join(KOKORO, '.venv/bin/python')) ? join(KOKORO, '.venv/bin/python') : 'python3');
const run = (cmd: string, a: string[]): void => { const r = spawnSync(cmd, a, { encoding: 'utf8' }); if (r.status !== 0) die(`${cmd} ${a.join(' ')}\n${r.stderr}`); };
const toWav = (src: string, dst: string): void => tool === 'afconvert'
  ? run('afconvert', ['-f', 'WAVE', '-d', 'LEI16@24000', '-c', '1', src, dst])
  : run('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le', dst]);
const toM4a = (src: string, dst: string, kbps: number): void => tool === 'afconvert'
  ? run('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', String(kbps * 1000), src, dst])
  : run('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-ac', '1', '-ar', '24000', '-c:a', 'aac', '-b:a', `${kbps}k`, '-f', 'ipod', dst]);
function measure(files: string[]): Map<string, { lufs: number; peak: number; sec: number }> {
  const r = spawnSync(py, [join(APP, 'tools/voice/measure-loudness.py'), '--files', ...files], { encoding: 'utf8', maxBuffer: 64 << 20 });
  if (r.status !== 0) die(`measure-loudness.py failed (it needs numpy and soundfile: render-mic's venv at ${KOKORO}/.venv, or VOICE_PYTHON)\n${r.stderr}`);
  const out = new Map<string, { lufs: number; peak: number; sec: number }>();
  for (const line of r.stdout.split('\n').filter(Boolean)) { const j = JSON.parse(line); out.set(j.file, j); }
  return out;
}

const tmp = mkdtempSync(join(tmpdir(), 'fel-voice-import-'));
const kbpsOf = (voice: string): number => (CAST.find((c) => c.id === voice)?.role === 'crowd' ? 24 : 32);
const work = plan.found.map(({ row, file }, i) => ({ row, src: join(folder!, file), raw: join(tmp, `${i}.raw.wav`), lvl: join(tmp, `${i}.lvl.wav`), m4a: join(tmp, `${i}.m4a`), back: join(tmp, `${i}.back.wav`), gain: 0, before: 0 }));
try {
  for (const w of work) {
    toWav(w.src, w.raw);
    const { rate, samples } = S.parseWav(new Uint8Array(readFileSync(w.raw)));
    writeFileSync(w.raw, S.encodeWav16(S.trimAndFade(samples, rate), rate));
  }
  const pre = measure(work.map((w) => w.raw));
  for (const w of work) {
    const m = pre.get(w.raw)!;
    w.before = m.lufs;
    w.gain = S.gainToTarget(m.lufs, m.peak, TARGET_LUFS);
    const { rate, samples } = S.parseWav(new Uint8Array(readFileSync(w.raw)));
    writeFileSync(w.lvl, S.encodeWav16(S.applyGainDb(samples, w.gain), rate));
    toM4a(w.lvl, w.m4a, kbpsOf(w.row.voice));
    toWav(w.m4a, w.back);
  }
  const post = measure(work.map((w) => w.back));

  // ── the banks, the scripts, the takes store, the loudness table ──────────────────────────────────────────────────
  const warnings: string[] = [], manual: string[] = [];
  const byBank = new Map<string, Take[]>();
  for (const w of work) {
    const m = post.get(w.back)!;
    const t = S.parseTarget(w.row.target)!;
    const take: Take = {
      id: t.lineId, moment: w.row.moment, text: w.row.text, ...(w.row.tier !== undefined ? { tier: w.row.tier } : {}),
      ...(w.row.tags.length ? { tags: w.row.tags } : {}), ...(w.row.match ? { match: w.row.match } : {}),
      bytes: new Uint8Array(readFileSync(w.m4a)), sec: m.sec, lufs: m.lufs, peak: m.peak,
    };
    const key = `${t.voice}/${t.group}`;
    byBank.set(key, [...(byBank.get(key) ?? []), take]);
    warnings.push(...S.takeWarnings(w.row, m, TARGET_LUFS, MAX_CLIP_TRIM_DB));
    const store = join(TAKES, t.voice);
    mkdirSync(store, { recursive: true });
    copyFileSync(w.m4a, join(store, `${t.lineId}.m4a`));
    console.log(`  ${w.row.id}: ${w.before.toFixed(1)} LUFS, ${w.gain >= 0 ? '+' : ''}${w.gain.toFixed(1)} dB → ${m.lufs.toFixed(1)} LUFS, peak ${m.peak.toFixed(1)}, ${m.sec.toFixed(2)} s`);
  }
  const touched = new Set<string>();
  for (const [key, takes] of byBank) {
    const [voice, group] = key.split('/');
    const { index, blob } = loadIndex(voice, group);
    const r = S.rebuildBank(index, blob, takes, hash10);
    const dir = join(APP, S.VOICE_ROOT, voice);
    mkdirSync(dir, { recursive: true });
    if (r.index.bank) writeFileSync(join(dir, r.index.bank), r.blob);
    if (index.bank && index.bank !== r.index.bank && existsSync(join(dir, index.bank))) unlinkSync(join(dir, index.bank));
    writeFileSync(indexPath(voice, group), S.indexJson(r.index));
    console.log(`${key}: ${r.added.length} added, ${r.replaced.length} replaced → ${r.index.bank} (${r.index.lines.length} lines)`);
    touched.add(voice);
    // the script the renderer reads, so a re-render keeps the line
    const src = S.TS_SOURCED[voice];
    if (src) {
      for (const t of takes) manual.push(`${voice}: add "${t.text}" to ${src.path} under '${t.moment}' (its id must come out as ${t.id})`);
      continue;
    }
    const sp = join(APP, 'lib/babylon/audio/mic/script', `${voice}.json`);
    if (!existsSync(sp)) { manual.push(`${voice}: no script JSON at ${sp}: add the lines by hand`); continue; }
    let file = JSON.parse(readFileSync(sp, 'utf8')) as ScriptFile;
    for (const t of takes) file = S.upsertScriptLine(file, { id: t.id, moment: t.moment, text: t.text, tier: t.tier, tags: t.tags, match: t.match }).file;
    writeFileSync(sp, S.scriptJson(file));
  }
  const table = S.readMeasuredTable(readFileSync(LOUDNESS_TS, 'utf8'));
  for (const voice of touched) {
    const dir = join(APP, S.VOICE_ROOT, voice);
    const lufs = readdirSync(dir).filter((f) => f.endsWith('.json'))
      .flatMap((f) => (JSON.parse(readFileSync(join(dir, f), 'utf8')) as BankIndexFile).lines.map((l) => l.lufs))
      .filter((x): x is number => typeof x === 'number');
    const med = S.median(lufs);
    if (med !== null) table[voice] = med;
  }
  writeFileSync(LOUDNESS_TS, S.writeMeasuredTable(readFileSync(LOUDNESS_TS, 'utf8'), table));

  console.log(`\nimported ${work.length} take(s) into ${byBank.size} bank(s); takes kept in ${TAKES}`);
  if (plan.missing.length) console.log(`NOT imported (no file): ${plan.missing.length}; the browser voice keeps saying those page lines`);
  if (warnings.length) { console.log(`\nWARNINGS (${warnings.length}):`); for (const w of warnings) console.log(`  ${w}`); }
  if (manual.length) { console.log(`\nBY HAND (${manual.length}):`); for (const m of manual) console.log(`  ${m}`); }
  console.log('\nNext: npx vitest run lib/babylon/audio, then listen in the game (docs: tools/voice/README.md).');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
