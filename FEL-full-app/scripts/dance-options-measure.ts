// dance-options-measure — THE NUMBERS BEHIND docs/DANCE-EXTRAS-OPTIONS.md (lane/dance-options, 2026-10-17).
//
// The owner asked to choose before anything is built. The four open choices lane/dance-extras (d600da41) left are
// (a) flip CHART_MOVES' six aliases to the captured moves, (b) a STYLE variety bonus, (c) more or longer freestyle
// sections, (d) re-time moonwalk and robot. This script measures each variant on the six SHIPPED charts, with the same
// pure functions the room plays them through (dance/chart.ts planChart + validateChart, chartPlay.chartForLevel,
// DanceCore.DancePerformance, floorPhase.onFloor, freestyle.routeFreestyle through tests/helpers/dancePressChain's
// runChain, danceClips.closedCycle). It changes nothing: every variant is a CLONE of a chart, and the one variant that
// needs a captured move to be a different length sets that field on the in-memory row and puts it back in a finally.
//
// Not a *-tests.ts: scripts/ci-suite.ts does not run it. Run from FEL-full-app/:
//   npx tsx scripts/dance-options-measure.ts [out.json]
// It prints markdown tables (the doc quotes them) and, given a path, writes every number as JSON.

import { writeFileSync } from 'node:fs';
import {
  chartFor, CHART_SONG_IDS, chartStats, planChart, stepsFromPresses, styleBeatsFromPresses, validateChart, SCORED_STEP_CAP,
  type DanceChart,
} from '../lib/babylon/dance/chart';
import {
  chartForLevel, categoryOf, buttonForStep, GROOVE_STYLE, HOLD_STYLE_CLEAN, GROOVE_WINDOW_SEC,
} from '../lib/babylon/dance/chartPlay';
import { DancePerformance, beatDuration, DANCE_LIBRARY, type DanceStep } from '../lib/babylon/core/DanceCore';
import { CAPTURED_MOVES, isCapturedMove } from '../lib/babylon/dance/moves';
import { onFloor } from '../lib/babylon/dance/floorPhase';
import { FREESTYLE_PAD, type FreeSpan, type PadSlot } from '../lib/babylon/dance/freestyle';
import { songFor, type FelSong } from '../lib/babylon/dance/felSongs';
import { danceCeiling } from '../lib/arena-score-integrity';
import { closedCycle, MOVE_CAPTURES } from '../lib/babylon/anim/danceClips';
import { MOCAP_DANCE_CLIPS } from '../lib/babylon/anim/authored/mocapDance';
import { runChain, type TimedInput } from '../tests/helpers/dancePressChain';
import type { FelInput } from '../lib/babylon/core/InputBus';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const SONGS: FelSong[] = CHART_SONG_IDS.map((id) => songFor(id)!).sort((a, b) => a.difficulty - b.difficulty);
const out: Record<string, unknown> = {};

/** A flawless run on the press clock (chart.test.ts's own helper): every step hit on its beat. */
function flawless(steps: readonly DanceStep[], bpm: number): number {
  const perf = new DancePerformance(bpm);
  perf.setRoutine([...steps]);
  perf.start(0);
  const bd = beatDuration(bpm);
  for (const x of steps) { perf.update(x.beat * bd); perf.hit(x.beat * bd); }
  return perf.result().score;
}

// ── (a) the aliases ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** The six short names and the captured move each would answer with once flipped. */
const FLIP: Readonly<Record<string, string>> = {
  kickstep: 'dance_toprock_kick', sidefreeze: 'dance_freeze_side', helicopter: 'dance_power_helicopter',
  headstand: 'dance_power_headstand', moonwalk: 'dance_pop_moonwalk', robot: 'dance_pop_robot',
};

/** A chart with the named short names spelled as the captures' ids — what flipping those CHART_MOVES lines does. */
function flipped(chart: DanceChart, names: readonly string[]): DanceChart {
  const c = clone(chart);
  for (const ph of Object.values(c.phrases)) for (const n of ph.notes ?? []) if (n.m && names.includes(n.m)) n.m = FLIP[n.m];
  return c;
}

/** Run `fn` with captured moves at other lengths (the (d) "2-beat" variant), then put the rows back. */
function withBeats<T>(beats: Readonly<Record<string, number>>, fn: () => T): T {
  const saved = new Map<string, number>();
  for (const m of CAPTURED_MOVES) if (beats[m.id] !== undefined) { saved.set(m.id, m.beats); (m as { beats: number }).beats = beats[m.id]; }
  try { return fn(); } finally { for (const m of CAPTURED_MOVES) if (saved.has(m.id)) (m as { beats: number }).beats = saved.get(m.id)!; }
}

interface ChartRead {
  problems: string[];
  scored: number;
  cap: number | null;
  normal: number;
  hard: number; hardSteps: number;
  easy: number; easySteps: number;
  styleTaps: number;
  freezes: number; freezeHoldBeats: number;
  styleMax: number;
  floorSwitches: number;
  tapsPerMin: number;
  /** The scored steps as (beat, family): equal = the judge asks the same thing at the same time. */
  shape: string;
  demoted: string;
  /** Every scored captured move: how much of its clip plays before the next step starts (1 = the whole clip). */
  captured: { id: string; beat: number; played: number }[];
  freeSpans: FreeSpan[];
}

function read(chart: DanceChart, song: FelSong): ChartRead {
  const problems = validateChart(chart, song);
  const plan = planChart(chart, song);
  const steps = stepsFromPresses(plan.scored);
  const hardSteps = chartForLevel(steps, 'hard', plan.freeSpans);
  const easySteps = chartForLevel(steps, 'easy', plan.freeSpans);
  const freezes = steps.filter((s) => categoryOf(s) === 'freeze');
  let floorSwitches = 0;
  for (let i = 0; i + 1 < steps.length; i++) if (onFloor(steps[i].clipId, steps[i + 1].beat - steps[i].beat, steps[i].holdBeats)) floorSwitches++;
  const styleTaps = styleBeatsFromPresses(plan.style).length;
  return {
    problems,
    scored: steps.length,
    cap: SCORED_STEP_CAP[song.id] ?? null,
    normal: flawless(steps, song.bpm),
    hard: flawless(hardSteps, song.bpm), hardSteps: hardSteps.length,
    easy: flawless(easySteps, song.bpm), easySteps: easySteps.length,
    styleTaps,
    freezes: freezes.length,
    freezeHoldBeats: freezes.reduce((n, s) => n + s.holdBeats, 0),
    styleMax: styleTaps * GROOVE_STYLE + freezes.length * HOLD_STYLE_CLEAN,
    floorSwitches,
    tapsPerMin: Math.round(chartStats(chart, song).tapsPerMin * 10) / 10,
    shape: steps.map((s) => `${s.beat}:${categoryOf(s)}`).join(','),
    demoted: plan.demoted.map((p) => p.swungBeat).join(','),
    captured: steps.flatMap((s, i) => (isCapturedMove(s.clipId)
      ? [{ id: s.clipId, beat: s.beat, played: Math.min(1, ((steps[i + 1]?.beat ?? Infinity) - s.beat) / s.holdBeats) }] : [])),
    freeSpans: plan.freeSpans,
  };
}

/** How many times each short name is DANCED (expanded through the sections), scored or demoted to a STYLE tap. */
function aliasSites(chart: DanceChart, song: FelSong): Record<string, { scored: number; demoted: number }> {
  const plan = planChart(flipped(chart, Object.keys(FLIP)), song);
  const sites: Record<string, { scored: number; demoted: number }> = {};
  const nameOf = new Map(Object.entries(FLIP).map(([k, v]) => [v, k]));
  // the shipped opt-in notes already name a captured id; count only the notes the flip turned (the raw chart names the short name)
  const raw = new Set<string>();
  chart.sections.forEach((sec) => {
    let bar = sec.bar;
    for (const pid of sec.play) {
      const ph = chart.phrases[pid];
      for (const n of ph?.notes ?? []) if (n.m && FLIP[n.m]) raw.add(`${(bar - 1) * 4 + n.b}`);
      bar += ph?.bars ?? 0;
    }
  });
  for (const p of plan.presses) {
    if (p.kind !== 'move' || !raw.has(`${p.beat}`)) continue;
    const name = nameOf.get(p.clipId)!;
    sites[name] ??= { scored: 0, demoted: 0 };
    if (plan.demoted.includes(p)) sites[name].demoted++; else sites[name].scored++;
  }
  return sites;
}

const A_VARIANTS: { key: string; label: string; names: string[]; beats?: Record<string, number> }[] = [
  { key: 'A0', label: 'shipped (no flip)', names: [] },
  { key: 'A1', label: 'flip all six', names: Object.keys(FLIP) },
  { key: 'A2', label: 'flip the three that are no longer than their stand-in (kick step, helicopter, headstand)', names: ['kickstep', 'helicopter', 'headstand'] },
  { key: 'A3', label: 'flip five, keep the side freeze on the baby freeze', names: ['kickstep', 'helicopter', 'headstand', 'moonwalk', 'robot'] },
  { key: 'A1+SF2', label: 'flip all six, with the side freeze a 2-beat step (the baby freeze\'s length)', names: Object.keys(FLIP), beats: { dance_freeze_side: 2 } },
  { key: 'A1+D2', label: 'flip all six, with moonwalk and robot as 2-beat steps (option d2)', names: Object.keys(FLIP), beats: { dance_pop_moonwalk: 2, dance_pop_robot: 2 } },
  { key: 'A3+D2', label: 'flip five (no side freeze), moonwalk and robot as 2-beat steps', names: ['kickstep', 'helicopter', 'headstand', 'moonwalk', 'robot'], beats: { dance_pop_moonwalk: 2, dance_pop_robot: 2 } },
];

function sectionA(): void {
  const res: Record<string, Record<string, ChartRead>> = {};
  const sites: Record<string, Record<string, { scored: number; demoted: number }>> = {};
  for (const song of SONGS) {
    const chart = chartFor(song.id)!;
    sites[song.id] = aliasSites(chart, song);
    res[song.id] = {};
    for (const v of A_VARIANTS) res[song.id][v.key] = withBeats(v.beats ?? {}, () => read(flipped(chart, v.names), song));
  }
  out.aliasSites = sites;
  out.aliases = res;
  // CONTROLS: the shipped baseline must read what the repo's own tests pin, or nothing below can be trusted
  const pinFlawless = { warmup: 9555, cypher: 10875, goldenhour: 12240, battle: 15105, canals: 16605, evolution: 19740 };   // chart.test.ts
  const pinFloor = { warmup: 2, cypher: 6, goldenhour: 4, battle: 9, canals: 9, evolution: 8 };                              // floorPhase.test.ts
  for (const song of SONGS) {
    const b = res[song.id].A0;
    if (b.problems.length || b.normal !== pinFlawless[song.id as keyof typeof pinFlawless] || b.floorSwitches !== pinFloor[song.id as keyof typeof pinFloor]) {
      throw new Error(`control failed on ${song.id}: the probe does not read the shipped chart the way the repo's tests do`);
    }
  }
  console.log('\nControls: on the shipped charts the probe reads the flawless scores chart.test.ts pins and the mid-floor switches floorPhase.test.ts pins, on all six songs.');

  console.log('\n## (a) alias sites in the shipped charts (danced through every section; scored / demoted to a STYLE tap by the cap)\n');
  console.log('| song | ' + Object.keys(FLIP).join(' | ') + ' |');
  console.log('|---|' + Object.keys(FLIP).map(() => '---').join('|') + '|');
  for (const song of SONGS) {
    console.log(`| ${song.id} | ` + Object.keys(FLIP).map((k) => { const s = sites[song.id][k]; return s ? `${s.scored} / ${s.demoted}` : '–'; }).join(' | ') + ' |');
  }

  console.log('\n## (a) per variant, per song: validator, NORMAL / HARD / EASY flawless score (Δ vs shipped), STYLE max, mid-floor switches\n');
  for (const v of A_VARIANTS) {
    console.log(`\n### ${v.key} — ${v.label}\n`);
    console.log('| song | valid | scored (cap) | same steps? | NORMAL | HARD (steps) | EASY (steps) | STYLE max | freeze hold beats | mid-floor switches | captured moves cut early |');
    console.log('|---|---|---|---|---|---|---|---|---|---|---|');
    for (const song of SONGS) {
      const r = res[song.id][v.key], b = res[song.id].A0;
      const d = (x: number, y: number) => (x === y ? `${x}` : `${x} (${x - y > 0 ? '+' : ''}${x - y})`);
      const cut = r.captured.filter((c) => c.played < 1);
      console.log(`| ${song.id} | ${r.problems.length ? `**NO (${r.problems.length})**` : 'yes'} | ${r.scored} (${r.cap}) | ${r.shape === b.shape ? 'yes' : '**no**'} | ${d(r.normal, b.normal)} | ${d(r.hard, b.hard)} (${d(r.hardSteps, b.hardSteps)}) | ${d(r.easy, b.easy)} (${r.easySteps}) | ${d(r.styleMax, b.styleMax)} | ${d(r.freezeHoldBeats, b.freezeHoldBeats)} | ${d(r.floorSwitches, b.floorSwitches)} | ${cut.length}/${r.captured.length}${cut.length ? ` (${cut.map((c) => `${c.id.replace('dance_', '')}@${c.beat}:${Math.round(c.played * 100)}%`).join(', ')})` : ''} |`);
    }
    for (const song of SONGS) {
      const r = res[song.id][v.key];
      if (r.problems.length) console.log(`\n- ${song.id} validator: ${r.problems.slice(0, 4).join(' · ')}${r.problems.length > 4 ? ` · (+${r.problems.length - 4} more)` : ''}`);
    }
  }
  console.log(`\nArena dance ceiling (danceCeiling, counts DANCE_LIBRARY's shortest clip): ${danceCeiling()}; shortest captured move: ${Math.min(...CAPTURED_MOVES.map((m) => m.beats))} beats, shortest library clip ${Math.min(...DANCE_LIBRARY.map((c) => c.beats))}.`);
}

// ── (b) a STYLE variety bonus ───────────────────────────────────────────────────────────────────────────────────────────

const press = (btn: PadSlot): FelInput => ({ t: 'button', btn, pressed: true });

/** The player models inside a freestyle section. `on` = one press per slot on its beat; `mash` = 8 presses a second. */
const MODELS: { key: string; label: string; button: (i: number) => PadSlot; mash?: boolean }[] = [
  { key: 'oneA', label: 'one button (A) on every slot', button: () => 'A' },
  { key: 'two', label: 'two buttons alternating (A, B) on every slot', button: (i) => (i % 2 ? 'B' : 'A') },
  { key: 'four', label: 'all four in turn (A B X Y) on every slot', button: (i) => (['A', 'B', 'X', 'Y'] as const)[i % 4] },
  { key: 'mashA', label: 'mashing A, 8 presses a second, through the section', button: () => 'A', mash: true },
  { key: 'mash4', label: 'mashing all four in turn, 8 a second', button: (i) => (['A', 'B', 'X', 'Y'] as const)[i % 4], mash: true },
];

/** Example bonus rules (example values — every one is a NEW TUNED NUMBER the owner would set). */
const B_RULES: { key: string; label: string; bonus: (sec: { btn: PadSlot; move: string; slot: boolean; offMs: number }[]) => number }[] = [
  { key: 'B1', label: 'section-end bonus: +GROOVE_STYLE (50) for each distinct button that hit a slot, past the first (max +150 a section)',
    bonus: (sec) => GROOVE_STYLE * Math.max(0, new Set(sec.filter((p) => p.slot).map((p) => p.btn)).size - 1) },
  { key: 'B2', label: 'change-up: a slot hit with a different button from the previous slot hit pays +25',
    bonus: (sec) => { let n = 0; let last: PadSlot | null = null; for (const p of sec) { if (!p.slot) continue; if (last && p.btn !== last) n += 25; last = p.btn; } return n; } },
  { key: 'B3', label: 'new move: a slot hit that dances a move not yet danced in this section pays +25',
    bonus: (sec) => { const seen = new Set<string>(); let n = 0; for (const p of sec) { if (p.slot && !seen.has(p.move)) n += 25; seen.add(p.move); } return n; } },
  { key: 'B4', label: '(not variety — for contrast) on the beat: a slot hit within 40 ms (the PERFECT window) pays +25',
    bonus: (sec) => sec.filter((p) => p.slot && p.offMs <= 40).length * 25 },
];

function sectionB(): void {
  const rows: Record<string, unknown> = {};
  console.log('\n## (b) STYLE today, and what a variety bonus would add — the shipped charts, flawless steps, every STYLE tap outside the section hit\n');
  console.log('STYLE is its own tally: shown on the results banner and sent as `stats.style`; the score, the session pay (app/api/sessions reads `score`, never `style`), the stars, the Arena ceiling and the local bests (danceBests: score, grade, combo) never read it.\n');
  const header = ['song', 'slots in section', 'STYLE max today', 'section share', ...MODELS.map((m) => m.key)];
  console.log('| ' + header.join(' | ') + ' |');
  console.log('|' + header.map(() => '---').join('|') + '|');
  const bonusRows: string[] = [];
  for (const song of SONGS) {
    const plan = planChart(chartFor(song.id)!, song);
    const steps = stepsFromPresses(plan.scored);
    const styleBeats = styleBeatsFromPresses(plan.style);
    const spans = plan.freeSpans;
    const bd = beatDuration(song.bpm);
    const inSpan = (b: number) => spans.some((f) => b >= f.start && b < f.end);
    const slots = styleBeats.filter(inSpan);
    const base: TimedInput[] = [
      ...steps.map((s) => ({ at: s.beat * bd, ev: press(buttonForStep(s)) })),
      ...styleBeats.filter((b) => !inSpan(b)).map((b) => ({ at: b * bd, ev: press('A') })),
    ];
    const endAt = (Math.max(...steps.map((s) => s.beat + s.holdBeats)) + 4) * bd;
    const plain = runChain({ steps, bpm: song.bpm, match: true, inputs: base, styleBeats, freeSpans: spans, endAt });
    const freezes = steps.filter((s) => categoryOf(s) === 'freeze').length;
    const styleMax = styleBeats.length * GROOVE_STYLE + freezes * HOLD_STYLE_CLEAN;
    const nearStep = (at: number) => steps.some((s) => Math.abs(s.beat * bd - at) <= 0.2);
    // …and a press within GROOVE_WINDOW_SEC of a STYLE tap OUTSIDE the section takes that tap (routeFreestyle's styleTapAt reads every
    // style beat), so the player's own on-beat press for it then goes to the judge as a wild tap
    const nearOtherTap = (at: number) => styleBeats.some((b) => !inSpan(b) && Math.abs(b * bd - at) <= GROOVE_WINDOW_SEC + 0.01);
    const cells: string[] = [];
    const perModel: Record<string, unknown> = {};
    for (const m of MODELS) {
      const all: { at: number; btn: PadSlot }[] = [];
      for (const f of spans) {
        if (m.mash) { let i = 0; for (let t = f.start * bd + 0.01; t < f.end * bd; t += 0.125) all.push({ at: t, btn: m.button(i++) }); }
        else slots.filter((b) => b >= f.start && b < f.end).forEach((b, i) => all.push({ at: b * bd, btn: m.button(i) }));
      }
      const run = (ps: { at: number; btn: PadSlot }[]) =>
        runChain({ steps, bpm: song.bpm, match: true, inputs: [...base, ...ps.map((p) => ({ at: p.at, ev: press(p.btn) }))], styleBeats, freeSpans: spans, endAt });
      // A press the judge would take for a step is the step's (routeFreestyle), so a mash that runs to the section's last instant can catch
      // the step right after it EARLY, or take the first STYLE tap after the section (then the player's own press for that tap is a wild
      // tap). That is measured on the whole mash (scoreDelta) and reported, not hidden; the STYLE tally below is read off the presses that
      // stay clear of both, so each one is a freestyle press the chain danced, in order.
      const scoreDelta = run(all).score - plain.score;
      const sec = all.filter((p) => !nearStep(p.at) && !nearOtherTap(p.at));
      const r = run(sec);
      if (r.freestyle !== sec.length || r.score !== plain.score) throw new Error(`${song.id} ${m.key}: a clear press was not a freestyle press (${r.freestyle}/${sec.length}, score ${r.score - plain.score})`);
      // which presses took a slot: the chain's own rule (the nearest untaken slot within GROOVE_WINDOW_SEC, once each)
      const taken = new Set<number>();
      const tagged = sec.map((p, i) => {
        const beat = p.at / bd;
        const s = slots.filter((b) => !taken.has(b) && Math.abs(b - beat) <= GROOVE_WINDOW_SEC / bd).sort((x, y) => Math.abs(x - beat) - Math.abs(y - beat))[0];
        if (s !== undefined) taken.add(s);
        return { btn: p.btn, move: r.moves[i], slot: s !== undefined, offMs: s === undefined ? Infinity : Math.abs(s - beat) * bd * 1000 };
      });
      const slotStyle = r.style - plain.style;
      if (slotStyle !== tagged.filter((t) => t.slot).length * GROOVE_STYLE) throw new Error(`${song.id} ${m.key}: slot tally mismatch (${slotStyle})`);
      const bonuses = Object.fromEntries(B_RULES.map((b) => {
        let n = 0;
        for (const f of spans) n += b.bonus(tagged.filter((_, i) => sec[i].at >= f.start * bd && sec[i].at < f.end * bd));
        return [b.key, n];
      }));
      perModel[m.key] = { scoreDeltaToEdge: scoreDelta, styleRun: r.style + freezes * HOLD_STYLE_CLEAN, slotStyle, slotsHit: taken.size, distinctMoves: new Set(r.moves).size, presses: sec.length, bonuses };
      cells.push(`${slotStyle} (${taken.size}/${slots.length})${scoreDelta ? ` · to the edge: score ${scoreDelta > 0 ? '+' : ''}${scoreDelta}` : ''}`);
      bonusRows.push(`| ${song.id} | ${m.key} | ${slotStyle} | ${new Set(r.moves).size} | ${B_RULES.map((b) => `+${bonuses[b.key]}`).join(' | ')} |`);
    }
    rows[song.id] = { slots: slots.length, styleTaps: styleBeats.length, freezes, styleMax, models: perModel };
    console.log(`| ${song.id} | ${slots.length} | ${styleMax} | ${Math.round((slots.length * GROOVE_STYLE / styleMax) * 1000) / 10} % | ${cells.join(' | ')} |`);
  }
  console.log('\n(cells: the STYLE the freestyle section pays today under that player, and the slots it took)\n');
  console.log('Models: ' + MODELS.map((m) => `**${m.key}** ${m.label}`).join('; ') + '.\n');
  console.log('| song | model | section STYLE today | distinct moves danced | ' + B_RULES.map((b) => b.key).join(' | ') + ' |');
  console.log('|---|---|---|---|' + B_RULES.map(() => '---').join('|') + '|');
  for (const r of bonusRows) console.log(r);
  console.log('\nRules: ' + B_RULES.map((b) => `**${b.key}** ${b.label}`).join('; ') + '.');
  console.log(`\nThe pad's decks: ${(Object.keys(FREESTYLE_PAD) as PadSlot[]).map((k) => `${k} ${FREESTYLE_PAD[k].length} moves`).join(', ')} — one button already cycles its moves on each press.`);
  out.style = rows;
}

// ── (c) more or longer freestyle sections ───────────────────────────────────────────────────────────────────────────────

/** Mark the free phrase at (section index, play index) a freestyle section, as a NEW phrase id (the shipped way: the same slots). */
function markFree(c: DanceChart, si: number, pi: number): void {
  const pid = c.sections[si].play[pi];
  const ph = c.phrases[pid];
  if (!ph?.free) throw new Error(`${pid} is not a free phrase`);
  const id = `${pid}__FS${si}_${pi}`;
  c.phrases[id] = { ...clone(ph), free: { ...ph.free, freestyle: true } };
  c.sections[si].play[pi] = id;
}
/** Replace the called phrase at (si, pi) with a freestyle phrase of the same bars, at `every` (the longer-section variant). */
function replaceWithFree(c: DanceChart, si: number, pi: number, every: number): void {
  const pid = c.sections[si].play[pi];
  const ph = c.phrases[pid];
  const id = `${pid}__FREE${si}_${pi}`;
  c.phrases[id] = { bars: ph.bars, free: { every, freestyle: true } };
  c.sections[si].play[pi] = id;
}
const freeAt = (c: DanceChart): { si: number; pi: number; flagged: boolean }[] =>
  c.sections.flatMap((s, si) => s.play.map((pid, pi) => ({ si, pi, ph: c.phrases[pid] })).filter((x) => x.ph?.free).map(({ si: a, pi, ph }) => ({ si: a, pi, flagged: ph.free!.freestyle === true })));

const C_VARIANTS: { key: string; label: string; make: (c: DanceChart, song: FelSong) => DanceChart }[] = [
  { key: 'C0', label: 'shipped: one 2-bar section at the end of the last hook', make: (c) => c },
  { key: 'C1', label: 'one more: the first hook\'s last free phrase is a section too (2 sections a song)',
    make: (c0) => { const c = clone(c0); const h = c.sections.findIndex((s) => s.name === 'hook'); const fp = freeAt(c).filter((x) => x.si === h && !x.flagged).pop(); if (fp) markFree(c, fp.si, fp.pi); return c; } },
  { key: 'C2', label: 'every free phrase is a section (every free 2 bars in the song)',
    make: (c0) => { const c = clone(c0); for (const x of freeAt(c)) if (!x.flagged) markFree(c, x.si, x.pi); return c; } },
  { key: 'C3', label: 'longer: the climax section grows from 2 to 4 bars (the called phrase before it becomes freestyle)',
    make: (c0) => {
      const c = clone(c0);
      const f = freeAt(c).find((x) => x.flagged)!;
      const every = c.phrases[c.sections[f.si].play[f.pi]].free!.every;
      if (f.pi > 0) replaceWithFree(c, f.si, f.pi - 1, every);
      return c;
    } },
  { key: 'C4', label: 'longer AND one more: C1 + C3', make: (c0, song) => C_VARIANTS[3].make(C_VARIANTS[1].make(c0, song), song) },
];

function sectionC(): void {
  const res: Record<string, Record<string, unknown>> = {};
  console.log('\n## (c) more or longer freestyle sections — each variant applied to the shipped chart\n');
  for (const v of C_VARIANTS) {
    console.log(`\n### ${v.key} — ${v.label}\n`);
    console.log('| song | valid | sections (bars) | freestyle share of the song | scored (cap) | NORMAL Δ | same steps? | STYLE taps | taps/min (band) | next step after a section (ms, least) |');
    console.log('|---|---|---|---|---|---|---|---|---|---|');
    for (const song of SONGS) {
      const base = read(chartFor(song.id)!, song);
      const chart = v.make(chartFor(song.id)!, song);
      const r = read(chart, song);
      const bars = r.freeSpans.reduce((n, f) => n + (f.end - f.start) / 4, 0);
      // the EDGE: how soon after a section ends the next scored step comes (a press in its last 200 ms is that step's, judged early)
      const steps = stepsFromPresses(planChart(chart, song).scored);
      const edgeMs = Math.min(...r.freeSpans.map((f) => { const nx = steps.find((x) => x.beat >= f.end - 1e-9); return nx ? Math.round((nx.beat - f.end) * beatDuration(song.bpm) * 1000) : Infinity; }));
      const band = `${Math.round(song.targetTapsPerMin * 0.8 * 10) / 10}–${Math.round(song.targetTapsPerMin * 1.25 * 10) / 10}`;
      res[song.id] ??= {};
      res[song.id][v.key] = { edgeMs, valid: r.problems.length === 0, problems: r.problems, sections: r.freeSpans.length, bars, scored: r.scored, normal: r.normal, normalDelta: r.normal - base.normal, sameSteps: r.shape === base.shape, styleTaps: r.styleTaps, tapsPerMin: r.tapsPerMin };
      console.log(`| ${song.id} | ${r.problems.length ? `**NO (${r.problems.length})**` : 'yes'} | ${r.freeSpans.length} (${bars}) | ${Math.round((bars / song.bars) * 1000) / 10} % | ${r.scored} (${r.cap}) | ${r.normal - base.normal} | ${r.shape === base.shape ? 'yes' : '**no**'} | ${r.styleTaps} (${r.styleTaps - base.styleTaps >= 0 ? '+' : ''}${r.styleTaps - base.styleTaps}) | ${r.tapsPerMin} (${band}) | ${edgeMs === Infinity ? '–' : edgeMs} |`);
    }
    for (const song of SONGS) {
      const x = res[song.id][v.key] as { problems: string[] };
      if (x.problems.length) console.log(`\n- ${song.id} validator: ${x.problems.slice(0, 3).join(' · ')}`);
    }
  }
  out.freestyle = res;
}

// ── (d) re-time moonwalk and robot ──────────────────────────────────────────────────────────────────────────────────────

const REF_BPM = 120;   // danceClips.ts REF_BPM = DanceMode's CLIP_REF_BPM: clips are built at 120 and played at bpm / 120

function sectionD(): void {
  const res: Record<string, unknown> = {};
  console.log('\n## (d) moonwalk and robot: how the capture is fitted into the step, per song tempo\n');
  console.log('A step is built at 120 BPM (4 beats = 2 s) and played at bpm / 120. `cycle` = the capture\'s closed loop; "speed" = how fast the dancer moves against the real capture (1.00 = the mover\'s own pace); "beats/cycle" = how many song beats one loop takes (a moonwalk loop is two slides, a robot loop a set of stiff steps and a turn).\n');
  const songsBpm = SONGS.map((s) => s.bpm);
  for (const id of ['dance_pop_moonwalk', 'dance_pop_robot'] as const) {
    const plan = MOVE_CAPTURES[id];
    const cap = MOCAP_DANCE_CLIPS.find((c) => c.name === plan.clip)!;
    const cyc = closedCycle(cap.keys, cap.root!, plan.minCycleSec ?? 0.5);
    const len = cap.keys[cyc.to].t - cap.keys[cyc.from].t;
    const span = /([\d.]+)[–-]([\d.]+)s/.exec(cap.source);
    const real = span ? (Number(span[2]) - Number(span[1])) / cap.duration : 1;
    /** One fitting: a step of `beats`, drop/rise in/out beats; `lock` forces each loop onto `lock` beats (else the real-speed rule). */
    const fit = (beats: number, inB: number, outB: number, lock?: number) => {
      const T = (beats * 60) / REF_BPM, win = T - ((inB + outB) * 60) / REF_BPM;
      const reps = lock ? Math.max(1, Math.round((beats - inB - outB) / lock)) : Math.max(1, Math.round(win / (len * real)));
      const scale = win / (reps * len);
      const beatsPerCycle = (len * scale * REF_BPM) / 60;
      return { reps, beatsPerCycle, speed: songsBpm.map((b) => Math.round(((real * b) / (REF_BPM * scale)) * 100) / 100) };
    };
    const variants = {
      D0: { label: 'shipped: 4-beat step, ¼-beat in/out, loop at the capture\'s real speed', ...fit(4, 0.25, 0.25) },
      D1: { label: 'beat-locked: 4-beat step, each loop snapped to whole beats (moonwalk 2 beats a loop, robot 4 with no ramps)', ...(id === 'dance_pop_moonwalk' ? fit(4, 0, 0, 2) : fit(4, 0, 0, 4)) },
      D2: { label: '2-beat step (the arm wave\'s length), one loop', ...fit(2, 0.25, 0.25) },
      D3: { label: '8-beat step (the windmill\'s length), real-speed loops', ...fit(8, 0.25, 0.25) },
    };
    res[id] = { cycleSec: Math.round(len * 1000) / 1000, cycleErr: Math.round(cyc.err * 100) / 100, real: Math.round(real * 1000) / 1000, variants };
    console.log(`\n### ${id} — closed cycle ${len.toFixed(2)} s (seam error ${cyc.err.toFixed(2)})\n`);
    console.log(`| variant | loops a step | beats a loop | speed at ${SONGS.map((s) => `${s.id} ${s.bpm}`).join(' / ')} |`);
    console.log('|---|---|---|---|');
    for (const [k, v] of Object.entries(variants)) console.log(`| ${k} — ${v.label} | ${v.reps} | ${v.beatsPerCycle.toFixed(2)} | ${v.speed.map((x) => x.toFixed(2)).join(' / ')} |`);
  }
  // where moonwalk / robot are danced today (opt-in + freestyle) and where they would be once (a) flips them
  const sites: Record<string, unknown> = {};
  for (const song of SONGS) {
    const chart = chartFor(song.id)!;
    for (const [k, beats] of [['D0', 4], ['D2', 2], ['D3', 8]] as const) {
      const r = withBeats({ dance_pop_moonwalk: beats, dance_pop_robot: beats }, () => read(flipped(chart, ['moonwalk', 'robot']), song));
      const pops = r.captured.filter((c) => c.id === 'dance_pop_moonwalk' || c.id === 'dance_pop_robot');
      (sites[song.id] ??= {} as Record<string, unknown>);
      (sites[song.id] as Record<string, unknown>)[k] = { valid: r.problems.length === 0, sites: pops, hard: r.hard, hardSteps: r.hardSteps };
    }
  }
  res.sites = sites;
  console.log('\nWhere they are danced as scored steps once moonwalk/robot are flipped (with their length under each variant): how much of the clip plays before the next step');
  console.log('\n| song | D0 (4 beats) | D2 (2 beats) | D3 (8 beats) |');
  console.log('|---|---|---|---|');
  for (const song of SONGS) {
    const s = sites[song.id] as Record<string, { valid: boolean; sites: { id: string; beat: number; played: number }[] }>;
    const cell = (k: string) => (s[k].sites.length ? s[k].sites.map((c) => `${c.id.replace('dance_pop_', '')}@${c.beat}: ${Math.round(c.played * 100)}%`).join(', ') : '–') + (s[k].valid ? '' : ' **(invalid)**');
    console.log(`| ${song.id} | ${cell('D0')} | ${cell('D2')} | ${cell('D3')} |`);
  }
  // where a 4-beat popping move would play WHOLE: scored wave-family steps (the arm wave, 2 beats) whose next step is 4+ beats later
  console.log('\nScored wave-family steps (where an arm wave, or a flipped moonwalk / robot, is danced) and how many have 4+ beats before the next step — room for a 4-beat popping move to play whole:\n');
  console.log('| song | scored wave steps | with 4+ beats of room | with 2+ beats |');
  console.log('|---|---|---|---|');
  const room: Record<string, unknown> = {};
  for (const song of SONGS) {
    const steps = stepsFromPresses(planChart(chartFor(song.id)!, song).scored);
    const waves = steps.map((x, i) => ({ x, gap: (steps[i + 1]?.beat ?? Infinity) - x.beat })).filter(({ x }) => categoryOf(x) === 'wave');
    room[song.id] = { waves: waves.length, room4: waves.filter((w) => w.gap >= 4).length, room2: waves.filter((w) => w.gap >= 2).length };
    console.log(`| ${song.id} | ${waves.length} | ${waves.filter((w) => w.gap >= 4).length} | ${waves.filter((w) => w.gap >= 2).length} |`);
  }
  res.waveRoom = room;
  // in a FREESTYLE section the move plays from one press to the next: pressing every slot shows `every` beats of each move
  console.log('\nIn a freestyle section a move plays from one press to the next. Pressing every slot (the chart\'s `every`): ');
  for (const song of SONGS) {
    const c = chartFor(song.id)!;
    const every = Object.values(c.phrases).find((ph) => ph.free?.freestyle)!.free!.every;
    const of = (id: string) => `${Math.round(Math.min(1, every / (CAPTURED_MOVES.find((m) => m.id === id)?.beats ?? DANCE_LIBRARY.find((m) => m.id === id)!.beats)) * 100)}%`;
    console.log(`- ${song.id}: a slot every ${every} beat(s) → ${of('dance_pop_moonwalk')} of a moonwalk or robot, ${of('dance_power_windmill')} of a windmill, ${of('dance_wave_arm')} of an arm wave`);
  }
  out.retime = res;
}

sectionA();
sectionB();
sectionC();
sectionD();
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
