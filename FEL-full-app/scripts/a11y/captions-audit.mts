// CAPTIONS AUDIT (A11-04, lane/a11y-design, 2026-10-25): every place the app SPEAKS a line, and whether the same line is
// put on screen as text (a caption, a cue chip, a live region) for a player who cannot hear it. Static: it finds the
// speech calls in the source and looks, in the same function, for the line reaching a visible or announced channel.
//
//   SPEECH     speakNatural(…), naturalSpeaker(…).speak, speechSynthesis.speak, speakCues(…), voice.speak(…), VoiceKit.play…,
//              a mode's MicDirector / ModeMic line (setHud({ mic })), a story line (story/voice.ts)
//   CAPTION    VoiceKit.playCaptioned({ caption }), setHud({ mic }) / captions.cue (the caption bus → CaptionRegion and
//              components/games/mic-caption.tsx), a React state set with the same text (setCaption, setCue, setSay…),
//              an aria-live region
//
//   npx tsx scripts/a11y/captions-audit.mts [--json]
// The result is written up, line by line with the verdicts read by hand, in docs/CAPTIONS-AUDIT.md.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const SPEECH = /\b(speakNatural\(|naturalSpeaker\(|speechSynthesis\.speak\(|speakCues\(|voice\.speak\(|speakerRef\.current\.speak\(|VoiceKit\.(play|playLine|say)\(|\bspeak\()/;
const CAPTION = /(playCaptioned|setHud\(\{[^}]*\bmic\b|captions\.cue|\bcue\(|setCaption|setCue|setSay|setSaid|setDunkSaid|setLine|setToast|hostCaption|aria-live|MicCaption|onCaption|\bcaption\b\s*[,:])/;

function walk(d: string, out: string[] = []): string[] {
  for (const e of readdirSync(d)) {
    if (e === 'node_modules' || e.startsWith('.')) continue;
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

interface Site { file: string; line: number; code: string; captioned: boolean; how: string }
const sites: Site[] = [];
for (const f of [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'components')), ...walk(join(ROOT, 'lib'))]) {
  const src = readFileSync(f, 'utf8');
  if (!SPEECH.test(src)) continue;
  const lines = src.split('\n');
  lines.forEach((l, i) => {
    const code = l.trim();
    if (code.startsWith('//') || code.startsWith('*') || code.startsWith('import ') || /^(export )?(async )?function |^const speak = |=>\s*\{$/.test(code) && !SPEECH.test(code.replace(/^.*?=>/, ''))) return;
    if (!SPEECH.test(code) || /function speak|speak = useCallback|speak\(text: string|speak\(line: string|speak\(clip|interface|^\w+\(text/.test(code)) return;
    // the window a caption must sit in: this statement and the six lines either side (one handler)
    const win = lines.slice(Math.max(0, i - 6), i + 7).join('\n');
    const m = CAPTION.exec(win);
    sites.push({ file: relative(ROOT, f), line: i + 1, code: code.slice(0, 110), captioned: !!m, how: m ? m[1] : '' });
  });
}
if (process.argv.includes('--json')) console.log(JSON.stringify(sites, null, 1));
else {
  for (const s of sites) console.log(`${s.captioned ? 'CAPTIONED  ' : 'CHECK      '} ${s.file}:${s.line}  ${s.how ? `[${s.how}] ` : ''}${s.code}`);
  console.log(`\n${sites.length} speech sites, ${sites.filter((s) => s.captioned).length} with a caption in the same handler, ${sites.filter((s) => !s.captioned).length} to read by hand`);
}
