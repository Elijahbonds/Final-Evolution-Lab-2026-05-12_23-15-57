// lib/library/demo.ts — EXERCISE-LIBRARY (2026-10-25): the demo data the follow-up lanes render.
//
// Owner decision (2026-10-25): every exercise gets all four demos — the 3D avatar, a coach video, a muscle view on the
// 3D body, and text cues and faults. This lane ships the text and the data the other three key on:
//   · CLIP_KEYS — one avatar clip key per movement shape (LIBRARY-ANATOMY: the loop an ENTRY plays is demoClipFor), chosen BY PATTERN (and family where a pattern holds two
//     shapes: a jump is locomotion, so is a sprint). CLIP_COVERAGE says which keys the shipped rig can already play
//     (components/coach/exercise-avatar-canvas.tsx loads public/models/elijah.glb); the rest are null until the avatar
//     clip lane authors them, and a card shows no avatar for an uncovered key rather than the wrong motion.
//   · muscleMap — an entry's primary and secondary muscles as anatomy-mesh keys (vocab.ts MUSCLES.anatomyKey).
//   · reviewMovementOf — which camera review (the form-review lane's squat / lunge / hinge / push-up) an entry gets,
//     from its pattern, family and laterality — never from its English name.
//
// Pure. Client-safe.

import { CATALOGUE_DEMO_LOOPS, DRILL_DEMO_LOOPS, LESSON_DEMO_LOOPS, SCREEN_DEMO_LOOPS, WARMUP_DEMO_LOOPS } from './surfaceDemo';
import { MUSCLES, type MovementPattern, type MuscleId } from './vocab';
import { FLOW_CLIPS, FLOW_SEQS, flowClip } from '@/lib/babylon/anim/authored/exerciseFlows';   // (data only: no Babylon)
import { PROPPED_LOOPS } from '@/lib/babylon/anim/authored/exerciseProps.data';   // (data only: which loop stands on what)

export const CLIP_KEYS = [
  'idle', 'squat', 'hinge', 'lunge', 'push', 'pull', 'carry', 'rotate', 'brace', 'jump', 'hop', 'bound', 'sprint',
  'shuffle', 'backpedal', 'dribble', 'shoot', 'layup', 'stretch', 'breathe', 'throw', 'crawl',
] as const;
export type ClipKey = (typeof CLIP_KEYS)[number];
export const isClipKey = (v: unknown): v is ClipKey => typeof v === 'string' && (CLIP_KEYS as readonly string[]).includes(v);

/**
 * Clip key → the loop that shows that movement shape on the library stage, or null (no faithful loop yet).
 * LIBRARY-ANATOMY (2026-10-25): the keys were 5 of 22 covered, and the five were not what they said — the R3F demo's
 * model (public/models/elijah.glb) carries ONE baked animation, so `idle_stand`, `jump_up` and `run_forward` were never
 * found and every entry played that same clip (exercise-avatar-canvas falls back to clipNames[0]). The library now plays
 * on the athlete's own body (components/library/exercise-stage.tsx): the exercise loops authored for it
 * (anim/authored/exercise.ts) and the hoops clips the court already plays. This table is the key's REPRESENTATIVE loop
 * (what clipCoverage counts); what an ENTRY plays is demoClipFor below, which is stricter — a key covered here can still
 * be a cue card for a variation the loop would show wrong (a seated press is not the standing press).
 */
export const CLIP_COVERAGE: Readonly<Record<ClipKey, string | null>> = {
  idle: null, squat: 'ex_squat', hinge: 'ex_hinge', lunge: 'ex_lunge', push: 'ex_press', pull: 'ex_row', carry: 'ex_carry',
  rotate: null, brace: 'ex_plank', jump: 'ex_jump', hop: 'ex_pogo', bound: null, sprint: 'run', shuffle: 'bball_defend_slide_left',
  backpedal: 'bball_defend_backpedal', dribble: 'bball_dribble_idle', shoot: 'jumpshot', layup: 'bball_layup_gather',
  stretch: 'ex_arm_circles', breathe: 'ex_breathe', throw: null, crawl: null,
};

/** The clip a pattern shows when its family names no better one. */
export const CLIP_BY_PATTERN: Readonly<Record<MovementPattern, ClipKey>> = {
  squat: 'squat', hinge: 'hinge', lunge: 'lunge', push: 'push', pull: 'pull', carry: 'carry', rotation: 'rotate',
  locomotion: 'sprint', breath: 'breathe', mobility: 'stretch', other: 'idle',
};

/** Families whose motion is not their pattern's default. */
const CLIP_BY_FAMILY: Readonly<Record<string, ClipKey>> = {
  pogo: 'hop', 'line-hop': 'hop', 'ankle-hop': 'hop', 'single-leg-hop': 'hop', 'hurdle-hop': 'hop', 'jump-rope': 'hop',
  'box-jump': 'jump', 'broad-jump': 'jump', 'squat-jump': 'jump', 'countermovement-jump': 'jump', 'approach-jump': 'jump',
  'depth-drop': 'jump', 'depth-jump': 'jump', 'tuck-jump': 'jump', 'split-jump': 'jump', 'seated-box-jump': 'jump', 'jump': 'jump',
  'lateral-bound': 'bound', 'skater-bound': 'bound', bound: 'bound',
  'defensive-slide': 'shuffle', shuffle: 'shuffle', closeout: 'shuffle', backpedal: 'backpedal',
  dribble: 'dribble', 'two-ball': 'dribble', layup: 'layup', finish: 'layup', 'form-shot': 'shoot', shot: 'shoot',
  'med-ball-throw': 'throw', 'med-ball-slam': 'throw', crawl: 'crawl', plank: 'brace', 'side-plank': 'brace',
  'dead-bug': 'brace', 'bird-dog': 'brace', pallof: 'brace', 'breath-drill': 'breathe',
};

export function clipKeyFor(pattern: MovementPattern, family: string): ClipKey {
  return CLIP_BY_FAMILY[family] ?? CLIP_BY_PATTERN[pattern];
}

/** The key's representative loop, or null (see CLIP_COVERAGE). An entry plays demoClipFor(entry), not this. */
export function avatarClip(key: ClipKey | null | undefined): string | null {
  return key ? CLIP_COVERAGE[key] ?? null : null;
}

/** How many of the keys have a representative loop (the rest show the cue card for every entry). */
export function clipCoverage(): { covered: ClipKey[]; missing: ClipKey[] } {
  const covered = CLIP_KEYS.filter((k) => CLIP_COVERAGE[k] !== null);
  return { covered, missing: CLIP_KEYS.filter((k) => CLIP_COVERAGE[k] === null) };
}

// ── the loop an entry plays (LIBRARY-ANATOMY, 2026-10-25) ───────────────────────────────────────────────────────────
//
// Owner: every entry plays the clip for its pattern and variation; where there is no faithful clip, the cue card —
// never a wrong movement. So the choice reads the entry's STRUCTURED tags only (family, the base variation, the
// modifiers after '+', equipment — never the English name), and every rule is a whitelist: a family a rule does not
// name, or a variation its pattern does not match, shows the cue card. A rule is written for what the loop shows: the
// standing press is not the seated press, the incline press or the landmine press; a curl is not a preacher curl.
//
// MODIFIERS that change what the body does (anything else — paused, tempo, a vest, game speed — is the same movement):
//   iso-hold (a hold, not reps), single-arm / alternating / off-hand (one side), half-kneeling, supported, staggered.
export const SHAPE_MODIFIERS: ReadonlySet<string> = new Set(['iso-hold', 'single-arm', 'alternating', 'off-hand', 'half-kneeling', 'supported', 'staggered']);

interface DemoRule {
  /** the loop, or a function of the entry's base variation (a weak-hand finish plays the left-hand clip) */
  clip: string | ((base: string, equipment: readonly string[]) => string | null);
  families: readonly string[];
  /** the base variation must match (anchored) */
  bases: RegExp;
  /** LIBRARY-ANATOMY-2: modifiers that change what THIS loop shows (an offset rack carry holds one bell low): the cue card */
  notMods?: RegExp;
  /** LIBRARY-ANATOMY-2: for a clip chosen by a function, every loop it can return (DEMO_CLIPS lists them) */
  emits?: readonly string[];
  /** LIBRARY-ANATOMY-2: the variation IS a hold (a wall sit, a split squat held at half depth): the second of the loop it
   *  holds at, whatever its modifiers — the loop's own frame at that depth */
  hold?: number;
}

const weak = (right: string, left: string) => (base: string) => (/-weak\b|-weak-/.test(`${base}-`) ? left : right);
/** A barbell back squat holds the bar on the back; a goblet, front, dumbbell or bodyweight squat holds the load in front. */
const squatClip = (base: string, eq: readonly string[]) => (eq.includes('barbell') && !/front|zercher|goblet/.test(base) ? 'ex_squat_bar' : 'ex_squat');


// LIBRARY-ANATOMY-2: a "<action>-<stance>" variation → its loop, `ex_<action>_<stance>` (exerciseAthletic.ts STANCE_ACTIONS)
const STANCE_SUFFIX: Readonly<Record<string, string>> = { standing: 'standing', 'half-kneeling': 'hk', 'tall-kneeling': 'tk', split: 'split', 'lateral-lunge': 'lateral', 'single-leg': 'single', 'step-in': 'stepin' };
const PALLOF_ACTION: Readonly<Record<string, string>> = { press: 'pallofpress', hold: 'pallofhold', overhead: 'pallofoverhead', 'rotate-out': 'pallofrotate' };
const THROW_ACTION: Readonly<Record<string, string>> = { chest: 'chest', overhead: 'overhead', scoop: 'scoop', 'shot-put': 'shotput', 'side-toss': 'sidetoss', underhand: 'underhand', 'single-push': 'singlepush', 'rot-overhead': 'rotoverhead' };
function stanceClip(base: string, re: RegExp, actions: Readonly<Record<string, string>>): string | null {
  const m = re.exec(base);
  if (!m || !actions[m[1]] || !STANCE_SUFFIX[m[2]]) return null;
  if (actions[m[1]] === 'singlepush' && m[2] === 'single-leg') return null;   // (no such loop: the library names none)
  return `ex_${actions[m[1]]}_${STANCE_SUFFIX[m[2]]}`;
}

/** Every rule (first match wins). DEMO_CLIPS (below) is the set of loops these name; demo.test.ts holds the hoops ones
 *  equal to the stage scope's borrow list (clipScope LIBRARY_HOOPS_BORROW). */
export const DEMO_RULES: readonly DemoRule[] = [
  // ── lower body ──
  { clip: squatClip, families: ['squat'], bases: /^(squat|bodyweight-squat|full-squat|front-squat|front-squat-two|front-kb2|goblet-squat|goblet-db|goblet-heels-up|goblet-box-db|goblet-db-tempo|back-bb|back-bb-pause|box-bw|box-squat|squat-bench|narrow-stanc-squat|wid-stanc-squat|pli-squat|counterweight|olympic-squat|weight-squat|squat-chain|front-squat-clean-grip|front-squat-bench)$/ },
  { clip: 'ex_squat', families: ['db-lower'], bases: /^(front|heels-up|sumo|box)$/ },
  { clip: 'ex_squat', families: ['kb-lower'], bases: /^sumo-squat$/ },
  { clip: 'ex_squat', families: ['sandbag'], bases: /^bear-hug-squat$/ },
  { clip: 'ex_squat', families: ['landmine-lower'], bases: /^squat$/ },
  { clip: 'ex_hinge', families: ['rdl'], bases: /^(romanian-deadlift|romanian-deadlift-deficit|stiff-leg-deadlift|wid-stanc-stiff-leg|smith-stiff-leg-deadlift)$/ },
  { clip: 'ex_hinge', families: ['deadlift'], bases: /^(deadlift|trap-bar-deadlift|axl-deadlift|rack-pull|deficit-deadlift)$/ },
  { clip: 'ex_hinge', families: ['hinge-pattern'], bases: /^(kb-rdl|kb-deadlift|db-rdl|band-rdl|bb-deadlift)$/ },
  { clip: 'ex_hinge', families: ['db-hinge'], bases: /^suitcase-rdl$/ },
  { clip: 'ex_hinge', families: ['kb-lower'], bases: /^suitcase-dl$/ },
  { clip: 'ex_hinge', families: ['landmine-lower'], bases: /^rdl$/ },
  { clip: 'ex_good_morning', families: ['good-morning'], bases: /^(morn|stiff-leg-morn|morn-pin)$/ },
  { clip: 'ex_good_morning', families: ['db-hinge'], bases: /^good-morning$/ },
  { clip: 'ex_lunge', families: ['lunge'], bases: /^(lung|forward-bw)$/ },
  { clip: 'ex_reverse_lunge', families: ['lunge'], bases: /^(rear-lung|reverse-db|reverse-bb|reverse-bw)$/ },
  { clip: 'ex_reverse_lunge', families: ['kb-lower'], bases: /^(rack-reverse-lunge|goblet-reverse-lunge)$/ },
  { clip: 'ex_reverse_lunge', families: ['landmine-lower', 'sandbag'], bases: /^reverse-lunge$/ },
  { clip: 'ex_reverse_lunge', families: ['db-lower'], bases: /^step-back-knee$/ },
  { clip: 'ex_split_squat', families: ['lunge'], bases: /^split-squat$/ },
  // PROGRAM-ASK-2 (2026-11-02): + 'band' — the Band Split Squat (data/library/authored/b5-program-ask.json) is the same movement
  { clip: 'ex_split_squat', families: ['split-squat'], bases: /^(bw|offset-kb|landmine|band)$/ },
  { clip: 'ex_bridge', families: ['bridge'], bases: /^(bw|mini-band)$/ },
  { clip: 'ex_bridge', families: ['bridge-thrust'], bases: /^(glut-bridg|hip-lift)$/ },
  { clip: 'ex_bridge', families: ['db-hinge'], bases: /^bridge$/ },
  { clip: 'ex_calf_raise', families: ['calf-raise'], bases: /^(stand-calf-rais|calf-rais|smith-calf-rais|rock-stand-calf-rais)$/ },
  { clip: 'ex_calf_raise', families: ['calf-capacity'], bases: /^straight-double-slow$/ },
  // LIBRARY-ANATOMY-2: off a step, the heels drop below it (the first pass showed the flat raise)
  { clip: 'ex_calf_raise_step', families: ['calf-capacity'], bases: /^straight-double-step$/ },
  // ── upper body ──
  { clip: 'ex_press', families: ['overhead-press'], bases: /^(shoulder-press|stand-press|db-standing|stand-palm-press|two-arm-military-press|stand-military-press|bb|shoulder-military-press)$/ },
  { clip: 'ex_seated_press', families: ['overhead-press'], bases: /^(seat-press|db-seated|seat-shoulder-press|seat-military-press)$/ },
  { clip: 'ex_curl', families: ['curl'], bases: /^(bicep-curl|stand-bicep-curl|hammer-curl|curl|ez-bar-curl|clos-grip-ez-bar-curl|clos-grip-stand-curl|stand-revers-curl|revers-curl|stand-inner-bicep-curl)$/ },
  { clip: 'ex_seated_curl', families: ['curl'], bases: /^(seat-curl|seat-inner-bicep-curl)$/ },
  { clip: 'ex_curl', families: ['arm-accessory'], bases: /^(band-curl|tempo-curl)$/ },
  { clip: 'ex_lateral_raise', families: ['raise'], bases: /^(sid-lateral-rais|lateral-rais)$/ },
  { clip: 'ex_seated_lateral_raise', families: ['raise'], bases: /^(seat-lateral-rais|seat-sid-lateral-rais)$/ },
  { clip: 'ex_front_raise', families: ['raise'], bases: /^(front-rais|front-two-rais|front-plat-rais)$/ },
  { clip: 'ex_row', families: ['row'], bases: /^(db-bent|bent-over-two-row|bent-over-row|bent-over-two-arm-long-bar-row|revers-grip-bent-over-row|bent-over-two-row-palm|t-bar-row-handl)$/ },
  { clip: 'ex_upright_row', families: ['upright-row-shrug'], bases: /^(upright-row|stand-upright-row|smith-upright-row)$/ },
  { clip: 'ex_shrug', families: ['upright-row-shrug'], bases: /^(shrug|leverag-shrug)$/ },
  { clip: 'ex_triceps_overhead', families: ['triceps'], bases: /^(overhead-tricep-extension|stand-overhead-tricep-extension|rop-overhead-tricep-extension|stand-tricep-extension|stand-towel-tricep-extension)$/ },
  { clip: 'ex_triceps_overhead', families: ['triceps-accessory'], bases: /^db-overhead-ext$/ },
  { clip: 'ex_seated_triceps', families: ['triceps'], bases: /^seat-tricep-press$/ },
  { clip: 'ex_skull_crusher', families: ['triceps'], bases: /^(lying-tricep-extension|lying-tricep-press|skull-crusher|ez-bar-skull-crusher)$/ },
  { clip: 'ex_pushdown', families: ['triceps'], bases: /^(tricep-pushdown|revers-grip-tricep-pushdown)$/ },
  { clip: 'ex_pushdown', families: ['triceps-accessory'], bases: /^band-pushdown$/ },
  { clip: 'ex_bench_press', families: ['bench-press'], bases: /^(bench-press|bench-press-medium-grip|bench-press-powerlift|bench-press-chain|bench-press-neutral-grip|clos-grip-bench-press|wid-grip-bench-press|technique)$/ },
  { clip: 'ex_floor_press', families: ['bench-press'], bases: /^floor-press$/ },
  { clip: 'ex_floor_press', families: ['db-press'], bases: /^kb-floor$/ },
  { clip: 'ex_incline_press', families: ['bench-press'], bases: /^(inclin-bench-press-medium-grip|hammer-grip-inclin-bench-press|inclin-bench-palm-fac)$/ },
  { clip: 'ex_incline_press', families: ['db-press'], bases: /^incline$/ },
  { clip: 'ex_fly', families: ['fly'], bases: /^(fly|flat-bench-fly)$/ },
  { clip: 'ex_incline_fly', families: ['fly'], bases: /^inclin-fly$/ },
  { clip: 'ex_pushup', families: ['push-up'], bases: /^(push-up|push-up-wid|clos-grip-push-up|push-ups-clos-tricep-position|push-up-clos-wid-hand-position|tempo|vest|band|deficit)$/ },
  { clip: 'ex_pushup', families: ['triceps-accessory'], bases: /^close-push-up$/ },
  { clip: 'ex_plank_high', families: ['isometric-hold'], bases: /^push-up-top$/ },
  { clip: 'ex_plank_high', families: ['plank'], bases: /^high$/ },
  // ── LIBRARY-ANATOMY-2: one arm, arm after arm, and the lifts the first pass had no loop for ──
  { clip: 'ex_curl_alt', families: ['curl'], bases: /^(alternat-bicep-curl|alternat-hammer-curl)$/ },
  { clip: 'ex_curl_one', families: ['curl'], bases: /^stand-singl-arm-curl$/ },
  { clip: 'ex_curl', families: ['curl'], bases: /^wid-grip-stand-curl$/ },
  { clip: 'ex_press_alt', families: ['overhead-press'], bases: /^(alternat-shoulder-press|alternat-press|stand-alternat-press)$/ },
  { clip: 'ex_press_one', families: ['overhead-press'], bases: /^(singl-arm-shoulder-press|stand-palm-singl-arm-press|kb)$/ },
  { clip: 'ex_press_hk_one', families: ['overhead-press'], bases: /^db-hk$/ },
  { clip: 'ex_lateral_raise_alt', families: ['raise'], bases: /^alternat-deltoid-rais$/ },
  { clip: 'ex_lateral_raise_one', families: ['raise'], bases: /^singl-arm-sid-lateral$/ },
  { clip: 'ex_scaption', families: ['raise'], bases: /^scaption$/ },
  { clip: 'ex_front_raise_overhead', families: ['raise'], bases: /^(stand-front-rais-over-head|stand-straight-arm-front-shoulder-rais-abov-head)$/ },
  { clip: 'ex_reverse_fly', families: ['raise'], bases: /^bent-over-rear-shoulder-rais-head-bench$/ },
  { clip: 'ex_reverse_fly', families: ['rear-delt-face-pull'], bases: /^(back-fly|rear-shoulder-fly|revers-fly)$/ },
  { clip: 'ex_pull_apart', families: ['rear-delt-face-pull'], bases: /^pull-apart$/ },
  { clip: 'ex_face_pull', families: ['rear-delt-face-pull'], bases: /^(fac-pull|rop-rear-shoulder-row)$/ },
  { clip: 'ex_face_pull', families: ['upper-back'], bases: /^face-pull-band$/ },
  { clip: 'ex_face_pull', families: ['pull-extra'], bases: /^strap-face-pull$/ },
  // (DEMO-LOOPS-8: the cable's one-arm extension is the high pulley's one-arm pushdown, the upper arm pinned at the side)
  { clip: (_b, eq) => (eq.includes('dumbbell') ? 'ex_triceps_overhead_one' : eq.includes('cable') ? 'ex_pushdown_one' : null), families: ['triceps'], bases: /^singl-arm-tricep-extension$/, emits: ['ex_triceps_overhead_one', 'ex_pushdown_one'] },
  { clip: 'ex_triceps_overhead_one', families: ['triceps'], bases: /^stand-singl-arm-tricep-extension$/ },
  { clip: 'ex_pushdown', families: ['triceps'], bases: /^(tricep-pushdown-rop-attachment|tricep-pushdown-v-bar-attachment)$/ },
  { clip: 'ex_kickback', families: ['triceps'], bases: /^(tricep-kickback|stand-bent-over-two-arm-tricep-extension)$/ },
  { clip: 'ex_kickback_one', families: ['triceps'], bases: /^stand-bent-over-singl-arm-tricep-extension$/ },
  { clip: 'ex_row_alt', families: ['row'], bases: /^alternat-row$/ },
  { clip: 'ex_row_one', families: ['row'], bases: /^singl-arm-row$/ },
  { clip: 'ex_upright_row_one', families: ['upright-row-shrug'], bases: /^singl-arm-upright-row$/ },
  // ── LIBRARY-ANATOMY-2: the mobility flows, each its own loop (exerciseFloor.ts, the positions in order) ──
  { clip: (base) => { const seq = base.replace(/^flow3?-/, ''); return FLOW_SEQS.includes(seq) ? flowClip(seq) : null; }, families: ['mobility-flow'], bases: /^flow3?-[a-z-]+$/, emits: FLOW_CLIPS },
  // ── LIBRARY-ANATOMY-2: single positions and stretches (exerciseFloor.ts POSITIONS: the position, breathing, or its small movement) ──
  { clip: 'ex_pos_child', families: ['stretch-upper'], bases: /^child-pos$/ },
  { clip: 'ex_pos_child', families: ['breathing-2'], bases: /^child$/ },
  { clip: 'ex_pos_catcamel', families: ['stretch-upper'], bases: /^cat-stretch$/ },
  { clip: 'ex_pos_catcamel', families: ['upper-back-mobility'], bases: /^cat-camel$/ },
  { clip: 'ex_pos_thread', families: ['upper-back-mobility'], bases: /^thread$/ },
  { clip: 'ex_pos_openbook', families: ['upper-back-mobility'], bases: /^open-book$/ },
  { clip: 'ex_pos_openbook', families: ['stretch-matrix'], bases: /^tspine-windmill$/ },
  { clip: 'ex_pos_kneehug', families: ['stretch-upper'], bases: /^hug-kne-chest$/ },
  { clip: 'ex_pos_oneknee', families: ['stretch-hip'], bases: /^one-kne-chest$/ },
  { clip: 'ex_pos_kneel', families: ['hip-mobility'], bases: /^half-kneel$/ },
  { clip: 'ex_pos_kneel', families: ['stretch-quad-hip'], bases: /^kneel-hip-flexor$/ },
  { clip: 'ex_pos_couch', families: ['hip-mobility'], bases: /^couch$/ },
  { clip: 'ex_pos_frog', families: ['hip-mobility'], bases: /^frog$/ },
  { clip: 'ex_pos_pigeon', families: ['hip-mobility'], bases: /^pigeon$/ },
  { clip: 'ex_pos_shinbox', families: ['hip-mobility'], bases: /^shin-box$/ },
  { clip: 'ex_pos_switch', families: ['hip-mobility'], bases: /^90-90-switch$/ },
  { clip: (_b) => flowClip('fold-inchworm'), families: ['dynamic-flow', 'dynamic-warmup'], bases: /^inchworm$/, emits: [flowClip('fold-inchworm')] },
  { clip: 'ex_pos_fold', families: ['posterior-chain-mobility'], bases: /^fold$/ },
  { clip: 'ex_pos_squat', families: ['goblet-cossack-flow'], bases: /^hold$/ },
  { clip: 'ex_pos_supine', families: ['breathing-2'], bases: /^supine-belly$/ },
  { clip: 'ex_pos_prone', families: ['breathing-2'], bases: /^prone$/ },
  { clip: 'ex_pos_prone', families: ['breath-drill'], bases: /^crocodile$/ },
  { clip: 'ex_pos_supine9090', families: ['breathing-2'], bases: /^feet-wall$/ },
  { clip: 'ex_pos_supine9090', families: ['breath-drill'], bases: /^90-90$/ },
  { clip: 'ex_pos_legsup', families: ['breath-drill'], bases: /^legs-up$/ },
  { clip: 'ex_pos_side', families: ['breathing-2'], bases: /^side-lying$/ },
  { clip: 'ex_pos_kneerock', families: ['recovery-mobility'], bases: /^(knee-rock|twist)$/ },
  { clip: 'ex_pos_childside', families: ['recovery-mobility'], bases: /^child-side$/ },
  { clip: 'ex_pos_happybaby', families: ['recovery-mobility'], bases: /^happy-baby$/ },
  { clip: 'ex_pos_figure4', families: ['recovery-mobility'], bases: /^figure-4$/ },
  { clip: 'ex_pos_halfsplit', families: ['stretch-matrix'], bases: /^ham-halfsplit$/ },
  { clip: 'ex_pos_rockback', families: ['stretch-matrix'], bases: /^quad-rock$/ },
  { clip: 'ex_pos_dogpedal', families: ['stretch-matrix'], bases: /^calf-dog$/ },
  { clip: 'ex_pos_straddle', families: ['stretch-matrix'], bases: /^add-straddle$/ },
  { clip: 'ex_pos_straddle', families: ['stretch-hamstring'], bases: /^straddl$/ },
  { clip: 'ex_pos_sidelunge', families: ['stretch-matrix'], bases: /^add-sidelunge$/ },
  { clip: 'ex_pos_pike', families: ['stretch-hamstring'], bases: /^(seat-hamstr|seat-floor-hamstr-stretch)$/ },
  { clip: 'ex_pos_lyinghams', families: ['stretch-hamstring'], bases: /^lying-hamstr$/ },
  { clip: 'ex_pos_superman', families: ['back-extension'], bases: /^superman$/ },
  { clip: 'ex_pos_clamshell', families: ['hip-stability'], bases: /^clamshell$/ },
  { clip: 'ex_pos_sideraise', families: ['hip-stability'], bases: /^side-raise$/ },
  { clip: 'ex_pos_sideer', families: ['shoulder-care'], bases: /^er-side-lying$/ },
  // ── LIBRARY-ANATOMY-2: anti-rotation and med-ball throws, a stance under an arm action (anim/authored/exerciseAthletic.ts) ──
  { clip: (b) => stanceClip(b, /^(?:band|cable)-(press|hold|overhead|rotate-out)-(standing|half-kneeling|tall-kneeling|split|lateral-lunge|single-leg)$/, PALLOF_ACTION), families: ['pallof-matrix'], bases: /^(band|cable)-/, emits: Object.values(PALLOF_ACTION).flatMap((a) => ['standing', 'hk', 'tk', 'split', 'lateral', 'single'].map((x) => `ex_${a}_${x}`)) },
  { clip: (b) => ({ 'tall-kneel': 'ex_pallofpress_tk', 'half-kneel': 'ex_pallofpress_hk', standing: 'ex_pallofpress_standing', split: 'ex_pallofpress_split', chop: 'ex_chop_hk', lift: 'ex_lift_hk', 'band-chop': 'ex_chop_standing' } as Record<string, string>)[b] ?? null, families: ['anti-rotation'], bases: /^(tall-kneel|half-kneel|standing|split|chop|lift|band-chop)$/, emits: ['ex_pallofpress_tk', 'ex_pallofpress_hk', 'ex_pallofpress_standing', 'ex_pallofpress_split', 'ex_chop_hk', 'ex_lift_hk', 'ex_chop_standing'] },
  { clip: (b) => stanceClip(b, /^(chest|overhead|scoop|shot-put|side-toss|underhand|single-push|rot-overhead)-(standing|half-kneeling|tall-kneeling|split|step-in|single-leg)$/, THROW_ACTION), families: ['med-ball-throw-matrix'], bases: /^[a-z-]+$/, emits: Object.values(THROW_ACTION).flatMap((a) => ['standing', 'hk', 'tk', 'split', 'stepin', 'single'].filter((x) => !(a === 'singlepush' && x === 'single')).map((x) => `ex_${a}_${x}`)) },
  { clip: (b) => ({ 'medicin-ball-chest-pass': 'ex_chest_standing', 'stand-two-arm-overhead-throw': 'ex_overhead_standing', 'overhead-slam': 'ex_slam_standing', 'medicin-ball-scoop-throw': 'ex_underhand_standing', 'backward-medicin-ball-throw': 'ex_backtoss_standing' } as Record<string, string>)[b] ?? null, families: ['throw'], bases: /^(medicin-ball-chest-pass|stand-two-arm-overhead-throw|overhead-slam|medicin-ball-scoop-throw|backward-medicin-ball-throw)$/, emits: ['ex_chest_standing', 'ex_overhead_standing', 'ex_slam_standing', 'ex_underhand_standing', 'ex_backtoss_standing'] },
  { clip: (b) => ({ 'scoop-forward': 'ex_underhand_standing', 'backward-toss': 'ex_backtoss_standing', slam: 'ex_slam_standing', 'squat-throw': 'ex_squatthrow_standing', 'kneeling-pass': 'ex_chest_tk' } as Record<string, string>)[b] ?? null, families: ['med-ball-power'], bases: /^(scoop-forward|backward-toss|slam|squat-throw|kneeling-pass)$/, emits: ['ex_underhand_standing', 'ex_backtoss_standing', 'ex_slam_standing', 'ex_squatthrow_standing', 'ex_chest_tk'] },
  { clip: (b) => ({ overhead: 'ex_overhead_standing', 'kneeling-overhead': 'ex_overhead_tk', 'single-arm': 'ex_singlepush_standing', rotational: 'ex_sidetoss_standing' } as Record<string, string>)[b] ?? null, families: ['partner-throw'], bases: /^(overhead|kneeling-overhead|single-arm|rotational)$/, emits: ['ex_overhead_standing', 'ex_overhead_tk', 'ex_singlepush_standing', 'ex_sidetoss_standing'] },
  { clip: (b) => ({ hk: 'ex_scoop_hk', scoop: 'ex_scoop_standing', 'shot-put': 'ex_shotput_standing' } as Record<string, string>)[b] ?? null, families: ['rotational-power'], bases: /^(hk|scoop|shot-put)$/, emits: ['ex_scoop_hk', 'ex_scoop_standing', 'ex_shotput_standing'] },
  { clip: 'ex_chop_standing', families: ['rotation'], bases: /^stand-wood-chop$/ },
  { clip: 'ex_lift_standing', families: ['rotation'], bases: /^stand-lift$/ },
  // DEMO-LOOPS-7: the barbell side bend (the bar across the back) has its own loop
  { clip: (_b, eq) => (eq.includes('dumbbell') ? 'ex_side_bend' : eq.includes('barbell') ? 'ex_side_bend_bar' : null), families: ['rotation'], bases: /^sid-bend$/, emits: ['ex_side_bend', 'ex_side_bend_bar'] },
  { clip: 'ex_halo', families: ['get-up-windmill'], bases: /^halo$/ },
  // ── carries, marches, swings, the rotator cuff, single-arm cable work ──
  { clip: 'ex_carry_rack', families: ['carry'], bases: /^rack$/, notMods: /^offset$/ },
  { clip: 'ex_carry_overhead', families: ['carry'], bases: /^overhead$/ },
  { clip: 'ex_march_carry', families: ['march'], bases: /^suitcase$/ },
  { clip: 'ex_march_rack', families: ['march'], bases: /^rack$/ },
  { clip: 'ex_march_overhead', families: ['march'], bases: /^overhead$/ },
  { clip: 'ex_kb_swing', families: ['kb-swing'], bases: /^two-hand$/ },
  { clip: 'ex_kb_swing_one', families: ['kb-swing'], bases: /^singl-arm-swing$/ },
  { clip: 'ex_kb_swing', families: ['db-hinge'], bases: /^swing$/ },
  { clip: 'ex_kb_swing', families: ['kb-lower'], bases: /^double-swing$/ },
  { clip: (b) => ({ 'er-side': 'ex_er_side', 'cable-er-side': 'ex_er_side', 'ir-side': 'ex_ir_side', 'cable-ir-side': 'ex_ir_side', 'er-90-standing': 'ex_er_90', 'cable-er-90-standing': 'ex_er_90', 'ir-90-standing': 'ex_ir_90', 'cable-ir-90-standing': 'ex_ir_90', 'er-90-kneeling': 'ex_er_90_hk', 'ir-90-kneeling': 'ex_ir_90_hk', 'er-split': 'ex_er_side_split', 'ir-split': 'ex_ir_side_split' } as Record<string, string>)[b] ?? null, families: ['shoulder-rotation'], bases: /^[a-z0-9-]+$/, emits: ['ex_er_side', 'ex_ir_side', 'ex_er_90', 'ex_ir_90', 'ex_er_90_hk', 'ex_ir_90_hk', 'ex_er_side_split', 'ex_ir_side_split'] },
  { clip: (b) => (/press/.test(b) ? 'ex_cable_press_one' : 'ex_cable_row_one'), families: ['standing-cable'], bases: /^(press|row|band-press|band-row)$/, emits: ['ex_cable_press_one', 'ex_cable_row_one'] },
  // ── LIBRARY-ANATOMY-2: lunges sideways and behind, the sumo pull, single-leg hinges (anim/authored/exerciseBody.ts) ──
  { clip: (b) => ({ 'lateral-bw': 'ex_lateral_lunge', 'lateral-goblet': 'ex_lateral_lunge', cossack: 'ex_pos_cossack', curtsy: 'ex_curtsy_lunge' } as Record<string, string>)[b] ?? null, families: ['lunge'], bases: /^(lateral-goblet|lateral-bw|cossack|curtsy)$/, emits: ['ex_lateral_lunge', 'ex_pos_cossack', 'ex_curtsy_lunge'] },
  { clip: (b) => ({ cossack: 'ex_pos_cossack', 'lateral-lunge': 'ex_lateral_lunge' } as Record<string, string>)[b] ?? null, families: ['db-lower'], bases: /^(lateral-lunge|cossack)$/, emits: ['ex_pos_cossack', 'ex_lateral_lunge'] },
  { clip: (b) => ({ 'goblet-lateral-squat': 'ex_pos_cossack', 'sumo-dl': 'ex_sumo_deadlift' } as Record<string, string>)[b] ?? null, families: ['kb-lower'], bases: /^(goblet-lateral-squat|sumo-dl)$/, emits: ['ex_pos_cossack', 'ex_sumo_deadlift'] },
  { clip: (b) => ({ 'lateral-lunge': 'ex_lateral_lunge' } as Record<string, string>)[b] ?? null, families: ['landmine-lower'], bases: /^(lateral-lunge)$/, emits: ['ex_lateral_lunge'] },
  { clip: (b) => ({ 'sumo-deadlift': 'ex_sumo_deadlift', 'sumo-deadlift-chain': 'ex_sumo_deadlift' } as Record<string, string>)[b] ?? null, families: ['deadlift'], bases: /^(sumo-deadlift-chain|sumo-deadlift)$/, emits: ['ex_sumo_deadlift'] },
  { clip: (b) => ({ bw: 'ex_sl_rdl', db: 'ex_sl_rdl', kb: 'ex_sl_rdl', 'kickstand-db': 'ex_kickstand_rdl' } as Record<string, string>)[b] ?? null, families: ['single-leg-hinge'], bases: /^(kickstand-db|bw|db|kb)$/, emits: ['ex_sl_rdl', 'ex_kickstand_rdl'] },
  { clip: (b) => ({ 'one-leg-deadlift': 'ex_sl_rdl' } as Record<string, string>)[b] ?? null, families: ['rdl'], bases: /^(one-leg-deadlift)$/, emits: ['ex_sl_rdl'] },
  { clip: (b) => ({ 'staggered-rdl': 'ex_kickstand_rdl' } as Record<string, string>)[b] ?? null, families: ['db-hinge'], bases: /^(staggered-rdl)$/, emits: ['ex_kickstand_rdl'] },
  // ── on the back, planks, conditioning, drills, jumps, rope, crawls ──
  { clip: (b) => ({ 'revers-crunch': 'ex_reverse_crunch', 'sit-up': 'ex_situp', '3-4-sit-up': 'ex_situp_34', 'cross-body-crunch': 'ex_bicycle', 'elbow-kne': 'ex_bicycle', 'alternat-heel-toucher': 'ex_heel_touch', 'flutter-kick': 'ex_flutter', 'toe-toucher': 'ex_toe_touch', 'jackknif-sit-up': 'ex_vup' } as Record<string, string>)[b] ?? null, families: ['flexion'], bases: /^(alternat-heel-toucher|cross-body-crunch|jackknif-sit-up|revers-crunch|flutter-kick|toe-toucher|3-4-sit-up|elbow-kne|sit-up)$/, emits: ['ex_reverse_crunch', 'ex_situp', 'ex_situp_34', 'ex_bicycle', 'ex_heel_touch', 'ex_flutter', 'ex_toe_touch', 'ex_vup'] },
  { clip: (b) => ({ hollow: 'ex_hollow', 'hollow-tuck': 'ex_hollow_tuck', 'hollow-rock': 'ex_hollow_rock' } as Record<string, string>)[b] ?? null, families: ['trunk-flexion'], bases: /^(hollow-tuck|hollow-rock|hollow)$/, emits: ['ex_hollow', 'ex_hollow_tuck', 'ex_hollow_rock'] },
  { clip: (b) => ({ 'heel-tap': 'ex_dead_bug_heel' } as Record<string, string>)[b] ?? null, families: ['dead-bug'], bases: /^(heel-tap)$/, emits: ['ex_dead_bug_heel'] },
  { clip: (b) => ({ 'shoulder-tap': 'ex_shoulder_tap', reach: 'ex_plank_high_reach', 'sid-bridg': 'ex_side_plank', 'bear-hold': 'ex_pos_bear', 'bear-crawl': 'ex_bear_crawl' } as Record<string, string>)[b] ?? null, families: ['plank'], bases: /^(shoulder-tap|bear-crawl|sid-bridg|bear-hold|reach)$/, emits: ['ex_shoulder_tap', 'ex_plank_high_reach', 'ex_side_plank', 'ex_pos_bear', 'ex_bear_crawl'] },
  { clip: (b) => ({ 'forearm-leg-lift': 'ex_plank_forearm_leg', 'forearm-arm-reach': 'ex_plank_forearm_reach', 'forearm-knee-elbow': 'ex_plank_forearm_knee', 'high-leg-lift': 'ex_plank_high_leg', 'high-arm-reach': 'ex_plank_high_reach', 'high-knee-elbow': 'ex_plank_high_knee', 'bear-leg-lift': 'ex_plank_bear_leg', 'bear-arm-reach': 'ex_plank_bear_reach', 'bear-knee-elbow': 'ex_plank_bear_knee', 'side-leg-lift': 'ex_side_plank_leg' } as Record<string, string>)[b] ?? null, families: ['plank-matrix'], bases: /^(forearm-knee-elbow|forearm-arm-reach|forearm-leg-lift|high-knee-elbow|bear-knee-elbow|high-arm-reach|bear-arm-reach|high-leg-lift|bear-leg-lift|side-leg-lift)$/, emits: ['ex_plank_forearm_leg', 'ex_plank_forearm_reach', 'ex_plank_forearm_knee', 'ex_plank_high_leg', 'ex_plank_high_reach', 'ex_plank_high_knee', 'ex_plank_bear_leg', 'ex_plank_bear_reach', 'ex_plank_bear_knee', 'ex_side_plank_leg'] },
  { clip: (b) => ({ full: 'ex_side_plank', 'leg-raise': 'ex_side_plank_leg' } as Record<string, string>)[b] ?? null, families: ['side-plank'], bases: /^(leg-raise|full)$/, emits: ['ex_side_plank', 'ex_side_plank_leg'] },
  { clip: (b) => ({ crab: 'ex_crab_walk', 'crab-reach': 'ex_crab_reach', leopard: 'ex_leopard_crawl', 'beast-tap': 'ex_bear_tap' } as Record<string, string>)[b] ?? null, families: ['crawl'], bases: /^(crab-reach|beast-tap|leopard|crab)$/, emits: ['ex_crab_walk', 'ex_crab_reach', 'ex_leopard_crawl', 'ex_bear_tap'] },
  { clip: (b) => ({ 'squat-thrust': 'ex_squat_thrust', burpee: 'ex_burpee', 'seal-jack': 'ex_seal_jack' } as Record<string, string>)[b] ?? null, families: ['conditioning-circuit'], bases: /^(squat-thrust|seal-jack|burpee)$/, emits: ['ex_squat_thrust', 'ex_burpee', 'ex_seal_jack'] },
  { clip: (b) => ({ 'a-skip': 'ex_a_skip', 'b-skip': 'ex_b_skip', 'high-knees': 'ex_high_knees', 'butt-kicks': 'ex_butt_kicks' } as Record<string, string>)[b] ?? null, families: ['sprint-mechanics'], bases: /^(high-knees|butt-kicks|a-skip|b-skip)$/, emits: ['ex_a_skip', 'ex_b_skip', 'ex_high_knees', 'ex_butt_kicks'] },
  { clip: (b) => ({ 'power-skip': 'ex_power_skip' } as Record<string, string>)[b] ?? null, families: ['bounding'], bases: /^(power-skip)$/, emits: ['ex_power_skip'] },
  { clip: (b) => ({ 'skip-height': 'ex_power_skip' } as Record<string, string>)[b] ?? null, families: ['basketball-warmup'], bases: /^(skip-height)$/, emits: ['ex_power_skip'] },
  { clip: (b) => ({ 'kne-tuck-jump': 'ex_tuck_jump', 'star-jump': 'ex_star_jump', 'split-jump': 'ex_split_jump', 'scissor-jump': 'ex_split_jump', 'lateral-bound': 'ex_lateral_bound', 'lateral-con-hop': 'ex_lateral_hops', 'singl-leg-lateral-hop': 'ex_lateral_hops_sl' } as Record<string, string>)[b] ?? null, families: ['jump'], bases: /^(singl-leg-lateral-hop|lateral-con-hop|kne-tuck-jump|lateral-bound|scissor-jump|split-jump|star-jump)$/, emits: ['ex_tuck_jump', 'ex_star_jump', 'ex_split_jump', 'ex_lateral_bound', 'ex_lateral_hops', 'ex_lateral_hops_sl'] },
  { clip: (b) => ({ tuck: 'ex_tuck_jump', 'split-switch': 'ex_split_jump', 'single-leg': 'ex_sl_jump' } as Record<string, string>)[b] ?? null, families: ['vertical-jump'], bases: /^(split-switch|single-leg|tuck)$/, emits: ['ex_tuck_jump', 'ex_split_jump', 'ex_sl_jump'] },
  { clip: (b) => ({ 'tuck-stick': 'ex_tuck_jump', 'split-stick': 'ex_split_jump', 'sl-vert-stick': 'ex_sl_jump', 'sl-vert-repeat': 'ex_sl_jump' } as Record<string, string>)[b] ?? null, families: ['vertical-jump-builds'], bases: /^(sl-vert-repeat|sl-vert-stick|split-stick|tuck-stick)$/, emits: ['ex_tuck_jump', 'ex_split_jump', 'ex_sl_jump'] },
  { clip: (b) => ({ 'fore-aft': 'ex_pogo_fb', lateral: 'ex_pogo_lat', 'single-leg': 'ex_pogo_sl', 'single-leg-lateral': 'ex_lateral_hops_sl' } as Record<string, string>)[b] ?? null, families: ['pogo'], bases: /^(single-leg-lateral|single-leg|fore-aft|lateral)$/, emits: ['ex_pogo_fb', 'ex_pogo_lat', 'ex_pogo_sl', 'ex_lateral_hops_sl'] },
  { clip: (b) => ({ continuous: 'ex_lateral_bound', 'bound-stick': 'ex_lateral_bound' } as Record<string, string>)[b] ?? null, families: ['lateral-bound'], bases: /^(bound-stick|continuous)$/, emits: ['ex_lateral_bound'] },
  { clip: (b) => ({ alternate: 'ex_rope_alt', 'side-side': 'ex_rope_side', 'high-knee': 'ex_rope_highknee', 'single-leg': 'ex_rope_sl', 'double-under': 'ex_rope_double' } as Record<string, string>)[b] ?? null, families: ['jump-rope'], bases: /^(double-under|single-leg|alternate|side-side|high-knee)$/, emits: ['ex_rope_alt', 'ex_rope_side', 'ex_rope_highknee', 'ex_rope_sl', 'ex_rope_double'] },
  { clip: (b) => ({ 'fwd-back': 'ex_rope_fb', boxer: 'ex_rope_boxer', ski: 'ex_rope_side', scissor: 'ex_rope_scissor', 'wide-narrow': 'ex_rope_wide', running: 'ex_rope_alt' } as Record<string, string>)[b] ?? null, families: ['jump-rope-2'], bases: /^(wide-narrow|fwd-back|scissor|running|boxer|ski)$/, emits: ['ex_rope_fb', 'ex_rope_boxer', 'ex_rope_side', 'ex_rope_scissor', 'ex_rope_wide', 'ex_rope_alt'] },
  // ── LIBRARY-ANATOMY-2: on a box, a bench, a bar, a pad — the stage draws it (anim/authored/exerciseProps.ts) ──
  { clip: (b, eq) => (eq.includes('barbell')) ? (b === 'step-ups' ? 'ex_step_up_bar' : null) : ({ 'step-ups': 'ex_step_up', bw: 'ex_step_up', db: 'ex_step_up', 'low-bw': 'ex_step_up', 'knee-drive': 'ex_step_up_knee', 'lateral-bw': 'ex_step_up_lat', 'lateral-db': 'ex_step_up_lat' } as Record<string, string>)[b] ?? null, families: ['step-up'], bases: /^(knee-drive|lateral-bw|lateral-db|step-ups|low-bw|bw|db)$/, emits: ['ex_step_up', 'ex_step_up_knee', 'ex_step_up_lat', 'ex_step_up_bar'] },
  { clip: (b) => ({ forward: 'ex_step_down', lateral: 'ex_step_down_lat', 'lateral-db': 'ex_step_down_lat' } as Record<string, string>)[b] ?? null, families: ['step-down'], bases: /^(lateral-db|forward|lateral)$/, emits: ['ex_step_down', 'ex_step_down_lat'] },
  { clip: (b) => ({ 'lat-hold': 'ex_step_down_lat', 'fwd-high': 'ex_step_down' } as Record<string, string>)[b] ?? null, families: ['knee-capacity'], bases: /^(lat-hold|fwd-high)$/, emits: ['ex_step_down_lat', 'ex_step_down'] },
  { clip: (b) => ({ 'box-high': 'ex_sl_box_squat', 'box-mid': 'ex_sl_box_squat', 'singl-leg-high-box-squat': 'ex_sl_box_squat', 'pistol-box': 'ex_sl_box_squat', pistol: 'ex_pistol', 'pistol-squat': 'ex_pistol_goblet', skater: 'ex_skater_squat', 'skater-pad': 'ex_skater_squat' } as Record<string, string>)[b] ?? null, families: ['single-leg-squat'], bases: /^(singl-leg-high-box-squat|pistol-squat|pistol-box|skater-pad|box-high|box-mid|pistol|skater)$/, emits: ['ex_sl_box_squat', 'ex_pistol', 'ex_pistol_goblet', 'ex_skater_squat'] },
  { clip: (b) => ({ 'sl-box': 'ex_sl_box_squat' } as Record<string, string>)[b] ?? null, families: ['db-lower'], bases: /^(sl-box)$/, emits: ['ex_sl_box_squat'] },
  { clip: (b) => ({ 'rfe-bw': 'ex_bulgarian', 'rfe-db': 'ex_bulgarian', 'rfe-band': 'ex_bulgarian', 'rfe-bb': 'ex_bulgarian_bar' } as Record<string, string>)[b] ?? null, families: ['split-squat'], bases: /^(rfe-bw|rfe-db|rfe-band|rfe-bb)$/, emits: ['ex_bulgarian', 'ex_bulgarian_bar'] },
  { clip: (b) => ({ 'lying-leg-curl': 'ex_lying_leg_curl', 'seat-leg-curl': 'ex_seated_leg_curl', 'seat-hamstr-curl': 'ex_seated_leg_curl', 'stand-leg-curl': 'ex_standing_leg_curl', 'platform-hamstr-slid': 'ex_slider_curl' } as Record<string, string>)[b] ?? null, families: ['leg-curl'], bases: /^(platform-hamstr-slid|seat-hamstr-curl|lying-leg-curl|stand-leg-curl|seat-leg-curl)$/, emits: ['ex_lying_leg_curl', 'ex_seated_leg_curl', 'ex_standing_leg_curl', 'ex_slider_curl'] },
  { clip: (b) => ({ 'leg-extension': 'ex_leg_extension', 'singl-leg-leg-extension': 'ex_leg_extension_one' } as Record<string, string>)[b] ?? null, families: ['leg-extension'], bases: /^(singl-leg-leg-extension|leg-extension)$/, emits: ['ex_leg_extension', 'ex_leg_extension_one'] },
  { clip: (b) => ({ 'seat-calf-rais': 'ex_seated_calf', 'seated-db': 'ex_seated_calf' } as Record<string, string>)[b] ?? null, families: ['calf-raise'], bases: /^(seat-calf-rais|seated-db)$/, emits: ['ex_seated_calf'] },
  { clip: (b) => ({ slider: 'ex_slider_curl', nordic: 'ex_nordic', 'nordic-eccentric': 'ex_nordic', 'nordic-band': 'ex_nordic' } as Record<string, string>)[b] ?? null, families: ['hamstring-curl'], bases: /^(nordic-eccentric|nordic-band|slider|nordic)$/, emits: ['ex_slider_curl', 'ex_nordic'] },
  { clip: (b) => ({ 'hip-thrust': 'ex_hip_thrust', 'singl-leg-glut-bridg': 'ex_bridge_sl' } as Record<string, string>)[b] ?? null, families: ['bridge-thrust'], bases: /^(singl-leg-glut-bridg|hip-thrust)$/, emits: ['ex_hip_thrust', 'ex_bridge_sl'] },
  { clip: (b) => ({ 'thrust-db': 'ex_hip_thrust', 'thrust-sl': 'ex_hip_thrust_sl', march: 'ex_bridge_march', 'feet-up': 'ex_bridge_feetup' } as Record<string, string>)[b] ?? null, families: ['bridge'], bases: /^(thrust-db|thrust-sl|feet-up|march)$/, emits: ['ex_hip_thrust', 'ex_hip_thrust_sl', 'ex_bridge_march', 'ex_bridge_feetup'] },
  { clip: (b) => ({ 'pull-up': 'ex_pullup', 'weight-pull-ups': 'ex_pullup', 'assist-pull-up': 'ex_pullup', 'v-bar-pull-up': 'ex_chinup', 'chin-up': 'ex_chinup', 'mix-grip-chin': 'ex_chinup', 'scapular-pull-up': 'ex_scap_pullup' } as Record<string, string>)[b] ?? null, families: ['pull-up'], bases: /^(scapular-pull-up|weight-pull-ups|assist-pull-up|v-bar-pull-up|mix-grip-chin|pull-up|chin-up)$/, emits: ['ex_pullup', 'ex_chinup', 'ex_scap_pullup'] },
  { clip: (b) => ({ 'dead-hang': 'ex_dead_hang', 'active-hang': 'ex_dead_hang', weighted: 'ex_pullup', pulldown: 'ex_pulldown' } as Record<string, string>)[b] ?? null, families: ['vertical-pull'], bases: /^(active-hang|dead-hang|weighted|pulldown)$/, emits: ['ex_dead_hang', 'ex_pullup', 'ex_pulldown'] },
  { clip: (b) => ({ 'wid-grip-lat-pulldown': 'ex_pulldown', 'full-rang-motion-lat-pulldown': 'ex_pulldown', 'clos-grip-front-lat-pulldown': 'ex_pulldown_close', 'underhand-pulldown': 'ex_pulldown_close', 'v-bar-pulldown': 'ex_pulldown_close', 'singl-arm-lat-pulldown': 'ex_pulldown_one', 'straight-arm-pulldown': 'ex_straight_arm_pulldown', 'rop-straight-arm-pulldown': 'ex_straight_arm_pulldown' } as Record<string, string>)[b] ?? null, families: ['pulldown'], bases: /^(full-rang-motion-lat-pulldown|clos-grip-front-lat-pulldown|rop-straight-arm-pulldown|singl-arm-lat-pulldown|wid-grip-lat-pulldown|straight-arm-pulldown|underhand-pulldown|v-bar-pulldown)$/, emits: ['ex_pulldown', 'ex_pulldown_close', 'ex_pulldown_one', 'ex_straight_arm_pulldown'] },
  { clip: (b) => ({ 'invert-row': 'ex_inverted_row', 'invert-row-strap': 'ex_inverted_row', 'db-chest': 'ex_chest_row', 'inclin-row': 'ex_chest_row', 'inclin-bench-pull': 'ex_chest_row' } as Record<string, string>)[b] ?? null, families: ['row'], bases: /^(inclin-bench-pull|invert-row-strap|invert-row|inclin-row|db-chest)$/, emits: ['ex_inverted_row', 'ex_chest_row'] },
  { clip: (b) => ({ 'dip-chest': 'ex_dip', 'dip-tricep': 'ex_dip', 'parallel-bar-dip': 'ex_dip', weighted: 'ex_dip', band: 'ex_dip', support: 'ex_dip_hold', 'bench-dip': 'ex_bench_dip', 'weight-bench-dip': 'ex_bench_dip', 'bench-bent': 'ex_bench_dip_bent' } as Record<string, string>)[b] ?? null, families: ['dip'], bases: /^(parallel-bar-dip|weight-bench-dip|dip-tricep|bench-bent|dip-chest|bench-dip|weighted|support|band)$/, emits: ['ex_dip', 'ex_dip_hold', 'ex_bench_dip', 'ex_bench_dip_bent'] },
  { clip: (b, eq) => (eq.includes('kettlebell')) ? null : ({ 'inclin-push-up': 'ex_incline_pushup', 'inclin-push-up-clos-grip': 'ex_incline_pushup', 'inclin-push-up-medium': 'ex_incline_pushup', 'inclin-push-up-revers-grip': 'ex_incline_pushup', 'inclin-push-up-wid': 'ex_incline_pushup', 'declin-push-up': 'ex_decline_pushup', 'push-ups-feet-elevat': 'ex_decline_pushup', 'feet-up': 'ex_decline_pushup', wall: 'ex_wall_pushup', 'plyometric-push-up': 'ex_plyo_pushup', 'hand-release': 'ex_hand_release' } as Record<string, string>)[b] ?? null, families: ['push-up'], bases: /^(inclin-push-up-revers-grip|inclin-push-up-clos-grip|inclin-push-up-medium|push-ups-feet-elevat|inclin-push-up-wid|plyometric-push-up|inclin-push-up|declin-push-up|hand-release|feet-up|wall)$/, emits: ['ex_incline_pushup', 'ex_decline_pushup', 'ex_wall_pushup', 'ex_plyo_pushup', 'ex_hand_release'] },
  { clip: (b) => ({ 'inclin-curl': 'ex_incline_curl', 'inclin-hammer-curl': 'ex_incline_curl', 'inclin-inner-bicep-curl': 'ex_incline_curl', 'flexor-inclin-curl': 'ex_incline_curl', 'alternat-inclin-curl': 'ex_incline_curl_alt', 'spider-curl': 'ex_spider_curl', 'pron-inclin-curl': 'ex_spider_curl', 'preacher-curl': 'ex_preacher_curl', 'two-arm-preacher-curl': 'ex_preacher_curl', 'preacher-hammer-curl': 'ex_preacher_curl', 'revers-preacher-curl': 'ex_preacher_curl', 'singl-arm-preacher-curl': 'ex_preacher_curl_one', 'concentration-curl': 'ex_concentration_curl' } as Record<string, string>)[b] ?? null, families: ['curl'], bases: /^(inclin-inner-bicep-curl|singl-arm-preacher-curl|two-arm-preacher-curl|alternat-inclin-curl|preacher-hammer-curl|revers-preacher-curl|inclin-hammer-curl|flexor-inclin-curl|concentration-curl|pron-inclin-curl|preacher-curl|inclin-curl|spider-curl)$/, emits: ['ex_incline_curl', 'ex_incline_curl_alt', 'ex_spider_curl', 'ex_preacher_curl', 'ex_preacher_curl_one', 'ex_concentration_curl'] },
  { clip: (b) => ({ 'incline-y': 'ex_incline_y', 'incline-t': 'ex_incline_t', 'incline-w': 'ex_incline_w' } as Record<string, string>)[b] ?? null, families: ['scap-work'], bases: /^(incline-y|incline-t|incline-w)$/, emits: ['ex_incline_y', 'ex_incline_t', 'ex_incline_w'] },
  { clip: (b) => ({ 'incline-y': 'ex_incline_y' } as Record<string, string>)[b] ?? null, families: ['db-upper'], bases: /^(incline-y)$/, emits: ['ex_incline_y'] },
  // ── LIBRARY-ANATOMY-2: the same lift on other kit (a Smith bar, chains, a band, a kettlebell for a dumbbell): the body does what the loop shows ──
  { clip: 'ex_bench_press', families: ['bench-press'], bases: /^(smith-bench-press|smith-clos-grip-bench-press|clos-grip-press|clos-grip-ez-bar-press|paused|revers-bench-press)$/ },
  { clip: 'ex_incline_press', families: ['bench-press'], bases: /^smith-inclin-bench-press$/ },
  { clip: 'ex_floor_press', families: ['bench-press'], bases: /^floor-press-chain$/ },
  // the incline dumbbell press the overhead-press family files (the bench at 45°, the same press as bench-press's)
  { clip: 'ex_incline_press', families: ['overhead-press'], bases: /^inclin-press$/ },
  // a bottoms-up kettlebell is a one-arm press (the bell upside down is the grip, not the path)
  { clip: 'ex_press_one', families: ['push-extra'], bases: /^bottoms-up-press$/ },
  // assumption: the reverse-grip bench press shows the bench press (the same bar path; the grip is not drawn)
  { clip: 'ex_bench_press', families: ['triceps'], bases: /^revers-tricep-bench-press$/ },
  { clip: 'ex_row', families: ['row'], bases: /^(two-arm-row|smith-bent-over-row)$/ },
  // assumption: the lying T-bar row's chest pad is the incline chest-supported row's
  { clip: 'ex_chest_row', families: ['row'], bases: /^lying-t-bar-row$/ },
  // bent over, a cable in each hand drawn out to the sides: the bent-over reverse fly
  { clip: 'ex_reverse_fly', families: ['raise'], bases: /^bent-over-low-pulley-sid-lateral$/ },
  { clip: 'ex_straight_arm_pulldown', families: ['pull-extra'], bases: /^band-straight-arm$/ },
  // ── LIBRARY-ANATOMY-2: a variation that IS a hold — the loop's own frame at the depth it names ──
  { clip: 'ex_split_squat', families: ['knee-capacity'], bases: /^(split-deep|split-iso)$/, hold: 1.09 },
  { clip: 'ex_split_squat', families: ['knee-capacity'], bases: /^split-half$/, hold: 0.49 },
  { clip: 'ex_split_squat', families: ['knee-capacity'], bases: /^split-quarter$/, hold: 0.33 },
  { clip: 'ex_split_squat', families: ['isometric-capacity'], bases: /^split-hover$/, hold: 1.09 },
  { clip: 'ex_calf_raise', families: ['calf-capacity'], bases: /^straight-double-iso$/, hold: 0.8 },
  { clip: 'ex_calf_raise', families: ['calf-raise'], bases: /^iso-wall$/, hold: 0.8 },
  // ── LIBRARY-ANATOMY-2: calf raises on one leg, knees bent, off a step; the high curl; the Z press; the wall sit; the seated row (anim/authored/exerciseVariants.ts) ──
  { clip: (b) => ({ 'bent-double-slow': 'ex_calf_raise_bent', 'bent-double-step': 'ex_calf_raise_bent_step', 'bent-single-slow': 'ex_calf_raise_bent_sl', 'bent-single-step': 'ex_calf_raise_bent_step_sl', 'straight-single-slow': 'ex_calf_raise_sl', 'straight-single-step': 'ex_calf_raise_step_sl' } as Record<string, string>)[b] ?? null,
    families: ['calf-capacity'], bases: /^(bent-double-slow|bent-double-step|bent-single-slow|bent-single-step|straight-single-slow|straight-single-step)$/, emits: ['ex_calf_raise_bent', 'ex_calf_raise_bent_step', 'ex_calf_raise_bent_sl', 'ex_calf_raise_bent_step_sl', 'ex_calf_raise_sl', 'ex_calf_raise_step_sl'] },
  { clip: 'ex_calf_raise_bent', families: ['calf-capacity'], bases: /^bent-double-iso$/, hold: 0.9 },
  { clip: 'ex_calf_raise_bent_sl', families: ['calf-capacity'], bases: /^bent-single-iso$/, hold: 0.9 },
  { clip: 'ex_calf_raise_sl', families: ['calf-capacity'], bases: /^straight-single-iso$/, hold: 0.9 },
  { clip: (b) => ({ 'bent-knee': 'ex_calf_raise_bent_step', 'eccentric-sl': 'ex_calf_raise_step_sl', step: 'ex_calf_raise_step', 'step-sl': 'ex_calf_raise_step_sl', 'step-sl-db': 'ex_calf_raise_step_sl' } as Record<string, string>)[b] ?? null,
    families: ['calf-raise'], bases: /^(bent-knee|eccentric-sl|step|step-sl|step-sl-db)$/, emits: ['ex_calf_raise_bent_step', 'ex_calf_raise_step_sl', 'ex_calf_raise_step'] },
  { clip: 'ex_high_curl', families: ['curl'], bases: /^(high-curl|overhead-curl)$/ },
  { clip: 'ex_z_press', families: ['push-extra'], bases: /^z-press$/ },
  { clip: 'ex_wall_sit', families: ['knee-capacity'], bases: /^wall-shallow$/, hold: 0.2 },
  { clip: 'ex_wall_sit', families: ['knee-capacity'], bases: /^wall-sit-quarter$/, hold: 0.7 },
  { clip: 'ex_wall_sit', families: ['knee-capacity'], bases: /^wall-sit-half$/, hold: 1.1 },
  { clip: 'ex_wall_sit', families: ['knee-capacity'], bases: /^wall-sit-deep$/, hold: 2.2 },
  { clip: 'ex_wall_sit', families: ['squat'], bases: /^wall-sit$/, hold: 2.2 },
  { clip: 'ex_wall_sit_sl', families: ['knee-capacity'], bases: /^wall-sl$/, hold: 1.1 },
  { clip: 'ex_wall_sit_sl', families: ['isometric-capacity'], bases: /^wall-sit-lift$/ },
  { clip: 'ex_spanish_squat', families: ['knee-capacity'], bases: /^spanish-quarter$/, hold: 0.8 },
  { clip: 'ex_spanish_squat', families: ['knee-capacity'], bases: /^spanish-half$/, hold: 1.05 },
  { clip: 'ex_spanish_squat', families: ['knee-capacity'], bases: /^spanish-deep$/, hold: 2.2 },
  { clip: 'ex_seated_row', families: ['row'], bases: /^(seat-row|elevat-row)$/ },
  { clip: 'ex_seated_row_one', families: ['row'], bases: /^seat-singl-arm-pulley-row$/ },
  { clip: 'ex_decline_press', families: ['bench-press'], bases: /^(declin-bench-press|wid-grip-declin-bench-press|declin-smith-press)$/ },
  { clip: 'ex_decline_fly', families: ['fly'], bases: /^declin-fly$/ },
  { clip: 'ex_decline_skull', families: ['triceps'], bases: /^(declin-tricep-extension|declin-ez-bar-tricep-extension)$/ },
  { clip: 'ex_spiderman_pushup', families: ['push-extra'], bases: /^spiderman$/ },
  { clip: 'ex_archer_pushup', families: ['push-up'], bases: /^archer$/ },
  { clip: 'ex_seated_reverse_fly', families: ['raise'], bases: /^seat-bent-over-rear-shoulder-rais$/ },
  { clip: 'ex_seated_kickback', families: ['triceps'], bases: /^seat-bent-over-two-arm-tricep-extension$/ },
  { clip: 'ex_seated_kickback_one', families: ['triceps'], bases: /^seat-bent-over-singl-arm-tricep-extension$/ },
  // assumption: a straight-arm dumbbell pullover is shown lying along the bench (some lie across it: the same arc)
  { clip: 'ex_pullover', families: ['fly'], bases: /^straight-arm-pullover$/ },
  { clip: 'ex_pullover', families: ['db-upper'], bases: /^pullover$/ },
  { clip: 'ex_pullover_bent', families: ['fly'], bases: /^bent-arm-pullover$/ },
  // ── DEMO-LOOPS (2026-10-27): the Quick Screen's checks and the daily drills, where the library has them (anim/authored/exerciseDrills.ts) ──
  { clip: 'ex_overhead_squat', families: ['squat'], bases: /^overhead-squat$/ },
  { clip: 'ex_overhead_squat', families: ['loaded-mobility'], bases: /^dowel-ohs$/, hold: 1.35 },
  { clip: 'ex_knee_to_wall', families: ['ankle-mobility'], bases: /^knee-to-wall$/ },
  { clip: 'ex_wall_march', families: ['sprint-mechanics'], bases: /^wall-march$/ },
  { clip: 'ex_wall_drive', families: ['sprint-mechanics'], bases: /^wall-switch$/ },
  // ── DEMO-LOOPS (2026-10-27): the signature programs' exercises (anim/authored/exerciseSignature.ts; the rest borrowed as noted) ──
  { clip: 'ex_def_stance', families: ['defense'], bases: /^stance$/ },
  { clip: 'ex_sl_balance', families: ['balance'], bases: /^basic$/ },
  { clip: 'ex_sl_balance_head', families: ['balance'], bases: /^head-turns$/ },
  { clip: 'ex_seated_breathe', families: ['breathing-2'], bases: /^seated-exhale$/ },
  // assumption: the ball between the knees is not drawn; the knees squeezing in are the movement
  { clip: 'ex_adductor_squeeze', families: ['hip-stability'], bases: /^adductor-squeeze$/ },
  { clip: 'ex_lateral_walk', families: ['hip-stability'], bases: /^lateral-walk$/ },
  { clip: 'ex_band_row', families: ['row'], bases: /^band$/ },
  { clip: 'ex_tke', families: ['knee-capacity'], bases: /^tke$/ },
  { clip: 'ex_back_wall_arm_raise', families: ['scap-work'], bases: /^wall-raise$/ },
  { clip: 'ex_incline_scap_push_up', families: ['scap-work'], bases: /^incline-scap$/ },
  // assumption: palms up is the grip, not drawn; the arms' path is the pull-apart's
  { clip: 'ex_pull_apart', families: ['scap-work'], bases: /^pull-apart-up$/ },
  { clip: 'ex_wall_chin_tuck', families: ['neck-care'], bases: /^wall$/ },
  { clip: 'ex_wall_slide_liftoff', families: ['shoulder-care'], bases: /^wall-lift$/ },
  { clip: 'ex_prone_t', families: ['shoulder-care'], bases: /^prone-t$/ },
  { clip: 'ex_box_jump', families: ['box-jump'], bases: /^mid$/ },
  { clip: 'ex_broad_jump_stick', families: ['broad-jump'], bases: /^stick$/ },
  { clip: 'ex_sl_hop_stick', families: ['broad-jump'], bases: /^single-leg-stick$/ },
  { clip: 'ex_lateral_hop_stick', families: ['lateral-bound'], bases: /^hop-stick$/ },
  { clip: 'ex_drop_landing', families: ['landing'], bases: /^drop-low$/ },
  { clip: 'ex_snap_down', families: ['landing'], bases: /^snap-down$/ },
  { clip: 'ex_supported_sl_rdl', families: ['single-leg-hinge'], bases: /^supported$/ },
  { clip: 'ex_hip_airplane', families: ['hip-capacity'], bases: /^airplane-sup$/ },
  { clip: 'ex_two_point_start', families: ['acceleration'], bases: /^two-point$/ },
  { clip: 'ex_arm_swing', families: ['sprint-development'], bases: /^arm-standing$/ },
  { clip: 'ex_pallofpress_standing', families: ['plank'], bases: /^pallof-press$/ },
  { clip: 'ex_calf_raise_sl', families: ['foot-strength'], bases: /^sl-flat$/ },
  // the bridge held at its top: the heels on the bench, and the heels far out on the floor (the slider curl's long position)
  { clip: 'ex_bridge_feetup', families: ['hamstring-iso'], bases: /^bench-hold$/, hold: 1.0 },
  { clip: 'ex_slider_curl', families: ['hamstring-iso'], bases: /^long-lever$/, hold: 1.2 },
  { clip: (b) => ({ 'one-step': 'ex_approach_jump_one_step', 'two-step': 'ex_approach_jump_two_step', 'three-step': 'ex_approach_jump_three_step', 'one-foot': 'ex_approach_jump_one_foot' } as Record<string, string>)[b] ?? null,
    families: ['approach-jump'], bases: /^(one-step|two-step|three-step|one-foot)$/, emits: ['ex_approach_jump_one_step', 'ex_approach_jump_two_step', 'ex_approach_jump_three_step', 'ex_approach_jump_one_foot'] },
  { clip: 'ex_decel_stick', families: ['deceleration'], bases: /^stick$/ },
  { clip: 'ex_jump_stop', families: ['footwork'], bases: /^jump-stop$/ },
  { clip: 'ex_lateral_skip', families: ['basketball-warmup'], bases: /^skip-lateral$/ },
  { clip: 'ex_copenhagen_knee', families: ['hip-capacity'], bases: /^cph-knee$/ },
  { clip: 'ex_copenhagen_knee', families: ['side-plank'], bases: /^copenhagen-short$/ },
  { clip: 'ex_copenhagen_raise_knee', families: ['hip-capacity'], bases: /^cph-raise-knee$/ },
  { clip: 'ex_calf_smr', families: ['roll'], bases: /^calf-smr$/ },
  { clip: 'ex_piriformis_smr', families: ['roll'], bases: /^piriformis-smr$/ },
  // the shots and finishes (the ball not drawn, and the card says so)
  { clip: 'ex_set_shot', families: ['shooting-spots'], bases: /^(free-throw|fatigue-ft)$/ },
  { clip: 'ex_form_shot_one', families: ['shooting-form'], bases: /^one-hand$/ },
  { clip: 'ex_catch_shoot_hop', families: ['shooting-form'], bases: /^hop$/ },
  { clip: 'ex_pullup_jumper', families: ['shooting-form'], bases: /^pull-up$/ },
  { clip: 'ex_power_layup', families: ['finishing'], bases: /^power$/ },
  { clip: 'ex_jab_crossover', families: ['footwork'], bases: /^jab-cross$/ },
  // assumption: recover and contest is the closeout the court plays (sprint, chop the feet, the hand up)
  { clip: 'bball_closeout', families: ['court-movement'], bases: /^recover-contest$/ },
  // ── trunk ──
  { clip: 'ex_plank', families: ['plank'], bases: /^(plank|forearm)$/ },
  { clip: 'ex_dead_bug', families: ['plank'], bases: /^dead-bug$/ },
  { clip: 'ex_dead_bug', families: ['dead-bug'], bases: /^(weighted|band)$/ },
  { clip: 'ex_bird_dog', families: ['dead-bug'], bases: /^bird-dog$/ },
  { clip: 'ex_crunch', families: ['flexion'], bases: /^(crunch|ab-crunch)$/ },
  { clip: 'ex_crunch', families: ['trunk-flexion'], bases: /^curl-up$/ },
  { clip: 'ex_mountain_climber', families: ['conditioning-circuit', 'cardio'], bases: /^mountain-climber$/ },
  // ── jumps, hops, conditioning ──
  { clip: 'ex_jump', families: ['vertical-jump'], bases: /^(squat-jump|cmj|cmj-stick|cmj-repeat)$/ },
  // DEMO-LOOPS (2026-10-27): the hands-on-hips jumps keep their hands on the hips (ex_jump swings the arms: a different jump).
  // The squat jump from a held squat has no loop of its own: the cue card.
  { clip: 'ex_jump', families: ['vertical-jump-builds'], bases: /^(squat-jump-pause|cmj-target)$/ },
  { clip: 'ex_jump_hands_hips', families: ['vertical-jump-builds'], bases: /^cmj-hips$/ },
  { clip: 'ex_jump', families: ['jump'], bases: /^(freehand-jump-squat|weight-jump-squat|rocket-jump)$/ },
  { clip: 'ex_jump', families: ['loaded-jump'], bases: /^vest-cmj$/ },
  { clip: 'ex_jump', families: ['rebound-jump'], bases: /^touches$/ },
  { clip: 'ex_jumping_jack', families: ['conditioning-circuit'], bases: /^jumping-jack$/ },
  { clip: 'ex_pogo', families: ['pogo'], bases: /^(ankle-bounce|pogo)$/ },
  { clip: 'ex_jump_rope', families: ['jump-rope'], bases: /^basic$/ },
  { clip: 'ex_jump_rope', families: ['cardio'], bases: /^rop-jump$/ },
  { clip: 'ex_carry', families: ['carry'], bases: /^(farmer-kb|farmer-db|farmer-walk|farmer-trap)$/ },
  // DEMO-LOOPS-4: a suitcase carry is ONE load in one hand (it played the two-handed farmer's carry)
  { clip: 'ex_carry_suitcase', families: ['carry'], bases: /^suitcase$/ },
  { clip: 'ex_march', families: ['sprint-mechanics'], bases: /^a-march$/ },
  { clip: 'ex_march', families: ['sprint-development'], bases: /^band-a-march$/ },
  { clip: 'run', families: ['sprint-development'], bases: /^(strides|fly-20|fly-30|fly-float|tempo-100|tempo-200)$/ },
  { clip: 'run', families: ['sprint-drill'], bases: /^wind-sprint$/ },
  { clip: 'run', families: ['sprint-conditioning'], bases: /^tempo$/ },
  { clip: 'run', families: ['cardio'], bases: /^(jog-treadmill|run-treadmill)$/ },
  { clip: 'run', families: ['conditioning-intervals'], bases: /^treadmill-/ },
  { clip: 'walk', families: ['cardio'], bases: /^walk-treadmill$/ },
  { clip: 'walk', families: ['breathing-2'], bases: /^walk-nasal$/ },
  // ── mobility, breathing ──
  { clip: 'ex_arm_circles', families: ['dynamic-flow'], bases: /^arm-circles$/ },
  { clip: 'ex_arm_circles', families: ['dynamic-warmup'], bases: /^arm-circl$/ },
  { clip: 'ex_arm_circles', families: ['joint-circles'], bases: /^shoulder-standing$/ },
  { clip: 'ex_quad_stretch', families: ['dynamic-flow'], bases: /^quad-pull$/ },
  { clip: 'ex_quad_stretch', families: ['stretch-quad-hip'], bases: /^quad-stretch$/ },
  { clip: 'ex_breathe', families: ['breath-drill'], bases: /^box$/ },
  { clip: 'ex_breathe', families: ['breathing-2'], bases: /^(sigh|humming|straw)$/ },
  // ── basketball (the court's own clips; the ball is not drawn on the stage, and the card says so) ──
  { clip: 'bball_dribble_idle', families: ['ball-handling'], bases: /^(pound|pound-low)$/ },
  { clip: 'bball_dribble_idle', families: ['one-hand-dribble'], bases: /^wide-pound$/ },
  { clip: 'bball_crossover_left', families: ['ball-handling', 'moving-handles'], bases: /^crossover$/ },
  { clip: 'bball_between_legs_left', families: ['ball-handling', 'moving-handles'], bases: /^between$/ },
  { clip: 'bball_behind_back_left', families: ['ball-handling', 'moving-handles'], bases: /^behind$/ },
  { clip: 'bball_in_and_out_left', families: ['ball-handling'], bases: /^in-out$/ },
  { clip: 'bball_hesi', families: ['ball-handling', 'moving-handles'], bases: /^hesi$/ },
  // a two-move combo shows its named move (a finish or a pull-up on the end is a second movement: cue card)
  { clip: 'bball_crossover_left', families: ['handle-combo'], bases: /^id-pound-crossover-combo(-move|-pressure)?$/ },
  { clip: 'bball_between_legs_left', families: ['handle-combo'], bases: /^combo-pound-between(-move|-pressure)?$/ },
  { clip: 'bball_behind_back_left', families: ['handle-combo'], bases: /^combo-pound-behind(-move|-pressure)?$/ },
  { clip: 'bball_in_and_out_left', families: ['handle-combo'], bases: /^combo-pound-inout(-move|-pressure)?$/ },
  { clip: 'bball_hesi', families: ['handle-combo'], bases: /^combo-pound-hesi(-move|-pressure)?$/ },
  { clip: 'bball_defend_slide_left', families: ['defense'], bases: /^(slide|zig-zag)$/ },
  { clip: 'bball_defend_slide_left', families: ['defense-drills-2'], bases: /^(lane-slides|slide-drop-slide|mirror-slides|wall-slides-def)$/ },
  { clip: 'bball_defend_slide_left', families: ['lateral-movement'], bases: /^shuffle$/ },
  { clip: 'bball_defend_slide_left', families: ['court-movement'], bases: /^slide-race$/ },
  { clip: 'bball_defend_slide_left', families: ['basketball-warmup'], bases: /^slide$/ },
  { clip: 'bball_defend_slide_left', families: ['shuffle-backpedal-2'], bases: /^shuffle-3-stick$/ },
  { clip: 'bball_closeout', families: ['defense'], bases: /^(closeout|closeout-slide)$/ },
  { clip: 'bball_closeout', families: ['closeout-series'], bases: /^closeout-[a-z]+-contest$/ },
  { clip: 'bball_closeout', families: ['court-movement'], bases: /^shell-closeout$/ },
  { clip: 'bball_closeout', families: ['basketball-warmup'], bases: /^closeout$/ },
  { clip: 'bball_defend_backpedal', families: ['lateral-movement'], bases: /^backpedal$/ },
  { clip: weak('bball_layup_gather', 'bball_layup_gather_left'), families: ['finish-series'], bases: /^overhand-/ },
  { clip: weak('bball_layup_reverse', 'bball_layup_reverse_left'), families: ['finish-series'], bases: /^reverse-/ },
  { clip: weak('bball_floater', 'bball_floater_left'), families: ['finish-series'], bases: /^(floater|runner)-/ },
  { clip: weak('bball_euro_step', 'bball_euro_step_left'), families: ['finish-series'], bases: /^euro-/ },
  { clip: weak('bball_finger_roll', 'bball_finger_roll_left'), families: ['finish-series'], bases: /^fingerroll-/ },
  { clip: weak('bball_layup_scoop', 'bball_layup_scoop_left'), families: ['finish-series'], bases: /^scoop-/ },
  { clip: weak('bball_hook', 'bball_hook_left'), families: ['finish-series'], bases: /^babyhook-/ },
  { clip: weak('bball_layup_spin', 'bball_layup_spin_left'), families: ['finish-series'], bases: /^spin-/ },
  { clip: weak('bball_up_and_under', 'bball_up_and_under_left'), families: ['finish-series'], bases: /^upunder-/ },
  { clip: 'bball_hop_step', families: ['finish-series'], bases: /^prohop-/ },
  { clip: 'bball_layup_gather', families: ['finishing'], bases: /^layup-right$/ },
  { clip: 'bball_layup_gather_left', families: ['finishing'], bases: /^layup-left$/ },
  { clip: 'bball_layup_reverse', families: ['finishing'], bases: /^reverse$/ },
  { clip: 'bball_floater', families: ['finishing'], bases: /^floater$/ },
  { clip: 'bball_euro_step', families: ['finishing'], bases: /^euro$/ },
  { clip: 'bball_mikan', families: ['finishing'], bases: /^mikan$/ },
  { clip: 'bball_finger_roll', families: ['finishing-touch'], bases: /^finger-roll$/ },
  { clip: 'bball_layup_scoop', families: ['finishing-touch'], bases: /^scoop$/ },
  { clip: 'bball_hook', families: ['finishing-touch'], bases: /^(baby-hook|jump-hook)$/ },
  { clip: 'bball_hop_step', families: ['finishing-touch'], bases: /^hop-step$/ },
  { clip: 'bball_up_and_under', families: ['finishing-touch'], bases: /^up-under-finish$/ },
  { clip: 'bball_hop_step', families: ['finishing-reads'], bases: /^pro-hop$/ },
  { clip: 'bball_drop_step', families: ['post-moves'], bases: /^drop-step-/ },
  { clip: 'bball_hook', families: ['post-moves'], bases: /^jump-hook-/ },
  { clip: 'bball_spin', families: ['post-moves'], bases: /^spin-/ },
  { clip: 'bball_hop_step', families: ['post-moves'], bases: /^hop-step-/ },
  { clip: 'bball_jab', families: ['footwork'], bases: /^jab$/ },
  { clip: 'bball_drop_step', families: ['footwork'], bases: /^drop-step$/ },
  { clip: 'bball_spin', families: ['footwork'], bases: /^spin$/ },
  { clip: 'bball_euro_step', families: ['footwork'], bases: /^euro$/ },
  { clip: 'bball_hop_step', families: ['footwork'], bases: /^hop-gather$/ },
  { clip: 'bball_up_and_under', families: ['footwork'], bases: /^up-under$/ },
  { clip: 'bball_pivot', families: ['footwork'], bases: /^(front-pivot|reverse-pivot)$/ },
  { clip: 'jumpshot', families: ['spot-shooting'], bases: /^[a-z]+-(left|right|centre)-(mid|three)$/ },
  { clip: 'jumpshot', families: ['shooting-spots'], bases: /^(corner|elbow|spot-up|around-world)$/ },
  // ── DEMO-LOOPS-4 (2026-11-03): what the programs ask for, and the "single leg" search (anim/authored/exerciseAsks.ts) ──
  { clip: 'ex_band_pulldown', families: ['vertical-pull'], bases: /^band-pulldown$/ },
  { clip: 'ex_pull_through', families: ['hinge-accessory'], bases: /^band-pull-through$/ },
  { clip: 'ex_pull_through', families: ['deadlift'], bases: /^pull-through$/ },
  { clip: 'ex_ninety_lean', families: ['hip-mobility'], bases: /^90-90-lean$/ },
  // the wall slide is the back-to-the-wall forearm slide the signature programs already play (exerciseSignature.ts)
  { clip: 'ex_back_wall_arm_raise', families: ['upper-back-mobility'], bases: /^wall-slide$/ },
  { clip: 'ex_elbows_back', families: ['stretch-upper'], bases: /^elbow-back$/ },
  // one leg, each read against the movement the entry was imported as (free-exercise-db): One Leg Barbell Squat and the Smith
  // Single-Leg Split Squat are the rear foot up on a bench behind, the bar on the back (the barbell Bulgarian split squat);
  // the push-off and the stride jumps drive up off one foot on a box (in front; beside), the stride jump crossover landing
  // on the far side; the one-leg butt kick jumps on one leg and kicks that heel up; the seated one-leg calf raise
  { clip: 'ex_bulgarian_bar', families: ['single-leg-squat'], bases: /^singl-leg-squat$/ },
  { clip: 'ex_box_pushoff', families: ['jump'], bases: /^singl-leg-push$/ },
  { clip: 'ex_stride_jump', families: ['jump'], bases: /^singl-leg-strid-jump$/ },
  { clip: 'ex_stride_jump_cross', families: ['jump'], bases: /^strid-jump-crossover$/ },
  { clip: 'ex_butt_kick_one', families: ['sprint-drill'], bases: /^singl-leg-glut-kick$/ },
  { clip: 'ex_bulgarian_bar', families: ['lunge'], bases: /^smith-singl-leg-split-squat$/ },
  { clip: 'ex_seated_calf_one', families: ['calf-raise'], bases: /^seat-singl-leg-calf-rais$/ },
  // the biggest families with no loop (anim/authored/exerciseFamilies.ts), each read against the movement the entry was
  // imported as (its source.ref in free-exercise-db): the held upper-body stretches by the shape each names (the overhead
  // lat holds the triceps stretch's arm — up, the elbow bent, the hand to the back — against a partner; the stage shows it
  // held, without one)
  { clip: 'ex_stretch_triceps', families: ['stretch-upper'], bases: /^(tricep-stretch|overhead-tricep|overhead-lat)$/ },
  { clip: 'ex_stretch_triceps_side', families: ['stretch-upper'], bases: /^tricep-sid-stretch$/ },
  { clip: 'ex_stretch_cross_arm', families: ['stretch-upper'], bases: /^shoulder-stretch$/ },
  { clip: 'ex_stretch_reach_up', families: ['stretch-upper'], bases: /^(upward-stretch|overhead-stretch)$/ },
  { clip: 'ex_stretch_side_reach', families: ['stretch-upper'], bases: /^stand-lateral-stretch$/ },
  { clip: 'ex_stretch_clasp_back', families: ['stretch-upper'], bases: /^stand-bicep-stretch$/ },
  { clip: 'ex_stretch_upper_back', families: ['stretch-upper'], bases: /^upper-back-stretch$/ },
  { clip: 'ex_stretch_neck_side', families: ['stretch-upper'], bases: /^sid-neck-stretch$/ },
  { clip: 'ex_stretch_chin_chest', families: ['stretch-upper'], bases: /^chin-chest-stretch$/ },
  { clip: 'ex_stretch_behind_head', families: ['stretch-upper'], bases: /^behind-head-chest-stretch$/ },
  // the dynamic warm-up's circles, the straight-leg swings, the rear leg raise from the hands and knees, the standing toe touch
  { clip: 'ex_circle_ankle', families: ['dynamic-warmup'], bases: /^ankl-circl$/ },
  { clip: 'ex_circle_knee', families: ['dynamic-warmup'], bases: /^kne-circl$/ },
  { clip: 'ex_circle_hip', families: ['dynamic-warmup'], bases: /^stand-hip-circl$/ },
  { clip: 'ex_circle_wrist', families: ['dynamic-warmup'], bases: /^wrist-circl$/ },
  { clip: 'ex_leg_raise_front', families: ['dynamic-warmup'], bases: /^front-leg-rais$/ },
  { clip: 'ex_leg_raise_side', families: ['dynamic-warmup'], bases: /^sid-leg-rais$/ },
  { clip: 'ex_leg_raise_back', families: ['dynamic-warmup'], bases: /^rear-leg-rais$/ },
  { clip: 'ex_toe_touch_stand', families: ['dynamic-warmup'], bases: /^stand-toe-touch$/ },
  // the kettlebell's clean (one arm; the hang clean is the same hike-and-float to the rack), snatch, push press, jerk,
  // thruster and sumo high pull
  { clip: 'ex_kb_clean_one', families: ['kb-clean-snatch'], bases: /^(singl-arm-clean|hang-clean)$/ },
  { clip: 'ex_kb_snatch_one', families: ['kb-clean-snatch'], bases: /^singl-arm-snatch$/ },
  { clip: 'ex_kb_snatch_two', families: ['kb-clean-snatch'], bases: /^doubl-snatch$/ },
  { clip: 'ex_kb_push_press_one', families: ['kb-clean-snatch'], bases: /^singl-arm-push-press$/ },
  { clip: 'ex_kb_push_press_two', families: ['kb-clean-snatch'], bases: /^doubl-push-press$/ },
  { clip: 'ex_kb_jerk_one', families: ['kb-clean-snatch'], bases: /^singl-arm-jerk$/ },
  { clip: 'ex_kb_jerk_two', families: ['kb-clean-snatch'], bases: /^doubl-jerk$/ },
  { clip: 'ex_kb_thruster', families: ['kb-clean-snatch'], bases: /^thruster$/ },
  { clip: 'ex_kb_high_pull', families: ['kb-clean-snatch'], bases: /^sumo-high-pull$/ },
  // the leg raises hanging from the bar and held up on the parallel bars (the source's vertical-leg-raise bench rests the
  // forearms on pads; the stage's parallel bars hold the arms long — the legs' movement is the same)
  { clip: 'ex_hang_leg_raise', families: ['flexion'], bases: /^hang-leg-rais$/ },
  { clip: 'ex_hang_pike', families: ['flexion'], bases: /^hang-pik$/ },
  { clip: 'ex_bar_leg_raise', families: ['flexion'], bases: /^kne-hip-rais-parallel-bar$/ },
  // existing loops that ARE these movements: the standing long jump is the broad jump and stick; the front box jump the box
  // jump; the band overhead extension and the one-arm low-pulley one (facing away, the arm overhead); the lying extensions —
  // the dumbbells' and the low cable's (lying face up, the head to the pulley)
  { clip: 'ex_broad_jump_stick', families: ['jump'], bases: /^stand-long-jump$/ },
  { clip: 'ex_box_jump', families: ['jump'], bases: /^front-box-jump$/ },
  { clip: 'ex_triceps_overhead', families: ['triceps'], bases: /^spe-overhead-tricep$/ },
  { clip: 'ex_triceps_overhead_one', families: ['triceps'], bases: /^stand-low-pulley-singl-arm-tricep-extension$/ },
  { clip: 'ex_skull_crusher', families: ['triceps'], bases: /^(tricep-extension-pronat-grip|low-tricep-extension)$/ },
  { clip: 'ex_skull_crusher_one', families: ['triceps'], bases: /^singl-arm-supinat-tricep-extension$/ },
  // the trunk: the crunch with the arms overhead, the tuck crunch; the Russian twist sitting back on the floor (the cable's
  // "Russian twists" lie on a ball, and the plate twist lifts the crossed legs: not this)
  { clip: 'ex_crunch_overhead', families: ['flexion'], bases: /^crunch-hand-overhead$/ },
  { clip: 'ex_crunch_tuck', families: ['flexion'], bases: /^tuck-crunch$/ },
  { clip: (_b, eq) => (eq.includes('cable') ? null : 'ex_russian_twist'), families: ['rotation'], bases: /^russian-twist$/, emits: ['ex_russian_twist'] },
  // the rickshaw's handles are held low at the sides, walking: the farmer's carry; the machine shoulder press is the seated press
  { clip: 'ex_carry', families: ['carry'], bases: /^rickshaw-carry$/ },
  { clip: 'ex_seated_press', families: ['overhead-press'], bases: /^leverag-shoulder-press$/ },
  // DEMO-LOOPS-5 (anim/authored/exerciseFamilies5.ts, exerciseOly.ts), each read against the movement the entry was imported
  // as (free-exercise-db). Trunk flexion: the leg pull-in on the floor and on a bench, the bench leg raise, the seated leg
  // tuck (the seated flat-bench leg pull-in is the same movement), the crunch holding a weight, the frog sit-up, the cocoon,
  // bottoms up, the rope crunch kneeling, standing and seated
  { clip: 'ex_leg_pull_in', families: ['flexion'], bases: /^leg-pull$/ },
  { clip: 'ex_bench_leg_raise', families: ['flexion'], bases: /^flat-bench-lying-leg-rais$/ },
  { clip: 'ex_bench_leg_pull_in', families: ['flexion'], bases: /^flat-bench-leg-pull$/ },
  { clip: 'ex_seated_leg_tuck', families: ['flexion'], bases: /^(seat-leg-tuck|seat-flat-bench-leg-pull)$/ },
  { clip: 'ex_crunch_weight', families: ['flexion'], bases: /^weight-crunch$/ },
  { clip: 'ex_frog_situp', families: ['flexion'], bases: /^frog-sit-ups$/ },
  { clip: 'ex_cocoon', families: ['flexion'], bases: /^cocoon$/ },
  { clip: 'ex_bottoms_up', families: ['flexion'], bases: /^bottom-up$/ },
  { clip: 'ex_rope_crunch_kneel', families: ['flexion'], bases: /^rop-crunch$/ },
  { clip: 'ex_rope_crunch_stand', families: ['flexion'], bases: /^stand-rop-crunch$/ },
  { clip: 'ex_rope_crunch_seat', families: ['flexion'], bases: /^seat-crunch$/ },
  // existing loops that ARE these: the bent-knee hip raise is the reverse crunch (the knees in, the hips off the floor); the
  // Janda sit-up is the sit-up's shape done slow; the scissor kick lifts one leg as the other lowers (the flutter kick);
  // the step-up with knee raise; the "leg lift" lifts one heel behind, standing (the standing leg curl)
  { clip: 'ex_reverse_crunch', families: ['flexion'], bases: /^bent-kne-hip-rais$/ },
  { clip: 'ex_situp', families: ['flexion'], bases: /^janda-sit-up$/ },
  { clip: 'ex_flutter', families: ['flexion'], bases: /^scissor-kick$/ },
  { clip: 'ex_step_up_knee', families: ['flexion'], bases: /^step-up-kne-rais$/ },
  { clip: 'ex_standing_leg_curl', families: ['flexion'], bases: /^leg-lift$/ },
  // the upper-body stretches: the dynamic arm swing up and chest swing, the standing twist, the standing pelvic tilt, the side
  // wrist pull, the chair's side bend and spinal twist, the seated overhead (butterfly) side reach; and existing loops that
  // are these: the shoulder raise is the shrug, the pelvic tilt into bridge rolls up to the bridge, the kneeling forearm
  // stretch leans back from the hands and knees (the rock back — the fingers' turn toward the knees is not shown)
  { clip: 'ex_arm_swing_up', families: ['stretch-upper'], bases: /^dynamic-back-stretch$/ },
  { clip: 'ex_chest_swing', families: ['stretch-upper'], bases: /^dynamic-chest-stretch$/ },
  { clip: 'ex_stand_twist', families: ['stretch-upper'], bases: /^middl-back-stretch$/ },
  { clip: 'ex_pelvic_tilt_stand', families: ['stretch-upper'], bases: /^stand-pelvic-tilt$/ },
  { clip: 'ex_wrist_pull', families: ['stretch-upper'], bases: /^sid-wrist-pull$/ },
  { clip: 'ex_seat_side_bend', families: ['stretch-upper'], bases: /^chair-lower-back-stretch$/ },
  { clip: 'ex_seat_twist', families: ['stretch-upper'], bases: /^spinal-stretch$/ },
  { clip: 'ex_butterfly_side_reach', families: ['stretch-upper'], bases: /^seat-overhead-stretch$/ },
  { clip: 'ex_shrug', families: ['stretch-upper'], bases: /^shoulder-rais$/ },
  { clip: 'ex_bridge', families: ['stretch-upper'], bases: /^pelvic-tilt-bridg$/ },
  { clip: 'ex_pos_rockback', families: ['stretch-upper'], bases: /^kneel-forearm-stretch$/ },
  // the barbell clean and snatch: where it starts (the floor, below the knees, the hang), how the bar is received (full,
  // power, split; or not: the pull, the shrug), and the press and the jerk after the clean. The clean and snatch deadlifts
  // are deadlifts (the hinge loop the deadlift family plays). The dumbbell clean shares the base and stays a cue card.
  { clip: (_b, eq) => (eq.includes('barbell') ? 'ex_bb_clean' : null), families: ['clean'], bases: /^clean$/, emits: ['ex_bb_clean'] },
  { clip: 'ex_bb_power_clean', families: ['clean'], bases: /^power-clean$/ },
  { clip: (_b, eq) => (eq.includes('barbell') ? 'ex_bb_hang_clean' : null), families: ['clean'], bases: /^hang-clean$/, emits: ['ex_bb_hang_clean'] },
  { clip: 'ex_bb_hang_clean_low', families: ['clean'], bases: /^hang-clean-below-kne$/ },
  { clip: 'ex_bb_split_clean', families: ['clean'], bases: /^split-clean$/ },
  { clip: 'ex_bb_clean_pull', families: ['clean'], bases: /^clean-pull$/ },
  { clip: 'ex_bb_clean_shrug', families: ['clean'], bases: /^clean-shrug$/ },
  { clip: 'ex_bb_clean_press', families: ['clean'], bases: /^clean-press$/ },
  { clip: 'ex_bb_clean_jerk', families: ['clean'], bases: /^clean-jerk$/ },
  { clip: 'ex_hinge', families: ['clean'], bases: /^clean-deadlift$/ },
  { clip: 'ex_bb_snatch', families: ['snatch'], bases: /^snatch$/ },
  { clip: 'ex_bb_power_snatch', families: ['snatch'], bases: /^power-snatch$/ },
  { clip: 'ex_bb_hang_snatch', families: ['snatch'], bases: /^hang-snatch$/ },
  { clip: 'ex_bb_hang_snatch_low', families: ['snatch'], bases: /^hang-snatch-below-kne$/ },
  { clip: 'ex_bb_split_snatch', families: ['snatch'], bases: /^split-snatch$/ },
  { clip: 'ex_bb_snatch_pull', families: ['snatch'], bases: /^snatch-pull$/ },
  { clip: 'ex_bb_snatch_shrug', families: ['snatch'], bases: /^snatch-shrug$/ },
  { clip: 'ex_bb_muscle_snatch', families: ['snatch'], bases: /^muscl-snatch$/ },
  { clip: 'ex_bb_snatch_balance', families: ['snatch'], bases: /^(snatch-balanc|heav-snatch-balanc)$/ },
  { clip: 'ex_hinge', families: ['snatch'], bases: /^snatch-deadlift$/ },
  // existing loops that ARE these (each against its source): the rear lateral raise lying face down on a low incline is the
  // prone incline T; the Smith machine shoulder press is seated; the kettlebell seesaw press presses one bell, lowers it and
  // presses the other (the press arm after arm); the one-arm long-bar rows are the bent-over one-arm row; the leverage iso
  // row is the seated row; the shotgun row is the split-stance one-arm cable row
  { clip: 'ex_incline_t', families: ['raise'], bases: /^lying-rear-lateral-rais$/ },
  { clip: 'ex_seated_press', families: ['overhead-press'], bases: /^smith-overhead-shoulder-press$/ },
  { clip: 'ex_press_alt', families: ['overhead-press'], bases: /^seesaw-press$/ },
  { clip: 'ex_row_one', families: ['row'], bases: /^(bent-over-singl-arm-long-bar-row|singl-arm-long-bar-row)$/ },
  { clip: 'ex_seated_row', families: ['row'], bases: /^leverag-iso-row$/ },
  { clip: 'ex_cable_row_one', families: ['row'], bases: /^shotgun-row$/ },
  // DEMO-LOOPS-6: the grip family's wrist curls (anim/authored/exerciseGrip.ts), each against its source: sitting with the
  // forearms on the thighs (two hands — dumbbells, a bar, or the low cable's bar — or one), kneeling with the forearms across
  // a bench, standing with the bar behind the seat; palms up or down. The wrist roller rolls with the arms out in front.
  { clip: 'ex_wrist_curl', families: ['grip'], bases: /^(seat-palm-up-wrist-curl|wrist-curl|seat-two-arm-palm-up-low-pulley-wrist-curl)$/ },
  { clip: 'ex_wrist_curl_down', families: ['grip'], bases: /^seat-palm-down-wrist-curl$/ },
  { clip: 'ex_wrist_curl_one', families: ['grip'], bases: /^seat-singl-arm-palm-up-wrist-curl$/ },
  { clip: 'ex_wrist_curl_one_down', families: ['grip'], bases: /^seat-singl-arm-palm-down-wrist-curl$/ },
  { clip: 'ex_wrist_curl_bench', families: ['grip'], bases: /^palm-up-wrist-curl-over-bench$/ },
  { clip: 'ex_wrist_curl_bench_down', families: ['grip'], bases: /^palm-down-wrist-curl-over-bench$/ },
  { clip: 'ex_wrist_curl_behind', families: ['grip'], bases: /^stand-palm-up-behind-back-wrist-curl$/ },
  { clip: 'ex_wrist_roller', families: ['grip'], bases: /^wrist-roller$/ },
  // the program-ask's Step-In Mountain Climber (lane/program-ask-2's entry: high plank, a foot steps in under the chest and
  // back out, then the other): the loop authored for it in DEMO-LOOPS-4 (exerciseAsks.ts)
  { clip: 'ex_stepin_climber', families: ['cardio'], bases: /^step-in-mountain-climber$/ },
  // and its Pike Push-Up (hands down, hips high in an upside-down V, the head lowered toward the floor in front of the hands):
  // the loop authored for it (exerciseAsks.ts), which the coach catalogue's row played by name until the entry existed
  { clip: 'ex_pike_pushup', families: ['push-up'], bases: /^pike$/ },
  // DEMO-LOOPS-7 (anim/authored/exerciseFamilies7.ts), each read against the movement the entry was imported as. The bench
  // press family: the one-arm floor press (bar or bell), the floor press arm after arm, the one-arm dumbbell bench press, and
  // the machine and cable chest presses seated (flat, incline, decline) and standing
  { clip: 'ex_floor_press_one', families: ['bench-press'], bases: /^singl-arm-floor-press$/ },
  { clip: 'ex_floor_press_alt', families: ['bench-press'], bases: /^alternat-floor-press$/ },
  { clip: 'ex_bench_press_one', families: ['bench-press'], bases: /^singl-arm-bench-press$/ },
  { clip: 'ex_chest_press_seat', families: ['bench-press'], bases: /^(chest-press|leverag-chest-press)$/ },
  { clip: 'ex_chest_press_incline', families: ['bench-press'], bases: /^(inclin-chest-press|leverag-inclin-chest-press)$/ },
  { clip: 'ex_chest_press_decline', families: ['bench-press'], bases: /^leverag-declin-chest-press$/ },
  { clip: 'ex_chest_press_stand', families: ['bench-press'], bases: /^stand-chest-press$/ },
  // the raises: lying back on an incline, the shoulder blades push the straight arms up (the dumbbell, the bar, the Smith);
  // the front raise sitting on an incline; the front raise swept out to the sides; one dumbbell in both hands; the Cuban
  // press; and existing loops that are these: the dumbbell raise lifts out to the sides (the lateral raise), the standing
  // low-pulley deltoid raise is the one-arm lateral raise, the lying rear delt raise is the prone T (on a flat bench in the
  // source; the stage's bench is inclined)
  { clip: 'ex_incline_shoulder_raise', families: ['raise'], bases: /^(inclin-shoulder-rais|smith-inclin-shoulder-rais)$/ },
  { clip: 'ex_front_raise_incline', families: ['raise'], bases: /^front-inclin-rais$/ },
  { clip: 'ex_front_to_lateral', families: ['raise'], bases: /^sid-lateral-front-rais$/ },
  { clip: 'ex_single_db_raise', families: ['raise'], bases: /^singl-rais$/ },
  { clip: 'ex_cuban_press', families: ['raise'], bases: /^cuban-press$/ },
  { clip: 'ex_lateral_raise', families: ['raise'], bases: /^rais$/ },
  { clip: 'ex_lateral_raise_one', families: ['raise'], bases: /^stand-low-pulley-deltoid-rais$/ },
  { clip: 'ex_incline_t', families: ['raise'], bases: /^lying-rear-shoulder-rais$/ },
  // the overhead presses: the Arnold press (the dumbbells seated; the kettlebell standing, one arm), the press behind the
  // neck, the Bradford press (standing; the Rocky press seated), the landmine's linear jammer (both hands; one arm)
  { clip: (_b, eq) => (eq.includes('kettlebell') ? 'ex_arnold_one' : 'ex_arnold_seated'), families: ['overhead-press'], bases: /^arnold-press$/, emits: ['ex_arnold_one', 'ex_arnold_seated'] },
  { clip: 'ex_press_behind_neck', families: ['overhead-press'], bases: /^stand-press-behind-neck$/ },
  { clip: 'ex_bradford_press', families: ['overhead-press'], bases: /^stand-bradford-press$/ },
  { clip: 'ex_bradford_seated', families: ['overhead-press'], bases: /^bradford-rocky-press$/ },
  { clip: 'ex_jammer', families: ['overhead-press'], bases: /^landmin-linear-jammer$/ },
  { clip: 'ex_jammer_one', families: ['overhead-press'], bases: /^singl-arm-linear-jammer$/ },
  // the trunk: the seated bar twist, the bar side bend, the landmine 180, car drivers, the kneeling rope crunch with twists;
  // the decline crunch, oblique crunch and band sit-up; the gorilla chin and crunch
  { clip: 'ex_seat_twist_bar', families: ['rotation'], bases: /^seat-twist$/ },
  { clip: 'ex_landmine_180', families: ['rotation'], bases: /^landmin-180s$/ },
  { clip: 'ex_car_driver', families: ['rotation'], bases: /^car-driver$/ },
  { clip: 'ex_rope_crunch_twist', families: ['rotation'], bases: /^kneel-crunch-alternat-obliqu-twist$/ },
  { clip: 'ex_decline_crunch', families: ['flexion'], bases: /^declin-crunch$/ },
  { clip: 'ex_decline_oblique', families: ['flexion'], bases: /^declin-obliqu-crunch$/ },
  { clip: 'ex_decline_situp', families: ['flexion'], bases: /^weight-sit-ups$/ },
  { clip: 'ex_gorilla_chin', families: ['flexion'], bases: /^gorilla-chin-crunch$/ },
  // the dynamic warm-up: elbow circles, shoulder circles (rolls), groiners, prone hip circles; the spider crawl's knee-to-elbow
  // from the low plank is the spiderman push-up's (in place: the crawl's travel is not shown)
  { clip: 'ex_elbow_circles', families: ['dynamic-warmup'], bases: /^elbow-circl$/ },
  { clip: 'ex_shoulder_rolls', families: ['dynamic-warmup'], bases: /^shoulder-circl$/ },
  { clip: 'ex_groiner', families: ['dynamic-warmup'], bases: /^groiner$/ },
  { clip: 'ex_hip_circle_quad', families: ['dynamic-warmup'], bases: /^hip-circl-pron$/ },
  // the side-to-side box shuffle is the stride jump crossover (one foot up on the box, over to the other side and back)
  { clip: 'ex_stride_jump_cross', families: ['jump'], bases: /^sid-sid-box-shuffl$/ },
  // DEMO-LOOPS-8 (anim/authored/exerciseFamilies8.ts): the entries the Playbook's lessons play. The short foot hold and the
  // tripod foot lift ("press heel, big toe and little toe into the floor and lift the arch, hold for three") are the Wake-Up's
  // tripod loop; the quadruped thoracic rotation ("one hand behind the head, the elbow up toward the ceiling, then down
  // toward the far hand"); Knee Across The Body (free-exercise-db: one leg long, the other knee across, the head turned away)
  { clip: 'ex_tripod', families: ['ankle-band'], bases: /^short-foot$/ },
  { clip: 'ex_tripod', families: ['foot-strength'], bases: /^tripod-lift$/ },
  { clip: 'ex_quad_t_rot', families: ['upper-back-mobility'], bases: /^quadruped$/ },
  { clip: 'ex_knee_across', families: ['stretch-hip'], bases: /^kne-across-body$/ },
  // the measured gaps, each read against its free-exercise-db source. Curls: the rope hammer curl and the barbell incline
  // curl are the standing and incline curls; the one-arm curl over an incline bench braces the upper arm on the bench the
  // way the preacher pad does (flag); the lying high-pulley curl folds the forearms down to the chin from upper arms
  // straight up — the skull crusher's arm path, palms up (flag)
  { clip: 'ex_curl', families: ['curl'], bases: /^hammer-curl-rop-attachment$/ },
  { clip: 'ex_incline_curl', families: ['curl'], bases: /^curl-lying-against-inclin$/ },
  { clip: 'ex_preacher_curl_one', families: ['curl'], bases: /^stand-singl-arm-curl-over-inclin-bench$/ },
  { clip: 'ex_skull_crusher', families: ['curl'], bases: /^lying-clos-grip-bar-curl-high-pulley$/ },
  { clip: 'ex_cross_hammer', families: ['curl'], bases: /^cross-body-hammer-curl$/ },
  { clip: 'ex_drag_curl', families: ['curl'], bases: /^drag-curl$/ },
  { clip: 'ex_lying_cable_curl', families: ['curl'], bases: /^lying-curl$/ },
  { clip: 'ex_lying_db_curl', families: ['curl'], bases: /^lying-supin-curl$/ },
  { clip: 'ex_concentration_stand', families: ['curl'], bases: /^stand-concentration-curl$/ },
  { clip: 'ex_zottman', families: ['curl'], bases: /^zottman-curl$/ },
  // flyes: the pec deck, the cable crossovers (high, low, one arm), the cable iron cross (the dumbbell one has no steps in its
  // source: no loop), the band crossover, the Svend press, the bar's raise to pullover; the one-arm flat bench fly; the incline
  // fly with a twist plays the incline fly (the wrists' quarter turn is not shown: flag)
  { clip: 'ex_pec_deck', families: ['fly'], bases: /^butterfly$/ },
  { clip: 'ex_crossover', families: ['fly'], bases: /^crossover$/ },
  { clip: 'ex_crossover_low', families: ['fly'], bases: /^low-crossover$/ },
  { clip: 'ex_crossover_one', families: ['fly'], bases: /^singl-arm-crossover$/ },
  { clip: (_b, eq) => (eq.includes('cable') ? 'ex_iron_cross' : null), families: ['fly'], bases: /^iron-cross$/, emits: ['ex_iron_cross'] },
  { clip: 'ex_band_crossover', families: ['fly'], bases: /^cross-over$/ },
  { clip: 'ex_svend_press', families: ['fly'], bases: /^svend-press$/ },
  { clip: 'ex_raise_pullover', families: ['fly'], bases: /^front-rais-pullover$/ },
  { clip: 'ex_fly_one', families: ['fly'], bases: /^singl-arm-flat-bench-fly$/ },
  { clip: 'ex_incline_fly', families: ['fly'], bases: /^inclin-fly-twist$/ },
  // triceps: the chain-handle extension and the one-arm pronated extension lie on the bench as the skull crushers do; the
  // JM press, the Tate press, the machine extension; the sled's overhead extension is the standing overhead extension (the
  // step forward to take up the slack is not shown: flag)
  { clip: 'ex_skull_crusher', families: ['triceps'], bases: /^chain-handl-extension$/ },
  { clip: 'ex_skull_crusher_one', families: ['triceps'], bases: /^singl-arm-pronat-tricep-extension$/ },
  { clip: 'ex_jm_press', families: ['triceps'], bases: /^jm-press$/ },
  { clip: 'ex_tate_press', families: ['triceps'], bases: /^tat-press$/ },
  { clip: (_b, eq) => (eq.includes('machine') ? 'ex_machine_triceps' : null), families: ['triceps'], bases: /^tricep-extension$/, emits: ['ex_machine_triceps'] },
  { clip: 'ex_triceps_overhead', families: ['triceps'], bases: /^sled-overhead-tricep-extension$/ },
  // sprint drills: the prowler sprint is the sled push; the double-leg butt kick; fast skipping; the kneeling arm drill; the
  // linear acceleration wall drill is the wall drive (lean into the wall, a knee up, struck down, then alternating)
  { clip: 'ex_sled_push', families: ['sprint-drill'], bases: /^prowler-sprint$/ },
  { clip: 'ex_heel_kick_jump', families: ['sprint-drill'], bases: /^doubl-leg-glut-kick$/ },
  { clip: 'ex_fast_skip', families: ['sprint-drill'], bases: /^fast-skip$/ },
  { clip: 'ex_kneel_arm_drill', families: ['sprint-drill'], bases: /^kneel-arm$/ },
  { clip: 'ex_wall_drive', families: ['sprint-drill'], bases: /^linear-acceleration-wall$/ },
  // the sled: pushed, dragged walking backward, walked backward with the hands overhead (in place)
  { clip: 'ex_sled_push', families: ['carry'], bases: /^sled-push$/ },
  { clip: 'ex_sled_drag_back', families: ['carry'], bases: /^backward-drag$/ },
  { clip: 'ex_sled_overhead_back', families: ['carry'], bases: /^sled-overhead-backward-walk$/ },
  // upper-body stretches: the lat stretch with a forearm on the wall; the pole lifted overhead and behind the head; the pole
  // lifted up behind the hips; the chair chest stretch; the dancer's stretch (and the stretch matrix's seated spinal twist:
  // "sit tall, one knee bent across the long leg, turn toward it, the hand behind pressing the floor")
  { clip: 'ex_lat_wall_stretch', families: ['stretch-upper'], bases: /^singl-arm-against-wall$/ },
  { clip: 'ex_pole_over', families: ['stretch-upper'], bases: /^chest-front-shoulder-stretch$/ },
  { clip: 'ex_pole_behind', families: ['stretch-upper'], bases: /^round-world-shoulder-stretch$/ },
  { clip: 'ex_chair_chest_stretch', families: ['stretch-upper'], bases: /^chair-upper-body-stretch$/ },
  { clip: 'ex_dancer_stretch', families: ['stretch-upper'], bases: /^dancer-stretch$/ },
  { clip: 'ex_dancer_stretch', families: ['stretch-matrix'], bases: /^seated-twist$/ },
  // DEMO-LOOPS-9 (anim/authored/exerciseFamilies9.ts; the kettlebell's in exerciseFamilies.ts), each read against the entry's
  // free-exercise-db source. Jumps: the box jump done for repeats is the box jump; the lateral box jump; cone and hurdle hops;
  // the side long jump; the one-leg hop progression hops and sticks cone to cone (flag: the loop holds each stick); the
  // kneeling jump squat
  { clip: 'ex_box_jump', families: ['jump'], bases: /^box-jump-multipl-respons$/ },
  { clip: 'ex_box_jump_lat', families: ['jump'], bases: /^lateral-box-jump$/ },
  { clip: 'ex_hurdle_hops', families: ['jump'], bases: /^(front-con-hop-hurdl-hop|hurdl-hop)$/ },
  { clip: 'ex_side_long_jump', families: ['jump'], bases: /^sid-stand-long-jump$/ },
  { clip: 'ex_sl_hop_stick', families: ['jump'], bases: /^singl-leg-hop-progression$/ },
  { clip: 'ex_kneel_jump_squat', families: ['jump'], bases: /^kneel-jump-squat$/ },
  // the foam roller: the hamstrings, the quads, the upper back (rhomboids), the low back
  { clip: 'ex_hamstring_smr', families: ['roll'], bases: /^hamstr-smr$/ },
  { clip: 'ex_quad_smr', families: ['roll'], bases: /^quadricep-smr$/ },
  { clip: 'ex_upper_back_smr', families: ['roll'], bases: /^rhomboid-smr$/ },
  { clip: 'ex_lower_back_smr', families: ['roll'], bases: /^lower-back-smr$/ },
  // cardio: free-exercise-db's Air Bike is the bicycle crunch (on the back, elbow to the opposite knee); the battle ropes
  { clip: 'ex_bicycle', families: ['cardio'], bases: /^air-bik$/ },
  { clip: 'ex_battle_ropes', families: ['cardio'], bases: /^battl-rop$/ },
  // the kettlebell: two bells cleaned and jerked; one bell's clean and jerk, split jerk, split snatch, dead clean; the
  // alternating hang cleans (one bell or two); the bottoms-up clean from the hang plays the clean (flag: the bell's
  // upside-down grip is not drawn)
  { clip: 'ex_kb_clean_two', families: ['kb-clean-snatch'], bases: /^two-arm-clean$/ },
  { clip: 'ex_kb_jerk_two', families: ['kb-clean-snatch'], bases: /^two-arm-jerk$/ },
  { clip: 'ex_kb_clean_jerk_one', families: ['kb-clean-snatch'], bases: /^singl-arm-clean-jerk$/ },
  { clip: 'ex_kb_split_jerk_one', families: ['kb-clean-snatch'], bases: /^singl-arm-split-jerk$/ },
  { clip: 'ex_kb_split_snatch_one', families: ['kb-clean-snatch'], bases: /^singl-arm-split-snatch$/ },
  { clip: 'ex_kb_dead_clean', families: ['kb-clean-snatch'], bases: /^dead-clean$/ },
  { clip: 'ex_kb_clean_alt', families: ['kb-clean-snatch'], bases: /^(alternat-hang-clean|doubl-alternat-hang-clean)$/ },
  { clip: 'ex_kb_clean_one', families: ['kb-clean-snatch'], bases: /^bottom-up-clean-hang-position$/ },
  // the medicine ball: the overhead throw; the kneeling chest push that falls to the hands (one throw or repeats); the
  // one-arm slam; the supine chest throw and one-arm overhead throw
  { clip: 'ex_overhead_standing', families: ['throw'], bases: /^catch-overhead-throw$/ },
  { clip: 'ex_chest_push_fall', families: ['throw'], bases: /^(chest-push-singl-respons|chest-push-multipl-respons)$/ },
  { clip: 'ex_slam_one', families: ['throw'], bases: /^singl-arm-medicin-ball-slam$/ },
  { clip: 'ex_supine_chest_throw', families: ['throw'], bases: /^supin-chest-throw$/ },
  { clip: 'ex_supine_throw_one', families: ['throw'], bases: /^supin-singl-arm-overhead-throw$/ },
  // squats: the box squats with chains, reverse bands or for speed sit to the box (flag: the chains and bands are not drawn);
  // the speed and reverse-band squats are the bar squat (flag: the same); the Frankenstein, kneeling, one-arm overhead and
  // Zercher squats
  { clip: 'ex_box_squat_bar', families: ['squat'], bases: /^(box-squat-chain|revers-box-squat|spe-box-squat)$/ },
  { clip: 'ex_squat_bar', families: ['squat'], bases: /^(spe-squat|revers-power-squat)$/ },
  { clip: 'ex_frankenstein_squat', families: ['squat'], bases: /^frankenstein-squat$/ },
  { clip: 'ex_kneel_squat', families: ['squat'], bases: /^kneel-squat$/ },
  { clip: 'ex_kb_overhead_squat_one', families: ['squat'], bases: /^singl-arm-overhead-squat$/ },
  { clip: 'ex_zercher_squat', families: ['squat'], bases: /^zercher-squat$/ },
  // rows: the renegade row; the kneeling high-pulley rows; the high-row machine; the low pulley to the neck; the sled row is
  // the standing row from in front; the lying cambered row is the chest-supported row (flag: the flat bench is drawn as the
  // incline pad); the straight bar bench row is the bent-over row (flag: standing on a bench); the suspended row is the
  // inverted row (flag: the straps drawn as a low bar); wrist rotations with a bar are the wrist roller (flag)
  { clip: 'ex_renegade_row', families: ['row'], bases: /^alternat-renegad-row$/ },
  { clip: 'ex_kneel_high_row', families: ['row'], bases: /^kneel-high-pulley-row$/ },
  { clip: 'ex_kneel_high_row_one', families: ['row'], bases: /^kneel-singl-arm-high-pulley-row$/ },
  { clip: 'ex_seated_high_row', families: ['row'], bases: /^leverag-high-row$/ },
  { clip: 'ex_row_to_neck', families: ['row'], bases: /^low-pulley-row-neck$/ },
  { clip: 'ex_band_row', families: ['row'], bases: /^sled-row$/ },
  { clip: 'ex_chest_row', families: ['row'], bases: /^lying-camber-row$/ },
  { clip: 'ex_row', families: ['row'], bases: /^straight-bar-bench-mid-row$/ },
  { clip: 'ex_inverted_row', families: ['row'], bases: /^suspend-row$/ },
  { clip: 'ex_wrist_roller', families: ['row'], bases: /^wrist-rotation-straight-bar$/ },
  // DEMO-LOOPS-10 (anim/authored/exerciseFamilies10.ts), each read against the entry's free-exercise-db source
  // (scripts/probes/demo-loops/source-text.mjs). The hamstrings: the 90/90, the chair stretch, the leg-up stretch, the runner's
  // stretch, the leg grab; the belt stretches play their position (flag: the belt is not drawn — the lying hamstring stretch
  // holds behind the thigh, the seated one folds to the feet, deeper than the entry's slight lean); the "split squat
  // stretch" is, as written, a jump that switches the legs (flag: the loop's split is deeper than the entry's shallow one)
  { clip: 'ex_ham_9090', families: ['stretch-hamstring'], bases: /^90-90-hamstr$/ },
  { clip: 'ex_chair_leg_out', families: ['stretch-hamstring'], bases: /^chair-leg-extend-stretch$/ },
  { clip: 'ex_pos_lyinghams', families: ['stretch-hamstring'], bases: /^hamstr-stretch$/ },
  { clip: 'ex_lying_leg_out', families: ['stretch-hamstring'], bases: /^intermediat-groin-stretch$/ },
  { clip: 'ex_ham_leg_up', families: ['stretch-hamstring'], bases: /^leg-up-hamstr-stretch$/ },
  { clip: 'ex_runner_stretch', families: ['stretch-hamstring'], bases: /^runner-stretch$/ },
  { clip: 'ex_pos_pike', families: ['stretch-hamstring'], bases: /^seat-hamstr-calf-stretch$/ },
  // EVERY-SCREEN P3 (owner via coordinator, 2026-11-10): the split-squat stretch (front leg long, fold forward) played the
  // jumping split switch, and the spider crawl (a travelling crawl) a push-up in place: both removed, so each shows the
  // labelled still until a loop of its own exists (docs/every-screen/demos.md)
  { clip: 'ex_stand_ham_calf', families: ['stretch-hamstring'], bases: /^stand-hamstr-calf-stretch$/ },
  { clip: 'ex_leg_grab', families: ['stretch-hamstring'], bases: /^upper-back-leg-grab$/ },
  // the quads and hip flexors: on all fours, face down with the belt (flag: not drawn), the half locust, the kneeling arch,
  // on the side, sit squats, standing; the standing elevated stretch is the rear-foot-elevated split squat held at its top
  // (flag: a held frame of that loop, the back foot on the bench)
  { clip: 'ex_quad_allfours', families: ['stretch-quad-hip'], bases: /^all-four-quad-stretch$/ },
  { clip: 'ex_prone_quad', families: ['stretch-quad-hip'], bases: /^intermediat-hip-flexor-quad-stretch$/ },
  { clip: 'ex_camel', families: ['stretch-quad-hip'], bases: /^ceil$/ },
  { clip: 'ex_side_quad', families: ['stretch-quad-hip'], bases: /^sid-quad-stretch$/ },
  { clip: 'ex_half_locust', families: ['stretch-quad-hip'], bases: /^one-half-locust$/ },
  { clip: 'ex_sit_squat', families: ['stretch-quad-hip'], bases: /^sit-squat$/ },
  { clip: 'ex_bulgarian', families: ['stretch-quad-hip'], bases: /^stand-elevat-quad-stretch$/, hold: 0 },
  { clip: 'ex_stand_hip_flexor', families: ['stretch-quad-hip'], bases: /^stand-hip-flexor$/ },
  // the hips: the ankle on the knee is the figure-4; the groin and back stretch; the IT band stretch with the belt (flag: not drawn)
  { clip: 'ex_pos_figure4', families: ['stretch-hip'], bases: /^ankl-kne$/ },
  { clip: 'ex_butterfly_curl', families: ['stretch-hip'], bases: /^groin-back-stretch$/ },
  { clip: 'ex_lying_leg_across', families: ['stretch-hip'], bases: /^glut-stretch$/ },
  // the calves: the hands on the wall; the soleus; seated; the heel on a step plays the standing hamstring and calf stretch
  // (flag: the step is not drawn — the heel is on the floor)
  { clip: 'ex_wall_calf_rock', families: ['stretch-calf'], bases: /^calf-stretch-hand-against-wall$/ },
  { clip: 'ex_soleus_stretch', families: ['stretch-calf'], bases: /^stand-soleus-achill-stretch$/ },
  { clip: 'ex_seat_calf_stretch', families: ['stretch-calf'], bases: /^seat-calf-stretch$/ },
  { clip: 'ex_stand_ham_calf', families: ['stretch-calf'], bases: /^stand-gastrocnemius-calf-stretch$/ },
  // the side-lying crunches (flag, assumption: the side jackknife's source has no instructions — the loop is the movement
  // the name is used for everywhere: the top leg and the trunk lifting to meet)
  { clip: 'ex_side_crunch', families: ['flexion'], bases: /^obliqu-crunch-floor$/ },
  { clip: 'ex_side_jackknife', families: ['flexion'], bases: /^sid-jackknif$/ },
  // the hip work, standing (flag: the post and the cable's frame are not drawn — the hands are on the hips; and the band
  // "hip adduction" entry's own instructions raise the leg out to the side, so it plays the abduction it describes), on
  // all fours, the monster walk, and the thigh machines (flag: drawn as a plain seat)
  { clip: (_b, eq) => (eq.includes('cable') ? 'ex_hip_adduction_stand' : eq.includes('band') ? 'ex_hip_abduction_stand' : null), families: ['hip-machine'], bases: /^hip-adduction$/, emits: ['ex_hip_adduction_stand', 'ex_hip_abduction_stand'] },
  { clip: 'ex_hip_extension_stand', families: ['hip-machine'], bases: /^(hip-extension|one-leg-kickback)$/ },
  { clip: 'ex_hip_flexion_stand', families: ['hip-machine'], bases: /^hip-flexion$/ },
  { clip: 'ex_donkey_kick', families: ['hip-machine'], bases: /^glut-kickback$/ },
  { clip: 'ex_monster_walk', families: ['hip-machine'], bases: /^monster-walk$/ },
  { clip: 'ex_seat_abduction', families: ['hip-machine'], bases: /^thigh-abductor$/ },
  { clip: 'ex_seat_adduction', families: ['hip-machine'], bases: /^thigh-adductor$/ },
  // the back: the lower back curl; the floor glute-ham raise is the Nordic lean (the hands catch the floor and push back); the
  // natural glute-ham raise is the same lean (flag: the pulldown seat it kneels on is not drawn)
  { clip: 'ex_prone_back_curl', families: ['back-extension'], bases: /^lower-back-curl$/ },
  { clip: 'ex_nordic', families: ['back-extension'], bases: /^(floor-glut-ham-rais|natural-glut-ham-rais)$/ },
  // the foam roller under the side of the thigh and of the lower leg
  { clip: 'ex_it_band_smr', families: ['roll'], bases: /^iliotibial-tract-smr$/ },
  { clip: 'ex_peroneal_smr', families: ['roll'], bases: /^peroneal-smr$/ },
  // the bar: Gironda's sternum chin, the side-to-side chin, the wide-grip pull-up behind the neck
  { clip: (b) => ({ 'gironda-sternum-chin': 'ex_sternum_chin', 'sid-sid-chin': 'ex_pullup_side', 'wid-grip-rear-pull-up': 'ex_pullup_rear' } as Record<string, string>)[b] ?? null, families: ['pull-up'], bases: /^(gironda-sternum-chin|sid-sid-chin|wid-grip-rear-pull-up)$/, emits: ['ex_sternum_chin', 'ex_pullup_side', 'ex_pullup_rear'] },
  // the kettlebell windmill; the double windmill is the same lean down to the bell on the floor (flag: the second bell is not drawn)
  { clip: 'ex_kb_windmill', families: ['get-up-windmill'], bases: /^(windmill|doubl-windmill)$/ },
  // the lying leg-overs: face up (windmills) and face down (iron crosses)
  { clip: 'ex_supine_windmill', families: ['dynamic-warmup'], bases: /^windmill$/ },
  { clip: 'ex_iron_cross_stretch', families: ['dynamic-warmup'], bases: /^iron-cross-stretch$/ },
  // DEMOS-FIX (2026-11-10): the exercises the programs people train from showed a still for (docs/every-screen/demos.md),
  // most-used first (anim/authored/exerciseFamilies11.ts), each read against the entry's own setup and cues and its
  // free-exercise-db source where it has one. Hinges, bridges, lunges and step-ups:
  { clip: 'ex_wall_hinge', families: ['hinge-pattern'], bases: /^wall-tap$/ },
  { clip: 'ex_bridge', families: ['bridge-thrust'], bases: /^glut-lift-bridg$/ },
  { clip: 'ex_frog_pump', families: ['hinge-accessory'], bases: /^frog-pump$/ },
  { clip: 'ex_hip_airplane_free', families: ['single-leg-hinge'], bases: /^airplane$/ },
  { clip: 'ex_split_squat_supported', families: ['split-squat'], bases: /^supported$/ },
  { clip: 'ex_walking_lunge', families: ['lunge'], bases: /^walking-db$/ },
  { clip: 'ex_walking_lunge_bar', families: ['lunge'], bases: /^walk-lung$/ },
  { clip: 'ex_walking_lunge_bw', families: ['lunge'], bases: /^bodyweight-walk-lung$/ },
  { clip: 'ex_side_split_squat_bar', families: ['lunge'], bases: /^sid-split-squat$/ },
  { clip: 'ex_step_up_bar', families: ['step-up'], bases: /^bb$/ },
  // planks and the floor's core work
  { clip: (b) => ({ incline: 'ex_plank_incline', 'long-lever': 'ex_plank_long', 'bear-lateral': 'ex_bear_lateral' } as Record<string, string>)[b] ?? null, families: ['plank'], bases: /^(incline|long-lever|bear-lateral)$/, emits: ['ex_plank_incline', 'ex_plank_long', 'ex_bear_lateral'] },
  { clip: (b) => ({ 'long-lever-leg-lift': 'ex_plank_long_leg', 'long-lever-arm-reach': 'ex_plank_long_reach', 'long-lever-knee-elbow': 'ex_plank_long_knee', 'reverse-leg-lift': 'ex_reverse_plank_leg', 'side-arm-reach': 'ex_side_plank_arm_reach' } as Record<string, string>)[b] ?? null, families: ['plank-matrix'], bases: /^(long-lever-leg-lift|long-lever-arm-reach|long-lever-knee-elbow|reverse-leg-lift|side-arm-reach)$/, emits: ['ex_plank_long_leg', 'ex_plank_long_reach', 'ex_plank_long_knee', 'ex_reverse_plank_leg', 'ex_side_plank_arm_reach'] },
  // (the wall the dead bug presses is drawn behind the head: demo.ts PROP_SHAPES wallhead)
  { clip: (b) => ({ 'bird-hover': 'ex_bird_dog_hover', 'bird-plank': 'ex_plank_bird_dog', kb: 'ex_dead_bug_press', legs: 'ex_dead_bug_legs', wall: 'ex_dead_bug_wall' } as Record<string, string>)[b] ?? null, families: ['dead-bug-bird-dog'], bases: /^(bird-hover|bird-plank|kb|legs|wall)$/, emits: ['ex_bird_dog_hover', 'ex_plank_bird_dog', 'ex_dead_bug_press', 'ex_dead_bug_legs', 'ex_dead_bug_wall'] },
  // push-ups: the single-arm push-up (the entry's own words are the plain push-up's; its source's are the one-arm push-up the
  // name says, feet wide, the free hand behind the back), the slow lower to the floor and the reset from the knees, the hands
  // staggered
  { clip: (b) => ({ 'singl-arm-push-up': 'ex_pushup_one_arm', eccentric: 'ex_pushup_eccentric' } as Record<string, string>)[b] ?? null, families: ['push-up'], bases: /^(singl-arm-push-up|eccentric)$/, emits: ['ex_pushup_one_arm', 'ex_pushup_eccentric'] },
  { clip: 'ex_pushup_staggered', families: ['push-extra'], bases: /^staggered$/ },
  // presses: the half-kneeling landmine press; the dumbbell push press plays the two-bell push press (flag: kettlebells and
  // dumbbells are the same dip, drive and press; neither is drawn)
  { clip: 'ex_landmine_press_hk', families: ['overhead-press'], bases: /^landmine-hk$/ },
  { clip: 'ex_kb_push_press_two', families: ['push-extra'], bases: /^db-push-press$/ },
  // rows and pulls: the dumbbell renegade row is the renegade row; the gorilla row; the feet-up inverted row; the eccentric
  // pull-up; the half-kneeling one-arm pulldown; the light kettlebell high pull plays the high pull (flag: the loop holds the
  // handle in both hands, the entry does not say how many)
  { clip: 'ex_renegade_row', families: ['db-upper'], bases: /^renegade$/ },
  { clip: (b) => ({ 'kb-gorilla': 'ex_gorilla_row', 'inverted-feet-up': 'ex_inverted_row_feet_up' } as Record<string, string>)[b] ?? null, families: ['row'], bases: /^(kb-gorilla|inverted-feet-up)$/, emits: ['ex_gorilla_row', 'ex_inverted_row_feet_up'] },
  { clip: (b) => ({ eccentric: 'ex_pullup_eccentric', 'pulldown-hk': 'ex_pulldown_hk_one' } as Record<string, string>)[b] ?? null, families: ['vertical-pull'], bases: /^(eccentric|pulldown-hk)$/, emits: ['ex_pullup_eccentric', 'ex_pulldown_hk_one'] },
  { clip: 'ex_kb_high_pull', families: ['pull-extra'], bases: /^kb-high-pull$/ },
  // the shoulders face down: the Y and the W; the prone dumbbell rear fly on a low incline plays the incline T (flag: the
  // arms open straight out to a T on the pad; the entry's soft elbows are not drawn)
  { clip: (b) => ({ 'prone-y': 'ex_prone_y', 'prone-w': 'ex_prone_w' } as Record<string, string>)[b] ?? null, families: ['shoulder-care'], bases: /^(prone-y|prone-w)$/, emits: ['ex_prone_y', 'ex_prone_w'] },
  { clip: 'ex_incline_t', families: ['upper-back'], bases: /^rear-fly-prone$/ },
  // mobility: the loaded ankle rock plays the ankle rock (flag: the bell on the knee is the hands on it; the wall is not
  // drawn); the prone scorpion reach is the iron cross stretch (face down, the heel up and across to the other hand)
  { clip: 'ex_ankle_rock', families: ['ankle-mobility'], bases: /^loaded$/ },
  { clip: (b) => ({ scorpion: 'ex_iron_cross_stretch', 'tall-kneel-rotation': 'ex_tk_hip_rotation', 'spinal-wave': 'ex_spinal_wave' } as Record<string, string>)[b] ?? null, families: ['shoulder-mobility'], bases: /^(scorpion|tall-kneel-rotation|spinal-wave)$/, emits: ['ex_iron_cross_stretch', 'ex_tk_hip_rotation', 'ex_spinal_wave'] },
  // the active lift-offs: from the couch stretch, the pigeon and the 90/90, the back knee (or shin) an inch off the floor
  { clip: (b) => ({ 'couch-liftoff': 'ex_couch_liftoff', 'pigeon-liftoff': 'ex_pigeon_liftoff', 'ninety-liftoff': 'ex_ninety_liftoff', 'hip-rot-liftoff': 'ex_hip_rot_liftoff_seat' } as Record<string, string>)[b] ?? null, families: ['active-mobility'], bases: /^(couch-liftoff|pigeon-liftoff|ninety-liftoff|hip-rot-liftoff)$/, emits: ['ex_couch_liftoff', 'ex_pigeon_liftoff', 'ex_ninety_liftoff', 'ex_hip_rot_liftoff_seat'] },
  { clip: 'ex_goblet_reach', families: ['loaded-mobility'], bases: /^goblet-reach$/ },
  { clip: 'ex_snow_angel_floor', families: ['stretch-matrix'], bases: /^chest-angel$/ },
  { clip: 'ex_knee_hug_walk', families: ['dynamic-flow'], bases: /^knee-hug$/ },
  { clip: 'ex_thoracic_circle_seat', families: ['joint-circles'], bases: /^thoracic-seated$/ },
  // side planks: from the knees, the hip dip, the reach through under the body, the top arm reaching long past the head
  { clip: 'ex_side_plank_short', families: ['side-plank'], bases: /^short$/ },
  { clip: (b) => ({ 'side-dip': 'ex_side_plank_dip', 'side-reach': 'ex_side_plank_reach_through' } as Record<string, string>)[b] ?? null, families: ['rollout-matrix'], bases: /^(side-dip|side-reach)$/, emits: ['ex_side_plank_dip', 'ex_side_plank_reach_through'] },
  // the kettlebell hike pass; the 45-degree back extension (demo.ts PROP_SHAPES hyper45)
  { clip: 'ex_kb_hike_pass', families: ['kb-swing'], bases: /^hike$/ },
  // machines (the seat and the pads drawn, the sled not): the leg press; the hack squat (flag on the barbell hack squat: its
  // entry's words are the machine's pad, which the loop shows; its source holds a barbell behind the legs)
  { clip: (b) => ({ 'leg-press': 'ex_leg_press', 'hack-squat': 'ex_hack_squat' } as Record<string, string>)[b] ?? null, families: ['leg-press-hack'], bases: /^(leg-press|hack-squat)$/, emits: ['ex_leg_press', 'ex_hack_squat'] },
  // the roller under the back of the armpit; the long-lever Copenhagen (the top foot on the bench); the lunge pass-through; the
  // seated hip rotation lift-off
  { clip: 'ex_lat_smr', families: ['roll'], bases: /^latissimus-dorsi-smr$/ },
  { clip: 'ex_copenhagen_long', families: ['side-plank'], bases: /^copenhagen-long$/ },
  { clip: 'ex_lunge_pass', families: ['lunge'], bases: /^lung-pass-through$/ },
  // the rollout from the knees (its entry kneels; its source too); the loaded Jefferson curl on a box
  { clip: 'ex_rollout_knees', families: ['rollout'], bases: /^ab-rollout-kne$/ },
  { clip: 'ex_jefferson_curl', families: ['posterior-chain-mobility'], bases: /^jefferson$/ },
  { clip: 'ex_back_ext_45', families: ['hinge-accessory'], bases: /^45-ext$/ },
  // sprint drills, shown in place (as the high knees and the skips are): ankling, the straight-leg run, the fast leg
  { clip: 'ex_ankling', families: ['sprint-mechanics'], bases: /^ankling$/ },
  { clip: (b) => ({ 'straight-leg-run': 'ex_straight_leg_run', 'fast-leg': 'ex_fast_leg' } as Record<string, string>)[b] ?? null, families: ['sprint-development'], bases: /^(straight-leg-run|fast-leg)$/, emits: ['ex_straight_leg_run', 'ex_fast_leg'] },
  // quick feet: on the spot, over five dots, over a line (the dots and the line are not drawn)
  { clip: (b) => ({ 'in-place': 'ex_quick_feet', dot: 'ex_dot_drill', 'line-steps': 'ex_line_steps' } as Record<string, string>)[b] ?? null, families: ['quick-feet'], bases: /^(in-place|dot|line-steps)$/, emits: ['ex_quick_feet', 'ex_dot_drill', 'ex_line_steps'] },
  // the sandbag bear-hug carry: the bag hugged high on the chest, walked
  { clip: 'ex_carry_hug', families: ['carry'], bases: /^sandbag$/ },
  // ── DEMOS-FIX-2 (2026-11-11, anim/authored/exerciseFamilies12.ts): what the session player still showed a still for ──
  // the whole body turning over: the T push-up — one push-up, then the turn on one hand into a side plank, the other arm to the
  // ceiling, each side — and the push-up to side plank (its source's words are the same movement; its entry's are the plain
  // push-up's, which the loop's push-up is); the kettlebell arm bar (flag: shown on the right side with the bell in the left
  // hand, so the chest faces the camera; the entry names neither side)
  { clip: 'ex_pushup_t', families: ['push-extra'], bases: /^t-push-up$/ },
  { clip: 'ex_pushup_t', families: ['push-up'], bases: /^push-up-sid-plank$/ },
  { clip: 'ex_kb_arm_bar', families: ['loaded-mobility'], bases: /^arm-bar$/ },
  // the machines: the calf press and the calf press on the leg press are the leg press's calf press (their entries' words are
  // the calf-raise family's shared set-up — "on a step or plate … holding a rail or the machine handles" — which the seated
  // and standing calf raises share too; the name, the kit and the source are the leg press's: the loop follows them, as the
  // seated calf raise's does; flag: the sled is not drawn); the machine chair squat (the uprights drawn, the bar not); the
  // lying machine squat (the pad drawn, the sled not)
  { clip: 'ex_calf_press', families: ['calf-raise'], bases: /^(calf-press|calf-press-leg-press)$/ },
  { clip: 'ex_chair_squat', families: ['squat'], bases: /^chair-squat$/ },
  { clip: 'ex_lying_machine_squat', families: ['leg-press-hack'], bases: /^lying-squat$/ },
  // lunges: the elevated back lunge off a short platform, the bar on the back; the Spiderman lunge walk (two lunges forward
  // and the walk back)
  { clip: 'ex_back_lunge_elevated', families: ['lunge'], bases: /^elevat-back-lung$/ },
  { clip: 'ex_spiderman_lunge_walk', families: ['dynamic-flow'], bases: /^spiderman$/ },
  // on a bench: the bird dog row (the hand and knee on the bench, the free leg long behind); the rollout kneeling on a bench
  // (flag: the bar on the floor is not drawn)
  { clip: 'ex_bird_dog_row', families: ['dead-bug'], bases: /^bird-dog-row$/ },
  { clip: 'ex_rollout_bench', families: ['rollout'], bases: /^rollout-bench$/ },
  // speed: the hill sprint, in place on a drawn slope (flag: the run up the hill is shown in place, as the sprint drills are;
  // the 20 m and 40 m hill sprints are the same run); the 5-10-5 shuttle (flag: shown short — 1, 2 and 1 metres for 5, 10 and 5
  // — and the cones and lines are not drawn)
  { clip: 'ex_hill_sprint', families: ['acceleration'], bases: /^hill$/ },
  { clip: 'ex_hill_sprint', families: ['sprint-development'], bases: /^(hill-20|hill-40)$/ },
  { clip: 'ex_shuttle_5105', families: ['change-of-direction'], bases: /^5-10-5$/ },
  // the basketball program's drills (the ball is not drawn: isBallClip). The two handle combos are the court's own handle moves
  // (anim/authored/basketball.ts), the second off the hand the first ended in. Shown IN PLACE (flag, each): the full-court speed
  // dribble, the change-of-pace dribble (also its full-court version), the crossover into a layup and the full-court layup
  // lines — the travel, the cones and the basket are not drawn, so the loop is the hands' and the legs' work on the spot. The
  // box-out turns and pushes back; Slide-Run-Slide travels (the cones are not drawn).
  { clip: (b) => ({ 'between-behind': 'ex_combo_between_behind', 'cross-between': 'ex_combo_cross_between' } as Record<string, string>)[b] ?? null, families: ['handle-combos'], bases: /^(between-behind|cross-between)$/, emits: ['ex_combo_between_behind', 'ex_combo_cross_between'] },
  { clip: (b) => ({ 'box-out': 'ex_box_out', 'slide-run': 'ex_slide_run_slide' } as Record<string, string>)[b] ?? null, families: ['defense'], bases: /^(box-out|slide-run)$/, emits: ['ex_box_out', 'ex_slide_run_slide'] },
  { clip: 'ex_change_pace_dribble', families: ['ball-handling'], bases: /^change-of-pace$/ },
  { clip: 'ex_change_pace_dribble', families: ['full-court-handles'], bases: /^change-pace$/ },
  { clip: (b) => ({ speed: 'ex_speed_dribble', 'cross-layup': 'ex_cross_layup' } as Record<string, string>)[b] ?? null, families: ['moving-handles'], bases: /^(speed|cross-layup)$/, emits: ['ex_speed_dribble', 'ex_cross_layup'] },
  { clip: 'ex_speed_layup', families: ['finishing-touch'], bases: /^full-court$/ },
  // DEMOS-FIX-2, second pass: what the program builder reaches with the band kit (the band is never drawn) and the rest. Where an
  // entry's words are its family's shared set-up and its name, kit and source agree on another movement, the loop follows the
  // name and the source (as the seated calf raise's always has): the anti-gravity press (face down on an incline bench, the bar
  // pressed out in front of the head), the handstand push-up (the heels on a wall), the guillotine bench press (the bar to the
  // neck), the leg-over floor press, the muscle-ups (flag: the source's rings are the entry's bar here), the dumbbell vertical
  // swing (flag: the kettlebell swings' shared set-up says the bell floats to chest height; the name and the source jump and
  // swing it overhead), the kneeling cable triceps extension (the cable is not drawn) and the Pallof press with rotation (an
  // entry tagged plank whose name and source are the standing cable press that turns; flag: the loop starts with the arms
  // already pressed out — the press out from the chest at each end is not shown)
  { clip: (b) => ({ march: 'ex_pallof_march', walkout: 'ex_pallof_walkout' } as Record<string, string>)[b] ?? null, families: ['anti-rotation'], bases: /^(march|walkout)$/, emits: ['ex_pallof_march', 'ex_pallof_walkout'] },
  { clip: 'ex_pallofrotate_standing', families: ['plank'], bases: /^pallof-press-rotation$/ },
  { clip: 'ex_pull_apart_diag', families: ['scap-work'], bases: /^pull-apart-diag$/ },
  { clip: 'ex_pull_apart_overhead', families: ['upper-back'], bases: /^pull-apart-overhead$/ },
  // the banded knee squat (the Spanish squat for reps) plays the Spanish squat's own loop (exerciseVariants.ts)
  { clip: 'ex_spanish_squat', families: ['spanish-squat'], bases: /^reps$/ },
  { clip: 'ex_side_plank_row', families: ['side-plank'], bases: /^row$/ },
  { clip: (b) => ({ 'bear-band-row': 'ex_bear_plank_row', 'high-band-row': 'ex_high_plank_row' } as Record<string, string>)[b] ?? null, families: ['plank-matrix'], bases: /^(bear-band-row|high-band-row)$/, emits: ['ex_bear_plank_row', 'ex_high_plank_row'] },
  { clip: 'ex_bird_dog_band_row', families: ['dead-bug-bird-dog'], bases: /^bird-band$/ },
  { clip: (b) => ({ 'guillotin-bench-press': 'ex_guillotine_press', 'leg-over-floor-press': 'ex_leg_over_floor_press' } as Record<string, string>)[b] ?? null, families: ['bench-press'], bases: /^(guillotin-bench-press|leg-over-floor-press)$/, emits: ['ex_guillotine_press', 'ex_leg_over_floor_press'] },
  { clip: 'ex_anti_gravity_press', families: ['overhead-press'], bases: /^anti-gravity-press$/ },
  { clip: 'ex_handstand_pushup', families: ['push-up'], bases: /^handstand-push-ups$/ },
  // the clock push-up: its entry's words are the push-up family's, its name and source the plyometric push-up that hops round the
  // feet (flag: the source goes all the way round the clock; the loop hops a step round each way and back)
  { clip: 'ex_clock_pushup', families: ['push-up'], bases: /^clock-push-up$/ },
  { clip: (b) => ({ 'muscl-up': 'ex_muscle_up', 'kip-muscl-up': 'ex_muscle_up_kip' } as Record<string, string>)[b] ?? null, families: ['pull-up'], bases: /^(muscl-up|kip-muscl-up)$/, emits: ['ex_muscle_up', 'ex_muscle_up_kip'] },
  { clip: 'ex_db_vertical_swing', families: ['kb-swing'], bases: /^vertical-swing$/ },
  { clip: 'ex_kneel_cable_triceps', families: ['triceps'], bases: /^kneel-tricep-extension$/ },
  // the loaded-mobility band stretches: the half-kneeling hip shift into the band; the arm in the band overhead, the chest sunk
  { clip: (b) => ({ 'band-hip': 'ex_hk_hip_shift', 'band-shoulder': 'ex_band_shoulder_sink' } as Record<string, string>)[b] ?? null, families: ['loaded-mobility'], bases: /^(band-hip|band-shoulder)$/, emits: ['ex_hk_hip_shift', 'ex_band_shoulder_sink'] },
  // existing loops that are the movement, each flagged for what they do not draw: the banded ankle rock plays the half-kneeling
  // ankle rock (flag: the band and the wall are not drawn); the band good morning plays the good morning (flag: the band round the
  // neck is not drawn: the hands hold it where the bar sits); the reverse-band sumo deadlift plays the sumo deadlift (flag: the
  // bands from the rack are not drawn); the reverse fly with external rotation plays the incline T, face down on the pad (flag:
  // the wrists' quarter turn is not drawn, and the pad is a little steeper than the source's 30°)
  { clip: 'ex_ankle_rock', families: ['ankle-mobility'], bases: /^banded$/ },
  { clip: 'ex_good_morning', families: ['good-morning'], bases: /^morn-pull-through$/ },
  { clip: 'ex_sumo_deadlift', families: ['deadlift'], bases: /^revers-sumo-deadlift$/ },
  { clip: 'ex_incline_t', families: ['rear-delt-face-pull'], bases: /^revers-fly-external-rotation$/ },
];

const RULES_BY_FAMILY: ReadonlyMap<string, readonly DemoRule[]> = (() => {
  const m = new Map<string, DemoRule[]>();
  for (const r of DEMO_RULES) for (const f of r.families) (m.get(f) ?? m.set(f, []).get(f)!).push(r);
  return m;
})();

/**
 * An ISOMETRIC HOLD ("stop at the hardest point of the range and hold still", modifiers.ts iso-hold) is its rep's loop
 * held still at that point: seconds into the loop where the rep is at its hardest (the bottom of a squat, the top of a
 * row, the half-way of a curl). Only the loops listed here can show a hold; exercise.test.ts checks each time is the
 * pose it names. Any other loop with an iso-hold variation shows the cue card.
 */
export const ISO_HOLD_SEC: Readonly<Record<string, number>> = {
  ex_squat: 1.2, ex_squat_bar: 1.2, ex_hinge: 1.15, ex_good_morning: 1.15, ex_split_squat: 1.05, ex_lunge: 1.3, ex_reverse_lunge: 1.3,
  ex_press: 0.38, ex_curl: 0.4, ex_lateral_raise: 0.85, ex_front_raise: 0.85, ex_row: 0.85, ex_upright_row: 0.85, ex_shrug: 0.65,
  ex_triceps_overhead: 0.4, ex_pushdown: 0.75, ex_pushup: 0.95, ex_bridge: 1.0, ex_calf_raise: 0.8, ex_crunch: 0.85,
  ex_seated_press: 0.38, ex_seated_curl: 0.4, ex_seated_lateral_raise: 0.85, ex_seated_triceps: 0.4, ex_bench_press: 1.1, ex_floor_press: 1.0,
  ex_skull_crusher: 1.0, ex_incline_press: 1.1,
  // LIBRARY-ANATOMY-2: a one-arm or kneeling loop holds where its two-arm lift does (the same two poses, the same timing)
  ex_curl_one: 0.4, ex_press_one: 0.38, ex_lateral_raise_one: 0.85, ex_front_raise_one: 0.85, ex_triceps_overhead_one: 0.4, ex_pushdown_one: 0.75,
  ex_row_one: 0.85, ex_upright_row_one: 0.85, ex_seated_press_one: 0.38, ex_seated_curl_one: 0.4, ex_seated_lateral_raise_one: 0.85, ex_seated_triceps_one: 0.4,
  ex_skull_crusher_one: 1.0, ex_incline_press_one: 1.1, ex_press_hk: 0.38, ex_press_hk_one: 0.38,
  ex_kickback: 0.75, ex_kickback_one: 0.75, ex_reverse_fly: 0.95, ex_pull_apart: 0.85, ex_face_pull: 0.85, ex_scaption: 0.85,
  ex_pullup: 1.05, ex_chinup: 1.05, ex_inverted_row: 0.95, ex_bulgarian: 1.1, ex_hip_thrust: 1.0, ex_leg_extension: 1.05, ex_lying_leg_curl: 1.05, ex_pulldown: 0.95,
  ex_chest_row: 0.85, ex_incline_y: 0.95, ex_incline_t: 0.95, ex_wall_pushup: 1.0, ex_incline_pushup: 1.0, ex_decline_pushup: 1.0, ex_dip: 1.0, ex_bench_dip: 1.0,
  // arm after arm: the first (right) arm at the hold its two-arm lift names, the other down (measured on the rig)
  ex_curl_alt: 0.4, ex_press_alt: 0.38, ex_lateral_raise_alt: 0.85, ex_row_alt: 0.85, ex_incline_curl: 0.4, ex_incline_curl_alt: 0.4,
  ex_concentration_curl: 0.63, ex_preacher_curl: 0.37, ex_spider_curl: 0.4, ex_front_raise_overhead: 1.48, ex_hand_release: 1.09,
  ex_lateral_lunge: 1.14, ex_curtsy_lunge: 1.06, ex_pos_cossack: 0.4, ex_sl_rdl: 1.35, ex_kickstand_rdl: 1.2, ex_pistol: 1.37, ex_pistol_goblet: 1.37,
  ex_skater_squat: 1.26, ex_bridge_sl: 1.02, ex_bulgarian_bar: 1.14, ex_straight_arm_pulldown: 0.96, ex_pulldown_close: 0.96,
  ex_seated_reverse_fly: 0.95, ex_seated_reverse_fly_one: 0.95, ex_seated_kickback: 0.75, ex_seated_kickback_one: 0.75,
  ex_decline_press: 1.1, ex_decline_skull: 1.0, ex_decline_skull_one: 1.0, ex_spiderman_pushup: 1.0, ex_archer_pushup: 1.0,
  ex_high_curl: 0.4, ex_high_curl_one: 0.4, ex_z_press: 0.38, ex_z_press_one: 0.38, ex_seated_row: 0.99, ex_seated_row_one: 0.99,
};

export interface DemoPick {
  clip: string;
  /** seconds into the loop to hold still at (an isometric hold), or null to loop it */
  hold: number | null;
}

/**
 * LIBRARY-ANATOMY-2 (2026-10-25): a SHAPE modifier turns a loop into the loop that does that version — one arm, arm after
 * arm, from a half-kneel, the off hand — and only these: a modifier with no row for the loop shows the cue card, as every
 * shape modifier did before. Each row is a loop authored for it (anim/authored/exerciseMore.ts: the same two poses as the
 * two-arm lift). Modifiers chain in the order the variation names them (half-kneeling then single-arm, or the reverse).
 */
export const MODIFIER_LOOPS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'single-arm': {
    ex_curl: 'ex_curl_one', ex_press: 'ex_press_one', ex_lateral_raise: 'ex_lateral_raise_one', ex_front_raise: 'ex_front_raise_one',
    ex_triceps_overhead: 'ex_triceps_overhead_one', ex_pushdown: 'ex_pushdown_one', ex_row: 'ex_row_one', ex_upright_row: 'ex_upright_row_one',
    ex_seated_press: 'ex_seated_press_one', ex_seated_curl: 'ex_seated_curl_one', ex_seated_lateral_raise: 'ex_seated_lateral_raise_one',
    ex_seated_triceps: 'ex_seated_triceps_one', ex_skull_crusher: 'ex_skull_crusher_one', ex_fly: 'ex_fly_one', ex_incline_press: 'ex_incline_press_one',
    ex_incline_fly: 'ex_incline_fly_one', ex_kickback: 'ex_kickback_one', ex_press_hk: 'ex_press_hk_one', ex_preacher_curl: 'ex_preacher_curl_one', ex_pulldown: 'ex_pulldown_one',
    ex_high_curl: 'ex_high_curl_one', ex_z_press: 'ex_z_press_one', ex_seated_row: 'ex_seated_row_one', ex_decline_fly: 'ex_decline_fly_one', ex_decline_skull: 'ex_decline_skull_one',
    ex_seated_reverse_fly: 'ex_seated_reverse_fly_one', ex_seated_kickback: 'ex_seated_kickback_one',
  },
  alternating: {
    ex_curl: 'ex_curl_alt', ex_press: 'ex_press_alt', ex_lateral_raise: 'ex_lateral_raise_alt', ex_front_raise: 'ex_front_raise_alt', ex_row: 'ex_row_alt',
    ex_seated_press: 'ex_seated_press_alt', ex_seated_curl: 'ex_seated_curl_alt', ex_incline_press: 'ex_incline_press_alt', ex_press_hk: 'ex_press_hk_alt', ex_incline_curl: 'ex_incline_curl_alt',
    ex_z_press: 'ex_z_press_alt',
  },
  // the kickstand: one foot back on its toes, the hinge on the front leg
  staggered: { ex_hinge: 'ex_kickstand_rdl' },
  'half-kneeling': { ex_press: 'ex_press_hk', ex_press_one: 'ex_press_hk_one', ex_press_alt: 'ex_press_hk_alt' },
  // the finishes the court plays with either hand (the right-hand loop's own left-hand twin)
  'off-hand': {
    bball_hook: 'bball_hook_left', bball_layup_reverse: 'bball_layup_reverse_left', bball_floater: 'bball_floater_left', bball_euro_step: 'bball_euro_step_left',
    bball_finger_roll: 'bball_finger_roll_left', bball_layup_scoop: 'bball_layup_scoop_left', bball_up_and_under: 'bball_up_and_under_left', bball_layup_gather: 'bball_layup_gather_left',
  },
};

/** What a library entry shows on the stage: its loop (or that loop held still), or null — the cue card. */
export function demoFor(e: { family: string; variation: string; equipment: readonly string[] }): DemoPick | null {
  const [base, ...mods] = e.variation.split('+');
  const iso = mods.includes('iso-hold');
  for (const r of RULES_BY_FAMILY.get(e.family) ?? []) {
    if (!r.bases.test(base)) continue;
    if (r.notMods && mods.some((m) => r.notMods!.test(m))) return null;
    let clip = typeof r.clip === 'string' ? r.clip : r.clip(base, e.equipment);
    for (const m of mods) if (clip && m !== 'iso-hold' && SHAPE_MODIFIERS.has(m)) clip = MODIFIER_LOOPS[m]?.[clip] ?? null;
    if (!clip) return null;
    if (r.hold != null) return { clip, hold: r.hold };
    if (!iso) return { clip, hold: null };
    return clip in ISO_HOLD_SEC ? { clip, hold: ISO_HOLD_SEC[clip] } : null;
  }
  return null;
}

/** The loop an entry plays (demoFor's clip), or null: the cue card. */
export const demoClipFor = (e: { family: string; variation: string; equipment: readonly string[] }): string | null => demoFor(e)?.clip ?? null;

/** Every loop a rule can name (the stage must own each one). */
export const DEMO_CLIPS: readonly string[] = (() => {
  const out = new Set<string>();
  for (const r of DEMO_RULES) {
    if (typeof r.clip === 'string') out.add(r.clip);
    else if (r.emits) for (const c of r.emits) out.add(c);
    else for (const b of ['x', 'x-weak']) for (const eq of [[], ['barbell']]) { const c = r.clip(b, eq); if (c) out.add(c); }
  }
  for (const table of Object.values(MODIFIER_LOOPS)) for (const c of Object.values(table)) out.add(c);
  // DEMO-LOOPS: the loops the drill and check demos play (lib/library/surfaceDemo.ts) are the stage's too
  for (const c of [...Object.values(DRILL_DEMO_LOOPS), ...Object.values(SCREEN_DEMO_LOOPS), ...Object.values(WARMUP_DEMO_LOOPS), ...Object.values(CATALOGUE_DEMO_LOOPS), ...Object.values(LESSON_DEMO_LOOPS)]) if (c) out.add(c);
  return [...out].sort();
})();

/** Floor loops: the stage frames these from the side, low (a push-up seen from the front is a head). */
export const FLOOR_CLIPS: ReadonlySet<string> = new Set(['ex_rollout_knees', 'ex_lat_smr', 'ex_copenhagen_long', 'ex_side_plank_short', 'ex_side_plank_dip', 'ex_side_plank_reach_through', 'ex_side_plank_arm_reach', 'ex_couch_liftoff', 'ex_pigeon_liftoff', 'ex_ninety_liftoff', 'ex_snow_angel_floor', 'ex_bridge_sl_hug', 'ex_bridge_sl_load', 'ex_frog_pump', 'ex_plank_long', 'ex_plank_long_leg', 'ex_plank_long_reach', 'ex_plank_long_knee', 'ex_plank_bird_dog', 'ex_bird_dog_hover', 'ex_reverse_plank_leg', 'ex_dead_bug_legs', 'ex_dead_bug_wall', 'ex_dead_bug_press', 'ex_pushup_staggered', 'ex_pushup_one_arm', 'ex_pushup_eccentric', 'ex_prone_y', 'ex_prone_w', 'ex_prone_yt', 'ex_ham_9090', 'ex_ham_leg_up', 'ex_lying_leg_out', 'ex_lying_leg_across', 'ex_runner_stretch', 'ex_leg_grab', 'ex_quad_allfours', 'ex_prone_quad', 'ex_half_locust', 'ex_side_quad', 'ex_seat_calf_stretch', 'ex_butterfly_curl', 'ex_side_crunch', 'ex_side_jackknife', 'ex_donkey_kick', 'ex_prone_back_curl', 'ex_it_band_smr', 'ex_peroneal_smr', 'ex_supine_windmill', 'ex_iron_cross_stretch', 'ex_hamstring_smr', 'ex_quad_smr', 'ex_upper_back_smr', 'ex_lower_back_smr', 'ex_supine_chest_throw', 'ex_supine_throw_one', 'ex_renegade_row', 'ex_quad_t_rot', 'ex_ninety_turn', 'ex_knee_across', 'ex_lying_cable_curl', 'ex_dancer_stretch', 'ex_floor_press_one', 'ex_floor_press_alt', 'ex_groiner', 'ex_hip_circle_quad', 'ex_stepin_climber', 'ex_leg_pull_in', 'ex_crunch_weight', 'ex_frog_situp', 'ex_cocoon', 'ex_bottoms_up', 'ex_butterfly_side_reach', 'ex_crunch_overhead', 'ex_crunch_tuck', 'ex_russian_twist', 'ex_leg_raise_back', 'ex_pushup', 'ex_plank', 'ex_plank_high', 'ex_mountain_climber', 'ex_bridge', 'ex_dead_bug', 'ex_bird_dog', 'ex_crunch', 'ex_floor_press', 'ex_spiderman_pushup', 'ex_archer_pushup', 'ex_prone_t', 'ex_adductor_squeeze', 'ex_copenhagen_knee', 'ex_copenhagen_raise_knee', 'ex_calf_smr', 'ex_piriformis_smr'].concat(
  // LIBRARY-ANATOMY-2: the floor positions and every flow (a flow spends most of its time on the floor)
  ['dog', 'child', 'pigeon', 'halfsplit', 'lowlunge', 'kneel', 'ninety', 'shinbox', 'catcamel', 'thread', 'bear', 'cobra', 'lizard', 'butterfly', 'couch', 'frog', 'spider', 'inchworm',
    'supine', 'supine9090', 'legsup', 'kneehug', 'oneknee', 'happybaby', 'kneerock', 'figure4', 'lyinghams', 'prone', 'pike', 'straddle', 'switch', 'rockback', 'childside', 'dogpedal',
    'side', 'openbook', 'clamshell', 'sideraise', 'sideer', 'superman'].map((p) => `ex_pos_${p}`),
  ['ex_reverse_crunch', 'ex_situp', 'ex_situp_34', 'ex_bicycle', 'ex_heel_touch', 'ex_flutter', 'ex_toe_touch', 'ex_vup', 'ex_hollow', 'ex_hollow_tuck', 'ex_hollow_rock', 'ex_dead_bug_heel',
    ...['forearm', 'high', 'bear'].flatMap((b) => ['leg', 'reach', 'knee'].map((a) => `ex_plank_${b}_${a}`)), 'ex_shoulder_tap', 'ex_bear_tap', 'ex_side_plank', 'ex_side_plank_leg',
    'ex_bear_crawl', 'ex_leopard_crawl', 'ex_crab_walk', 'ex_crab_reach', 'ex_plyo_pushup', 'ex_hand_release', 'ex_bridge_march', 'ex_bridge_sl', 'ex_slider_curl'],
  // DEMO-LOOPS-4: the warm-up's and cool-down's floor steps (anim/authored/exerciseWarmup.ts)
  ['ex_ankle_rock', 'ex_ninety_rock', 'ex_open_book_rock', 'ex_kneeling_reach_rock', 'ex_breathe_supine', 'ex_fast_pushup'],
  FLOW_CLIPS,
  // DEMOS-FIX-2: the T push-up (exerciseFamilies12.ts)
  ['ex_pushup_t', 'ex_kb_arm_bar', 'ex_side_plank_row', 'ex_bear_plank_row', 'ex_high_plank_row', 'ex_bird_dog_band_row', 'ex_leg_over_floor_press', 'ex_clock_pushup'],
));
/** Hinges and rows read from the side (the angle at the hips is the movement). */
/** DEMO-LOOPS: loops that travel a metre or more — framed wide: forward travel from the side, sideways travel from the
 *  front, both (the T-drill) from three-quarters. */
export const TRAVEL_CLIPS: Readonly<Record<string, 'forward' | 'lateral' | 'both'>> = {
  // DEMOS-FIX: the walking lunges (two steps forward and the walk back); the lateral bear crawl
  ex_walking_lunge: 'forward', ex_walking_lunge_bar: 'forward', ex_walking_lunge_bw: 'forward', ex_bear_lateral: 'lateral', ex_knee_hug_walk: 'forward',
  ex_approach_one: 'forward', ex_approach_two: 'forward', ex_approach_jump_one_step: 'forward', ex_approach_jump_two_step: 'forward', ex_approach_jump_three_step: 'forward', ex_approach_jump_one_foot: 'forward',
  ex_decel_stick: 'forward', ex_jump_stop: 'forward', ex_broad_jump_stick: 'forward', ex_two_point_start: 'forward', ex_power_layup: 'forward', ex_catch_shoot_hop: 'forward',
  ex_lateral_skip: 'lateral', ex_lateral_walk: 'lateral', ex_lateral_hop_stick: 'lateral', ex_t_drill: 'both',
  ex_stride_jump_cross: 'lateral',
  // DEMOS-FIX-2: the double broad jump and the walk back; the Spiderman lunge walk; the step and stick to each side
  // (the handstand push-up is framed as forward travel for its height: upside down against the wall the feet are 2 m up)
  ex_handstand_pushup: 'forward', ex_broad_jump_double: 'forward', ex_spiderman_lunge_walk: 'forward', ex_lateral_step_stick: 'lateral', ex_slide_run_slide: 'lateral', ex_shuttle_5105: 'lateral',
  // DEMO-LOOPS-8: the ankle lesson gets up from its chair and walks to the wall, 1.2 m in front
  ex_ankle_unlock: 'forward',
  // DEMO-LOOPS-9: three hurdle hops forward and the walk back; the long jump to the side and back
  ex_hurdle_hops: 'forward', ex_side_long_jump: 'lateral',
};
export const SIDE_CLIPS: ReadonlySet<string> = new Set(['ex_jefferson_curl', 'ex_leg_press', 'ex_hack_squat', 'ex_lunge_pass', 'ex_spinal_wave', 'ex_kb_hike_pass', 'ex_ankling', 'ex_straight_leg_run', 'ex_fast_leg', 'ex_wall_hinge', 'ex_hip_airplane_free', 'ex_split_squat_supported', 'ex_gorilla_row', 'ex_landmine_press_hk', 'ex_pulldown_hk_one', 'ex_hinge', 'ex_good_morning', 'ex_row', 'ex_row_one', 'ex_row_alt', 'ex_kickback', 'ex_kickback_one', 'ex_press_hk', 'ex_press_hk_one', 'ex_press_hk_alt',
  'ex_sl_rdl', 'ex_kickstand_rdl', 'ex_nordic', 'ex_squat_thrust', 'ex_burpee', 'ex_high_knees', 'ex_butt_kicks', 'ex_a_skip', 'ex_b_skip', 'ex_power_skip', 'ex_seated_kickback', 'ex_seated_kickback_one', 'ex_seated_row', 'ex_seated_row_one',
  // DEMO-LOOPS: read from the side
  'ex_sl_squat_partial', 'ex_supported_sl_rdl', 'ex_hip_airplane', 'ex_two_point_start', 'ex_arm_swing', 'ex_broad_jump_stick', 'ex_sl_hop_stick', 'ex_snap_down', 'ex_cmj_dip', 'ex_decel_stick', 'ex_jump_stop',
  'ex_approach_one', 'ex_approach_two', 'ex_approach_jump_one_step', 'ex_approach_jump_two_step', 'ex_approach_jump_three_step', 'ex_approach_jump_one_foot',
  // DEMO-LOOPS-4: the warm-up's hinges, the split-stance primers and the lean-back row read from the side
  'ex_hinge_rock', 'ex_hip_snap', 'ex_split_drive', 'ex_split_hop', 'ex_door_row',
  // DEMO-LOOPS-8: the Playbook's bodyweight hinge; the bent-over and dragged curls, the sled, the kneeling arm drill, the
  // poles lifted, the heel-kick jump
  // DEMO-LOOPS-10: the kneeling arch, the standing stretches and hip work seen from the side
  'ex_camel', 'ex_stand_ham_calf', 'ex_stand_hip_flexor', 'ex_soleus_stretch', 'ex_hip_extension_stand', 'ex_hip_flexion_stand', 'ex_sit_squat', 'ex_monster_walk',
  // DEMO-LOOPS-9: the kneeling jump squat, push and squat; the kettlebell's dead clean and splits
  'ex_kneel_jump_squat', 'ex_chest_push_fall', 'ex_kneel_squat', 'ex_kb_dead_clean', 'ex_kb_split_jerk_one', 'ex_kb_split_snatch_one',
  'ex_bw_hinge', 'ex_concentration_stand', 'ex_drag_curl', 'ex_sled_push', 'ex_sled_drag_back', 'ex_sled_overhead_back', 'ex_kneel_arm_drill', 'ex_pole_over', 'ex_pole_behind', 'ex_heel_kick_jump',
  // the hike-and-snap kettlebell lifts, the fold to the toes, the front leg swing, the one-leg butt kick, the rounded upper back
  // (the hanging and bar raises and the box push-off keep their prop's framing: the bar and the box in view)
  'ex_kb_clean_one', 'ex_kb_snatch_one', 'ex_kb_snatch_two', 'ex_kb_high_pull', 'ex_toe_touch_stand', 'ex_leg_raise_front', 'ex_butt_kick_one', 'ex_stretch_upper_back',
  // DEMO-LOOPS-5: the barbell's pulls and catches, the rope crunches, the arm swing up and the pelvic tilt read from the side
  'ex_bb_clean', 'ex_bb_power_clean', 'ex_bb_hang_clean', 'ex_bb_hang_clean_low', 'ex_bb_clean_pull', 'ex_bb_clean_shrug', 'ex_bb_clean_press',
  'ex_bb_snatch', 'ex_bb_power_snatch', 'ex_bb_hang_snatch', 'ex_bb_hang_snatch_low', 'ex_bb_snatch_pull', 'ex_bb_snatch_shrug', 'ex_bb_muscle_snatch', 'ex_bb_snatch_balance',
  'ex_rope_crunch_kneel', 'ex_rope_crunch_stand', 'ex_arm_swing_up', 'ex_pelvic_tilt_stand',
  // DEMOS-FIX-2: the machine chair squat's depth and the elevated back lunge read from the side
  'ex_chair_squat', 'ex_back_lunge_elevated', 'ex_box_out', 'ex_hill_sprint', 'ex_db_vertical_swing', 'ex_hk_hip_shift', 'ex_band_shoulder_sink']);
/** What the stage draws under a loop that needs it: a bench seat, a flat bench to lie on, or an incline bench. Bench loops
 *  lying down are framed from the side, like the floor loops. LIBRARY-ANATOMY-2: and the rest of a gym's furniture a loop
 *  stands, sits, lies or hangs on — a box, benches in front and behind, a pull-up bar, a low bar, dip bars, pads, a wall. */
export type DemoProp = 'seat' | 'bench' | 'incline' | 'box' | 'boxside' | 'stepbox' | 'boxback' | 'rearbench' | 'handbench' | 'feetbench' | 'feetbenchfront' | 'thrust'
  | 'pullbar' | 'lowbar' | 'dipbars' | 'dipbench' | 'legcurl' | 'proneincline' | 'decline' | 'preacher' | 'wall' | 'calfstep' | 'wallback' | 'rowseat' | 'dowel' | 'cphbench' | 'roller' | 'rollerseat'
  | 'doorpost' | 'doorway' | 'seatwall' | 'rollerthigh' | 'rollerquad' | 'rollerback' | 'rollerlow' | 'rollerit' | 'rollershin' | 'wallhinge' | 'wallhead' | 'lowbarfeet' | 'hyper45' | 'legpress' | 'hackpad' | 'rollerlat' | 'cphlong'
  | 'feetbox' | 'lowstep' | 'rowbench' | 'kneelbench' | 'rails' | 'ramp' | 'lyingpad';
/** A plain box (metres, the body's frame: +x its right, +y up, +z its front; rx tips it about x — negative raises its −z end).
 *  (The stage puts the body's +x at its own −x: the spawned root carries the importer's mirror.) */
export interface PropBox { w: number; h: number; d: number; x?: number; y: number; z: number; rx?: number; /** DEMO-LOOPS: a roller — a cylinder across the body, `w` long, `h` across */ cyl?: true }
/** Each prop's boxes. The first three are the first pass's own (exercise-stage.tsx drew them inline; same sizes). */
export const PROP_SHAPES: Readonly<Record<DemoProp, readonly PropBox[]>> = {
  seat: [{ w: 0.34, h: 0.44, d: 0.42, y: 0.22, z: -0.02 }],
  bench: [{ w: 0.30, h: 0.44, d: 1.30, y: 0.22, z: -0.52 }],
  incline: [{ w: 0.34, h: 0.44, d: 0.42, y: 0.22, z: 0.02 }, { w: 0.34, h: 0.08, d: 0.95, y: 0.79, z: -0.43, rx: -Math.PI / 4 }],
  box: [{ w: 0.55, h: 0.40, d: 0.45, y: 0.20, z: 0.42 }],
  boxside: [{ w: 0.55, h: 0.40, d: 0.50, x: 0.45, y: 0.20, z: 0.04 }],
  stepbox: [{ w: 0.50, h: 0.40, d: 0.40, y: 0.20, z: 0.0 }],
  boxback: [{ w: 0.45, h: 0.45, d: 0.40, y: 0.225, z: -0.38 }],
  rearbench: [{ w: 0.34, h: 0.44, d: 0.50, y: 0.22, z: -0.74 }],
  handbench: [{ w: 0.95, h: 0.44, d: 0.34, y: 0.22, z: 0.58 }],
  feetbench: [{ w: 0.70, h: 0.44, d: 0.34, y: 0.22, z: -0.94 }],
  feetbenchfront: [{ w: 0.70, h: 0.44, d: 0.34, y: 0.22, z: 0.62 }],
  thrust: [{ w: 1.00, h: 0.40, d: 0.34, y: 0.20, z: -0.64 }],
  pullbar: [{ w: 1.30, h: 0.035, d: 0.035, y: 2.22, z: 0.02 }],
  lowbar: [{ w: 1.30, h: 0.035, d: 0.035, y: 0.98, z: -0.36 }],
  dipbars: [{ w: 0.04, h: 0.04, d: 0.80, x: -0.27, y: 1.12, z: 0.02 }, { w: 0.04, h: 0.04, d: 0.80, x: 0.27, y: 1.12, z: 0.02 }],
  dipbench: [{ w: 0.90, h: 0.44, d: 0.34, y: 0.22, z: -0.42 }],
  legcurl: [{ w: 0.30, h: 0.44, d: 1.35, y: 0.22, z: 0.30 }],
  proneincline: [{ w: 0.34, h: 0.50, d: 0.30, y: 0.25, z: -0.28 }, { w: 0.34, h: 0.07, d: 0.90, y: 0.80, z: 0.02, rx: 0.66 }],
  // LIBRARY-ANATOMY-2: the decline bench as exerciseVariants.ts lies on it (the pad 14° head-down, its top 0.60 at the hips;
  // the roller in front of the ankles at its high end)
  decline: [{ w: 0.30, h: 0.07, d: 1.20, y: 0.458, z: -0.42, rx: 0.25 }, { w: 0.24, h: 0.40, d: 0.24, y: 0.20, z: -0.40 }, { w: 0.06, h: 0.30, d: 0.06, y: 0.15, z: 0.52 }, { w: 0.40, h: 0.08, d: 0.08, y: 0.30, z: 0.51 }],
  preacher: [{ w: 0.34, h: 0.44, d: 0.42, y: 0.22, z: -0.02 }, { w: 0.40, h: 0.05, d: 0.36, y: 0.86, z: 0.30, rx: -0.8 }],
  wall: [{ w: 1.40, h: 2.10, d: 0.06, y: 1.05, z: 0.72 }],
  // the calf-raise step: its back edge just behind the balls of the feet (exerciseVariants.ts CALF_STEP)
  calfstep: [{ w: 0.50, h: 0.20, d: 0.30, y: 0.10, z: 0.33 }],
  // the wall a wall sit leans on: its face a hand behind the hip joints
  wallback: [{ w: 1.40, h: 2.10, d: 0.06, y: 1.05, z: -0.15 }],
  // the cable row's low seat and its foot plate
  rowseat: [{ w: 0.34, h: 0.30, d: 0.70, y: 0.15, z: -0.12 }, { w: 0.44, h: 0.36, d: 0.05, y: 0.18, z: 0.84 }],
  // DEMO-LOOPS: a dowel planted beside the body (a single-leg hinge's support)
  dowel: [{ w: 0.03, h: 1.10, d: 0.03, x: 0.42, y: 0.55, z: 0.20 }],
  // the Copenhagen's bench: under the top knee, the shin hanging past its far edge (exerciseSignature.ts cph)
  cphbench: [{ w: 0.50, h: 0.46, d: 0.30, y: 0.23, z: -0.31 }],
  // foam rollers (exerciseSignature.ts): under the calves, and under the seat
  roller: [{ w: 0.55, h: 0.14, d: 0.14, y: 0.07, z: 0.56, cyl: true }],
  rollerseat: [{ w: 0.55, h: 0.14, d: 0.14, y: 0.07, z: -0.04, cyl: true }],
  // DEMO-LOOPS-4: a door post at the body's right (the doorway chest stretch's forearm on it: its inner face at x 0.64), and a
  // doorway's two posts in front (the door-frame row holds them at chest height)
  doorpost: [{ w: 0.08, h: 2.10, d: 0.12, x: 0.68, y: 1.05, z: 0.04 }],
  doorway: [{ w: 0.08, h: 2.10, d: 0.10, x: -0.34, y: 1.05, z: 0.56 }, { w: 0.08, h: 2.10, d: 0.10, x: 0.34, y: 1.05, z: 0.56 }],
  // DEMO-LOOPS-8: the ankle lesson's chair, and the wall it walks up to (its face 1.20 m in front: exerciseFamilies8.ts)
  seatwall: [{ w: 0.34, h: 0.44, d: 0.42, y: 0.22, z: -0.02 }, { w: 1.40, h: 2.10, d: 0.06, y: 1.05, z: 1.23 }],
  // DEMO-LOOPS-9: the foam roller under the backs of the thighs, the fronts of the thighs, the upper back, the low back
  rollerthigh: [{ w: 0.55, h: 0.14, d: 0.14, y: 0.07, z: 0.26, cyl: true }],
  rollerquad: [{ w: 0.55, h: 0.14, d: 0.14, y: 0.07, z: -0.28, cyl: true }],
  rollerback: [{ w: 0.55, h: 0.14, d: 0.14, y: 0.07, z: -0.44, cyl: true }],
  rollerlow: [{ w: 0.55, h: 0.14, d: 0.14, y: 0.07, z: -0.14, cyl: true }],
  // DEMO-LOOPS-10: the foam roller under the side of the thigh, and of the lower leg (the body lies on its side, turned to the camera)
  rollerit: [{ w: 0.55, h: 0.14, d: 0.14, y: 0.07, z: -0.24, cyl: true }],
  rollershin: [{ w: 0.55, h: 0.14, d: 0.14, y: 0.07, z: -0.64, cyl: true }],
  // DEMOS-FIX: the wall the hips tap behind (exerciseFamilies11.ts ex_wall_hinge), the wall behind the head on the floor (the
  // dead bug's press), the low bar with a bench under the heels (the feet-up inverted row)
  wallhinge: [{ w: 1.40, h: 2.10, d: 0.06, y: 1.05, z: -0.33 }],
  wallhead: [{ w: 1.40, h: 1.00, d: 0.06, y: 0.50, z: -1.00 }],
  lowbarfeet: [{ w: 1.30, h: 0.035, d: 0.035, y: 0.98, z: -0.36 }, { w: 0.70, h: 0.44, d: 0.34, y: 0.22, z: 1.00 }],
  // the 45-degree back-extension bench: the pad under the fronts of the hips, tipped to 45° (its front end high), the post, the
  // foot plate behind
  // the 45-degree leg press's seat and back pad; the hack squat's inclined back pad; the roller under the armpit (the body on
  // its side, turned to the camera); the bench under the long-lever Copenhagen's top foot
  legpress: [{ w: 0.44, h: 0.30, d: 0.44, y: 0.15, z: 0.02 }, { w: 0.44, h: 0.06, d: 0.70, y: 0.60, z: -0.24, rx: -0.78 }],
  hackpad: [{ w: 0.44, h: 0.06, d: 1.10, y: 0.95, z: -0.24, rx: 1.32 }],
  rollerlat: [{ w: 0.55, h: 0.14, d: 0.14, y: 0.07, z: 0.46, cyl: true }],
  cphlong: [{ w: 0.50, h: 0.46, d: 0.30, y: 0.23, z: -0.88 }],
  hyper45: [{ w: 0.40, h: 0.07, d: 0.42, y: 0.66, z: -0.10, rx: 0.78 }, { w: 0.08, h: 0.60, d: 0.08, y: 0.30, z: -0.20 }, { w: 0.40, h: 0.05, d: 0.26, y: 0.12, z: -0.60 }],
  // DEMOS-FIX-2 (exerciseFamilies12.ts): the box under the toes of the feet-elevated pike (close enough behind the hands for
  // the hips to stack over them); the short platform the elevated back lunge stands on; the flat bench under the left hand and
  // knee of the bird dog row; the bench the rollout kneels on (the bar on the floor in front is not drawn: it rolls)
  feetbox: [{ w: 0.60, h: 0.44, d: 0.34, y: 0.22, z: -0.62 }],
  lowstep: [{ w: 0.60, h: 0.15, d: 0.40, y: 0.075, z: 0.04 }],
  rowbench: [{ w: 0.30, h: 0.44, d: 1.30, x: -0.16, y: 0.22, z: -0.24 }],
  kneelbench: [{ w: 0.40, h: 0.44, d: 0.80, y: 0.22, z: -0.50 }],
  // the machine chair squat's two uprights (the bar it rides on moves with the body and is not drawn); the slope a hill sprint
  // runs up (exerciseFamilies12.ts RAMP_Y: its top 0.12 under the feet, 8° up toward the front; the stage draws a negative rx
  // with the front end high — the contact sheet showed a positive one sloping down the way the body faced)
  rails: [{ w: 0.05, h: 2.0, d: 0.05, x: -0.62, y: 1.0, z: -0.12 }, { w: 0.05, h: 2.0, d: 0.05, x: 0.62, y: 1.0, z: -0.12 }],
  ramp: [{ w: 0.90, h: 0.04, d: 2.4, y: 0.10, z: 0.0, rx: -0.14 }],
  // the lying machine squat's pad, reclined 34° from upright behind the back
  lyingpad: [{ w: 0.44, h: 0.06, d: 1.20, y: 0.86, z: -0.58, rx: 0.98 }],
};
export const DEMO_PROPS: Readonly<Record<string, DemoProp>> = {
  ex_seated_press: 'seat', ex_seated_curl: 'seat', ex_seated_lateral_raise: 'seat', ex_seated_triceps: 'seat',
  ex_bench_press: 'bench', ex_fly: 'bench', ex_skull_crusher: 'bench', ex_incline_press: 'incline', ex_incline_fly: 'incline',
  ex_seated_press_one: 'seat', ex_seated_press_alt: 'seat', ex_seated_curl_one: 'seat', ex_seated_curl_alt: 'seat', ex_seated_lateral_raise_one: 'seat',
  ex_seated_triceps_one: 'seat', ex_skull_crusher_one: 'bench', ex_fly_one: 'bench', ex_incline_press_one: 'incline', ex_incline_press_alt: 'incline', ex_incline_fly_one: 'incline',
  ...(PROPPED_LOOPS as Readonly<Record<string, DemoProp>>),
};
/** Ball-handling and finishing loops: the stage draws no ball, and the card says so. */
/** DEMO-LOOPS: the authored shooting and finishing loops carry a ball too (exerciseSignature.ts) */
const BALL_LOOPS: ReadonlySet<string> = new Set(['ex_set_shot', 'ex_form_shot_one', 'ex_catch_shoot_hop', 'ex_pullup_jumper', 'ex_power_layup', 'ex_jab_crossover',
  // DEMO-LOOPS-6: the ball-skill drills' own loops (exerciseHoops.ts)
  'ex_catch_shoot_12', 'ex_layup_steps', 'ex_rip_through', 'ex_rebound_chin',
  // DEMOS-FIX-2: the dribble combos and the in-place dribbling and finishing drills (exerciseFamilies12.ts)
  'ex_combo_between_behind', 'ex_combo_cross_between', 'ex_speed_dribble', 'ex_change_pace_dribble', 'ex_cross_layup', 'ex_speed_layup']);
export const isBallClip = (clip: string | null | undefined): boolean => !!clip && (clip.startsWith('bball_') || clip === 'jumpshot' || BALL_LOOPS.has(clip));

const ANATOMY: ReadonlyMap<string, string> = new Map(MUSCLES.map((m) => [m.id, m.anatomyKey]));

/** The anatomy view's input: mesh keys, primary and secondary, no repeats. */
export function muscleMap(e: { primaryMuscles: readonly MuscleId[]; secondaryMuscles: readonly MuscleId[] }): { primary: string[]; secondary: string[] } {
  const primary = [...new Set(e.primaryMuscles.map((m) => ANATOMY.get(m) ?? m))];
  const secondary = [...new Set(e.secondaryMuscles.map((m) => ANATOMY.get(m) ?? m))].filter((m) => !primary.includes(m));
  return { primary, secondary };
}

// ── the camera review, by pattern ─────────────────────────────────────────────────────────────────────────────────

export type ReviewMovement = 'squat' | 'lunge' | 'hinge' | 'pushup';

/** Families the camera's push-up review reads (a push-up from the floor; not a press, not a dip). */
const PUSHUP_FAMILIES = new Set(['push-up']);

/**
 * Which camera review fits a library entry, from its structured tags only: the lunge pattern (split stance, step-ups,
 * split squats) is a lunge whatever it is called; a two-foot squat pattern is a squat; a two-foot hinge is a hinge; only the floor push-up
 * family is the push-up. Everything else (a single-leg hinge, a press, a jump) has no review yet: null.
 * The form-review lane (lib/coach/formReview/movements.ts on lane/coach-video-review, not on this lane's base) matches
 * catalogue rows by English name; a catalogue row copied from the library carries libraryExerciseId, so that matcher
 * can call this first and keep its name rules for rows a coach wrote by hand.
 */
export function reviewMovementOf(e: { pattern: MovementPattern; family: string; laterality: string }): ReviewMovement | null {
  if (PUSHUP_FAMILIES.has(e.family)) return 'pushup';
  if (e.pattern === 'lunge') return 'lunge';
  // a single-leg squat (pistol, skater) is neither the two-foot squat nor the split stance the lunge audit reads
  if (e.pattern === 'squat') return e.laterality === 'bilateral' ? 'squat' : null;
  if (e.pattern === 'hinge') return e.laterality === 'bilateral' ? 'hinge' : null;
  return null;
}
