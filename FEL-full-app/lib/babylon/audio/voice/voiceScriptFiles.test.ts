// The production voice script itself (tools/voice/script/*.csv, IMPROVE 2026-10-06): every row would import cleanly, passes the
// script rules, says what the page says, and together with the bank brings every pool to three lines.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { CAST } from '../mic/cast';
import { momentSpec } from '../mic/moments';
import { lintLine } from '../mic/scriptRules';
import { textKey } from '../mic/VoiceKit';
import { hostLines, type HostMoment } from '../../party/brainBrawlLines';
import { TS_SOURCED, groupFor, parseTarget, rowsFromCsv, splitFileId, type BankIndexFile, type ScriptRow } from './voiceScript';
import { framingLine, SIDE_TURNED } from '../../../mirror/framing';
import { DEEPER_LINE, SQUARE_UP_LINE } from '../../../mirror/squatStage';
import { MODIFIED_SCREEN, FULL_SCREEN, TURN_CUE } from '../../../mirror/screen';
import { MOVE_ON_LINE, NEXT_LINE, PART_READ_LINE } from '../../../mirror/screenRunner';
import { HEAD_TURNED_HINT, RETEST_HINT } from '../../../mirror/stationGraders';
import { refusalLine } from '../../../irl/dunkTracker';
import { QUICK_PARTS } from '../../../assess/runner';
import { facingCue } from '../../../assess/protocol';
import { TRACKING_LOSS_PROMPT } from '../../../screen/copy';
import { NEXT_UP_SPOKEN, goWhenReadyLine } from '../../../session-setup/voice';

const APP = join(__dirname, '../../../..');
const SCRIPT = join(APP, 'tools/voice/script');
const BANK = join(APP, 'public/audio/voice/v1');
const files = readdirSync(SCRIPT).filter((f) => f.endsWith('.csv')).sort();
const rows: ScriptRow[] = files.flatMap((f) => rowsFromCsv(readFileSync(join(SCRIPT, f), 'utf8'), f));
const bankLines = (voice: string): (BankIndexFile['lines'][number] & { group: string })[] => {
  const dir = join(BANK, voice);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.json')).flatMap((f) => {
    const idx = JSON.parse(readFileSync(join(dir, f), 'utf8')) as BankIndexFile;
    return idx.lines.map((l) => ({ ...l, group: idx.group }));
  });
};
const roleOf = (v: string) => CAST.find((c) => c.id === v)?.role;

describe('the production voice script', () => {
  it('has rows, every file parses, every id is unique', () => {
    expect(files.length).toBeGreaterThan(0);
    expect(rows.length).toBeGreaterThan(250);
    const ids = rows.map((r) => r.id.toLowerCase());
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every row\'s id, voice, target and bank agree, and the target bank exists', () => {
    const bad: string[] = [];
    for (const r of rows) {
      const id = splitFileId(r.id), t = parseTarget(r.target);
      if (!id || !t) { bad.push(`${r.id}: unparsable id or target`); continue; }
      if (id.voice !== r.voice || t.voice !== r.voice || t.lineId !== id.lineId) bad.push(`${r.id}: id/voice/target disagree`);
      if (!CAST.some((c) => c.id === r.voice) && !TS_SOURCED[r.voice]) bad.push(`${r.id}: unknown voice ${r.voice}`);
      if (t.group !== groupFor(r.voice, roleOf(r.voice), r.moment)) bad.push(`${r.id}: group ${t.group}, expected ${groupFor(r.voice, roleOf(r.voice), r.moment)}`);
      if (!existsSync(join(BANK, r.voice, `${t.group}.json`))) bad.push(`${r.id}: no bank index ${r.voice}/${t.group}.json`);
      if (!r.persona || !r.mode || !r.delivery) bad.push(`${r.id}: persona, mode and delivery are required`);
      if (!(r.maxSec > 0 && r.maxSec <= 20)) bad.push(`${r.id}: max_sec ${r.maxSec}`);
    }
    expect(bad).toEqual([]);
  });

  it('a row is either new to its bank or already imported with the same words (never a clash with another line)', () => {
    const bad: string[] = [];
    for (const r of rows) {
      const t = parseTarget(r.target)!;
      const have = bankLines(r.voice).find((l) => l.id === t.lineId);
      if (have && textKey(have.text) !== textKey(r.text)) bad.push(`${r.id}: the bank already has ${t.lineId} saying "${have.text}"`);
    }
    expect(bad).toEqual([]);
  });

  it('every line passes the script rules (clean, original, gender-neutral, no digits, inside its moment\'s word limit)', () => {
    const bad: string[] = [];
    for (const r of rows) {
      const why = lintLine({ moment: r.moment, text: r.text, tier: r.tier, tags: r.tags });
      // the quiz host's moments are Brain Brawl's own (brainBrawlLines.ts HostMoment), not the hoops table
      const issues = r.voice === 'bb_host' ? why.filter((w) => !w.startsWith('unknown moment')) : why;
      for (const w of issues) bad.push(`${r.id} "${r.text}": ${w}`);
      if (r.voice === 'bb_host' && !hostLines(r.moment as HostMoment).length) bad.push(`${r.id}: no Brain Brawl host moment ${r.moment}`);
      if (r.voice === 'bb_host' && r.text.split(/\s+/).length > 7) bad.push(`${r.id}: a host line is over before the next beat (7 words)`);
      if (r.match !== undefined && textKey(r.match) === textKey(r.text)) bad.push(`${r.id}: match equals the text (drop it)`);
    }
    expect(bad).toEqual([]);
  });

  it('every page line says exactly what the page says (the page finds the take by that string)', () => {
    const computed = new Set([
      ...QUICK_PARTS.map((p) => p.setup), `${TRACKING_LOSS_PROMPT}.`, NEXT_UP_SPOKEN, goWhenReadyLine(),
      refusalLine('implausible_vertical'), refusalLine('implausible_flight'), 'Stand on your LEFT leg.', 'Stand on your RIGHT leg.', '3', '2', '1',
    ].map(textKey));
    const bad: string[] = [];
    for (const r of rows.filter((x) => x.priority === 'P1')) {
      const said = r.match ?? r.text;
      if (!r.source) { bad.push(`${r.id}: a page line needs its source file`); continue; }
      // the source's string quotes are not part of the line (an apostrophe inside a word is)
      const src = readFileSync(join(APP, r.source), 'utf8').replace(/\\'/g, "'").replace(/(?<![a-z])'|'(?![a-z])/gi, ' ');
      // compared as the page's lookup compares them (VoiceKit.textKey: case, punctuation and spacing aside)
      if (!` ${textKey(src)} `.includes(` ${textKey(said)} `) && !computed.has(textKey(said))) bad.push(`${r.id}: "${said}" is not in ${r.source}`);
    }
    expect(bad).toEqual([]);
  });

  it('every fixed line the pages speak has a take: in the script, or already in the Coach\'s bank', () => {
    const cueSrc = readFileSync(join(APP, 'lib/babylon/nexus/neuro-mirror/rules/cue-engine.ts'), 'utf8');
    const block = cueSrc.slice(cueSrc.indexOf('const CUES: Record<FaultId, CueCard> = {'));
    const cues = [...block.slice(0, block.indexOf('\n};')).matchAll(/^\s+(?:cue|escalate|regress): '((?:[^'\\]|\\.)*)',/gm)].map((m) => m[1].replace(/\\'/g, "'"));
    expect(cues.length).toBe(24);
    const spoken = [
      ...cues, 'There it is. Own it.',
      ...(['noBody', 'cutOffBottom', 'cutOffTop', 'turned', 'tooClose', 'tooFar', 'offCentre', 'dim'] as const).map((i) => framingLine(i)),
      SIDE_TURNED, DEEPER_LINE, SQUARE_UP_LINE, refusalLine('implausible_vertical'), refusalLine('implausible_flight'),
      ...MODIFIED_SCREEN.map((s) => s.cue), ...FULL_SCREEN.map((s) => s.cue), ...Object.values(TURN_CUE), NEXT_LINE, MOVE_ON_LINE, PART_READ_LINE,
      ...Object.values(RETEST_HINT), HEAD_TURNED_HINT,
      ...QUICK_PARTS.map((p) => p.setup), facingCue('front'), facingCue('side', 'left'), facingCue('side', 'right'), `${TRACKING_LOSS_PROMPT}.`,
      'Hold that.', 'Stand still for two seconds.', 'Go.', '3', '2', '1', 'Lost you for a moment — trying this move once more.',
      goWhenReadyLine(), NEXT_UP_SPOKEN,
    ];
    const have = new Set([
      ...rows.filter((r) => r.voice === 'coach').map((r) => textKey(r.match ?? r.text)),
      ...bankLines('coach').flatMap((l) => [textKey(l.text), ...(l.match ? [textKey(l.match)] : [])]),
    ]);
    expect(spoken.filter((s) => !have.has(textKey(s)))).toEqual([]);
  });

  it('with the script imported, every pool the game picks from has at least three lines', () => {
    const voices = [...new Set(rows.filter((r) => r.priority !== 'P1').map((r) => r.voice))];
    const thin: string[] = [];
    for (const v of voices) {
      const lines = [
        ...bankLines(v).filter((l) => l.moment !== 'name' && !l.moment.startsWith('page.')),
        ...rows.filter((r) => r.voice === v && !r.moment.startsWith('page.') && !bankLines(v).some((l) => l.id === parseTarget(r.target)!.lineId))
          .map((r) => ({ id: parseTarget(r.target)!.lineId, moment: r.moment, tier: r.tier, tags: r.tags })),
      ];
      const slots = new Map<string, Set<string>>();
      for (const l of lines) {
        const k = `${l.moment}|${l.tier ?? ''}`;
        const s = slots.get(k) ?? new Set<string>(); slots.set(k, s);
        if (l.tags?.length) s.add(l.tags.join('+'));
      }
      for (const [k, tagsets] of slots) {
        const [moment, tier] = k.split('|');
        const spec = momentSpec(moment);
        // a moment whose events always carry one of its tags (the rival, the side, the player, the event) is never asked untagged
        const events = spec?.tags?.length ? [...(spec.tags)] : ['', ...tagsets];
        for (const ev of events) {
          const evTags = ev ? ev.split('+') : [];
          const pool = lines.filter((l) => l.moment === moment && String(l.tier ?? '') === tier && (!l.tags?.length || l.tags.every((t) => evTags.includes(t))));
          if (!ev && !pool.length) continue;
          if (pool.length < 3) thin.push(`${v} ${moment}${tier ? ` tier ${tier}` : ''}${ev ? ` [${ev}]` : ''}: ${pool.length}`);
        }
      }
    }
    expect(thin).toEqual([]);
  });
});
