// The words (SCREEN-SHIP safety copy, Red wording, A3-1): the draft's safety lines verbatim; Red is "priority to work
// on" and never "injured", "failed", "fail" or "injury", in the screen's strings, the PROPOSED file's labels and cues,
// and every screen component; and no coach link or booking anywhere.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as COPY from './copy';
import { BAND_WORDS, DRAFT_CUES, SCREEN_CHECKS, THRESHOLDS, THRESHOLD_IDS, bands3Of } from './PROPOSED-thresholds';
import { LANES, LANE_TABLE } from './PROPOSED-program-lanes';
import { CAMERA_HELP } from '@/app/play/mirror/assess/_components/camera-help';

const ROOT = join(__dirname, '../..');
const BANNED = /\b(injur\w*|fail\w*)\b/i;
const SCREEN_FILES = [
  ...readdirSync(join(ROOT, 'app/play/mirror/assess/_components')).filter((f) => /\.tsx?$/.test(f)).map((f) => `app/play/mirror/assess/_components/${f}`),
  'app/play/mirror/assess/page.tsx', 'app/play/mirror/assess/results/page.tsx', 'app/screen/page.tsx',
  'app/screen/program/[lane]/page.tsx', 'app/screen/program/[lane]/program-lane.tsx',
  ...readdirSync(join(ROOT, 'lib/screen')).filter((f) => /\.ts$/.test(f) && !f.endsWith('.test.ts')).map((f) => `lib/screen/${f}`),
];
/** The string literals a file can show (quotes and template text, comments dropped). */
function literals(src: string): string[] {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  return [...code.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)].map((m) => m[1] ?? m[2] ?? m[3] ?? '');
}

describe('the safety copy (the research draft, verbatim)', () => {
  it('the disclaimer, the pain question and the pain stop', () => {
    expect(COPY.DISCLAIMER).toBe('This is a free movement check, not a medical exam.');
    expect(COPY.PAIN_QUESTION).toBe('Does anything hurt right now?');
    expect(COPY.PAIN_STOP).toBe('Talk to a coach or a medical pro before training through pain.');
  });
  it('the end of the results', () => {
    expect(COPY.SCREENSHOT_LINE).toBe('Screenshot this to keep your results.');
    expect(COPY.DONE_CLEAR).toBe('Done, clear my results');
    expect(COPY.BUILD_PROGRAM).toBe('Build my Dunk Program');
    expect(COPY.WIN_LINE).toBe('Clean screen. You\'re ready for Dunking & Plyometrics.');
    expect(COPY.NOT_SAVED_TITLE).toBe('Your results aren\'t saved. Run the screen again');
    expect(COPY.TRACKING_LOSS_PROMPT).toBe('Step back into the light');
  });
});

describe('Red says "priority to work on", never anything harsher', () => {
  it('the band words', () => {
    expect(BAND_WORDS.red).toBe('Priority to work on');
  });

  it('no banned word in the screen\'s copy, the PROPOSED labels, words and cues, the lanes, or the camera card', () => {
    const strings: string[] = [
      ...Object.values(COPY).flatMap((v) => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.map((x) => JSON.stringify(x)) : [])),
      ...Object.values(BAND_WORDS), ...Object.values(DRAFT_CUES),
      ...THRESHOLD_IDS.map((id) => THRESHOLDS[id].label),
      ...THRESHOLD_IDS.flatMap((id) => { const b = (THRESHOLDS[id] as { bands3?: unknown }).bands3 ? bands3Of(id) : null; return b ? [...Object.values(b.words), b.cue] : []; }),
      ...SCREEN_CHECKS.flatMap((c) => [c.name, c.draftRow, ...(c.draftOnly ? [...Object.values(c.draftOnly.words), c.draftOnly.cue] : [])]),
      ...Object.values(LANES).flatMap((l) => [l.name, l.defaultSample.cue]), ...LANE_TABLE.map((r) => r.why),
      ...Object.values(CAMERA_HELP).flatMap((k) => [k.title, k.reason, k.next, ...k.steps]),
    ];
    for (const s of strings) expect(s, s).not.toMatch(BANNED);
  });

  it.each(SCREEN_FILES)('%s: no banned word in any string it can show', (f) => {
    for (const s of literals(readFileSync(join(ROOT, f), 'utf8'))) expect(s, `${f}: ${s}`).not.toMatch(BANNED);
  });
});

describe('A3-1: no coach link, no booking, anywhere in the screen', () => {
  it.each(SCREEN_FILES)('%s', (f) => {
    const src = readFileSync(join(ROOT, f), 'utf8');
    expect(src).not.toMatch(/NEXT_PUBLIC_COACH_BOOKING_URL|sms:|book a session|Coach Elijah|booking/i);
  });
});
