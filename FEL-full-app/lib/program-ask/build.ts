// lib/program-ask/build.ts — PROGRAM-ASK (2026-11-02): a request → a complete, properly built program. Rule-based and
// deterministic: the same request and library give the same program, every time (program-ask.test.ts).
//
// THE ORDER:
//   1. the split (rules.ts splitFor) and each day's slots (rules.ts dayTemplate);
//   2. each slot filled from REAL library entries (./slots.ts eligible + SLOT_MATCH), ranked (rank below); a day that
//      repeats a template repeats its picks, and an A/B pair of days picks different entries where the library has them;
//      a slot nothing fits gets the best real stand-in, said in plain words;
//   3. the dose by goal and level (rules.ts GOAL_DOSE), then the WEEKLY VOLUME fit: sets per item moved until every
//      group's weekly hard sets sit in rules.ts VOLUME_RANGES (and pulling ≥ pushing);
//   4. the TIME fit: rest within the goal's band, a filler block (a conditioning finisher, or mobility in the lighter week)
//      so every session lands within ±10% of the stated minutes; if the hardest week runs long, sets come off the
//      smallest jobs first and the program says when the time is short of the goal's volume;
//   5. the weeks: each block builds (reps up, a set on the key lift, then the tempo or harder version), then a lighter
//      week (a set off everything, every effort at Cruise) and a checkpoint (./checkpoint.ts). Later blocks move each
//      move up its library ladder (progressionId, then its harder variants: paused, band-resisted, single-arm);
//   6. a warm-up first and a cool-down last on every day (lib/coach/warmup.ts generateWarmup, lib/coach/cooldown.ts
//      generateCooldown), the jump gate and youth rules passed in.
//
// Pure: the library and the gate's verdict are passed in.
import { generateCooldown } from '@/lib/coach/cooldown';
import { generateWarmup, JUMP_GATE_DEFAULT_WHY } from '@/lib/coach/warmup';
import { MAX_EFFORT_CUE } from '@/lib/coach/taxonomy';
import type { MovementPattern } from '@/lib/generated/prisma';
import type { LibraryExercise } from '@/lib/library/types';
import { levelRank, LEVEL_IDS, type LevelId } from '@/lib/library/vocab';
import {
  BAND_ANCHOR, BAND_TIP, CHILD_LINE, FOCUS_LABEL, HARDER_NOTE, JUMPS_OPEN_LINE, KIT_ANCHOR_ASSUMPTION, MAKE_HARDER_BAND,
  MAKE_HARDER_BODY, NO_BAND_SQUAT, NO_PULL_TIP, ONE_LEG_BIAS, SLOT_LABEL, STAND_IN, TEEN_LINE, TEMPO_NOTE, VOLUME_SHORT, effortWords, felWhy, kitWords,
  programSummary, programTitle,
} from './copy';
import {
  ACCESSORY_DOSE, BLOCK_WEEKS, FINISHER, GOAL_DOSE, MAX_SETS, MOBILITY_ROUND, POWER_DOSE, SPEED_DOSE,
  PULL_PUSH_RATIO, TIME_TOLERANCE, YOUTH_MIN_REPS, bandFor, blockSteps, dayTemplate, slotWeight, splitFor, volumeRange, type Dose, type WeekStep,
} from './rules';
import { AMBIENT, LOADING_KIT, PREFERS_KIT, SLOT_MATCH, baseIdOf, eligible, isImpact, isTimedEntry, perSideEntry, type Eligibility } from './slots';
import { daySeconds, timeWindow } from './time';
import { EASIER_NAME, bandForJob, bandSetupFor, easierLine, harderLine } from './adjust';
import { MAX_WEEKLY_SET_GROWTH } from '@/lib/coach/templates/waves';
import type {
  BuiltProgram, ProgramBlock, ProgramDay, ProgramItem, ProgramRequest, ProgramWeek, SlotId, TimedStep, VolumeGroup, WeeklyVolume,
} from './types';

export interface BuildInput {
  request: ProgramRequest;
  library: readonly LibraryExercise[];
  /** The protocol gate's verdict for this person (lib/coach/protocolGate.ts). Default closed. Never open for youth. */
  jumpsOpen?: boolean;
  /** The gate's own line when closed (protocolGate athleteWhy), else FEL's default. */
  jumpsWhy?: string | null;
  /** Choices the AI made (./ai.ts), choice key → entry id. Each is re-checked against that choice's options here. */
  picks?: Readonly<Record<string, string>>;
}

const MAIN: ReadonlySet<SlotId> = new Set<SlotId>(['knee', 'hinge', 'single', 'hpush', 'hpull', 'vpush', 'vpull']);
const ACCESSORY: ReadonlySet<SlotId> = new Set<SlotId>(['calf', 'biceps', 'triceps', 'rear']);
const TRUNK: ReadonlySet<SlotId> = new Set<SlotId>(['antiExt', 'antiRot']);

/** When a slot has nothing, the job that stands in (in order). */
const STAND_IN_FOR: Partial<Record<SlotId, SlotId[]>> = {
  vpull: ['rear', 'hpull'], hpull: ['rear'], rear: ['hpull'], vpush: ['hpush', 'triceps'], hpush: ['vpush'],
  knee: ['single'], single: ['knee'], hinge: ['single'], antiExt: ['antiRot'], antiRot: ['antiExt'],
  biceps: ['hpull', 'rear'], triceps: ['hpush'], speed: ['cond'],
};

/** The pull a person with nothing to pull against still has: prone raises (pattern pull, upper back). */
const bodyPull = (e: LibraryExercise) => e.pattern === 'pull' && ['strength', 'prehab'].includes(e.category)
  && e.primaryMuscles.some((m) => ['mid-back', 'rear-delts', 'lats'].includes(m)) && /prone|raise|pull[- ]apart|superman|snow angel/i.test(e.name);

function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

// ── ranking ─────────────────────────────────────────────────────────────────────────────────────────────────────────

function rank(e: LibraryExercise, slot: SlotId, r: ProgramRequest, owned: readonly string[]): number {
  const lr = levelRank(e.level), want = levelRank(r.level);
  let s = lr === want ? 3 : lr < want ? 1.5 : -50;
  const usesKit = e.equipment.some((x) => !AMBIENT.includes(x));
  const loading = owned.some((x) => LOADING_KIT.includes(x));
  if (usesKit && (PREFERS_KIT.has(slot) || (loading && e.equipment.some((x) => LOADING_KIT.includes(x))))) s += 2;
  if (e.category === 'strength' && (MAIN.has(slot) || ACCESSORY.has(slot))) s += 1;
  if (e.category === 'core' && TRUNK.has(slot)) s += 1;
  if (e.category === 'prehab' && MAIN.has(slot)) s -= 1.5;
  if (e.demo?.clipKey && e.demo.clipKey !== 'idle') s += 1.5;
  if (e.review.status === 'approved') s += 0.5;
  if (e.source.kind === 'authored') s += 0.5;
  if (isTimedEntry(e) && MAIN.has(slot)) s -= 1.5;          // a main lift is counted reps where the library has one
  if (r.lowLoad.length && r.lowLoad.every((j) => (e.lowLoad as string[]).includes(j))) s += 2;
  if (r.lowLoad.length && MAIN.has(slot) && !r.lowLoad.some((j) => (e.lowLoad as string[]).includes(j))) s -= 0.5;
  if (r.sport && e.sportTags.includes(r.sport)) s += 1;
  if (r.age !== 'adult' && e.cues.some((c) => MAX_EFFORT_CUE.test(c))) s -= 1;
  // a long name is usually a variation of a variation: the plain version first
  s -= Math.min(1, e.name.length / 80);
  return s;
}

interface Pool { bySlot: Map<SlotId, LibraryExercise[]>; byId: Map<string, LibraryExercise>; variants: Map<string, LibraryExercise[]>; aboveLevel: Set<string>; kneeUnloaded: boolean }

function pools(lib: readonly LibraryExercise[], r: ProgramRequest, el: Eligibility): Pool {
  const byId = new Map(lib.map((e) => [e.id, e]));
  const variants = new Map<string, LibraryExercise[]>();
  for (const e of lib) if (e.variantOf) { const l = variants.get(e.variantOf) ?? []; l.push(e); variants.set(e.variantOf, l); }
  const bySlot = new Map<SlotId, LibraryExercise[]>();
  const ok = lib.filter((e) => !e.variantOf && eligible(e, el));
  for (const slot of Object.keys(SLOT_MATCH) as SlotId[]) {
    // jump work enters ONLY through the power slot (its own week rules); every other slot is jump-free
    const list = ok.filter((e) => SLOT_MATCH[slot](e) && (slot === 'power' ? el.jumpsOpen : !isImpact(e)));
    list.sort((a, b) => rank(b, slot, r, el.owned) - rank(a, slot, r, el.owned) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    bySlot.set(slot, list);
  }
  // THE LOAD FLOOR (coordinator review, 2026-11-02): for an adult, a bodyweight two-leg squat or a wall sit cannot reach
  // the effort words a strength set asks for ("1–2 reps left" at 12 reps is fiction for most adults). So an adult's knee
  // slot starts one rung harder: a squat loaded with the kit they own (a real variant, even one level up — marked
  // harderStart), then one-leg squats and split squats (the single-leg bias). The unloaded two-leg squat stays only when
  // nothing else exists. Youth keep the bodyweight squat: for them it is the right start.
  const aboveLevel = new Set<string>();
  let kneeUnloaded = false;
  if (el.age === 'adult') {
    const up: Eligibility = { ...el, level: LEVEL_IDS[Math.min(2, levelRank(el.level) + 1)] as LevelId };
    const loads = (e: LibraryExercise) => e.equipment.some((x) => !AMBIENT.includes(x) && x !== 'box' && x !== 'step' && x !== 'bench');
    const knee = bySlot.get('knee') ?? [];
    const loadedVariants = lib.filter((e) => e.variantOf && loads(e) && eligible(e, up) && SLOT_MATCH.knee({ ...e, variantOf: null }) && !/isometric|hold|paused|4-second/i.test(e.name));
    for (const v of loadedVariants) if (!eligible(v, el)) aboveLevel.add(v.id);
    // ranked at their own level (a harder start is not "above level" here), counted reps before holds, strength before prehab
    const kr = (e: LibraryExercise) => rank(e, 'knee', { ...r, level: levelRank(e.level) > levelRank(r.level) ? e.level : r.level }, el.owned) - (isTimedEntry(e) ? 3 : 0) - (e.category === 'prehab' ? 2 : 0);
    const loadedAll = [...knee.filter(loads), ...loadedVariants];
    // on a ladder, the lower rung first (day A learns the easier one; the harder one is the next rung or day B)
    const below = (e: LibraryExercise) => (loadedAll.some((x) => x.regressionId === e.id) ? 0.75 : 0);
    const loaded = loadedAll.sort((a, b) => kr(b) + below(b) - kr(a) - below(a) || a.name.localeCompare(b.name));
    const oneLeg = lib.filter((e) => !e.variantOf && eligible(e, el) && e.category === 'strength' && !isImpact(e)
      && ((e.pattern === 'squat' && e.laterality !== 'bilateral') || e.family === 'split-squat') && e.primaryMuscles.includes('quads'))
      .sort((a, b) => kr(b) - kr(a) || a.name.localeCompare(b.name));
    const unloaded = knee.filter((e) => !loads(e));
    kneeUnloaded = !loaded.length;
    bySlot.set('knee', [...loaded.filter((e) => !isTimedEntry(e)), ...oneLeg, ...loaded.filter(isTimedEntry), ...(loaded.length + oneLeg.length ? [] : unloaded)]);
  }
  const bp = ok.filter(bodyPull).sort((a, b) => levelRank(a.level) - levelRank(b.level) || a.name.localeCompare(b.name));
  bySlot.set('rear', [...(bySlot.get('rear') ?? []), ...bp.filter((e) => !(bySlot.get('rear') ?? []).includes(e))]);
  return { bySlot, byId, variants, aboveLevel, kneeUnloaded };
}

// ── the ladder: harder versions of a base, real entries only ───────────────────────────────────────────────────────

const TEMPO_VARIANT = /4-second lower|tempo|eccentric|slow/i;
const HARDER_VARIANT = /^paused |band-resisted|single-arm|single-leg|deficit|feet elevated|archer|isometric hold/i;

/** The tempo version of a base the library holds, if eligible. */
function tempoVariant(base: LibraryExercise, p: Pool, el: Eligibility): LibraryExercise | null {
  return (p.variants.get(base.id) ?? []).filter((v) => TEMPO_VARIANT.test(v.name) && !/isometric/i.test(v.name) && eligible(v, el) && isTimedEntry(v) === isTimedEntry(base))
    .sort((a, b) => a.name.localeCompare(b.name))[0] ?? null;
}

/** The rungs above a base: its progression links, then its harder variants, each eligible one level up at most. */
function rungsAbove(base: LibraryExercise, slot: SlotId, p: Pool, el: Eligibility): LibraryExercise[] {
  const up: Eligibility = { ...el, level: el.age === 'child' ? el.level : LEVEL_IDS[Math.min(2, levelRank(el.level) + 1)] as LevelId };
  const out: LibraryExercise[] = [];
  const seen = new Set<string>([base.id]);
  let cur: LibraryExercise | undefined = base;
  for (let i = 0; i < 3 && cur?.progressionId; i++) {
    const next = p.byId.get(cur.progressionId);
    if (!next || seen.has(next.id)) break;
    seen.add(next.id);
    if (eligible(next, up) && (SLOT_MATCH[slot](next) || SLOT_MATCH[slot]({ ...next, variantOf: null }))) out.push(next);
    cur = next;
  }
  const vs = (p.variants.get(base.id) ?? []).filter((v) => !seen.has(v.id) && HARDER_VARIANT.test(v.name) && !/isometric hold/i.test(v.name) && eligible(v, up) && isTimedEntry(v) === isTimedEntry(base));
  vs.sort((a, b) => levelRank(a.level) - levelRank(b.level) || a.name.localeCompare(b.name));
  for (const v of vs) if (!seen.has(v.id)) { seen.add(v.id); out.push(v); }
  // no ladder of its own: the next real rung in the same job — a harder entry the slot holds (a one-leg squat above a
  // two-leg one), then that entry's harder variants
  if (!out.length) {
    const lr = levelRank(base.level);
    const job = [...(p.bySlot.get(slot) ?? []), ...[...p.variants.values()].flat().filter((v) => SLOT_MATCH[slot]({ ...v, variantOf: null }))]
      .filter((x) => !seen.has(x.id) && levelRank(x.level) > lr && eligible(x, up) && isTimedEntry(x) === isTimedEntry(base)
        && !/isometric|hold|4-second|paused/i.test(x.name) && x.primaryMuscles.some((m) => base.primaryMuscles.includes(m)))
      .sort((a, b) => levelRank(a.level) - levelRank(b.level) || a.name.localeCompare(b.name));
    for (const x of job.slice(0, 2)) { seen.add(x.id); out.push(x); }
  }
  return out;
}

// ── the day templates, filled ───────────────────────────────────────────────────────────────────────────────────────

interface TItem {
  slot: SlotId;
  /** The slot it was asked to fill (differs when a stand-in fills it). */
  wanted: SlotId;
  base: LibraryExercise;
  dose: Dose;
  sets: number;
  key: boolean;
  restAfter: number;
  timed: boolean;
}
interface TBlock { kind: ProgramBlock['kind']; items: TItem[]; rest: number }
interface TDay { key: string; focus: ProgramDay['focus']; blocks: TBlock[] }

/** A strength set (one that counts to a volume group). */
const SLOT_WEIGHT_ANY = (slot: SlotId): boolean => !['power', 'speed', 'cond', 'mobility', 'calf'].includes(slot);

const usesKitOf = (e: LibraryExercise): boolean => e.equipment.some((x) => !AMBIENT.includes(x));

const doseFor = (slot: SlotId, r: ProgramRequest): Dose => (MAIN.has(slot) ? GOAL_DOSE[r.goal][r.level] : ACCESSORY_DOSE);

export function buildProgram(input: BuildInput): BuiltProgram {
  const r = input.request;
  const jumpsOpen = r.age === 'adult' && input.jumpsOpen === true;
  const owned = [...r.equipment];
  const el: Eligibility = { owned, level: r.level, age: r.age, jumpsOpen, lowLoad: r.lowLoad };
  const p = pools(input.library, r, el);
  const notes: string[] = [];
  const noteOnce = (n: string) => { if (!notes.includes(n)) notes.push(n); };
  const standIns = new Map<SlotId, string[]>();
  const choices: BuiltProgram['choices'] = [];
  const split = splitFor(r.days, r.goal);
  const blockLen = BLOCK_WEEKS[r.level];

  // 2. fill the templates
  const used = new Map<SlotId, string[]>();          // slot → base ids already used on another day template
  const templates = new Map<string, TDay>();
  for (const d of split) {
    if (templates.has(d.key)) continue;
    const slots = dayTemplate(d.focus, d.key, r.goal, r.minutes);
    if (jumpsOpen && (d.focus === 'athletic' || ((r.goal === 'athletic' || r.goal === 'sport') && d.focus === 'full'))) slots.splice(1, 0, ['power']);
    const inDay = new Set<string>();
    const blocks: TBlock[] = [];
    let n = 0;
    for (const group of slots) {
      const items: TItem[] = [];
      for (const want of group) {
        const tries: SlotId[] = [want, ...(STAND_IN_FOR[want] ?? [])];
        let picked: { e: LibraryExercise; slot: SlotId } | null = null;
        for (const s of tries) {
          const list = (p.bySlot.get(s) ?? []).filter((e) => !inDay.has(e.id));
          if (!list.length) continue;
          const prior = used.get(s) ?? [];
          // a different entry from the other day templates where the library has one (A/B variety)
          const fresh = list.filter((e) => !prior.includes(e.id));
          const ranked = fresh.length ? fresh : list;
          // equivalent = the same job AND the same dose shape (counted or timed, one side or both), so a pick can never change a dose
          const options = ranked.filter((o) => isTimedEntry(o) === isTimedEntry(ranked[0]) && perSideEntry(o) === perSideEntry(ranked[0]) && usesKitOf(o) === usesKitOf(ranked[0])).slice(0, 3);
          const ckey = `${d.key}/${want}/${n}`;
          const pick = input.picks?.[ckey];
          const e = (pick && options.find((o) => o.id === pick)) || options[0];
          if (s === want && options.length > 1) choices.push({ key: ckey, slot: want, chosen: e.id, options: options.map((o) => ({ id: o.id, name: o.name })) });
          picked = { e, slot: s };
          break;
        }
        n++;
        if (!picked) {
          if (want === 'hpull' || want === 'vpull') noteOnce(NO_PULL_TIP);
          continue;
        }
        if (picked.slot !== want) { const l = standIns.get(want) ?? []; if (!l.includes(picked.e.name)) l.push(picked.e.name); standIns.set(want, l); }
        if ((want === 'hpull' || want === 'vpull') && picked.slot === 'rear' && !r.equipment.length) noteOnce(NO_PULL_TIP);
        inDay.add(picked.e.id);
        used.set(picked.slot, [...(used.get(picked.slot) ?? []), picked.e.id]);
        const slot = picked.slot;
        const dose = slot === 'speed' ? { ...ACCESSORY_DOSE, sets: SPEED_DOSE.sets, rest: [SPEED_DOSE.rest, SPEED_DOSE.rest] as [number, number], secs: [...SPEED_DOSE.secs] as [number, number, number] }
          : slot === 'power' ? { ...ACCESSORY_DOSE, sets: POWER_DOSE.sets, reps: [...POWER_DOSE.reps] as [number, number, number], rest: [POWER_DOSE.rest, POWER_DOSE.rest] as [number, number] }
            : slot === 'cond' || slot === 'mobility' ? { ...ACCESSORY_DOSE, sets: 2, secs: [30, 35, 40] as [number, number, number], rest: [20, 30] as [number, number] }
              : doseFor(MAIN.has(want) ? want : slot, r);
        items.push({ slot, wanted: want, base: picked.e, dose, sets: dose.sets, key: false, restAfter: 0, timed: isTimedEntry(picked.e) || slot === 'speed' || slot === 'cond' || slot === 'mobility' });
      }
      if (!items.length) continue;
      const kind: ProgramBlock['kind'] = items.length === 1 ? 'single' : items.length === 2 ? 'pair' : 'circuit';
      const d0 = items[0].dose;
      const rest = kind === 'circuit' ? Math.max(60, d0.rest[0]) : Math.round((d0.rest[0] + d0.rest[1]) / 2);
      blocks.push({ kind, items, rest });
    }
    // the key lift: the day's first main item
    const firstMain = blocks.filter((b) => b.kind !== 'circuit').flatMap((b) => b.items).find((i) => MAIN.has(i.wanted));
    if (firstMain) firstMain.key = true;
    templates.set(d.key, { key: d.key, focus: d.focus, blocks });
  }

  // child: two sets and nothing more, whatever the goal
  const maxSets = MAX_SETS[r.age];
  for (const t of templates.values()) for (const b of t.blocks) for (const i of b.items) i.sets = Math.min(i.sets, maxSets);

  // 3. weekly volume: move sets until each group sits in its range (base week and the build weeks' extra key set)
  const occurrences = split.map((d) => templates.get(d.key)!);
  const groups: VolumeGroup[] = ['knee', 'hip', 'push', 'pull', 'trunk'];
  const weekItems = () => occurrences.flatMap((t) => t.blocks.flatMap((b) => b.items));
  const volumeOf = (g: VolumeGroup, extraKey: boolean) => weekItems().reduce((a, i) => a + slotWeight(i.slot, g) * Math.min(maxSets, i.sets + (extraKey && i.key ? 1 : 0)), 0);
  const groupItems = (g: VolumeGroup) => [...new Set(occurrences.flatMap((t) => t.blocks.flatMap((b) => b.items)).filter((i) => slotWeight(i.slot, g) > 0))];
  // a main lift keeps two sets (one for a child, or when the goal is mobility or conditioning, where it is not the point)
  const mainFloor = r.age === 'child' || r.goal === 'mobility' || r.goal === 'conditioning' ? 1 : 2;
  const minSetsFor = (i: TItem) => (MAIN.has(i.wanted) ? mainFloor : 1);
  for (const g of groups) {
    const [lo, hi] = volumeRange(r.goal, r.level, r.age, g);
    const items = groupItems(g);
    if (!items.length) continue;
    // a template item appears once per day it runs; changing its sets changes the week by that many
    for (let guard = 0; guard < 40 && volumeOf(g, true) > hi; guard++) {
      const cand = [...items].filter((i) => i.sets > minSetsFor(i)).sort((a, b) => Number(MAIN.has(a.wanted)) - Number(MAIN.has(b.wanted)) || Number(a.key) - Number(b.key) || b.sets - a.sets)[0];
      if (!cand) break;
      cand.sets--;
    }
    for (let guard = 0; guard < 40 && volumeOf(g, false) < lo; guard++) {
      const cand = [...items].filter((i) => i.sets < maxSets).sort((a, b) => Number(MAIN.has(b.slot)) - Number(MAIN.has(a.slot)) || a.sets - b.sets)[0];
      if (!cand) break;
      cand.sets++;
      if (volumeOf(g, true) > hi) { cand.sets--; break; }
    }
  }
  // pulling at least equal to pushing (rows and upper-back work carry the extra)
  const balance = () => {
    const pullHi = volumeRange(r.goal, r.level, r.age, 'pull')[1];
    for (let guard = 0; guard < 30 && volumeOf('pull', false) < volumeOf('push', false); guard++) {
      const pull = groupItems('pull').filter((i) => i.sets < maxSets).sort((a, b) => a.sets - b.sets)[0];
      if (pull) { pull.sets++; if (volumeOf('pull', true) <= pullHi) continue; pull.sets--; }
      const push = groupItems('push').filter((i) => i.sets > minSetsFor(i)).sort((a, b) => Number(a.key) - Number(b.key) || b.sets - a.sets)[0];
      if (!push) break;
      push.sets--;
    }
  };
  balance();

  // 5 + 6. the weeks
  const steps: WeekStep[] = [];
  const blockOf: number[] = [];
  const inBlock: number[] = [];
  for (let w = 0, b = 1; w < r.weeks; b++) {
    const len = Math.min(blockLen, r.weeks - w);
    const st = blockSteps(len);
    st.forEach((s, i) => { steps.push(s); blockOf.push(b); inBlock.push(i + 1); });
    w += len;
  }

  const rungCache = new Map<string, LibraryExercise[]>();
  const rungs = (base: LibraryExercise, slot: SlotId) => {
    const k = `${base.id}/${slot}`;
    if (!rungCache.has(k)) rungCache.set(k, rungsAbove(base, slot, p, el));
    return rungCache.get(k)!;
  };
  const usesBand = (e: LibraryExercise) => e.equipment.includes('band') || e.equipment.includes('mini-band');

  const window = timeWindow(r.minutes, TIME_TOLERANCE);
  const warmMinutes = r.minutes >= 75 ? 14 : r.minutes >= 55 ? 10 : 6;
  const jumpGate = jumpsOpen ? null : { closed: true, why: input.jumpsWhy || JUMP_GATE_DEFAULT_WHY, href: null };

  /** Filler entries: up to three of a pool, a different starting one per day so the days do not repeat. */
  const fillerPicks = (kind: 'cond' | 'mobility', dayIndex: number): LibraryExercise[] => {
    const top = (p.bySlot.get(kind) ?? []).slice(0, 9);
    if (!top.length) return [];
    const out: LibraryExercise[] = [];
    for (let k = 0; k < Math.min(3, top.length); k++) out.push(top[(dayIndex * 3 + k) % top.length]);
    return [...new Set(out)];
  };

  function itemFor(t: TItem, dayKey: string, bi: number, ii: number, label: string, step: WeekStep, block: number, lastInBlock: boolean, blockRest: number, kind: ProgramBlock['kind'], bump: boolean): ProgramItem | null {
    // no jumps in a block's first week or its lighter week
    if (t.slot === 'power' && (step.lighter || step.label === 'Learn the moves')) return null;
    let e = t.base;
    let note: string | null = null;
    let tempo: string | null = null;
    // later blocks climb the ladder
    if (block > 1 && MAIN.has(t.slot)) {
      const ladder = rungs(t.base, t.slot);
      const rung = ladder[Math.min(block - 2, ladder.length - 1)];
      if (rung) { e = rung; note = HARDER_NOTE(t.base.name); }
      else note = usesBand(t.base) ? MAKE_HARDER_BAND : MAKE_HARDER_BODY;
    }
    if (step.tempo && MAIN.has(t.slot) && !t.timed && !noTempo.has(dayKey)) {
      const tv = tempoVariant(e, p, el);
      if (tv) { e = tv; tempo = tv.dosage.tempo ?? null; note = null; }
      else tempo = t.dose.tempo;
      if (tempo) note = [TEMPO_NOTE(tempo), note].filter(Boolean).join(' ');
    }
    const sets = Math.max(1, Math.min(maxSets, t.sets + (t.key && bump ? step.keySets : 0) + step.allSets));
    const side = perSideEntry(e);
    const timed = isTimedEntry(e) || t.timed;
    const minReps = YOUTH_MIN_REPS[r.age];
    const reps = Math.max(minReps, t.dose.reps[step.reps]);
    const secs = t.dose.secs[step.reps];
    const band = (r.age === 'adult' ? step.bands : step.youthBands)[t.key ? 'key' : MAIN.has(t.wanted) ? 'main' : 'rest'];
    const effort = t.slot === 'mobility' || t.slot === 'speed' ? 'cruise' : bandFor(band, r.age);
    const cues = r.age === 'adult' ? e.cues : e.cues.filter((c) => !MAX_EFFORT_CUE.test(c));
    const impact = isImpact(e);
    const banded = e.equipment.includes('band') || e.equipment.includes('mini-band');
    const working = t.slot !== 'mobility' && t.slot !== 'cond' && t.slot !== 'speed' && t.slot !== 'power';
    const ladder = MAIN.has(t.slot) ? rungs(t.base, t.slot) : [];
    const nextRung = ladder[Math.max(0, block - 1)] ?? ladder[ladder.length - 1] ?? null;
    return {
      key: `${dayKey}/${bi}/${ii}`,
      slot: t.slot, label, exId: e.id, name: e.name, sets,
      reps: timed ? (side ? `${secs} s each side` : null) : `${reps}${side ? ' each side' : ''}`,
      workSeconds: timed ? secs : null,
      perSide: side,
      restSeconds: kind === 'single' || lastInBlock ? blockRest : 0,
      tempo, effort, effortWords: effortWords(effort, timed), isKey: t.key,
      contacts: impact ? reps * POWER_DOSE.contactsPerRep : null, impact,
      setup: e.setup, cue: cues[0] ?? null, note, baseId: baseIdOf(t.base),
      bandSetup: banded ? bandSetupFor(e.name, t.slot, r.tension, bandForJob(t.slot, r.bands ?? [])) : null,
      harder: working ? harderLine({ band: banded, anchored: banded && /Anchor/.test(bandSetupFor(e.name, t.slot, null)), timed, next: nextRung && nextRung.id !== e.id ? nextRung.name : null }) : null,
      easier: working ? easierLine({ band: banded, anchored: banded && /Anchor/.test(bandSetupFor(e.name, t.slot, null)), timed, easier: easierOf(e, t.slot)?.name ?? null }) : null,
      harderStart: p.aboveLevel.has(e.id) || p.aboveLevel.has(t.base.id),
    };
  }

  /** The easier library entry for the same job: its regression link, else an incline / wall / supported version. */
  function easierOf(e: LibraryExercise, slot: SlotId): LibraryExercise | null {
    const lr = levelRank(e.level);
    const reg = e.regressionId ? p.byId.get(e.regressionId) : null;
    if (reg && eligible(reg, el) && reg.id !== e.id) return reg;
    const base = e.variantOf ? p.byId.get(e.variantOf) : null;
    if (base && eligible(base, el)) return base;
    const pool = (p.bySlot.get(slot) ?? []).filter((x) => x.id !== e.id && x.family === e.family && levelRank(x.level) <= lr && EASIER_NAME.test(x.name) && !EASIER_NAME.test(e.name));
    return pool[0] ?? null;
  }

  function sessionFor(t: TDay, step: WeekStep, block: number, restScale: number, setCut: Map<TItem, number>, bump = true): ProgramBlock[] {
    const out: ProgramBlock[] = [];
    t.blocks.forEach((b, bi) => {
      const letter = String.fromCharCode(65 + out.length);
      const live = b.items.map((it) => ({ it, sets: Math.max(1, it.sets - (setCut.get(it) ?? 0)) }));
      const rest = Math.round((b.rest * restScale) / 5) * 5;
      const items = live.map(({ it, sets }, ii) => itemFor({ ...it, sets }, t.key, bi, ii, b.items.length > 1 ? `${letter}${ii + 1}` : letter, step, block, ii === live.length - 1, rest, b.kind, bump))
        .filter((x): x is ProgramItem => !!x);
      if (!items.length) return;
      if (items.length < b.items.length) items.forEach((x, k) => { x.label = items.length > 1 ? `${letter}${k + 1}` : letter; x.restSeconds = k === items.length - 1 ? rest : 0; });
      out.push({ label: letter, kind: items.length === 1 ? 'single' : items.length === 2 ? 'pair' : 'circuit', items });
    });
    return out;
  }

  const warmCache = new Map<string, TimedStep[]>();
  const coolCache = new Map<string, TimedStep[]>();
  const warmFor = (t: TDay): TimedStep[] => {
    if (warmCache.has(t.key)) return warmCache.get(t.key)!;
    const keyItem = t.blocks.flatMap((b) => b.items).find((i) => i.key) ?? t.blocks[0]?.items[0];
    const plan = generateWarmup({
      pattern: (keyItem?.base.pattern ?? null) as MovementPattern | null, weakestZone: null, minutes: warmMinutes,
      isYouth: r.age !== 'adult', painDecision: null, readiness: null, jumpGate,
    });
    const steps2 = plan.steps.filter((s) => !s.impact || jumpsOpen).map((s) => ({ id: s.id, name: s.name, seconds: s.seconds, cue: s.cue || null, dose: s.dose }));
    warmCache.set(t.key, steps2);
    return steps2;
  };
  const coolFor = (t: TDay): TimedStep[] => {
    if (coolCache.has(t.key)) return coolCache.get(t.key)!;
    const items = t.blocks.flatMap((b) => b.items).map((i, k) => ({ order: k, section: 'key', isKeySet: i.key, coaching: { pattern: { id: i.base.pattern as MovementPattern } } }));
    const plan = generateCooldown(items);
    const steps2 = (r.minutes < 30 ? plan.steps.slice(0, 1) : plan.steps).map((s) => ({ id: s.id, name: s.name, seconds: s.seconds, cue: s.cue || null, dose: s.dose }));
    coolCache.set(t.key, steps2);
    return steps2;
  };

  // 4. the time fit, per template: find the rest scale and set cuts that keep the hardest week inside the window. One
  // cut map for the week, so a cut never leaves pulling below pushing across the week.
  const fit = new Map<string, { restScale: number; cut: Map<TItem, number> }>();
  const noTempo = new Set<string>();
  const cut = new Map<TItem, number>();
  const weekVol = (g: VolumeGroup) => weekItems().reduce((a, i) => a + slotWeight(i.slot, g) * Math.max(1, i.sets - (cut.get(i) ?? 0)), 0);
  for (const t of templates.values()) {
    let restScale = 1;
    const measure = (step: WeekStep, block: number) => daySeconds({ warmup: warmFor(t), cooldown: coolFor(t), blocks: sessionFor(t, step, block, restScale, cut) });
    const peak = () => Math.max(...steps.map((s, i) => measure(s, blockOf[i])));
    const rests = t.blocks.map((b) => b.items[0].dose.rest);
    const minScale = Math.min(...rests.map((rr, i) => rr[0] / Math.max(1, t.blocks[i].rest)));
    const maxScale = Math.min(...rests.map((rr, i) => rr[1] / Math.max(1, t.blocks[i].rest)));
    const order = (i: TItem) => (ACCESSORY.has(i.wanted) ? 0 : TRUNK.has(i.slot) ? 1 : i.slot === 'speed' || i.slot === 'power' || i.slot === 'mobility' ? 2 : i.key ? 4 : 3);
    const left = (i: TItem) => i.sets - (cut.get(i) ?? 0);
    const keepsBalance = (i: TItem) => {
      if (slotWeight(i.slot, 'pull') === 0) return true;
      const occ = occurrences.filter((o) => o === t).length;
      return weekVol('pull') - slotWeight(i.slot, 'pull') * occ >= weekVol('push');
    };
    // too long: shorter rests first, then sets off the smallest jobs, never below the item's floor (and, only when the
    // time allows nothing else, a non-key main lift down to one set: the program then says the volume is short)
    for (let guard = 0; guard < 80 && peak() > window[1]; guard++) {
      if (restScale > minScale + 0.01) { restScale = Math.max(minScale, restScale - 0.1); continue; }
      const all = t.blocks.flatMap((b) => b.items);
      const pick = (floor: (i: TItem) => number) => all.filter((i) => left(i) > floor(i) && keepsBalance(i)).sort((a, b) => order(a) - order(b) || left(b) - left(a))[0];
      const cand = pick(minSetsFor) ?? pick((i) => (i.key ? minSetsFor(i) : 1));
      if (!cand) break;
      cut.set(cand, (cut.get(cand) ?? 0) + 1);
    }
    // room to spare: more work first — a set at a time on the main lifts, while every group stays inside its range
    // (the build weeks' extra key set counted) and pulling stays at or above pushing — then longer rests, then filler
    const shortest = () => Math.min(...steps.map((s, i) => measure(s, blockOf[i])));
    for (let guard = 0; guard < 30 && shortest() < r.minutes * 60 - 150; guard++) {
      const all = t.blocks.flatMap((b) => b.items).filter((i) => MAIN.has(i.wanted) && left(i) < maxSets && !cut.get(i));
      // the day's key lift first, then the lightest main lift: a key lift never has fewer sets than the rest of its day
      all.sort((a, b) => Number(b.key) - Number(a.key) || left(a) - left(b));
      let grew = false;
      for (const i of all) {
        i.sets++;
        const fits = groups.every((g) => volumeOf(g, true) <= volumeRange(r.goal, r.level, r.age, g)[1])
          && volumeOf('pull', false) >= volumeOf('push', false) && volumeOf('pull', true) <= PULL_PUSH_RATIO[1] * volumeOf('push', false) && peak() <= window[1];
        if (fits) { grew = true; break; }
        i.sets--;
      }
      if (!grew) break;
    }
    // then rest up to the top of the goal's band (the filler blocks take the rest of the slack per week)
    for (let guard = 0; guard < 20 && restScale < maxScale - 0.01; guard++) {
      const before = restScale;
      restScale = Math.min(maxScale, restScale + 0.1);
      if (peak() > window[1] || Math.min(...steps.map((s, i) => measure(s, blockOf[i]))) > r.minutes * 60) { restScale = before; break; }
    }
    // still long: the slow-lowering week costs time this session does not have; it builds by reps instead
    if (peak() > window[1]) noTempo.add(t.key);
    fit.set(t.key, { restScale, cut });
  }

  /** A filler block: rounds of up to three conditioning or mobility entries. */
  const fillerBlock = (kind: 'cond' | 'mobility', dayKey: string, di: number, letter: string, slack: number, maxRounds: number, step: WeekStep): ProgramBlock | null => {
    const fes = fillerPicks(kind, di);
    if (!fes.length || slack < 45) return null;
    const mob = kind === 'mobility';
    const rest = mob ? MOBILITY_ROUND.rest : FINISHER.rest;
    const parts = fes.map((fe) => {
      const side = perSideEntry(fe);
      const work = mob ? (side ? 30 : MOBILITY_ROUND.work) : FINISHER.work[step.reps];
      return { fe, side, work, secs: work * (side ? 2 : 1) + 5 };
    });
    const round = parts.reduce((a, x) => a + x.secs, 0) + (parts.length - 1) * 5 + rest;
    const rounds = Math.max(0, Math.min(maxRounds, Math.round(slack / round)));
    if (!rounds) return null;
    const effort = mob ? 'cruise' as const : bandFor(step.lighter ? 'cruise' : 'drive', r.age);
    return {
      label: letter, kind: 'filler', items: parts.map(({ fe, side, work }, k) => ({
        key: `${dayKey}/${kind}/${k}`, slot: kind, label: parts.length > 1 ? `${letter}${k + 1}` : letter, exId: fe.id, name: fe.name, sets: rounds,
        reps: side ? `${work} s each side` : null, workSeconds: work, perSide: side, restSeconds: k === parts.length - 1 ? rest : 0, tempo: null,
        effort, effortWords: effortWords(effort, true),
        isKey: false, contacts: null, impact: false, setup: fe.setup, cue: (r.age === 'adult' ? fe.cues : fe.cues.filter((c) => !MAX_EFFORT_CUE.test(c)))[0] ?? null,
        note: mob ? 'Easy range, steady breathing.' : 'Steady and smooth: breathing hard, never sloppy.', baseId: fe.id,
        bandSetup: fe.equipment.includes('band') || fe.equipment.includes('mini-band') ? bandSetupFor(fe.name, kind, r.tension) : null, harder: null, easier: null, harderStart: false,
      })),
    };
  };
  /** Goals whose spare minutes go to a short conditioning finisher before the easy range. */
  const finisherGoal = r.goal === 'full-body' || r.goal === 'conditioning' || r.goal === 'athletic' || r.goal === 'sport';

  // the build weeks' extra key set: at most MAX_WEEKLY_SET_GROWTH of week 1's working sets (lib/coach/templates/waves.ts),
  // so a short plan with few sets progresses by reps and tempo instead of a set it cannot afford
  const week1Sets = weekItems().filter((i) => SLOT_WEIGHT_ANY(i.slot)).reduce((a, i) => a + Math.max(1, i.sets - (cut.get(i) ?? 0)), 0);
  const bumps = Math.floor(week1Sets * MAX_WEEKLY_SET_GROWTH + 1e-9);
  // which training days get it: in order, while no group passes the top of its range and pushing stays at or under pulling
  const bumpDays = new Set<number>();
  {
    const added: Record<VolumeGroup, number> = { knee: 0, hip: 0, push: 0, pull: 0, trunk: 0 };
    const base = (g: VolumeGroup) => weekVol(g);
    split.forEach((d, di) => {
      if (bumpDays.size >= bumps) return;
      const key = templates.get(d.key)!.blocks.flatMap((b) => b.items).find((i) => i.key);
      if (!key || key.sets - (cut.get(key) ?? 0) + 1 > maxSets) return;
      const next = { ...added };
      for (const g of groups) next[g] += slotWeight(key.slot, g);
      if (groups.some((g) => base(g) + next[g] > volumeRange(r.goal, r.level, r.age, g)[1])) return;
      if (base('push') + next.push > base('pull') + next.pull) return;
      if (base('pull') + next.pull > PULL_PUSH_RATIO[1] * (base('push') + next.push)) return;
      Object.assign(added, next);
      bumpDays.add(di);
    });
  }

  const weeks: ProgramWeek[] = steps.map((step, wi) => {
    const n = wi + 1;
    const block = blockOf[wi];
    const days: ProgramDay[] = split.map((d, di) => {
      const t = templates.get(d.key)!;
      const f = fit.get(d.key)!;
      const blocks = sessionFor(t, step, block, f.restScale, f.cut, bumpDays.has(di));
      const day: ProgramDay = {
        key: d.key, id: `w${n}:d${di + 1}`, day: d.day, focus: d.focus, title: FOCUS_LABEL[d.focus],
        warmup: warmFor(t), blocks, cooldown: coolFor(t), minutes: 0, seconds: 0,
      };
      // the spare minutes: a short finisher (≤ 4 rounds) where the goal wants one, then easy range work; a lighter week
      // spends them on easy range only
      const next = () => String.fromCharCode(65 + blocks.length);
      if (!step.lighter && finisherGoal && d.focus !== 'mobility') {
        const f1 = fillerBlock('cond', d.key, di, next(), r.minutes * 60 - daySeconds(day), 4, step);
        if (f1) blocks.push(f1);
      }
      for (const cap of [6, 12, 20]) {
        if (daySeconds(day) >= window[0]) break;
        const prev = blocks[blocks.length - 1];
        if (prev?.kind === 'filler' && prev.items[0].slot === 'mobility') blocks.pop();
        const f2 = fillerBlock('mobility', d.key, di, next(), r.minutes * 60 - daySeconds(day), cap, step);
        if (f2) blocks.push(f2);
      }
      day.seconds = daySeconds(day);
      day.minutes = Math.round(day.seconds / 60);
      return day;
    });
    return { n, block, weekInBlock: inBlock[wi], label: step.label, lighter: step.lighter, checkpoint: step.lighter, days };
  });

  // the volume as built, week by week (the filler and the jumps count to nothing)
  const volume: WeeklyVolume[] = groups.map((g) => ({
    group: g, range: volumeRange(r.goal, r.level, r.age, g),
    perWeek: weeks.map((w) => w.days.flatMap((d) => d.blocks.filter((b) => b.kind !== 'filler').flatMap((b) => b.items)).reduce((a, i) => a + slotWeight(i.slot, g) * i.sets, 0)),
  }));
  for (const v of volume) {
    const build = v.perWeek.filter((_, i) => !weeks[i].lighter);
    const low = build.length ? Math.min(...build) : 0;
    if (low < v.range[0]) {
      const area = v.group === 'knee' ? 'the legs' : v.group === 'hip' ? 'the hips' : v.group === 'push' ? 'pushing' : v.group === 'pull' ? 'pulling' : 'the trunk';
      noteOnce(VOLUME_SHORT(area, low, v.range[0]));
    }
  }

  if (r.age === 'adult' && (r.equipment.includes('band') || r.equipment.includes('mini-band')) && !r.equipment.some((x) => LOADING_KIT.includes(x))) noteOnce(NO_BAND_SQUAT);
  else if (r.age === 'adult' && p.kneeUnloaded) noteOnce(ONE_LEG_BIAS);
  for (const [job, names] of standIns) noteOnce(STAND_IN(SLOT_LABEL[job], kitWords(r.equipment, r.tension), names.join(' and ')));
  if (r.equipment.includes('band')) { noteOnce(BAND_TIP); noteOnce(BAND_ANCHOR); }
  if (r.age === 'child') noteOnce(CHILD_LINE);
  else if (r.age === 'teen') noteOnce(TEEN_LINE);
  const jumpsLine = jumpsOpen ? JUMPS_OPEN_LINE : (r.goal === 'athletic' || r.goal === 'sport') ? (input.jumpsWhy || JUMP_GATE_DEFAULT_WHY) : null;

  const exerciseIds = [...new Set(weeks.flatMap((w) => w.days.flatMap((d) => d.blocks.flatMap((b) => b.items.map((i) => i.exId)))))];
  const splitWords = split.length <= 3 ? `${split.length} full-body days` : `${split.length} days: ${[...new Set(split.map((d) => FOCUS_LABEL[d.focus].toLowerCase()))].join(', ')}`;
  return {
    id: hash(JSON.stringify({ r, picks: input.picks ?? null, jumpsOpen })),
    title: programTitle(r),
    summary: programSummary(r, blockLen),
    request: r,
    weeks,
    notes,
    volume,
    jumps: { allowed: jumpsOpen, line: jumpsLine },
    choices,
    why: felWhy(r, splitWords.charAt(0).toUpperCase() + splitWords.slice(1)),
    whyBy: 'fel',
    exerciseIds,
  };
}

/** The assumption the band read needs (said in the report and on the page). */
export const BAND_ASSUMPTIONS = [KIT_ANCHOR_ASSUMPTION];
