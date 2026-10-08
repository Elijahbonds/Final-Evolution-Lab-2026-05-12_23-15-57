// voiceScript: the provider import's pure parts (IMPROVE 2026-10-06): the CSV, the id ↔ bank mapping, the folder check, the
// bank rebuild (the manifest update), the script and loudness-table updates, the PCM and WAV helpers. No real audio.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SCRIPT_COLUMNS, applyGainDb, encodeWav16, exportRows, fileIdOf, gainToTarget, groupFor, idStem, indexJson, median, nextLineId,
  parseCsv, parseTarget, parseWav, planImport, planProblems, readMeasuredTable, rebuildBank, rowsFromCsv, scriptToCsv, splitFileId,
  takeWarnings, targetOf, toCsv, trimAndFade, upsertScriptLine, writeMeasuredTable, type BankIndexFile, type ScriptRow,
} from './voiceScript';
import { clipTrimDb, TARGET_LUFS } from './loudness';

const row = (id: string, over: Partial<ScriptRow> = {}): ScriptRow => {
  const s = splitFileId(id)!;
  return {
    id, voice: s.voice, persona: s.voice.toUpperCase(), mode: 'Mirror', moment: 'page.mirror.cue', tags: [], priority: 'P1', text: 'Hold that.',
    delivery: 'calm', maxSec: 2, target: targetOf(s.voice, 'coach', s.lineId), source: '', ...over,
  };
};
const bytes = (...xs: number[]): Uint8Array => new Uint8Array(xs);
const fakeHash = (b: Uint8Array): string => b.reduce((a, x) => (a * 31 + x) >>> 0, 7).toString(16).padStart(10, '0').slice(0, 10);

describe('the script CSV', () => {
  it('round-trips quotes, commas, newlines, a BOM and CRLF', () => {
    const cells = [['a', 'b,c', 'say "hi"', 'two\nlines', ' pad ', '']];
    expect(parseCsv(toCsv(cells))).toEqual(cells);
    expect(parseCsv('﻿x,y\r\n1,"2,3"\r\n')).toEqual([['x', 'y'], ['1', '2,3']]);
    expect(parseCsv('a,b\n\n\nc,d\n')).toEqual([['a', 'b'], ['c', 'd']]);
  });
  it('reads rows (tier, tags, match) and writes them back identically', () => {
    const rows = [
      row('coach.page.mirror.jump.02', { text: 'Not counted: that read over one hundred thirty centimetres.', match: 'Not counted: that read over 130 cm.' }),
      row('scoop.dunk.make.t0.02', { voice: 'scoop', moment: 'dunk.make', tier: 0, priority: 'P2', target: targetOf('scoop', 'dunk', 'dunk.make.t0.02') }),
      row('boardwalk.carnival.event.slam_rush.02', { voice: 'boardwalk', moment: 'carnival.event', tags: ['ev:slam_rush'], priority: 'P3', target: targetOf('boardwalk', 'carnival', 'carnival.event.slam_rush.02') }),
    ];
    const csv = scriptToCsv(rows);
    expect(csv.split('\n')[0]).toBe(SCRIPT_COLUMNS.join(','));
    expect(rowsFromCsv(csv)).toEqual(rows);
    expect(scriptToCsv(rowsFromCsv(csv))).toBe(csv);
  });
  it('refuses a wrong header, a short row, a bad priority, tier or length', () => {
    const head = SCRIPT_COLUMNS.join(',');
    const good = rowToLine(row('coach.page.assess.01'));
    expect(() => rowsFromCsv(`id,voice\n${good}`)).toThrow(/header/);
    expect(() => rowsFromCsv(`${head}\na,b,c`)).toThrow(/cells/);
    expect(() => rowsFromCsv(`${head}\n${good.replace(',P1,', ',P9,')}`)).toThrow(/priority/);
    expect(() => rowsFromCsv(`${head}\n${good.replace(',2.0,', ',0,')}`)).toThrow(/max_sec/);
    expect(rowsFromCsv(`${head}\n${good}`)).toHaveLength(1);
  });
});
function rowToLine(r: ScriptRow): string { return scriptToCsv([r]).split('\n')[1]; }

describe('ids and the bank layout', () => {
  it('a row id is <voice>.<line id>; the voice never has a dot', () => {
    expect(fileIdOf('coach', 'coach.space.left.03')).toBe('coach.coach.space.left.03');
    expect(splitFileId('coach.coach.space.left.03')).toEqual({ voice: 'coach', lineId: 'coach.space.left.03' });
    expect(splitFileId('bb_host.land.LOGIC.03')).toEqual({ voice: 'bb_host', lineId: 'land.LOGIC.03' });
    expect(splitFileId('nodot')).toBeNull();
    expect(splitFileId('.x')).toBeNull();
    expect(splitFileId('Coach.x')).toBeNull();
  });
  it('the target names the bank index (the manifest) and the entry, and parses back', () => {
    const t = targetOf('scoop', 'dunk', 'dunk.up.02');
    expect(t).toBe('public/audio/voice/v1/scoop/dunk.json#dunk.up.02');
    expect(parseTarget(t)).toEqual({ voice: 'scoop', group: 'dunk', lineId: 'dunk.up.02' });
    expect(parseTarget('public/audio/voice/v2/scoop/dunk.json#x')).toBeNull();
  });
  it('the group follows build-mic.mts: the moment\'s group for the booth, the role\'s bank for the rest, the hosts\' own', () => {
    expect(groupFor('boardwalk', 'mc', 'carnival.tie')).toBe('carnival');
    expect(groupFor('scoop', 'side', 'momentum.cold')).toBe('shared');
    expect(groupFor('crowd_a', 'crowd', 'crowd.defense')).toBe('crowd');
    expect(groupFor('cass', 'player', 'player.dunk.jab')).toBe('chatter');
    expect(groupFor('coach', 'coach', 'page.proveit')).toBe('coach');
    expect(groupFor('bb_host', undefined, 'claim')).toBe('quiz');
    expect(groupFor('nova', 'mc', 'name')).toBe('names');
  });
  it('a new id takes the next free number in its slot (scriptRules.lineId\'s shape)', () => {
    expect(idStem('dunk.make', 2)).toBe('dunk.make.t2');
    expect(idStem('carnival.event', undefined, ['ev:slam_rush'])).toBe('carnival.event.slam_rush');
    const taken = new Set(['dunk.up.01', 'dunk.up.02', 'dunk.upper.07', 'dunk.up.x']);
    expect(nextLineId(taken, 'dunk.up')).toBe('dunk.up.03');
    expect(nextLineId(new Set(), 'page.assess')).toBe('page.assess.01');
  });
});

describe('the rendered folder against the script', () => {
  const rows = [row('coach.page.assess.01'), row('coach.page.assess.02'), row('scoop.dunk.up.02', { voice: 'scoop' }), row('nova.game.point.01', { voice: 'nova' })];
  it('finds each id once, any audio extension, any case; reports the missing, the unexpected, the doubled and the ignored', () => {
    const plan = planImport(rows, ['coach.page.assess.01.wav', 'COACH.PAGE.ASSESS.02.MP3', 'scoop.dunk.up.02.m4a', 'scoop.dunk.up.02.wav',
      'nova.game.pont.01.wav', 'notes.txt', '.DS_Store']);
    expect(plan.found.map((f) => [f.row.id, f.file])).toEqual([['coach.page.assess.01', 'coach.page.assess.01.wav'], ['coach.page.assess.02', 'COACH.PAGE.ASSESS.02.MP3']]);
    expect(plan.missing.map((r) => r.id)).toEqual(['nova.game.point.01']);
    expect(plan.duplicates).toEqual([{ id: 'scoop.dunk.up.02', files: ['scoop.dunk.up.02.m4a', 'scoop.dunk.up.02.wav'] }]);
    expect(plan.unexpected).toEqual(['nova.game.pont.01.wav']);
    expect(plan.ignored).toEqual(['notes.txt']);
    const report = planProblems(plan).join('\n');
    expect(report).toMatch(/MISSING 1 file\(s\)/);
    expect(report).toMatch(/nova\.game\.point\.01/);
    expect(report).toMatch(/DUPLICATE scoop\.dunk\.up\.02/);
    expect(report).toMatch(/UNEXPECTED 1 file\(s\).*nova\.game\.pont\.01\.wav/);
  });
  it('a complete folder has no problems', () => {
    const plan = planImport(rows, rows.map((r) => `${r.id}.wav`));
    expect(plan.found).toHaveLength(4);
    expect(planProblems(plan)).toEqual([]);
  });
});

describe('the bank rebuild (the manifest update)', () => {
  const index: BankIndexFile = { cast: 'scoop', group: 'dunk', bank: 'dunk.0000000000.bin', lines: [
    { id: 'dunk.up.01', moment: 'dunk.up', text: 'Notebook open.', off: 0, len: 3, sec: 1.2 },
    { id: 'dunk.miss.01', moment: 'dunk.miss', text: 'Close!', off: 3, len: 2, sec: 0.9, lufs: -20 },
  ] };
  const blob = bytes(1, 2, 3, 4, 5);
  it('replaces a re-voiced id in place, appends a new id, and keeps every other clip\'s bytes', () => {
    const r = rebuildBank(index, blob, [
      { id: 'dunk.up.02', moment: 'dunk.up', text: 'Here we go!', bytes: bytes(9, 9), sec: 1.1, lufs: -19.2, peak: -3 },
      { id: 'dunk.up.01', moment: 'dunk.up', text: 'Notebook open.', bytes: bytes(7, 7, 7, 7), sec: 1.3, lufs: -18.9, peak: -2 },
    ], fakeHash);
    expect(r.replaced).toEqual(['dunk.up.01']);
    expect(r.added).toEqual(['dunk.up.02']);
    expect([...r.blob]).toEqual([7, 7, 7, 7, 4, 5, 9, 9]);
    expect(r.index.lines.map((l) => [l.id, l.off, l.len])).toEqual([['dunk.up.01', 0, 4], ['dunk.miss.01', 4, 2], ['dunk.up.02', 6, 2]]);
    expect(r.index.lines[0]).toMatchObject({ sec: 1.3, lufs: -18.9, peak: -2 });
    expect(r.index.lines[1]).toMatchObject({ text: 'Close!', lufs: -20 });
    expect(r.index.bank).toBe(`dunk.${fakeHash(r.blob)}.bin`);
    expect(JSON.parse(indexJson(r.index))).toEqual(r.index);
    // every line's bytes are where the index says
    for (const l of r.index.lines) expect(r.blob.subarray(l.off, l.off + l.len).length).toBe(l.len);
  });
  it('keeps tier, tags and match on the entry, and starts an empty bank', () => {
    const r = rebuildBank({ cast: 'coach', group: 'coach', bank: '', lines: [] }, new Uint8Array(0), [
      { id: 'page.mirror.jump.02', moment: 'page.mirror.jump', text: 'one hundred thirty', match: '130 cm', bytes: bytes(1), sec: 2 },
      { id: 'dunk.make.t0.02', moment: 'dunk.make', text: 'Count it!', tier: 0, tags: [], bytes: bytes(2), sec: 1 },
    ], fakeHash);
    expect(r.index.lines[0].match).toBe('130 cm');
    expect(r.index.lines[1].tier).toBe(0);
    expect('tags' in r.index.lines[1]).toBe(false);
    expect(r.index.bank).toMatch(/^coach\.[0-9a-f]{10}\.bin$/);
  });
  it('refuses an index whose line runs past its bank (a stale .bin)', () => {
    expect(() => rebuildBank(index, bytes(1, 2), [], fakeHash)).toThrow(/past the end/);
  });
});

describe('the script JSON and the loudness table', () => {
  it('adds a new line, updates a changed one in place, leaves an identical one alone', () => {
    const file = { cast: 'coach', lines: [{ id: 'coach.space.left.01', moment: 'coach.space.left', text: 'Move to your left.' }] };
    const a = upsertScriptLine(file, { id: 'page.proveit.02', moment: 'page.proveit', text: 'Next up!' });
    expect(a.change).toBe('added');
    expect(a.file.lines).toHaveLength(2);
    expect(file.lines).toHaveLength(1);
    expect(upsertScriptLine(a.file, { id: 'page.proveit.02', moment: 'page.proveit', text: 'Next up!' }).change).toBe('same');
    const u = upsertScriptLine(a.file, { id: 'page.proveit.02', moment: 'page.proveit', text: 'Next up, folks!', match: 'Next up!' });
    expect(u.change).toBe('updated');
    expect(u.file.lines[1]).toEqual({ id: 'page.proveit.02', moment: 'page.proveit', text: 'Next up, folks!', match: 'Next up!' });
  });
  it('rewrites only the MEASURED_CAST_LUFS block of the real loudness.ts, and reads it back', () => {
    const src = readFileSync(join(__dirname, 'loudness.ts'), 'utf8');
    expect(readMeasuredTable(src)).toEqual({});
    const out = writeMeasuredTable(src, { scoop: -19.24, coach: -18.96 });
    expect(readMeasuredTable(out)).toEqual({ coach: -19, scoop: -19.2 });
    const strip = (s: string) => s.replace(/\/\/ <measured-cast-lufs>[\s\S]*\/\/ <\/measured-cast-lufs>/, '');
    expect(strip(out)).toBe(strip(src));
    expect(writeMeasuredTable(out, {})).toBe(src);
    expect(() => writeMeasuredTable('no markers', {})).toThrow(/markers/);
  });
  it('a line without its own measurement is trimmed by its voice\'s measured median', () => {
    expect(clipTrimDb({}, 'scoop', { scoop: TARGET_LUFS + 2 })).toBeCloseTo(-2, 9);
    expect(clipTrimDb({ lufs: TARGET_LUFS - 1 }, 'scoop', { scoop: TARGET_LUFS + 2 })).toBeCloseTo(1, 9);   // its own wins
    expect(clipTrimDb({}, 'nova', { scoop: TARGET_LUFS + 2 })).toBe(0);
    expect(clipTrimDb({}, 'scoop')).toBe(0);   // the shipped table is empty until an import
  });
});

describe('loudness and the take itself', () => {
  it('levels to the target without pushing the peak past the ceiling, and leaves silence alone', () => {
    expect(gainToTarget(-25, -10)).toBe(6);
    expect(gainToTarget(-25, -4)).toBe(3);        // the peak allows only +3
    expect(gainToTarget(-14, -2)).toBe(-5);
    expect(gainToTarget(-60, -40)).toBe(20);      // at most +20
    expect(gainToTarget(-70, -90)).toBe(0);
    expect(gainToTarget(NaN, 0)).toBe(0);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
  });
  it('trims a provider\'s silence to 30 ms before and 80 ms after the speech, and fades both ends', () => {
    const rate = 1000;
    const x = new Float32Array(2000);
    for (let i = 500; i < 1500; i++) x[i] = 0.5;
    const y = trimAndFade(x, rate);
    expect(y.length).toBe((1499 + 80) - (500 - 30));
    expect(y[0]).toBe(0);
    expect(y[y.length - 1]).toBe(0);
    expect(trimAndFade(new Float32Array(10), rate)).toHaveLength(10);   // silence stays as it is
    expect([...applyGainDb(Float32Array.from([0.5, -0.5, 0.9]), 6)].map((v) => Math.round(v * 1000) / 1000)).toEqual([0.998, -0.998, 1]);
  });
  it('writes and reads mono 16-bit WAV; reads float and stereo', () => {
    const x = Float32Array.from([0, 0.5, -0.5, 0.25]);
    const w = parseWav(encodeWav16(x, 24000));
    expect(w.rate).toBe(24000);
    expect([...w.samples].map((v) => Math.round(v * 100) / 100)).toEqual([0, 0.5, -0.5, 0.25]);
    // a stereo float file: channels averaged
    const buf = new Uint8Array(44 + 16); const dv = new DataView(buf.buffer);
    const put = (o: number, s: string) => { for (let i = 0; i < 4; i++) buf[o + i] = s.charCodeAt(i); };
    put(0, 'RIFF'); dv.setUint32(4, 52, true); put(8, 'WAVE'); put(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 3, true); dv.setUint16(22, 2, true);
    dv.setUint32(24, 48000, true); dv.setUint32(28, 48000 * 8, true); dv.setUint16(32, 8, true); dv.setUint16(34, 32, true); put(36, 'data'); dv.setUint32(40, 16, true);
    dv.setFloat32(44, 1, true); dv.setFloat32(48, 0, true); dv.setFloat32(52, -0.5, true); dv.setFloat32(56, -0.5, true);
    expect([...parseWav(buf).samples]).toEqual([0.5, -0.5]);
    expect(() => parseWav(bytes(1, 2, 3))).toThrow(/not a WAV/);
  });
  it('warns on a take over its seconds, far from the target, or near clipping', () => {
    expect(takeWarnings({ id: 'x', maxSec: 2 }, { sec: 1.5, lufs: -19, peak: -3 })).toEqual([]);
    const w = takeWarnings({ id: 'x', maxSec: 2 }, { sec: 2.6, lufs: -27, peak: -0.1 });
    expect(w).toHaveLength(3);
    expect(w[0]).toMatch(/over its 2\.0 s/);
  });
});

describe('a re-voice script for a whole persona', () => {
  it('lists every existing line with its bank target, so one provider voice can replace the persona', () => {
    const rows = exportRows('scoop', 'SCOOP', () => 'hoops', [{ cast: 'scoop', group: 'dunk', bank: 'b', lines: [
      { id: 'dunk.up.01', moment: 'dunk.up', text: 'Notebook open.', off: 0, len: 3, sec: 2 },
      { id: 'dunk.make.t1.01', moment: 'dunk.make', tier: 1, text: 'Underline that one.', off: 3, len: 3, sec: 1.4 },
    ] }]);
    expect(rows.map((r) => [r.id, r.target, r.maxSec])).toEqual([
      ['scoop.dunk.up.01', 'public/audio/voice/v1/scoop/dunk.json#dunk.up.01', 2.3],
      ['scoop.dunk.make.t1.01', 'public/audio/voice/v1/scoop/dunk.json#dunk.make.t1.01', 1.7],
    ]);
    expect(rows[1].tier).toBe(1);
    expect(rowsFromCsv(scriptToCsv(rows))).toEqual(rows);
  });
});
