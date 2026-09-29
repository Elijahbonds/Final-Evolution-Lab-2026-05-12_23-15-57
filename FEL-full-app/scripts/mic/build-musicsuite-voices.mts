// MUSIC-SUITE P8 (2026-09-25): Stoop's (the Cypher) and Professor Okta's (the Academy) lines
// (lib/babylon/audio/mic/script/stoop.ts, okta.ts) rendered offline with Kokoro into
// public/audio/voice/v1/stoop/dance.{json,<hash>.bin} and .../okta/academy.{json,<hash>.bin} — the same bank format
// VoiceKit already plays (VoiceKit.load({cast,group}), VoiceKit.play({cast,clips:['<cast>/<line id>'],…})).
//
//   node node_modules/tsx/dist/cli.mjs scripts/mic/build-musicsuite-voices.mts [--dry] [--only stoop,okta]
//
// Its own job file (KOKORO_HOME/job-musicsuite-voices.json) and its own two output directories: THE MIC's hoops
// scripts, banks and contracts (build-mic.mts, cast.ts, CAST) are not touched, the same separation
// scripts/mic/build-brainbrawl-voice.mts drew for DOC VOLT. The renderer (tools/voice/render-mic.py) and the Kokoro
// install (KOKORO_HOME, default ~/.cache/fel-kokoro, outside the repo) are the same; its clip cache means a re-run
// only voices the lines that changed, and running this script never re-voices — let alone repacks — a single hoops
// bank.
//
// Bank size (the task's own budget: "keep these two under ~6 MB together at 32 kbps"): this prints each bank's
// output size on disk after the render, in the same line the hoops build's own log does.
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
import * as stoopNs from '../../lib/babylon/audio/mic/script/stoop.ts';
import * as oktaNs from '../../lib/babylon/audio/mic/script/okta.ts';
// the app's modules load as CommonJS under tsx: the named exports sit on the default (build-brainbrawl-voice.mts's
// own `unwrap`, copied rather than imported — this script stays runnable standalone, like that one)
const unwrap = <T,>(ns: T): T => ((ns as unknown as { default?: T }).default ?? ns);
const { STOOP, STOOP_LINES } = unwrap(stoopNs);
const { OKTA, OKTA_LINES } = unwrap(oktaNs);

const HOME = process.env.KOKORO_HOME ?? join(homedir(), '.cache/fel-kokoro');
const OUT = join(process.cwd(), 'public/audio/voice/v1');
const args = process.argv.slice(2);
const only = args.includes('--only') ? new Set(args[args.indexOf('--only') + 1].split(',')) : null;
const dry = args.includes('--dry');

const CASTS = [
  { id: STOOP.id, name: 'STOOP', voice: STOOP.voice, group: STOOP.group, lines: STOOP_LINES },
  { id: OKTA.id, name: 'PROFESSOR OKTA', voice: OKTA.voice, group: OKTA.group, lines: OKTA_LINES },
].filter((c) => !only || only.has(c.id));

const job = {
  casts: CASTS.map((c) => ({
    id: c.id,
    voice: c.voice,
    kbps: 32,   // the task's own budget target — the crowd renders at 24 in THE MIC; these two are the only voice in
                // their room, so 32 (THE MIC's MC rate) reads clean without ballooning past ~6 MB for both banks
    lines: c.lines.map((l) => ({ id: l.id, moment: l.moment, text: l.text, group: c.group })),
    groups: [c.group],
  })),
};
const jobPath = join(HOME, 'job-musicsuite-voices.json');
writeFileSync(jobPath, JSON.stringify(job));
for (const c of CASTS) console.log(`${c.name}: ${c.lines.length} lines -> ${OUT}/${c.id}/${c.group}.*`);
if (dry) process.exit(0);

const r = spawnSync(join(HOME, '.venv/bin/python'), ['tools/voice/render-mic.py', jobPath, OUT], { stdio: 'inherit', env: { ...process.env, KOKORO_HOME: HOME } });
if (r.status) process.exit(r.status);

let total = 0;
for (const c of CASTS) {
  const idxPath = join(OUT, c.id, `${c.group}.json`);
  if (!existsSync(idxPath)) { console.warn(`${c.id}: no ${c.group}.json written`); continue; }
  const idx = JSON.parse(readFileSync(idxPath, 'utf8')) as { bank: string };
  const binPath = idx.bank ? join(OUT, c.id, idx.bank) : null;
  const bytes = binPath && existsSync(binPath) ? statSync(binPath).size : 0;
  total += bytes;
  console.log(`${c.name}: ${(bytes / (1024 * 1024)).toFixed(2)} MB (${idx.bank || 'empty'})`);
}
console.log(`total: ${(total / (1024 * 1024)).toFixed(2)} MB (budget: ~6 MB for both banks together, 32 kbps)`);
