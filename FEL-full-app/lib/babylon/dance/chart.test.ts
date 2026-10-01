// MUSIC-SUITE P9 (2026-09-29): the authored chart format, its loader and its validator — and every shipped chart held to
// it. THIS is where a broken chart fails loudly (movement play's condition: "chart validation FAILS LOUDLY IN A TEST,
// never silently at runtime"); at runtime a failing chart is logged with console.error and the room plays the generated
// steps instead (chartStepsFor → null → danceTracks.stepsFor's fallback).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  CHART_FORMAT, CHART_MOVES, CHART_SONG_IDS, DENSITY_BAND, DIFFICULTY_RULES, FREESTYLE_PAD, HOLD_GAP_BEATS, MAX_FREE_SHARE,
  MIN_HOLD_BEATS,
  chartFor, chartStats, chartStepsFor, barKindsFor, expandChart, moveClip, stepsFromPresses, swingBeat, validateChart,
  type DanceChart,
} from './chart';
import { FEL_SONGS, songFor, type FelSong } from './felSongs';
import { DancePerformance, beatDuration, isFreeSlot, isPressHold } from '../core/DanceCore';
import { ALL_DANCE_MOVES, CAPTURED_MOVES } from './moves';
import { stepsForSong } from '../core/danceTracks';

const song = (id: string): FelSong => songFor(id)!;
const clone = (c: DanceChart): DanceChart => JSON.parse(JSON.stringify(c)) as DanceChart;
const warm = () => clone(chartFor('warmup')!);

describe('the six shipped charts', () => {
  it('there is one chart per FEL song, and each one is VALID against its song (every rule — see validateChart)', () => {
    expect([...CHART_SONG_IDS].sort()).toEqual([...FEL_SONGS.map((s) => s.id)].sort());
    for (const s of FEL_SONGS) {
      const problems = validateChart(chartFor(s.id)!, s);
      expect(problems, `${s.id}:\n  ${problems.join('\n  ')}`).toEqual([]);
    }
  });

  it('easy → hard: the taps a minute climb with the song\'s difficulty, each inside its own band', () => {
    const tpm = FEL_SONGS.map((s) => chartStats(chartFor(s.id)!, s).tapsPerMin);
    for (let i = 1; i < tpm.length; i++) expect(tpm[i], FEL_SONGS[i].id).toBeGreaterThan(tpm[i - 1]);
    FEL_SONGS.forEach((s, i) => {
      expect(tpm[i]).toBeGreaterThanOrEqual(DENSITY_BAND[0] * s.targetTapsPerMin);
      expect(tpm[i]).toBeLessThanOrEqual(DENSITY_BAND[1] * s.targetTapsPerMin);
    });
    // and far denser than the generated steps they replace (the measurement in chart.ts's header)
    for (const s of FEL_SONGS) expect(chartStats(chartFor(s.id)!, s).presses).toBeGreaterThan(stepsForSong(s).length * 1.5);
  });

  it('every chart has what PLAN phase 9 asked for: accents inside moves, freeze holds, freestyle bars — and double taps from difficulty 2', () => {
    for (const s of FEL_SONGS) {
      const st = chartStats(chartFor(s.id)!, s);
      expect(st.accents, s.id).toBeGreaterThan(0);
      expect(st.holds, s.id).toBeGreaterThanOrEqual(2);
      expect(st.freeBars, s.id).toBeGreaterThan(0);
      if (s.difficulty >= 2) expect(st.doubles, s.id).toBeGreaterThan(0);
      else expect(st.doubles, s.id).toBe(0);
    }
  });

  it('every accent and double tap sits on the music: a kick, snare or clap, or a strong (≥ 0.6) note of a stem that plays there', () => {
    for (const s of FEL_SONGS) {
      const map = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/audio/songs', s.id, 'map.json'), 'utf8')) as {
        stems: Record<string, { onsets: number[][]; voices?: Record<string, number[][]> }>;
      };
      const off: string[] = [];
      for (const p of expandChart(chartFor(s.id)!, s).presses) {
        if (p.kind !== 'accent' && p.kind !== 'double') continue;
        const six = Math.round((p.beat - (p.bar - 1) * 4) * 4);
        const at = (o: number[]) => o[0] === p.bar && o[1] === six;
        const on = s.sections[p.section].stems.some((stem) => {
          const st = map.stems[stem];
          if (!st) return false;
          if (Object.entries(st.voices ?? {}).some(([v, arr]) => /kick|snare|clap/.test(v) && arr.some(at))) return true;
          return !['bed', 'drums', 'perc'].includes(stem) && st.onsets.some((o) => at(o) && o[2] >= 0.6);
        });
        if (!on) off.push(`bar ${p.bar} sixteenth ${six}`);
      }
      expect(off, s.id).toEqual([]);
    }
  });

  it('chartStepsFor plays each chart: fresh copies, press-only fields where the chart put them, holdBeats = the clip\'s length', () => {
    for (const s of FEL_SONGS) {
      const a = chartStepsFor(s)!, b = chartStepsFor(s.id)!;
      expect(a).toEqual(b);
      a[0].beat = -99;
      expect(chartStepsFor(s)![0].beat).not.toBe(-99);
      // MUSIC-SUITE P9 moves: the charts call captured moves too, so a clip's length is read from the room's vocabulary
      // (DANCE_LIBRARY's rows first — dance/moves.ts); the assertion itself is unchanged
      const lib = new Map(ALL_DANCE_MOVES.map((c) => [c.id, c]));
      for (const st of b) {
        expect(st.holdBeats).toBe(lib.get(st.clipId)!.beats);
        expect(st.move).toBeUndefined();                     // press steps only: no body target on a house chart
        expect(st.holdSec).toBeUndefined();
      }
      expect(b.some(isPressHold)).toBe(true);
      expect(b.some(isFreeSlot)).toBe(true);
      const kinds = barKindsFor(s)!;
      expect(kinds).toHaveLength(s.bars);
    }
    expect(chartStepsFor('nope')).toBeNull();
    expect(barKindsFor('nope')).toBeNull();
  });

  it('a perfect player scores every press of every chart, holds kept, at 100 %', () => {
    for (const s of FEL_SONGS) {
      const steps = chartStepsFor(s)!;
      const p = new DancePerformance(s.bpm);
      p.setRoutine(steps);
      p.start(0);
      const bd = beatDuration(s.bpm);
      for (const st of steps) {
        const t = st.beat * bd;
        p.update(t);
        p.hit(t, { key: 'A', move: FREESTYLE_PAD.A });
      }
      p.update((p.totalBeats + 1) * bd);
      const r = p.result();
      const holds = steps.filter(isPressHold).length;
      expect(r.counts, s.id).toEqual({ PERFECT: steps.length + holds, GREAT: 0, GOOD: 0, MISS: 0 });
      expect(r.accuracy).toBe(1);
      expect(r.holds).toEqual({ kept: holds, dropped: 0 });
      // the routine ends inside the song's last bar (DanceMode finishes a beat after it)
      expect(p.totalBeats).toBeLessThanOrEqual(s.bars * 4);
      expect(p.totalBeats).toBeGreaterThanOrEqual(s.bars * 4 - 4);
    }
  });
});

describe('the loader', () => {
  it('swings an odd sixteenth by the song\'s own swing (CONTRACT.md §4), and leaves quarters and eighths straight', () => {
    expect(swingBeat(1, 0.58)).toBe(1);
    expect(swingBeat(1.5, 0.58)).toBe(1.5);
    expect(swingBeat(1.25, 0.58)).toBeCloseTo(1.25 + 0.04, 12);   // 2 × 0.08 sixteenths = 0.04 beats
    expect(swingBeat(1.75, 0.5)).toBe(1.75);                      // straight song: no offset
    const battle = song('battle');
    const dbl = expandChart(chartFor('battle')!, battle).presses.find((p) => p.kind === 'double' && Math.round(p.beat * 4) % 2 === 1)!;
    expect(dbl.swungBeat).toBeCloseTo(dbl.beat + (2 * (battle.swing - 0.5)) / 4, 12);
  });

  it('a move runs until the next move: an accent and a double carry its clip and mirror; a freestyle slot names the default', () => {
    const c = warm();
    c.phrases.t = { bars: 1, notes: [{ b: 0, m: 'sixstep', mir: 1 }, { b: 3 }] };
    c.phrases.f = { bars: 1, free: { every: 2 } };
    c.sections = [{ name: 'intro', bar: 1, bars: 2, play: ['t', 'f'] }];
    const { presses, barKinds } = expandChart(c, song('warmup'));
    expect(presses.map((p) => [p.kind, p.beat, p.clipId, p.mirrored])).toEqual([
      ['move', 0, 'dance_footwork_six', true], ['accent', 3, 'dance_footwork_six', true],
      ['free', 4, 'dance_toprock_basic', false], ['free', 6, 'dance_toprock_basic', false],
    ]);
    expect(barKinds).toEqual(['call', 'free']);
    const steps = stepsFromPresses(presses);
    expect(steps[1]).toMatchObject({ pressKind: 'accent' });
    expect(steps[2]).toMatchObject({ pressFree: true });
    expect(steps[0].pressHoldBeats).toBeUndefined();
  });

  it('move names: the aliases, a raw move id, and nothing else', () => {
    for (const id of Object.values(CHART_MOVES)) expect(moveClip(id)?.id).toBe(id);
    expect(moveClip('babyfreeze')?.category).toBe('freeze');
    expect(moveClip('dance_trans_spin')?.name).toBe('Spin');
    // MUSIC-SUITE P9 moves: 'moonwalk' USED to be the example of a name that is not a move (it asserted null here); the
    // captured moonwalk (CMU 90_32) is a move now, so the rule the old line held — an unknown name is null — is held on a
    // move nobody captured instead: locking, which CMU and UAL lack (p9/MOCAP-WANTED.md lists the Mixamo take).
    expect(moveClip('moonwalk')?.id).toBe('dance_pop_moonwalk');
    for (const m of CAPTURED_MOVES) expect(moveClip(m.id)).toBe(m);
    expect(moveClip('locking')).toBeNull();
    expect(moveClip('dance_pop_locking')).toBeNull();
    expect(moveClip(undefined)).toBeNull();
    // the pad's four moves are four different instruments
    expect(new Set(Object.values(FREESTYLE_PAD).map((id) => moveClip(id)!.category)).size).toBe(4);
  });
});

describe('the validator catches each rule (one broken chart per rule)', () => {
  const W = song('warmup');
  const fails = (c: DanceChart, s: FelSong, re: RegExp): void => {
    const p = validateChart(c, s);
    expect(p.some((x) => re.test(x)), `expected /${re.source}/ in:\n  ${p.join('\n  ')}`).toBe(true);
  };

  it('identity: format, song, bpm, bars', () => {
    fails({ ...warm(), format: 'x' }, W, /format/);
    fails(warm(), song('cypher'), /chart is for "warmup"/);
    fails({ ...warm(), bpm: 90 }, W, /bpm 90/);
    fails({ ...warm(), bars: 35 }, W, /bars 35/);
    expect(CHART_FORMAT).toBe('fel-dance-chart/1');
  });

  it('sections must be the song\'s own, each filled exactly by its phrases', () => {
    const c = warm(); c.sections[1] = { ...c.sections[1], name: 'hook' };
    fails(c, W, /section 1 is hook/);
    const d = warm(); d.sections[0].play = ['intro'];
    fails(d, W, /plays 2 bars of phrases, it is 4/);
    const e = warm(); e.sections[0].play = ['intro', 'nope'];
    fails(e, W, /unknown phrase "nope"/);
  });

  it('every note on the difficulty\'s grid (quarters at difficulty 1), in order, inside its phrase', () => {
    const c = warm(); c.phrases.verseA.notes![1].b = 4.5;
    fails(c, W, /off the 1-beat grid of difficulty 1/);
    const d = warm(); d.phrases.verseA.notes!.reverse();
    fails(d, W, /not after the note before it/);
    const e = warm(); e.phrases.verseA.notes!.push({ b: 8 });
    fails(e, W, /outside the phrase/);
  });

  it('double taps only where the difficulty allows them, and never on a hold', () => {
    const c = warm(); c.phrases.verseA.notes![0].x2 = 0.5;
    fails(c, W, /a double of 0.5 beats is not allowed at difficulty 1/);
    const cy = clone(chartFor('cypher')!);
    cy.phrases.cvB.notes![1].x2 = 0.25;                     // difficulty 2 allows eighth doubles only
    fails(cy, song('cypher'), /a double of 0.25 beats/);
    const h = clone(chartFor('cypher')!);
    h.phrases.brk.notes![0].x2 = 0.5;
    fails(h, song('cypher'), /cannot also be a hold/);
  });

  it(`a hold lasts a beat at least, ends at least ${HOLD_GAP_BEATS} beat before the next press, and starts on an eighth`, () => {
    const c = warm(); c.phrases.break.notes![0].hold = 3.75;   // ends 0.25 before the freeze on beat 4
    fails(c, W, /less than 0.5 beat before the next press/);
    const d = warm(); d.phrases.break.notes![0].hold = 0;
    fails(d, W, /is not a positive number of sixteenths/);
    const short = warm(); short.phrases.break.notes![0].hold = 0.75;
    fails(short, W, /shorter than 1 beat/);
    expect(MIN_HOLD_BEATS).toBe(1);
    const e = clone(chartFor('battle')!); e.phrases.bin2.notes![2] = { b: 4.25, m: 'babyfreeze', hold: 1 };
    fails(e, song('battle'), /a hold starts on an eighth/);
  });

  it('the difficulty\'s least press gap', () => {
    const c = warm(); c.phrases.verseA.notes!.splice(1, 0, { b: 3 }, { b: 3.5 } as never);
    fails(c, W, /presses 0.5 beats apart/);
    expect(DIFFICULTY_RULES[1].minGapBeats).toBe(1);
    expect(DIFFICULTY_RULES[6].minGapBeats).toBe(0.25);
  });

  // MUSIC-SUITE P9 FIX PASS (2026-09-29): the gaps are checked on the SWUNG beats the judge plays too. canals kvD's double
  // { b 3.5, x2 0.25 } passed the straight check (0.25) while its second tap, an odd sixteenth, swung to 3.775 — 0.225
  // beats (114 ms at 118 BPM) before the move on beat 4, under difficulty 5's least gap. The shipped chart now doubles on
  // 3 + an eighth (same presses, same density, both taps on the kick / clap and the bass — the musicality test above);
  // the old one fails here.
  it('the least gap as PLAYED: a swung odd sixteenth closer than the difficulty allows fails (canals kvD, before the fix)', () => {
    const K = song('canals');
    expect(K.swing).toBeGreaterThan(0.5);
    const c = clone(chartFor('canals')!);
    const d = c.phrases.kvD.notes!.find((n) => n.x2 !== undefined)!;
    expect(d).toEqual({ b: 3, x2: 0.5 });
    expect(validateChart(c, K)).toEqual([]);
    d.b = 3.5; d.x2 = 0.25;                                              // the chart as the phase shipped it
    fails(c, K, /presses 0\.225 beats apart as played/);
    expect(swingBeat(155.75, K.swing)).toBeCloseTo(155.775, 9);
  });

  it('density inside the band around the song\'s target (too sparse and too dense both fail)', () => {
    const sparse = warm();
    for (const id of ['hookA', 'hookB', 'verseA', 'verseB', 'verseC']) sparse.phrases[id].notes = sparse.phrases[id].notes!.slice(0, 1);
    fails(sparse, W, /taps a minute is outside/);
    const dense = warm();
    for (const id of ['verseA', 'verseB']) dense.phrases[id].notes = [0, 1, 2, 3, 4, 5, 6, 7].map((b) => (b === 0 ? { b, m: id === 'verseA' ? 'toprock' : 'sixstep' } : { b }));
    fails(dense, W, /taps a minute is outside/);
  });

  it('a move\'s instrument must play in its section; every stem the song lists must be called by a move somewhere', () => {
    const c = warm(); c.phrases.intro.notes![0].m = 'windmill';   // the intro plays keys + fx, not lead
    fails(c, W, /which does not play lead/);
    const d = warm();
    for (const ph of Object.values(d.phrases)) for (const n of ph.notes ?? []) if (n.m === 'sixstep') n.m = 'twostep';
    fails(d, W, /no move ever calls bass/);
  });

  it('a freeze hold on every break bar whose section plays horns', () => {
    const c = warm(); c.phrases.break.notes![1] = { b: 4, m: 'spin' };
    fails(c, W, /break bar 22: no freeze hold/);
    const d = warm(); delete d.phrases.break.notes![0].hold;
    fails(d, W, /break bar 21: no freeze hold/);
  });

  it('freestyle: present, alternating with called bars, not more than the share, only where the pad is heard, at an allowed rate', () => {
    const none = warm();
    for (const s of none.sections) s.play = s.play.map((p) => (p === 'free2' ? 'hookA' : p));
    fails(none, W, /no freestyle bar/);
    const twice = warm(); twice.sections[2].play = ['hookA', 'free2', 'free2', 'hookA'];
    fails(twice, W, /follows another freestyle phrase/);
    const intro = warm(); intro.sections[0].play = ['free2', 'intro'];
    fails(intro, W, /section 0 \(intro\) has freestyle but does not play perc, drums/);
    const rate = warm(); rate.phrases.free2.free!.every = 1;
    fails(rate, W, /freestyle every 1 beats is not allowed at difficulty 1/);
    expect(MAX_FREE_SHARE).toBe(0.4);
  });

  it('the routine ends in the song\'s last bar, on a called move', () => {
    const c = warm(); c.phrases.outro.notes = [{ b: 0, m: 'wave' }, { b: 2, m: 'spin' }];
    c.phrases.outro.notes.push({ b: 4, m: 'sixstep' } as never);   // an 8-beat clip from beat 4 runs past the song
    fails(c, W, /the routine ends at beat/);
  });

  it('an accent needs a move running — at the start and again after a freestyle phrase', () => {
    const c = warm(); c.phrases.hookA.notes![0] = { b: 0 };
    fails(c, W, /an accent with no move running/);
  });
});
