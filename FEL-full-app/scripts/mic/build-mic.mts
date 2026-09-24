// THE MIC (2026-09-24): the shipped scripts → voiced banks in public/audio/voice/v1, and the recording scripts.
//
//   node node_modules/tsx/dist/cli.mjs scripts/mic/build-mic.mts [--only <cast,cast>] [--dry]
//
// For each cast member (lib/babylon/audio/mic/cast.ts): its script (lib/babylon/audio/mic/script/<cast>.json), plus, for the
// court MCs, the name stingers (lib/babylon/audio/mic/names.ts), each line tagged with the bank it belongs in (the moment's event
// group; the crowd's own bank; the players' chatter bank; the MCs' names). Writes the render job and runs the Kokoro renderer
// (tools/voice/render-mic.py) with the voice tool's own python (KOKORO_HOME, default ~/.cache/fel-kokoro, OUTSIDE the repo).
//
// It also writes a RECORDING SCRIPT per voice to the outbox: every line id and text, grouped by moment, with what the moment is.
// A real person behind a creator card records the same ids in their own voice and their own words.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
import type { ScriptFile } from '../../lib/babylon/audio/mic/scriptRules.ts';
import * as castNs from '../../lib/babylon/audio/mic/cast.ts';
import * as momentsNs from '../../lib/babylon/audio/mic/moments.ts';
import * as namesNs from '../../lib/babylon/audio/mic/names.ts';
// the app's modules load as CommonJS under tsx: the named exports sit on the default
const unwrap = <T,>(ns: T): T => ((ns as unknown as { default?: T }).default ?? ns);
const { CAST } = unwrap(castNs);
const { MOMENTS, CROWD_MOMENTS, PLAYER_MOMENTS, momentSpec } = unwrap(momentsNs);
const { allStingers } = unwrap(namesNs);

const args = process.argv.slice(2);
const only = args.includes('--only') ? new Set(args[args.indexOf('--only') + 1].split(',')) : null;
const dry = args.includes('--dry');
const HOME = process.env.KOKORO_HOME ?? join(homedir(), '.cache/fel-kokoro');
const SCRIPTS = join(process.cwd(), 'lib/babylon/audio/mic/script');
const OUT = join(process.cwd(), 'public/audio/voice/v1');
const RECORD = join(homedir(), 'Claude/outbox/finish-release/mic/recording-scripts');

const groupOf = (moment: string, role: string): string => {
  if (moment === 'name') return 'names';
  if (role === 'crowd') return 'crowd';
  if (role === 'player') return 'chatter';
  return momentSpec(moment)?.group ?? 'shared';
};
const sayOf = (moment: string): string =>
  momentSpec(moment)?.say ?? CROWD_MOMENTS.find((m) => m.id === moment)?.say ?? PLAYER_MOMENTS.find((m) => m.id === moment)?.say ?? (moment === 'name' ? 'A name called right after a line.' : '');

const casts = [];
mkdirSync(RECORD, { recursive: true });
for (const c of CAST) {
  if (only && !only.has(c.id)) continue;
  const path = join(SCRIPTS, `${c.id}.json`);
  if (!existsSync(path)) { console.warn(`no script for ${c.id}`); continue; }
  const script = JSON.parse(readFileSync(path, 'utf8')) as ScriptFile;
  const lines = script.lines.map((l) => ({ ...l, group: groupOf(l.moment, c.role) }));
  if (c.role === 'mc') for (const s of allStingers()) lines.push({ id: `name.${s.key.replace(/:/g, '.')}`, moment: 'name', text: s.text, tags: [`name:${s.key}`], group: 'names' });
  // A REAL VOICE only behind a SIGNED card: their takes (MIC_RECORDINGS/<cast>/<line id>.wav) replace the rendered lines
  const recDir = process.env.MIC_RECORDINGS ? join(process.env.MIC_RECORDINGS, c.id) : null;
  const recordings = c.card?.status === 'signed' && recDir && existsSync(recDir) ? recDir : undefined;
  if (recDir && existsSync(recDir) && !recordings) console.warn(`${c.id}: takes found but the card is not signed: NOT used`);
  // every group a mode may ask this voice for (ModeMic asks the MC and the sidekick for each of the mode's groups)
  const groups = c.role === 'mc' ? ['shared', 'dunk', 'three', 'game', 'carnival', 'names'] : c.role === 'side' ? ['shared', 'dunk', 'three', 'game', 'carnival'] : [];
  casts.push({ id: c.id, voice: c.voice, kbps: c.role === 'crowd' ? 24 : 32, lines, groups, ...(recordings ? { recordings } : {}) });
  // the recording script
  const order = [...MOMENTS.map((m) => m.id), ...CROWD_MOMENTS.map((m) => m.id), ...PLAYER_MOMENTS.map((m) => m.id), 'name'];
  const md: string[] = [`# ${c.name}: recording script`, '', c.persona, '',
    'Record each line as its own take, named by its id (e.g. `dunk.make.t2.03.wav`). Say it your way: the words are a starting point, and a line can be rewritten in your own voice as long as it fits the moment and its length. Clean language only.', ''];
  for (const m of order) {
    const ls = lines.filter((l) => l.moment === m); if (!ls.length) continue;
    const spec = momentSpec(m);
    md.push(`## ${m}`, '', `_${sayOf(m)}${spec ? ` At most ${spec.maxWords} words.` : ''}_`, '');
    for (const l of ls) md.push(`- \`${l.id}\`${l.tier !== undefined ? ` (size ${l.tier})` : ''}${l.tags?.length ? ` [${l.tags.join(', ')}]` : ''}: ${l.text}`);
    md.push('');
  }
  writeFileSync(join(RECORD, `${c.id}.md`), md.join('\n'));
}
const total = casts.reduce((a, c) => a + c.lines.length, 0);
console.log(`${casts.length} voices, ${total} lines`);
const job = join(HOME, 'job.json');
writeFileSync(job, JSON.stringify({ casts }));
if (dry) process.exit(0);
const py = join(HOME, '.venv/bin/python');
const r = spawnSync(py, ['tools/voice/render-mic.py', job, OUT], { stdio: 'inherit', env: { ...process.env, KOKORO_HOME: HOME } });
process.exit(r.status ?? 1);
