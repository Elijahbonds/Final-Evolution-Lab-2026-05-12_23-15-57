// BRAINBRAWL-RESIDUAL (2026-09-24): Brain Brawl's host, voiced — DOC VOLT's lines (lib/babylon/party/brainBrawlLines.ts) rendered
// offline with Kokoro into public/audio/voice/v1/bb_host/quiz.{json,<hash>.bin}, the bank format VoiceKit already plays.
//
//   node node_modules/tsx/dist/cli.mjs scripts/mic/build-brainbrawl-voice.mts [--dry]
//
// Its own job file and its own cast directory: the hoops mic's scripts, banks and contracts (build-mic.mts) are not touched.
// The renderer (tools/voice/render-mic.py) and the Kokoro install (KOKORO_HOME, default ~/.cache/fel-kokoro, outside the repo) are
// the same; the clip cache there means a re-run only voices the lines that changed.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
import * as linesNs from '../../lib/babylon/party/brainBrawlLines.ts';
const unwrap = <T,>(ns: T): T => ((ns as unknown as { default?: T }).default ?? ns);   // the app's modules load as CommonJS under tsx
const { BB_HOST, HOST_LINES } = unwrap(linesNs);

const HOME = process.env.KOKORO_HOME ?? join(homedir(), '.cache/fel-kokoro');
const OUT = join(process.cwd(), 'public/audio/voice/v1');
const lines = HOST_LINES.map((l) => ({ id: l.id, moment: l.moment, text: l.text, group: BB_HOST.group }));
const job = join(HOME, 'job-brainbrawl.json');
writeFileSync(job, JSON.stringify({ casts: [{ id: BB_HOST.cast, voice: BB_HOST.voice, kbps: 32, lines, groups: [BB_HOST.group] }] }));
console.log(`${BB_HOST.name}: ${lines.length} lines → ${OUT}/${BB_HOST.cast}`);
if (process.argv.includes('--dry')) process.exit(0);
const r = spawnSync(join(HOME, '.venv/bin/python'), ['tools/voice/render-mic.py', job, OUT], { stdio: 'inherit', env: { ...process.env, KOKORO_HOME: HOME } });
process.exit(r.status ?? 1);
