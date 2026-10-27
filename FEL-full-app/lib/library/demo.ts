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

import { MUSCLES, type MovementPattern, type MuscleId } from './vocab';

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
  idle: 'ex_idle_ready', squat: 'ex_squat', hinge: 'ex_hinge', lunge: 'ex_lunge', push: 'ex_press', pull: 'ex_row', carry: 'ex_carry',
  rotate: 'ex_rotate', brace: 'ex_plank', jump: 'ex_jump', hop: 'ex_pogo', bound: 'ex_bound', sprint: 'run', shuffle: 'bball_defend_slide_left',
  backpedal: 'bball_defend_backpedal', dribble: 'bball_dribble_idle', shoot: 'jumpshot', layup: 'bball_layup_gather',
  stretch: 'ex_arm_circles', breathe: 'ex_breathe', throw: 'ex_throw', crawl: 'ex_crawl',
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
}

const weak = (right: string, left: string) => (base: string) => (/-weak\b|-weak-/.test(`${base}-`) ? left : right);
/** A barbell back squat holds the bar on the back; a goblet, front, dumbbell or bodyweight squat holds the load in front. */
const squatClip = (base: string, eq: readonly string[]) => (eq.includes('barbell') && !/front|zercher|goblet/.test(base) ? 'ex_squat_bar' : 'ex_squat');

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
  { clip: 'ex_split_squat', families: ['split-squat'], bases: /^(bw|offset-kb|landmine)$/ },
  { clip: 'ex_bridge', families: ['bridge'], bases: /^(bw|mini-band)$/ },
  { clip: 'ex_bridge', families: ['bridge-thrust'], bases: /^(glut-bridg|hip-lift)$/ },
  { clip: 'ex_bridge', families: ['db-hinge'], bases: /^bridge$/ },
  { clip: 'ex_calf_raise', families: ['calf-raise'], bases: /^(stand-calf-rais|calf-rais|smith-calf-rais|rock-stand-calf-rais)$/ },
  { clip: 'ex_calf_raise', families: ['calf-capacity'], bases: /^straight-double-(step|slow)$/ },
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
  { clip: 'ex_jump', families: ['vertical-jump-builds'], bases: /^(squat-jump-pause|cmj-target|cmj-hips|squat-jump-hips)$/ },
  { clip: 'ex_jump', families: ['jump'], bases: /^(freehand-jump-squat|weight-jump-squat|rocket-jump)$/ },
  { clip: 'ex_jump', families: ['loaded-jump'], bases: /^vest-cmj$/ },
  { clip: 'ex_jump', families: ['rebound-jump'], bases: /^touches$/ },
  { clip: 'ex_jumping_jack', families: ['conditioning-circuit'], bases: /^jumping-jack$/ },
  { clip: 'ex_pogo', families: ['pogo'], bases: /^(ankle-bounce|pogo)$/ },
  { clip: 'ex_jump_rope', families: ['jump-rope'], bases: /^basic$/ },
  { clip: 'ex_jump_rope', families: ['cardio'], bases: /^rop-jump$/ },
  { clip: 'ex_carry', families: ['carry'], bases: /^(farmer-kb|farmer-db|farmer-walk|farmer-trap|suitcase)$/ },
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
  // ── FITNESS-TPOSE batchA (2026-10-26): new authored loops (exerciseBatch*.ts); rows from the loop plan's family/base assignment ──
  { clip: 'ex_idle_ready', families: ['court-movement'], bases: /^(help-side)$/ },
  { clip: 'ex_idle_ready', families: ['defense'], bases: /^(stance)$/ },
  { clip: 'ex_idle_ready', families: ['foot-and-balance'], bases: /^(toe-spread)$/ },
  { clip: 'ex_idle_ready', families: ['foot-strength'], bases: /^(tripod-lift)$/ },
  { clip: 'ex_idle_ready', families: ['footwork'], bases: /^(triple-threat)$/ },
  { clip: 'ex_rotate', families: ['plank'], bases: /^(pallof-press-rotation)$/ },
  { clip: 'ex_rotate', families: ['rotation'], bases: /^(car-driver|isometric-wiper|judo-flip|landmin-180s|medicin-ball-full-twist|plat-twist|russian-twist|seat-twist|stand-lift|stand-wood-chop)$/ },
  { clip: 'ex_rotate', families: ['rotational-power'], bases: /^(landmine)$/ },
  { clip: 'ex_bound', families: ['bounding'], bases: /^(alternate|ankle-skip|power-skip|single-leg|to-sprint)$/ },
  { clip: 'ex_bound', families: ['decel-2'], bases: /^(lat-bound)$/ },
  { clip: 'ex_bound', families: ['drop-jump-builds'], bases: /^(drop-lat-bound)$/ },
  { clip: 'ex_bound', families: ['jump'], bases: /^(alternat-leg-diagonal-bound|lateral-bound)$/ },
  { clip: 'ex_bound', families: ['jump-combos'], bases: /^(bound-vert|broad-bound|drop-land-bound|hop-push|snap-bound)$/ },
  { clip: 'ex_bound', families: ['jump-land-matrix'], bases: /^(bound-diagonal-sprint|bound-diagonal-stick)$/ },
  { clip: 'ex_bound', families: ['lateral-bound'], bases: /^(bound-stick|continuous|diagonal|hop-stick|to-sprint)$/ },
  { clip: 'ex_bound', families: ['sprint-development'], bases: /^(hill-bound)$/ },
  { clip: 'ex_throw', families: ['med-ball-power'], bases: /^(kneeling-pass)$/ },
  { clip: 'ex_throw', families: ['med-ball-throw-matrix'], bases: /^(chest-half-kneeling|chest-single-leg|chest-split|chest-standing|chest-step-in|chest-tall-kneeling|single-push-half-kneeling|single-push-split|single-push-standing|single-push-step-in|single-push-tall-kneeling)$/ },
  { clip: 'ex_throw', families: ['partner-throw'], bases: /^(single-arm)$/ },
  { clip: 'ex_throw', families: ['passing'], bases: /^(chest)$/ },
  { clip: 'ex_throw', families: ['passing-2'], bases: /^(chest-partner)$/ },
  { clip: 'ex_throw', families: ['throw'], bases: /^(chest-push-3-point-stanc|chest-push-multipl-respons|chest-push-run-releas|chest-push-singl-respons|heavy-bag-thrust|medicin-ball-chest-pass|return-push-stanc|supin-chest-throw)$/ },
  { clip: 'ex_crawl', families: ['carry'], bases: /^(bear-crawl-sled-drag)$/ },
  { clip: 'ex_crawl', families: ['court-conditioning'], bases: /^(crawl-int)$/ },
  { clip: 'ex_crawl', families: ['crawl'], bases: /^(beast-tap|crab|crab-lateral|crab-reach|leopard)$/ },
  { clip: 'ex_crawl', families: ['dynamic-flow'], bases: /^(inchworm)$/ },
  { clip: 'ex_crawl', families: ['dynamic-warmup'], bases: /^(inchworm)$/ },
  { clip: 'ex_crawl', families: ['mobility-flow'], bases: /^(flow-bear-inchworm|flow-fold-inchworm|flow3-bear-inchworm-dog|flow3-bear-inchworm-fold|flow3-bear-inchworm-spider|flow3-child-bear-inchworm|flow3-child-dog-inchworm|flow3-cobra-dog-inchworm|flow3-dog-fold-inchworm|flow3-dog-spider-inchworm|flow3-fold-inchworm-spider|flow3-halfsplit-dog-inchworm|flow3-halfsplit-spider-inchworm|flow3-inchworm-dog-lizard|flow3-inchworm-dog-pigeon|flow3-inchworm-fold-squat|flow3-inchworm-spider-lizard|flow3-inchworm-spider-lowlunge|flow3-inchworm-spider-squat)$/ },
  { clip: 'ex_crawl', families: ['plank'], bases: /^(bear-crawl|bear-lateral)$/ },
  { clip: 'ex_t_drill', families: ['change-of-direction'], bases: /^(t-drill)$/ },
  { clip: 'ex_t_drill', families: ['sprint-development'], bases: /^(t-dribble)$/ },
  { clip: 'ex_knee_to_wall', families: ['active-mobility'], bases: /^(ankle-endrange)$/ },
  { clip: 'ex_knee_to_wall', families: ['ankle-mobility'], bases: /^(banded|knee-to-wall|loaded)$/ },
  { clip: 'ex_knee_to_wall', families: ['stretch-matrix'], bases: /^(calf-bent|calf-step-bent)$/ },
  { clip: 'ex_single_leg_squat', families: ['db-lower'], bases: /^(sl-box)$/ },
  { clip: 'ex_single_leg_squat', families: ['single-leg-squat'], bases: /^(box-high|box-mid|pistol|pistol-assisted|pistol-box|pistol-squat|singl-leg-squat|skater|skater-pad|smith-pistol-squat)$/ },
  { clip: 'ex_single_leg_squat', families: ['step-down'], bases: /^(forward|heel-up|lateral|lateral-db)$/ },
  { clip: 'ex_breathe_prone', families: ['breath-drill'], bases: /^(crocodile)$/ },
  { clip: 'ex_breathe_prone', families: ['breathing-2'], bases: /^(prone)$/ },
  { clip: 'ex_breathe_legs_up_wall', families: ['breath-drill'], bases: /^(90-90|legs-up)$/ },
  { clip: 'ex_breathe_legs_up_wall', families: ['breathing-2'], bases: /^(feet-wall|supine-belly)$/ },
  { clip: 'ex_breathe_legs_up_wall', families: ['recovery-mobility'], bases: /^(knee-rock)$/ },
  { clip: 'ex_ankle_circles', families: ['dynamic-warmup'], bases: /^(ankl-circl)$/ },
  { clip: 'ex_ankle_circles', families: ['foot-and-balance'], bases: /^(alphabet)$/ },
  { clip: 'ex_ankle_circles', families: ['joint-circles'], bases: /^(ankle-seated)$/ },
  { clip: 'ex_hip_circles_9090', families: ['dynamic-warmup'], bases: /^(hip-circl-pron|stand-hip-circl)$/ },
  { clip: 'ex_hip_circles_9090', families: ['hip-capacity'], bases: /^(hydrant|hydrant-band)$/ },
  { clip: 'ex_hip_circles_9090', families: ['hip-mobility'], bases: /^(90-90-free|90-90-switch|quad-circles)$/ },
  { clip: 'ex_hip_circles_9090', families: ['joint-circles'], bases: /^(hip-standing)$/ },
  { clip: 'ex_pogo_single', families: ['broad-jump'], bases: /^(single-leg-series)$/ },
  { clip: 'ex_pogo_single', families: ['ladder'], bases: /^(single-leg-hops)$/ },
  { clip: 'ex_pogo_single', families: ['pogo'], bases: /^(single-leg|single-leg-lateral)$/ },
  { clip: 'ex_pogo_single', families: ['vertical-jump-builds'], bases: /^(sl-vert-repeat)$/ },
  { clip: 'ex_bridge_single_pulse', families: ['bridge'], bases: /^(march|thrust-sl)$/ },
  { clip: 'ex_bridge_single_pulse', families: ['bridge-thrust'], bases: /^(singl-leg-glut-bridg)$/ },
  { clip: 'ex_bridge_single_pulse', families: ['isometric-capacity'], bases: /^(ham-dig-sl)$/ },
  { clip: 'ex_press_oscillation', families: ['overhead-press'], bases: /^(singl-arm-military-press-sid|singl-arm-para-press|singl-arm-shoulder-press|stand-palm-singl-arm-press)$/ },
  { clip: 'ex_press_oscillation', families: ['push-extra'], bases: /^(bottoms-up-press)$/ },
  { clip: 'ex_throw_vertical', families: ['med-ball-power'], bases: /^(backward-toss|scoop-forward|squat-throw)$/ },
  { clip: 'ex_throw_vertical', families: ['med-ball-throw-matrix'], bases: /^(underhand-half-kneeling|underhand-single-leg|underhand-split|underhand-standing|underhand-step-in|underhand-tall-kneeling)$/ },
  { clip: 'ex_throw_vertical', families: ['throw'], bases: /^(backward-medicin-ball-throw|medicin-ball-scoop-throw)$/ },
  { clip: 'ex_box_out', families: ['closeout-series'], bases: /^(closeout-baseline-box-out|closeout-corner-box-out|closeout-elbow-box-out|closeout-help-box-out|closeout-nail-box-out|closeout-opp-wing-box-out|closeout-paint-box-out)$/ },
  { clip: 'ex_box_out', families: ['defense'], bases: /^(box-out)$/ },
  { clip: 'ex_box_out', families: ['defense-drills-2'], bases: /^(box-help|box-hold|box-outlet|front-post|post-battle|three-quarter)$/ },
  // ── FITNESS-TPOSE batchB1 (2026-10-26): new authored loops (exerciseBatch*.ts); rows from the loop plan's family/base assignment ──
  { clip: 'ex_jump_stick', families: ['approach-jump'], bases: /^(one-foot|one-foot-off|one-step|three-step|two-step)$/ },
  { clip: 'ex_jump_stick', families: ['box-jump'], bases: /^(approach|low|mid|seated|single-leg)$/ },
  { clip: 'ex_jump_stick', families: ['box-jump-builds'], bases: /^(box-hips|box-kneel|box-pause|box-rot|box-sl-lat|box-split)$/ },
  { clip: 'ex_jump_stick', families: ['broad-jump'], bases: /^(consecutive|single-leg-stick|stick|triple)$/ },
  { clip: 'ex_jump_stick', families: ['broad-jump-builds'], bases: /^(broad-kneel|broad-pause|broad-sl|broad-vert|triple)$/ },
  { clip: 'ex_jump_stick', families: ['decel-2'], bases: /^(backpedal|sl-stick)$/ },
  { clip: 'ex_jump_stick', families: ['deceleration'], bases: /^(stick)$/ },
  { clip: 'ex_jump_stick', families: ['depth-jump'], bases: /^(depth-jump-leap|drop-push|inclin-push-up-depth-jump|linear-depth-jump)$/ },
  { clip: 'ex_jump_stick', families: ['drop-jump-builds'], bases: /^(drop-hips|drop-lat|drop-sl|drop-sprint|drop-target)$/ },
  { clip: 'ex_jump_stick', families: ['drop-landing-heights'], bases: /^(drop-knee-single-fwd|drop-knee-single-lat|drop-knee-single-rot|drop-knee-split-fwd|drop-knee-split-lat|drop-knee-split-rot|drop-knee-two-fwd|drop-knee-two-lat|drop-knee-two-rot|drop-low-single-fwd|drop-low-single-lat|drop-low-single-rot|drop-low-split-fwd|drop-low-split-lat|drop-low-split-rot|drop-low-two-lat|drop-low-two-rot)$/ },
  { clip: 'ex_jump_stick', families: ['hurdle-hops'], bases: /^(hurdle-stick)$/ },
  { clip: 'ex_jump_stick', families: ['jump'], bases: /^(bench-jump|box-jump-multipl-respons|box-skip|front-box-jump|front-con-hop-hurdl-hop|hurdl-hop|kne-tuck-jump|kneel-jump-squat|lateral-box-jump|lateral-con-hop|quick-leap|scissor-jump|seat-box-jump|sid-sid-box-shuffl|sid-stand-long-jump|singl-leg-hop-progression|singl-leg-lateral-hop|singl-leg-push|singl-leg-strid-jump|split-jump|stand-long-jump|star-jump|strid-jump-crossover)$/ },
  { clip: 'ex_jump_stick', families: ['jump-combos'], bases: /^(cross-bound|drop-broad|drop-catch|drop-catch-sl|hop-vert|jump-push|pogo-broad|pogo-vert|snap-vert|split-vert)$/ },
  { clip: 'ex_jump_stick', families: ['jump-land-matrix'], bases: /^(hop-backward-cont|hop-backward-stick|hop-diagonal-cont|hop-diagonal-sprint|hop-diagonal-stick|hop-forward-sprint|hop-lateral-cont|hop-lateral-sprint|hop-medial-cont|hop-medial-stick|hop-rot180-stick|hop-rot90-cont|hop-rot90-stick|jump-backward-cont|jump-backward-stick|jump-diagonal-cont|jump-diagonal-sprint|jump-diagonal-stick|jump-forward-sprint|jump-lateral-cont|jump-lateral-sprint|jump-lateral-stick|jump-rot180-cont|jump-rot180-stick|jump-rot90-cont|jump-rot90-stick|jump1-backward-stick|jump1-diagonal-stick|jump1-forward-sprint|jump1-forward-stick|jump1-lateral-sprint|jump1-lateral-stick|jump1-rot90-stick|one2-diagonal-stick|one2-forward-stick|one2-lateral-cont|one2-lateral-stick|one2-rot90-stick)$/ },
  { clip: 'ex_jump_stick', families: ['landing'], bases: /^(drop-low|drop-mid|drop-sl|pogo-stick|snap-down|snap-lateral)$/ },
  { clip: 'ex_jump_stick', families: ['loaded-jump'], bases: /^(band-assist|band-resist|kb|trap-bar|vest-broad)$/ },
  { clip: 'ex_jump_stick', families: ['reactive-jump'], bases: /^(drop-broad|drop-jump-low|drop-to-box)$/ },
  { clip: 'ex_jump_stick', families: ['vertical-jump'], bases: /^(loaded|single-leg|split-switch|tuck)$/ },
  { clip: 'ex_jump_stick', families: ['vertical-jump-builds'], bases: /^(sl-vert-stick|sl-vert-target|split-pause|split-stick|tuck-stick)$/ },
  { clip: 'ex_flow_squat_lunge', families: ['mobility-flow'], bases: /^(flow-bear-child|flow-bear-dog|flow-butterfly-frog|flow-butterfly-ninety|flow-catcamel-frog|flow-catcamel-thread|flow-child-catcamel|flow-child-frog|flow-child-thread|flow-cobra-child|flow-cobra-dog|flow-couch-halfsplit|flow-couch-kneel|flow-couch-lowlunge|flow-dog-child|flow-dog-halfsplit|flow-dog-pigeon|flow-dog-spider|flow-fold-dog|flow-halfsplit-kneel|flow-halfsplit-lowlunge|flow-inchworm-dog|flow-inchworm-spider|flow-kneel-lowlunge|flow-kneel-ninety|flow-lizard-dog|flow-lizard-halfsplit|flow-lizard-spider|flow-ninety-pigeon|flow-ninety-shinbox|flow-pigeon-child|flow-pigeon-lizard|flow-spider-halfsplit|flow-spider-lowlunge|flow-squat-butterfly|flow-squat-fold|flow-squat-frog|flow-squat-spider|flow-thread-frog|flow3-bear-child-catcamel|flow3-bear-child-cobra|flow3-bear-child-frog|flow3-bear-child-pigeon|flow3-bear-child-thread|flow3-bear-dog-child|flow3-bear-dog-cobra|flow3-bear-dog-fold|flow3-bear-dog-halfsplit|flow3-bear-dog-lizard|flow3-bear-dog-pigeon|flow3-bear-dog-spider|flow3-butterfly-frog-catcamel|flow3-butterfly-frog-child|flow3-butterfly-frog-thread|flow3-butterfly-ninety-kneel|flow3-butterfly-ninety-pigeon|flow3-butterfly-ninety-shinbox|flow3-butterfly-squat-fold|flow3-butterfly-squat-frog|flow3-butterfly-squat-spider|flow3-catcamel-child-cobra|flow3-catcamel-child-dog|flow3-catcamel-child-pigeon|flow3-catcamel-child-thread|flow3-catcamel-frog-child|flow3-catcamel-frog-squat|flow3-catcamel-frog-thread|flow3-child-dog-cobra|flow3-child-dog-fold|flow3-child-dog-halfsplit|flow3-child-dog-lizard|flow3-child-dog-pigeon|flow3-child-dog-spider|flow3-child-frog-squat|flow3-child-frog-thread|flow3-child-pigeon-lizard|flow3-child-pigeon-ninety|flow3-cobra-child-frog|flow3-cobra-child-pigeon|flow3-cobra-child-thread|flow3-cobra-dog-fold|flow3-cobra-dog-halfsplit|flow3-cobra-dog-lizard|flow3-cobra-dog-pigeon|flow3-cobra-dog-spider|flow3-couch-halfsplit-dog|flow3-couch-halfsplit-kneel|flow3-couch-halfsplit-lizard|flow3-couch-halfsplit-lowlunge|flow3-couch-halfsplit-spider|flow3-couch-kneel-ninety|flow3-couch-lowlunge-kneel|flow3-couch-lowlunge-spider|flow3-dog-child-frog|flow3-dog-child-thread|flow3-dog-fold-squat|flow3-dog-halfsplit-kneel|flow3-dog-halfsplit-lowlunge|flow3-dog-pigeon-ninety|flow3-dog-spider-halfsplit|flow3-dog-spider-lizard|flow3-dog-spider-lowlunge|flow3-dog-spider-squat|flow3-fold-dog-halfsplit|flow3-fold-dog-lizard|flow3-fold-dog-pigeon|flow3-fold-dog-spider|flow3-fold-squat-frog|flow3-fold-squat-spider|flow3-frog-butterfly-ninety|flow3-frog-child-pigeon|flow3-frog-squat-spider|flow3-halfsplit-dog-lizard|flow3-halfsplit-dog-pigeon|flow3-halfsplit-kneel-ninety|flow3-halfsplit-lizard-pigeon|flow3-halfsplit-spider-lizard|flow3-halfsplit-spider-lowlunge|flow3-halfsplit-spider-squat|flow3-kneel-halfsplit-lizard|flow3-kneel-halfsplit-lowlunge|flow3-kneel-halfsplit-spider|flow3-kneel-lowlunge-spider|flow3-kneel-ninety-pigeon|flow3-kneel-ninety-shinbox|flow3-lizard-dog-pigeon|flow3-lizard-halfsplit-lowlunge|flow3-lizard-pigeon-ninety|flow3-lizard-spider-lowlunge|flow3-lizard-spider-squat|flow3-lowlunge-kneel-ninety|flow3-lowlunge-spider-squat|flow3-ninety-butterfly-squat|flow3-pigeon-child-thread|flow3-pigeon-dog-spider|flow3-pigeon-lizard-spider|flow3-pigeon-ninety-shinbox|flow3-squat-frog-thread)$/ },
  { clip: 'ex_cut', families: ['agility-patterns'], bases: /^(arrowhead|arrowhead-dribble|hourglass|hourglass-dribble|lane|lane-dribble|n-drill|n-drill-dribble|square|square-dribble|star|star-dribble|triangle|triangle-dribble|w-drill|w-drill-dribble|x-drill|x-drill-dribble|y-drill|y-drill-dribble|z-drill|z-drill-dribble)$/ },
  { clip: 'ex_cut', families: ['change-of-direction'], bases: /^(5-10-5)$/ },
  { clip: 'ex_cut', families: ['court-conditioning'], bases: /^(shuttle-pyramid)$/ },
  { clip: 'ex_cut', families: ['curve-run'], bases: /^(circle-shuffle|curve|figure-8)$/ },
  { clip: 'ex_cut', families: ['cut-matrix'], bases: /^(180-backpedal|180-dribble|180-shuffle|180-sprint|45-backpedal|45-dribble|45-shuffle|45-sprint|90-backpedal|90-dribble|90-shuffle|90-sprint|crossover-backpedal|crossover-dribble|crossover-shuffle|crossover-sprint|jump-stop-backpedal|jump-stop-dribble|jump-stop-shuffle|jump-stop-sprint|side-step-backpedal|side-step-dribble|side-step-shuffle|side-step-sprint|speed-turn-backpedal|speed-turn-dribble|speed-turn-shuffle|speed-turn-sprint)$/ },
  { clip: 'ex_cut', families: ['decel-2'], bases: /^(into-cut)$/ },
  { clip: 'ex_cut', families: ['football-footwork'], bases: /^(backpedal-weave|ball-security|break-45|break-90|comeback|hand-fight|hip-turn|hurdle-shuffle|kick-step|mirror-rush|out-route|pedal-drive|rb-cut|release|slant|speed-out|zone-drop)$/ },
  { clip: 'ex_cut', families: ['net-footwork'], bases: /^(split-step)$/ },
  { clip: 'ex_cut', families: ['racket-footwork'], bases: /^(approach-split|baseline-shuffle|closed-stance|cross-recovery|inside-out|net-approach|open-stance|overhead|serve-first|shadow-bh|shadow-fh|shadow-volley|short-ball|shuffle-centre|spider|split-first|two-ball-feed|wide-slide)$/ },
  { clip: 'ex_cut', families: ['soccer-ball-skills'], bases: /^(in-out-cut|in-out-cut-move|inside-cut|inside-cut-move|outside-cut|outside-cut-move)$/ },
  { clip: 'ex_cut', families: ['sprint-conditioning'], bases: /^(30-30|court-17|lines)$/ },
  { clip: 'ex_cut', families: ['sprint-development'], bases: /^(pro-dribble)$/ },
  { clip: 'ex_stretch_hold', families: ['dynamic-warmup'], bases: /^(iron-cross-stretch|world-greatest-stretch)$/ },
  { clip: 'ex_stretch_hold', families: ['loaded-mobility'], bases: /^(arm-bar|band-hip|band-shoulder|dowel-ohs|goblet-reach|straddle-weight)$/ },
  { clip: 'ex_stretch_hold', families: ['posterior-chain-mobility'], bases: /^(fold|heel-up|jefferson|strap)$/ },
  { clip: 'ex_stretch_hold', families: ['recovery-mobility'], bases: /^(child-side|figure-4|happy-baby|twist)$/ },
  { clip: 'ex_stretch_hold', families: ['shoulder-mobility'], bases: /^(bench-lat|doorway|pass-through|scorpion|spinal-wave|tall-kneel-rotation)$/ },
  { clip: 'ex_stretch_hold', families: ['stretch-hamstring'], bases: /^(90-90-hamstr|chair-leg-extend-stretch|hamstr-stretch|intermediat-groin-stretch|leg-up-hamstr-stretch|lying-hamstr|runner-stretch|seat-floor-hamstr-stretch|seat-hamstr|seat-hamstr-calf-stretch|split-squat-stretch|stand-hamstr-calf-stretch|straddl|upper-back-leg-grab)$/ },
  { clip: 'ex_stretch_hold', families: ['stretch-matrix'], bases: /^(add-kneel|add-side|add-straddle|calf-dog|calf-standing-step|calf-step-straight|calf-straight|chest-angel|chest-corner|chest-straight|glute-seated|glute-standing|ham-across|ham-box|ham-doorway|ham-halfsplit|ham-seated|ham-sweep|hf-bench|hf-reach|hf-side|hf-standing|lat-ball|lat-door|pigeon-bench|quad-prone|quad-rock|quad-side|seated-twist|shin-kneel|toe-kneel|tspine-dowel|tspine-roller|tspine-windmill|wrist-ext|wrist-flex)$/ },
  { clip: 'ex_stretch_hold', families: ['stretch-upper'], bases: /^(behind-head-chest-stretch|cat-stretch|chair-lower-back-stretch|chair-upper-body-stretch|chest-front-shoulder-stretch|chest-stretch-stability-ball|child-pos|chin-chest-stretch|dancer-stretch|dynamic-back-stretch|dynamic-chest-stretch|elbow-back|hug-ball|hug-kne-chest|kneel-forearm-stretch|middl-back-stretch|overhead-lat|overhead-stretch|overhead-tricep|pelvic-tilt-bridg|pyramid|round-world-shoulder-stretch|seat-bicep|seat-front-deltoid|seat-overhead-stretch|shoulder-rais|shoulder-stretch|sid-lying-floor-stretch|sid-neck-stretch|sid-wrist-pull|singl-arm-against-wall|singl-hand-hang|spinal-stretch|stand-bicep-stretch|stand-lateral-stretch|stand-pelvic-tilt|tricep-sid-stretch|tricep-stretch|upper-back-stretch|upward-stretch)$/ },
  { clip: 'ex_pushup_variants', families: ['isometric-hold'], bases: /^(push-up-bottom)$/ },
  { clip: 'ex_pushup_variants', families: ['push-extra'], bases: /^(ring|spiderman|staggered|t-push-up)$/ },
  { clip: 'ex_pushup_variants', families: ['push-up'], bases: /^(archer|clock-push-up|declin-push-up|eccentric|feet-up|hand-release|handstand-push-ups|inclin-push-up|inclin-push-up-clos-grip|inclin-push-up-medium|inclin-push-up-revers-grip|inclin-push-up-wid|plyometric-push-up|push-up-sid-plank|push-ups-feet-ball|push-ups-feet-elevat|singl-arm-push-up|suspend-push-up|wall)$/ },
  { clip: 'ex_pushup_variants', families: ['upper-body-power'], bases: /^(incline|kneeling|mb-drop|plates)$/ },
  { clip: 'ex_sprint_start', families: ['acceleration'], bases: /^(band|build-up|falling|flying|half-kneel|hill|push-up|sled|three-point|two-point)$/ },
  { clip: 'ex_sprint_start', families: ['football-footwork'], bases: /^(get-off|stance-10)$/ },
  { clip: 'ex_sprint_start', families: ['sprint-drill'], bases: /^(linear-3-part-start-techniqu)$/ },
  { clip: 'ex_sprint_start', families: ['sprint-starts'], bases: /^(backpedal-go-10|backpedal-go-20|backpedal-go-5|backpedal-go-band|falling-start-20|falling-start-5|half-kneeling-start-sprint-20|half-kneeling-start-sprint-5|pogo-go-10|pogo-go-20|pogo-go-5|pogo-go-band|prone-10|prone-20|prone-5|prone-band|push-up-start-sprint-20|push-up-start-sprint-5|seated-10|seated-20|seated-5|seated-band|shuffle-go-10|shuffle-go-20|shuffle-go-5|shuffle-go-band|side-on-10|side-on-20|side-on-5|side-on-band|split-10|split-20|split-5|split-band|supine-10|supine-20|supine-5|supine-band|three-point-start-sprint-20|three-point-start-sprint-5|toss-go-10|toss-go-20|toss-go-5|toss-go-band|turn-10|turn-20|turn-5|turn-band|two-point-start-sprint-20|two-point-start-sprint-5)$/ },
  { clip: 'ex_raise_overhead', families: ['raise'], bases: /^(alternat-deltoid-rais|cuban-press|front-inclin-rais|inclin-shoulder-rais|power-partial|rais|scaption|sid-lateral-front-rais|singl-rais|smith-inclin-shoulder-rais|stand-front-rais-over-head|stand-low-pulley-deltoid-rais|stand-straight-arm-front-shoulder-rais-abov-head|straight-rais-inclin-bench)$/ },
  { clip: 'ex_curl_supported', families: ['curl'], bases: /^(concentration-curl|preacher-curl|preacher-hammer-curl|pron-inclin-curl|revers-preacher-curl|seat-clos-grip-concentration-curl|singl-arm-preacher-curl|spider-curl|stand-concentration-curl|two-arm-preacher-curl|zottman-preacher-curl)$/ },
  { clip: 'ex_sprint_drill', families: ['basketball-warmup'], bases: /^(jog-back|skip-distance|skip-height|skip-lateral)$/ },
  { clip: 'ex_sprint_drill', families: ['dynamic-warmup-2'], bases: /^(skip-circles)$/ },
  { clip: 'ex_sprint_drill', families: ['ladder-2'], bases: /^(carioca)$/ },
  { clip: 'ex_sprint_drill', families: ['lateral-movement'], bases: /^(carioca)$/ },
  { clip: 'ex_sprint_drill', families: ['shuffle-backpedal-2'], bases: /^(carioca-high|carioca-sprint)$/ },
  { clip: 'ex_sprint_drill', families: ['skip-builds'], bases: /^(skip-back|skip-cross|skip-lat)$/ },
  { clip: 'ex_sprint_drill', families: ['sprint-development'], bases: /^(a-skip-sl|arm-seated|arm-standing|band-5|band-crossover|chase|escape|fast-leg|hill-20|hill-40|hurdle-a-run|hurdle-high-knee|hurdle-lat-run|l-dribble|skip-sprint|sled-20|sled-march|stairs|straight-leg-run|towel-sprint|wall-double|wall-single|wall-triple|wicket|wicket-accel|wicket-top)$/ },
  { clip: 'ex_sprint_drill', families: ['sprint-drill'], bases: /^(bench-sprint|carioca-quick-step|doubl-leg-glut-kick|fast-skip|kneel-arm|linear-acceleration-wall|lung-sprint|mov-claw-sery|sid-hop-sprint|singl-con-sprint|singl-leg-glut-kick)$/ },
  { clip: 'ex_sprint_drill', families: ['sprint-mechanics'], bases: /^(a-skip|b-skip|butt-kicks)$/ },
  { clip: 'ex_olympic_lift', families: ['clean'], bases: /^(clean|clean-block|clean-deadlift|clean-jerk|clean-press|clean-pull|clean-shrug|hang-clean|hang-clean-below-kne|power-clean|power-clean-block|rack-delivery|smith-hang-power-clean|split-clean)$/ },
  { clip: 'ex_olympic_lift', families: ['jerk-press'], bases: /^(jerk-balanc|power-jerk|push-press|push-press-behind-neck|split-jerk|squat-jerk)$/ },
  { clip: 'ex_olympic_lift', families: ['kb-clean-snatch'], bases: /^(alternat-hang-clean|bottom-up-clean-hang-position|dead-clean|doubl-alternat-hang-clean|doubl-jerk|doubl-push-press|doubl-snatch|hang-clean|open-palm-clean|singl-arm-clean|singl-arm-clean-jerk|singl-arm-jerk|singl-arm-open-palm-clean|singl-arm-push-press|singl-arm-snatch|singl-arm-split-jerk|singl-arm-split-snatch|sumo-high-pull|thruster|two-arm-clean|two-arm-jerk)$/ },
  { clip: 'ex_olympic_lift', families: ['snatch'], bases: /^(hang-snatch|hang-snatch-below-kne|heav-snatch-balanc|muscl-snatch|power-snatch|power-snatch-block|snatch|snatch-balanc|snatch-block|snatch-deadlift|snatch-pull|snatch-shrug|split-snatch)$/ },
  // ── FITNESS-TPOSE batchB2 (2026-10-26): new authored loops (exerciseBatch*.ts); rows from the loop plan's family/base assignment ──
  { clip: 'ex_pallof', families: ['anti-rotation'], bases: /^(half-kneel|split|standing|tall-kneel|walkout)$/ },
  { clip: 'ex_pallof', families: ['pallof-matrix'], bases: /^(band-hold-half-kneeling|band-hold-lateral-lunge|band-hold-single-leg|band-hold-split|band-hold-standing|band-hold-tall-kneeling|band-overhead-half-kneeling|band-overhead-lateral-lunge|band-overhead-single-leg|band-overhead-split|band-overhead-standing|band-overhead-tall-kneeling|band-press-half-kneeling|band-press-lateral-lunge|band-press-single-leg|band-press-standing|band-press-tall-kneeling|band-rotate-out-half-kneeling|band-rotate-out-lateral-lunge|band-rotate-out-single-leg|band-rotate-out-split|band-rotate-out-standing|band-rotate-out-tall-kneeling|cable-hold-half-kneeling|cable-hold-lateral-lunge|cable-hold-single-leg|cable-hold-split|cable-hold-standing|cable-hold-tall-kneeling|cable-overhead-half-kneeling|cable-overhead-lateral-lunge|cable-overhead-single-leg|cable-overhead-split|cable-overhead-standing|cable-overhead-tall-kneeling|cable-press-half-kneeling|cable-press-lateral-lunge|cable-press-single-leg|cable-press-split|cable-press-standing|cable-press-tall-kneeling|cable-rotate-out-half-kneeling|cable-rotate-out-lateral-lunge|cable-rotate-out-single-leg|cable-rotate-out-split|cable-rotate-out-standing|cable-rotate-out-tall-kneeling)$/ },
  { clip: 'ex_pallof', families: ['plank'], bases: /^(pallof-press)$/ },
  { clip: 'ex_iso_capacity', families: ['hip-capacity'], bases: /^(abd-hold|abd-standing|add-standing|band-walk-low|bridge-push|flex-march|monster-back|quad-ext)$/ },
  { clip: 'ex_iso_capacity', families: ['isometric-capacity'], bases: /^(add-side-hold|ankle-in-hold|ankle-out-hold|bridge-sl-hold|calf-bent-hold|calf-step-hold|chin-floor|ham-dig-bent|ham-dig-long|prone-y-hold|scap-hold|split-hover|split-knee-fwd|squeeze-bent|squeeze-bridge|squeeze-long|tib-hold|wall-sit-lift|wrist-rock)$/ },
  { clip: 'ex_iso_capacity', families: ['knee-capacity'], bases: /^(back-walk|fwd-high|heel-goblet-hold|lat-hold|retro|reverse-nordic|reverse-nordic-short|seated-ext|sissy|slant|slant-hold|slant-sl|spanish-deep|spanish-half|spanish-quarter|split-deep|split-half|split-iso|split-quarter|tke|tke-sl|wall-shallow|wall-sit-deep|wall-sit-half|wall-sit-quarter|wall-sl)$/ },
  { clip: 'ex_lunge_lateral', families: ['curve-run'], bases: /^(band-lateral-sprint)$/ },
  { clip: 'ex_lunge_lateral', families: ['db-lower'], bases: /^(cossack|lateral-lunge)$/ },
  { clip: 'ex_lunge_lateral', families: ['dynamic-flow'], bases: /^(lateral-walk)$/ },
  { clip: 'ex_lunge_lateral', families: ['dynamic-warmup-2'], bases: /^(lat-lunge-reach|lat-squat-walk)$/ },
  { clip: 'ex_lunge_lateral', families: ['kb-lower'], bases: /^(goblet-lateral-squat)$/ },
  { clip: 'ex_lunge_lateral', families: ['landmine-lower'], bases: /^(lateral-lunge)$/ },
  { clip: 'ex_lunge_lateral', families: ['loaded-mobility'], bases: /^(slider-lateral)$/ },
  { clip: 'ex_lunge_lateral', families: ['lunge'], bases: /^(cossack|lateral-bw|lateral-goblet|sid-split-squat)$/ },
  { clip: 'ex_lunge_lateral', families: ['mobility-flow'], bases: /^(flow-squat-cossack|flow3-butterfly-squat-cossack|flow3-cossack-squat-fold|flow3-cossack-squat-frog|flow3-cossack-squat-spider)$/ },
  { clip: 'ex_lunge_lateral', families: ['stretch-matrix'], bases: /^(add-sidelunge)$/ },
  { clip: 'ex_press_alt', families: ['db-upper'], bases: /^(rotating-press)$/ },
  { clip: 'ex_press_alt', families: ['overhead-press'], bases: /^(alternat-press|alternat-shoulder-press|arnold-press|bent-press|bradford-rocky-press|db-hk|landmin-linear-jammer|landmine|landmine-hk|see-saw-press-alternat-sid-press|seesaw-press|singl-arm-linear-jammer|stand-alternat-press|stand-bradford-press)$/ },
  { clip: 'ex_press_alt', families: ['standing-cable'], bases: /^(band-press|band-row|press|row)$/ },
  { clip: 'ex_machine_cardio', families: ['cardio'], bases: /^(air-bik|battl-rop|bicycl|bicycl-stationary|elliptical-trainer|recumbent-bik|row-stationary|skat|stairmaster|step-mill|trail-run-walk)$/ },
  { clip: 'ex_machine_cardio', families: ['conditioning-intervals'], bases: /^(bike-10-20|bike-15-15|bike-20-40|bike-3-min|bike-30-30|bike-4-min|bike-60-60|bike-pyramid|court-10-20|court-15-15|court-20-40|court-30-30|court-60-60|rope-15-15|rope-20-10|rope-30-30|rope-60-60|rower-10-20|rower-15-15|rower-20-40|rower-3-min|rower-30-30|rower-4-min|rower-60-60|rower-pyramid|slide-15-15|slide-20-40|slide-30-30|stairs-30-30|stairs-60-60)$/ },
  { clip: 'ex_machine_cardio', families: ['machine-intervals'], bases: /^(bike-sprint|bike-tempo|row|row-steady)$/ },
  { clip: 'ex_curl_incline', families: ['curl'], bases: /^(alternat-inclin-curl|curl-lying-against-inclin|flexor-inclin-curl|inclin-curl|inclin-hammer-curl|inclin-inner-bicep-curl|lying-supin-curl|stand-singl-arm-curl-over-inclin-bench)$/ },
  { clip: 'ex_pulldown', families: ['pulldown'], bases: /^(clos-grip-front-lat-pulldown|full-rang-motion-lat-pulldown|rocky-pull-ups-pulldown|singl-arm-lat-pulldown|underhand-pulldown|v-bar-pulldown|wid-grip-lat-pulldown|wid-grip-pulldown-behind-neck)$/ },
  { clip: 'ex_pulldown', families: ['vertical-pull'], bases: /^(band-pulldown|pulldown|pulldown-hk)$/ },
  { clip: 'ex_pullup', families: ['pull-extra'], bases: /^(towel|towel-hang)$/ },
  { clip: 'ex_pullup', families: ['pull-hold'], bases: /^(flexed-arm|halfway)$/ },
  { clip: 'ex_pullup', families: ['pull-up'], bases: /^(assist-pull-up|chin-up|gironda-sternum-chin|kip-muscl-up|lying-clos-grip-tricep-press-chin|mix-grip-chin|muscl-up|otis-up|pull-up|scapular-pull-up|sid-sid-chin|singl-arm-chin-up|v-bar-pull-up|wid-grip-rear-pull-up)$/ },
  { clip: 'ex_pullup', families: ['vertical-pull'], bases: /^(active-hang|dead-hang|eccentric|weighted)$/ },
  { clip: 'ex_triceps_lying', families: ['triceps'], bases: /^(declin-clos-grip-bench-skull-crusher|declin-ez-bar-tricep-extension|declin-tricep-extension|inclin-tricep-extension|jm-press|lying-clos-grip-tricep-extension-behind-head|revers-tricep-bench-press|tat-press)$/ },
  { clip: 'ex_bench_variants', families: ['bench-press'], bases: /^(alternat-floor-press|board-press|chain-press|clos-grip-ez-bar-press|clos-grip-press|declin-bench-press|declin-smith-press|extend-rang-singl-arm-floor-press|floor-press-chain|guillotin-bench-press|leg-over-floor-press|leverag-chest-press|leverag-declin-chest-press|leverag-inclin-chest-press|paused|pin-press|revers-bench-press|singl-arm-bench-press|singl-arm-floor-press|smith-bench-press|smith-clos-grip-bench-press|smith-inclin-bench-press|wid-grip-declin-bench-press)$/ },
  // ── FITNESS-TPOSE batchB3 (2026-10-26): new authored loops (exerciseBatch*.ts); rows from the loop plan's family/base assignment ──
  { clip: 'ex_ladder', families: ['ladder'], bases: /^(crossover-shuffle|hopscotch|in-out|lateral-two-in|one-in|two-in)$/ },
  { clip: 'ex_ladder', families: ['ladder-2'], bases: /^(backward|crossover-steps|in-in-out|lat-one-in|lat-two-foot|scissors|sl-lat|slalom|straddle|to-sprint|two-foot-hops|two-in-two-out|zigzag-hops)$/ },
  { clip: 'ex_row_chest_supported', families: ['row'], bases: /^(db-chest|inclin-bench-pull|inclin-row|lying-camber-row|lying-t-bar-row|straight-bar-bench-mid-row)$/ },
  { clip: 'ex_lateral_raise_bent', families: ['raise'], bases: /^(bent-over-low-pulley-sid-lateral|bent-over-rear-shoulder-rais-head-bench|crucifix|lying-rear-lateral-rais|lying-rear-shoulder-rais|lying-singl-arm-rear-lateral-rais|seat-bent-over-rear-shoulder-rais)$/ },
  { clip: 'ex_lateral_raise_bent', families: ['rear-delt-face-pull'], bases: /^(back-fly|rear-shoulder-fly|rear-shoulder-row|revers-fly|revers-fly-external-rotation|sled-revers-fly)$/ },
  { clip: 'ex_triceps_single_overhead', families: ['triceps'], bases: /^(chain-handl-extension|kneel-tricep-extension|low-tricep-extension|seat-bent-over-singl-arm-tricep-extension|singl-arm-pronat-tricep-extension|singl-arm-supinat-tricep-extension|singl-arm-tricep-extension|sled-overhead-tricep-extension|spe-overhead-tricep|stand-bent-over-singl-arm-tricep-extension|stand-low-pulley-singl-arm-tricep-extension|stand-singl-arm-tricep-extension|tricep-extension|tricep-extension-pronat-grip)$/ },
  { clip: 'ex_crunch_variants', families: ['flexion'], bases: /^(3-4-sit-up|alternat-heel-toucher|ball-crunch|cocoon|cross-body-crunch|crunch-hand-overhead|crunch-leg-ball|declin-crunch|declin-obliqu-crunch|declin-revers-crunch|elbow-kne|frog-sit-ups|gorilla-chin-crunch|jackknif-sit-up|janda-sit-up|obliqu-crunch|obliqu-crunch-floor|press-sit-up|revers-crunch|rop-crunch|seat-crunch|seat-leg-tuck|sid-jackknif|sit-up|stand-rop-crunch|suspend-revers-crunch|toe-toucher|tuck-crunch|weight-crunch|weight-sit-ups)$/ },
  { clip: 'ex_plank_reach', families: ['plank'], bases: /^(bear-hold|body-saw|incline|long-lever|reach|shoulder-tap)$/ },
  { clip: 'ex_plank_reach', families: ['plank-matrix'], bases: /^(bear-arm-reach|bear-band-row|bear-knee-elbow|bear-leg-lift|bear-partner-push|bear-plate-drag|forearm-arm-reach|forearm-knee-elbow|forearm-leg-lift|forearm-partner-push|high-arm-reach|high-band-row|high-knee-elbow|high-leg-lift|high-partner-push|high-plate-drag|long-lever-arm-reach|long-lever-knee-elbow|long-lever-leg-lift|long-lever-partner-push|reverse-leg-lift|reverse-partner-push|side-arm-reach|side-leg-lift|side-partner-push)$/ },
  { clip: 'ex_row_inverted', families: ['pull-extra'], bases: /^(strap-face-pull|strap-row)$/ },
  { clip: 'ex_row_inverted', families: ['row'], bases: /^(bodyweight-mid-row|invert-row|invert-row-strap|inverted-feet-up|inverted-high|suspend-row)$/ },
  { clip: 'ex_throw_rotational', families: ['med-ball-throw-matrix'], bases: /^(rot-overhead-half-kneeling|rot-overhead-single-leg|rot-overhead-split|rot-overhead-standing|rot-overhead-step-in|rot-overhead-tall-kneeling|scoop-half-kneeling|scoop-single-leg|scoop-split|scoop-standing|scoop-step-in|scoop-tall-kneeling|shot-put-half-kneeling|shot-put-single-leg|shot-put-split|shot-put-standing|shot-put-step-in|shot-put-tall-kneeling|side-toss-half-kneeling|side-toss-single-leg|side-toss-split|side-toss-standing|side-toss-step-in|side-toss-tall-kneeling)$/ },
  { clip: 'ex_throw_rotational', families: ['partner-throw'], bases: /^(rotational)$/ },
  { clip: 'ex_throw_rotational', families: ['rotational-power'], bases: /^(hk|scoop|shot-put|step-behind)$/ },
  { clip: 'ex_dip', families: ['dip'], bases: /^(band|bench-bent|bench-dip|body-tricep-press|body-up|dip|dip-chest|dip-tricep|eccentric|parallel-bar-dip|ring-dip|support|weight-bench-dip|weighted)$/ },
  { clip: 'ex_dip', families: ['jerk-press'], bases: /^(jerk-dip-squat)$/ },
  { clip: 'ex_dip', families: ['rollout-matrix'], bases: /^(side-dip)$/ },
  { clip: 'ex_sl_rdl', families: ['hip-capacity'], bases: /^(airplane-cone|airplane-sup)$/ },
  { clip: 'ex_sl_rdl', families: ['single-leg-hinge'], bases: /^(airplane|bw|db|kb|kickstand-db|landmine|supported)$/ },
  // ── FITNESS-TPOSE batchB4 (2026-10-26): new authored loops (exerciseBatch*.ts); rows from the loop plan's family/base assignment ──
  { clip: 'ex_hip_thrust', families: ['bridge'], bases: /^(feet-up|thrust-db)$/ },
  { clip: 'ex_hip_thrust', families: ['bridge-thrust'], bases: /^(glut-lift-bridg|glut-ups|hip-thrust|london-bridg|physioball-hip-bridg|smith-hip-rais)$/ },
  { clip: 'ex_hip_thrust', families: ['hamstring-iso'], bases: /^(bench-hold|long-lever|strap-hinge)$/ },
  { clip: 'ex_row_single', families: ['db-upper'], bases: /^(renegade)$/ },
  { clip: 'ex_row_single', families: ['row'], bases: /^(alternat-renegad-row|alternat-row|bent-over-singl-arm-long-bar-row|kb-gorilla|kneel-singl-arm-high-pulley-row|seat-singl-arm-pulley-row|singl-arm-long-bar-row|singl-arm-row)$/ },
  { clip: 'ex_cable_crossover', families: ['fly'], bases: /^(bodyweight-fly|butterfly|cross-over|crossover|declin-fly|inclin-fly-twist|iron-cross|low-crossover|singl-arm-crossover|singl-arm-flat-bench-fly)$/ },
  { clip: 'ex_good_morning_var', families: ['db-hinge'], bases: /^(staggered-rdl)$/ },
  { clip: 'ex_good_morning_var', families: ['deadlift'], bases: /^(car-deadlift|deadlift-chain|leverag-deadlift|pull-through|revers-deadlift|revers-sumo-deadlift|rickshaw-deadlift|singl-arm-sid-deadlift|sumo-deadlift|sumo-deadlift-chain)$/ },
  { clip: 'ex_good_morning_var', families: ['good-morning'], bases: /^(hang-bar-morn|jefferson-squat|morn-pull-through|seat-morn)$/ },
  { clip: 'ex_good_morning_var', families: ['hinge-pattern'], bases: /^(dowel|wall-tap)$/ },
  { clip: 'ex_dynamic_warmup', families: ['dynamic-warmup'], bases: /^(balanc-board|crossover-revers-lung|downward-fac-balanc|elbow-circl|frog-hop|front-leg-rais|groiner|kne-circl|rear-leg-rais|shoulder-circl|sid-leg-rais|spider-crawl|stand-toe-touch|torso-rotation|windmill|wrist-circl)$/ },
  { clip: 'ex_dynamic_warmup', families: ['dynamic-warmup-2'], bases: /^(hinge-reach|hug-lunge|kick-walk|quad-hinge|torso-turns)$/ },
  { clip: 'ex_dynamic_warmup', families: ['joint-circles'], bases: /^(neck|shoulder-side|thoracic-seated|wrist)$/ },
  { clip: 'ex_squat_var', families: ['goblet-cossack-flow'], bases: /^(goblet-pry|hold|pry|supported)$/ },
  { clip: 'ex_squat_var', families: ['landmine-lower'], bases: /^(squat-press)$/ },
  { clip: 'ex_squat_var', families: ['sandbag'], bases: /^(ground-shoulder|shoulder-carry|zercher-squat)$/ },
  { clip: 'ex_squat_var', families: ['spanish-squat'], bases: /^(iso|reps)$/ },
  { clip: 'ex_squat_var', families: ['squat'], bases: /^(box-squat-chain|chair-squat|frankenstein-squat|kneel-squat|overhead-squat|revers-box-squat|revers-power-squat|singl-arm-overhead-squat|spe-box-squat|spe-squat|squat-plat-mover|wall-sit|zercher-squat)$/ },
  { clip: 'ex_rotator_cuff', families: ['isometric-capacity'], bases: /^(door-er|door-ir|prone-er|side-ir|wall-er-raised)$/ },
  { clip: 'ex_rotator_cuff', families: ['rotator'], bases: /^(external-rotation|internal-rotation)$/ },
  { clip: 'ex_rotator_cuff', families: ['shoulder-care'], bases: /^(er-90|er-side-lying)$/ },
  { clip: 'ex_rotator_cuff', families: ['shoulder-rotation'], bases: /^(cable-er-90-standing|cable-er-side|cable-ir-90-standing|cable-ir-side|er-90-kneeling|er-90-standing|er-side|er-split|ir-90-kneeling|ir-90-standing|ir-side|ir-split)$/ },
  { clip: 'ex_leg_curl_slider', families: ['hamstring-curl'], bases: /^(ball|nordic|nordic-band|nordic-eccentric|slider|slider-sl)$/ },
  { clip: 'ex_leg_curl_slider', families: ['leg-curl'], bases: /^(ball-leg-curl|platform-hamstr-slid)$/ },
  { clip: 'ex_grip_wrist', families: ['grip'], bases: /^(finger-curl|lying-pronation|lying-supination|palm-down-wrist-curl-over-bench|palm-up-wrist-curl-over-bench|plat-pinch|revers-plat-curl|seat-palm-down-wrist-curl|seat-palm-up-wrist-curl|seat-singl-arm-palm-down-wrist-curl|seat-singl-arm-palm-up-wrist-curl|seat-two-arm-palm-up-low-pulley-wrist-curl|stand-olympic-plat-hand-squeez|stand-palm-up-behind-back-wrist-curl|wrist-curl|wrist-roller)$/ },
  { clip: 'ex_grip_wrist', families: ['wrist-care'], bases: /^(db-turns|rocks)$/ },
  { clip: 'ex_step_up', families: ['flexion'], bases: /^(step-up-kne-rais)$/ },
  { clip: 'ex_step_up', families: ['step-up'], bases: /^(bb|bw|crossover|db|knee-drive|lateral-bw|lateral-db|low-bw|power-stair|reverse|step-ups)$/ },
  // ── FITNESS-TPOSE batchB5 (2026-10-26): new authored loops (exerciseBatch*.ts); rows from the loop plan's family/base assignment ──
  { clip: 'ex_row_seated_cable', families: ['row'], bases: /^(band|elevat-row|kneel-high-pulley-row|low-pulley-row-neck|seat-row|sled-row)$/ },
  { clip: 'ex_carry_strongman', families: ['carry'], bases: /^(bottoms-up|overhead|rack|rack-single|rickshaw-carry|sandbag|sled-overhead-backward-walk|yok-walk)$/ },
  { clip: 'ex_carry_strongman', families: ['grip-hold'], bases: /^(db-end|farmer-hold|horn|towel)$/ },
  { clip: 'ex_carry_strongman', families: ['loaded-conditioning'], bases: /^(farmer-int|sandbag-int)$/ },
  { clip: 'ex_carry_strongman', families: ['march'], bases: /^(band|overhead|rack|suitcase)$/ },
  { clip: 'ex_jump_rope_variants', families: ['jump-rope-2'], bases: /^(boxer|criss-cross|crossover-step|fwd-back|heel-toe|running|scissor|ski|sl-side|turns|wide-narrow)$/ },
  { clip: 'ex_throw_overhead', families: ['loaded-conditioning'], bases: /^(slam-int)$/ },
  { clip: 'ex_throw_overhead', families: ['med-ball-power'], bases: /^(slam)$/ },
  { clip: 'ex_throw_overhead', families: ['med-ball-throw-matrix'], bases: /^(overhead-half-kneeling|overhead-single-leg|overhead-split|overhead-standing|overhead-step-in|overhead-tall-kneeling)$/ },
  { clip: 'ex_throw_overhead', families: ['partner-throw'], bases: /^(kneeling-overhead|overhead|slam-catch)$/ },
  { clip: 'ex_throw_overhead', families: ['throw'], bases: /^(catch-overhead-throw|overhead-slam|singl-arm-medicin-ball-slam|stand-two-arm-overhead-throw|supin-singl-arm-overhead-throw|supin-two-arm-overhead-throw)$/ },
  { clip: 'ex_leg_press', families: ['calf-raise'], bases: /^(calf-press-leg-press)$/ },
  { clip: 'ex_leg_press', families: ['leg-extension'], bases: /^(leg-extension|singl-leg-leg-extension)$/ },
  { clip: 'ex_leg_press', families: ['leg-press-hack'], bases: /^(hack-squat|leg-press|narrow-stanc-hack-squat|narrow-stanc-leg-press|smith-leg-press)$/ },
  { clip: 'ex_straight_arm_pulldown', families: ['pull-extra'], bases: /^(band-straight-arm)$/ },
  { clip: 'ex_straight_arm_pulldown', families: ['pulldown'], bases: /^(rop-straight-arm-pulldown|straight-arm-pulldown)$/ },
  { clip: 'ex_leg_raise', families: ['flexion'], bases: /^(ball-pull|bent-kne-hip-rais|bottom-up|flat-bench-leg-pull|flat-bench-lying-leg-rais|flutter-kick|hang-leg-rais|hang-pik|kne-hip-rais-parallel-bar|leg-lift|leg-pull|scissor-kick|seat-flat-bench-leg-pull)$/ },
  { clip: 'ex_leg_raise', families: ['trunk-flexion'], bases: /^(hanging-knee|hanging-toes)$/ },
  { clip: 'ex_side_plank', families: ['hip-capacity'], bases: /^(cph-foot|cph-knee|cph-lift|cph-raise-foot|cph-raise-knee|sp-clam)$/ },
  { clip: 'ex_side_plank', families: ['isometric-capacity'], bases: /^(side-top-hold)$/ },
  { clip: 'ex_side_plank', families: ['plank'], bases: /^(sid-bridg)$/ },
  { clip: 'ex_side_plank', families: ['rollout-matrix'], bases: /^(side-reach)$/ },
  { clip: 'ex_side_plank', families: ['side-plank'], bases: /^(copenhagen-long|copenhagen-short|full|leg-raise|row|short)$/ },
  { clip: 'ex_sled_push', families: ['carry'], bases: /^(backward-drag|forward-drag-press|sled-drag-harness|sled-push)$/ },
  { clip: 'ex_sled_push', families: ['conditioning-intervals'], bases: /^(sled-20-40|sled-30-30|sled-60-60)$/ },
  { clip: 'ex_sled_push', families: ['loaded-conditioning'], bases: /^(sled-drag-int|sled-int)$/ },
  { clip: 'ex_sled_push', families: ['sled-push'], bases: /^(drag-back|drag-forward|heavy|light)$/ },
  { clip: 'ex_sled_push', families: ['sprint-drill'], bases: /^(prowler-sprint)$/ },
  { clip: 'ex_kb_swing', families: ['db-hinge'], bases: /^(swing)$/ },
  { clip: 'ex_kb_swing', families: ['kb-lower'], bases: /^(double-swing)$/ },
  { clip: 'ex_kb_swing', families: ['kb-swing'], bases: /^(deadstop|hand-to-hand|singl-arm-swing|sledgehammer-swing|two-hand|vertical-swing)$/ },
  // ── FITNESS-TPOSE batchB6 (2026-10-26): new authored loops (exerciseBatch*.ts); rows from the loop plan's family/base assignment ──
  { clip: 'ex_foam_roll', families: ['roll'], bases: /^(adductor|anterior-tibialis-smr|brachialis-smr|calf-smr|foot-smr|hamstr-smr|iliotibial-tract-smr|latissimus-dorsi-smr|lower-back-smr|neck-smr|peroneal-smr|piriformis-smr|quadricep-smr|rhomboid-smr)$/ },
  { clip: 'ex_curl_alt', families: ['curl'], bases: /^(alternat-bicep-curl|alternat-hammer-curl)$/ },
  { clip: 'ex_pullover', families: ['db-upper'], bases: /^(pullover)$/ },
  { clip: 'ex_pullover', families: ['fly'], bases: /^(bent-arm-pullover|front-rais-pullover|straight-arm-pullover|svend-press|wid-grip-declin-pullover)$/ },
  { clip: 'ex_face_pull', families: ['rear-delt-face-pull'], bases: /^(fac-pull|pull-apart|rop-rear-shoulder-row)$/ },
  { clip: 'ex_face_pull', families: ['upper-back'], bases: /^(face-pull-band)$/ },
  { clip: 'ex_triceps_kickback', families: ['triceps'], bases: /^(seat-bent-over-two-arm-tricep-extension|stand-bent-over-two-arm-tricep-extension|tricep-kickback)$/ },
  { clip: 'ex_lunge_walking', families: ['dynamic-warmup-2'], bases: /^(lunge-halfsplit|lunge-rot|rev-lunge-reach|spider-reach)$/ },
  { clip: 'ex_lunge_walking', families: ['lunge'], bases: /^(bodyweight-walk-lung|walk-lung|walking-db)$/ },
  { clip: 'ex_calf_raise_single', families: ['calf-raise'], bases: /^(bent-knee|eccentric-sl|iso-wall|seat-singl-leg-calf-rais|step|step-sl|step-sl-db)$/ },
  { clip: 'ex_calf_raise_single', families: ['tib-raise'], bases: /^(wall-sl)$/ },
  { clip: 'ex_neck', families: ['neck'], bases: /^(isometric-neck-front-back|isometric-neck-sid|lying-fac-down-plat-neck-resistanc|lying-fac-up-plat-neck-resistanc|seat-head-harness-neck-resistanc)$/ },
  { clip: 'ex_neck', families: ['neck-care'], bases: /^(chin-nod|hand-iso|wall)$/ },
  { clip: 'ex_curl_hammer', families: ['curl'], bases: /^(cross-body-hammer-curl|hammer-curl-rop-attachment)$/ },
  { clip: 'ex_pushdown_variants', families: ['triceps'], bases: /^(inclin-pushdown|tricep-pushdown-rop-attachment|tricep-pushdown-v-bar-attachment)$/ },
  { clip: 'ex_burpee', families: ['conditioning-circuit'], bases: /^(burpee|seal-jack|squat-thrust)$/ },
  { clip: 'ex_burpee', families: ['court-conditioning'], bases: /^(burpee-int)$/ },
  { clip: 'ex_calf_raise_seated', families: ['calf-raise'], bases: /^(calf-press|donkey-calf-rais|seat-calf-rais|seated-db)$/ },
  { clip: 'ex_tib_raise', families: ['foot-and-balance'], bases: /^(tib-seated)$/ },
  { clip: 'ex_tib_raise', families: ['tib-raise'], bases: /^(band|heel-walk|wall)$/ },
  // ── FITNESS-TPOSE batchC1 (2026-10-26): new authored loops (exerciseBatch*.ts); rows from the loop plan's family/base assignment ──
  { clip: 'ex_bball_pullup', families: ['handle-combo'], bases: /^(combo-behind-hesi-pull-up|combo-behind-inout-pull-up|combo-behind-retreat-pull-up|combo-behind-spin-pull-up|combo-between-hesi-pull-up|combo-between-inout-pull-up|combo-between-retreat-pull-up|combo-between-spin-pull-up|combo-cross-behind-pull-up|combo-cross-hesi-pull-up|combo-cross-inout-pull-up|combo-cross-retreat-pull-up|combo-cross-spin-pull-up|combo-hesi-retreat-pull-up|combo-hesi-spin-pull-up|combo-inout-hesi-pull-up|combo-inout-retreat-pull-up|combo-inout-spin-pull-up|combo-pound-behind-pull-up|combo-pound-between-pull-up|combo-pound-hesi-pull-up|combo-pound-inout-pull-up|combo-pound-retreat-pull-up|combo-pound-spin-pull-up|combo-retreat-spin-pull-up|id-between-behind-combo-pull-up|id-crossover-between-combo-pull-up|id-pound-crossover-combo-pull-up)$/ },
  { clip: 'ex_bball_pullup', families: ['off-dribble-shooting'], bases: /^(behind-baseline|behind-baseline-weak|behind-elbow|behind-elbow-weak|behind-ft-line|behind-ft-line-weak|behind-slot|behind-slot-three|behind-slot-three-weak|behind-slot-weak|behind-top|behind-top-three|behind-top-three-weak|behind-top-weak|behind-wing|behind-wing-three|behind-wing-three-weak|behind-wing-weak|between-baseline|between-baseline-weak|between-elbow|between-elbow-weak|between-ft-line|between-ft-line-weak|between-slot|between-slot-three|between-slot-three-weak|between-slot-weak|between-top|between-top-three|between-top-three-weak|between-top-weak|between-wing|between-wing-three|between-wing-three-weak|between-wing-weak|cross-baseline|cross-baseline-weak|cross-elbow|cross-elbow-weak|cross-ft-line|cross-ft-line-weak|cross-slot|cross-slot-three|cross-slot-three-weak|cross-slot-weak|cross-top|cross-top-three|cross-top-three-weak|cross-top-weak|cross-wing|cross-wing-three|cross-wing-three-weak|cross-wing-weak|hesi-baseline|hesi-baseline-weak|hesi-elbow|hesi-elbow-weak|hesi-ft-line|hesi-ft-line-weak|hesi-slot|hesi-slot-three|hesi-slot-three-weak|hesi-slot-weak|hesi-top|hesi-top-three|hesi-top-three-weak|hesi-top-weak|hesi-wing|hesi-wing-three|hesi-wing-three-weak|hesi-wing-weak|inout-baseline|inout-baseline-weak|inout-elbow|inout-elbow-weak|inout-ft-line|inout-ft-line-weak|inout-slot|inout-slot-three|inout-slot-three-weak|inout-slot-weak|inout-top|inout-top-three|inout-top-three-weak|inout-top-weak|inout-wing|inout-wing-three|inout-wing-three-weak|inout-wing-weak|one-dribble-baseline|one-dribble-baseline-weak|one-dribble-elbow|one-dribble-elbow-weak|one-dribble-ft-line|one-dribble-ft-line-weak|one-dribble-slot|one-dribble-slot-three|one-dribble-slot-three-weak|one-dribble-slot-weak|one-dribble-top|one-dribble-top-three|one-dribble-top-three-weak|one-dribble-top-weak|one-dribble-wing|one-dribble-wing-three|one-dribble-wing-three-weak|one-dribble-wing-weak|side-step-baseline|side-step-baseline-weak|side-step-elbow|side-step-elbow-weak|side-step-ft-line|side-step-ft-line-weak|side-step-slot|side-step-slot-three|side-step-slot-three-weak|side-step-slot-weak|side-step-top|side-step-top-three|side-step-top-three-weak|side-step-top-weak|side-step-wing|side-step-wing-three|side-step-wing-three-weak|side-step-wing-weak|snatch-back-baseline|snatch-back-baseline-weak|snatch-back-elbow|snatch-back-elbow-weak|snatch-back-ft-line|snatch-back-ft-line-weak|snatch-back-slot|snatch-back-slot-three|snatch-back-slot-three-weak|snatch-back-slot-weak|snatch-back-top|snatch-back-top-three|snatch-back-top-three-weak|snatch-back-top-weak|snatch-back-wing|snatch-back-wing-three|snatch-back-wing-three-weak|snatch-back-wing-weak|spin-baseline|spin-baseline-weak|spin-elbow|spin-elbow-weak|spin-ft-line|spin-ft-line-weak|spin-slot|spin-slot-three|spin-slot-three-weak|spin-slot-weak|spin-top|spin-top-three|spin-top-three-weak|spin-top-weak|spin-wing|spin-wing-three|spin-wing-three-weak|spin-wing-weak|step-back-baseline|step-back-baseline-weak|step-back-elbow|step-back-elbow-weak|step-back-ft-line|step-back-ft-line-weak|step-back-slot|step-back-slot-three|step-back-slot-three-weak|step-back-slot-weak|step-back-top|step-back-top-three|step-back-top-three-weak|step-back-top-weak|step-back-wing|step-back-wing-three|step-back-wing-three-weak|step-back-wing-weak|two-dribble-baseline|two-dribble-baseline-weak|two-dribble-elbow|two-dribble-elbow-weak|two-dribble-ft-line|two-dribble-ft-line-weak|two-dribble-slot|two-dribble-slot-three|two-dribble-slot-three-weak|two-dribble-slot-weak|two-dribble-top|two-dribble-top-three|two-dribble-top-three-weak|two-dribble-top-weak|two-dribble-wing|two-dribble-wing-three|two-dribble-wing-three-weak|two-dribble-wing-weak)$/ },
  { clip: 'ex_bball_pullup', families: ['post-moves'], bases: /^(turnaround-baseline|turnaround-middle)$/ },
  { clip: 'ex_bball_pullup', families: ['shooting-form'], bases: /^(pull-up)$/ },
  { clip: 'ex_bball_pullup', families: ['shooting-spots'], bases: /^(fake-dribble)$/ },
  { clip: 'ex_bball_pullup', families: ['spot-shooting'], bases: /^(corner-left-three-fake|corner-right-three-fake|slot-left-three-fake|slot-right-three-fake|top-centre-three-fake|wing-left-three-fake|wing-right-three-fake)$/ },
  { clip: 'ex_bball_handle_combo', families: ['full-court-handles'], bases: /^(change-pace|retreat-series|two-ball)$/ },
  { clip: 'ex_bball_handle_combo', families: ['handle-combo'], bases: /^(combo-behind-hesi|combo-behind-hesi-move|combo-behind-hesi-pressure|combo-behind-inout|combo-behind-inout-move|combo-behind-inout-pressure|combo-behind-retreat|combo-behind-retreat-move|combo-behind-retreat-pressure|combo-behind-spin|combo-behind-spin-move|combo-behind-spin-pressure|combo-between-hesi|combo-between-hesi-move|combo-between-hesi-pressure|combo-between-inout|combo-between-inout-move|combo-between-inout-pressure|combo-between-retreat|combo-between-retreat-move|combo-between-retreat-pressure|combo-between-spin|combo-between-spin-move|combo-between-spin-pressure|combo-cross-behind|combo-cross-behind-move|combo-cross-behind-pressure|combo-cross-hesi|combo-cross-hesi-move|combo-cross-hesi-pressure|combo-cross-inout|combo-cross-inout-move|combo-cross-inout-pressure|combo-cross-retreat|combo-cross-retreat-move|combo-cross-retreat-pressure|combo-cross-spin|combo-cross-spin-move|combo-cross-spin-pressure|combo-hesi-retreat|combo-hesi-retreat-move|combo-hesi-retreat-pressure|combo-hesi-spin|combo-hesi-spin-move|combo-hesi-spin-pressure|combo-inout-hesi|combo-inout-hesi-move|combo-inout-hesi-pressure|combo-inout-retreat|combo-inout-retreat-move|combo-inout-retreat-pressure|combo-inout-spin|combo-inout-spin-move|combo-inout-spin-pressure|combo-pound-retreat|combo-pound-retreat-move|combo-pound-retreat-pressure|combo-pound-spin|combo-pound-spin-move|combo-pound-spin-pressure|combo-retreat-spin|combo-retreat-spin-move|combo-retreat-spin-pressure|combo3-cross-behind-retreat|combo3-cross-behind-retreat-move|combo3-cross-behind-retreat-pressure|combo3-cross-behind-spin|combo3-cross-behind-spin-move|combo3-cross-behind-spin-pressure|combo3-cross-between-retreat|combo3-cross-between-retreat-move|combo3-cross-between-retreat-pressure|combo3-cross-between-spin|combo3-cross-between-spin-move|combo3-cross-between-spin-pressure|combo3-hesi-behind-cross|combo3-hesi-behind-cross-move|combo3-hesi-behind-cross-pressure|combo3-hesi-behind-retreat|combo3-hesi-behind-retreat-move|combo3-hesi-behind-retreat-pressure|combo3-hesi-behind-spin|combo3-hesi-behind-spin-move|combo3-hesi-behind-spin-pressure|combo3-hesi-between-cross|combo3-hesi-between-cross-move|combo3-hesi-between-cross-pressure|combo3-hesi-between-retreat|combo3-hesi-between-retreat-move|combo3-hesi-between-retreat-pressure|combo3-hesi-between-spin|combo3-hesi-between-spin-move|combo3-hesi-between-spin-pressure|combo3-inout-behind-cross|combo3-inout-behind-cross-move|combo3-inout-behind-cross-pressure|combo3-inout-behind-retreat|combo3-inout-behind-retreat-move|combo3-inout-behind-retreat-pressure|combo3-inout-behind-spin|combo3-inout-behind-spin-move|combo3-inout-behind-spin-pressure|combo3-inout-between-cross|combo3-inout-between-cross-move|combo3-inout-between-cross-pressure|combo3-inout-between-retreat|combo3-inout-between-retreat-move|combo3-inout-between-retreat-pressure|combo3-inout-between-spin|combo3-inout-between-spin-move|combo3-inout-between-spin-pressure|id-between-behind-combo-move|id-between-behind-combo-pressure|id-crossover-between-combo-move|id-crossover-between-combo-pressure)$/ },
  { clip: 'ex_bball_handle_combo', families: ['handle-combos'], bases: /^(between-behind|cross-between|pound-cross|toss|two-ball-cross|wall-overhead)$/ },
  { clip: 'ex_bball_handle_combo', families: ['moving-handles'], bases: /^(speed|two-ball)$/ },
  { clip: 'ex_bball_catch_shoot', families: ['catch-and-shoot-cuts'], bases: /^(curl-elbow-mid|curl-elbow-mid-one-two|fade-corner-mid|fade-corner-mid-one-two|fade-corner-three|fade-corner-three-one-two|flare-corner-mid|flare-corner-mid-one-two|flare-corner-three|flare-corner-three-one-two|flare-wing-mid|flare-wing-mid-one-two|flare-wing-three|flare-wing-three-one-two|handoff-top-mid|handoff-top-mid-one-two|handoff-top-three|handoff-top-three-one-two|handoff-wing-mid|handoff-wing-mid-one-two|handoff-wing-three|handoff-wing-three-one-two|l-cut-elbow-mid|l-cut-elbow-mid-one-two|l-cut-wing-mid|l-cut-wing-mid-one-two|l-cut-wing-three|l-cut-wing-three-one-two|lift-wing-mid|lift-wing-mid-one-two|lift-wing-three|lift-wing-three-one-two|pop-top-mid|pop-top-mid-one-two|pop-top-three|pop-top-three-one-two|pop-wing-mid|pop-wing-mid-one-two|pop-wing-three|pop-wing-three-one-two|relocate-corner-mid|relocate-corner-mid-one-two|relocate-corner-three|relocate-corner-three-one-two|relocate-wing-mid|relocate-wing-mid-one-two|relocate-wing-three|relocate-wing-three-one-two|v-cut-wing-mid|v-cut-wing-mid-one-two|v-cut-wing-three|v-cut-wing-three-one-two)$/ },
  { clip: 'ex_bball_catch_shoot', families: ['free-throws'], bases: /^(ft-sprint|ft-two)$/ },
  { clip: 'ex_bball_catch_shoot', families: ['post-moves'], bases: /^(fake-through-baseline|fake-through-middle)$/ },
  { clip: 'ex_bball_catch_shoot', families: ['shooting-footwork'], bases: /^(fake-through|hop|one-two|pivot-catch|sprint-set|step-in|turn-face)$/ },
  { clip: 'ex_bball_catch_shoot', families: ['shooting-form'], bases: /^(hop|one-hand|one-two|two-hand)$/ },
  { clip: 'ex_bball_catch_shoot', families: ['shooting-spots'], bases: /^(fatigue-ft|free-throw)$/ },
  { clip: 'ex_bball_catch_shoot', families: ['spot-shooting'], bases: /^(block-left-mid-pass|block-right-mid-pass|corner-left-mid-pass|corner-left-three-pass|corner-right-mid-pass|corner-right-three-pass|elbow-left-mid-pass|elbow-right-mid-pass|ft-line-centre-mid-pass|short-corner-left-mid-pass|short-corner-right-mid-pass|slot-left-mid-pass|slot-left-three-pass|slot-right-mid-pass|slot-right-three-pass|top-centre-mid-pass|top-centre-three-pass|wing-left-mid-pass|wing-left-three-pass|wing-right-mid-pass|wing-right-three-pass)$/ },
  { clip: 'ex_bball_catch_shoot', families: ['triple-threat-series'], bases: /^(fake-side-step|fake-side-step-closeout|jab-fake-drive|jab-fake-drive-closeout)$/ },
  { clip: 'ex_bball_drive_finish', families: ['finish-series'], bases: /^(inside-baseline|inside-baseline-contact|inside-baseline-weak|inside-crossdrive|inside-crossdrive-contact|inside-crossdrive-weak|inside-middle|inside-middle-contact|inside-middle-weak|inside-rip|inside-rip-contact|inside-rip-weak|inside-wing|inside-wing-contact|inside-wing-weak|power-baseline|power-baseline-contact|power-baseline-weak|power-crossdrive|power-crossdrive-contact|power-crossdrive-weak|power-cut|power-cut-contact|power-cut-weak|power-middle|power-middle-contact|power-middle-weak|power-rip|power-rip-contact|power-rip-weak|power-spindrive|power-spindrive-contact|power-spindrive-weak|power-wing|power-wing-contact|power-wing-weak)$/ },
  { clip: 'ex_bball_drive_finish', families: ['finishing'], bases: /^(pad|power|same-foot)$/ },
  { clip: 'ex_bball_drive_finish', families: ['full-court-handles'], bases: /^(coast-euro|weak-speed|zig-zag-layup)$/ },
  { clip: 'ex_bball_drive_finish', families: ['handle-combo'], bases: /^(combo-behind-hesi-finish|combo-behind-inout-finish|combo-behind-retreat-finish|combo-behind-spin-finish|combo-between-hesi-finish|combo-between-inout-finish|combo-between-retreat-finish|combo-between-spin-finish|combo-cross-behind-finish|combo-cross-hesi-finish|combo-cross-inout-finish|combo-cross-retreat-finish|combo-cross-spin-finish|combo-hesi-retreat-finish|combo-hesi-spin-finish|combo-inout-hesi-finish|combo-inout-retreat-finish|combo-inout-spin-finish|combo-pound-behind-finish|combo-pound-between-finish|combo-pound-hesi-finish|combo-pound-inout-finish|combo-pound-retreat-finish|combo-pound-spin-finish|combo-retreat-spin-finish|combo3-cross-behind-retreat-finish|combo3-cross-behind-spin-finish|combo3-cross-between-retreat-finish|combo3-cross-between-spin-finish|combo3-hesi-behind-cross-finish|combo3-hesi-behind-retreat-finish|combo3-hesi-behind-spin-finish|combo3-hesi-between-cross-finish|combo3-hesi-between-retreat-finish|combo3-hesi-between-spin-finish|combo3-inout-behind-cross-finish|combo3-inout-behind-retreat-finish|combo3-inout-behind-spin-finish|combo3-inout-between-cross-finish|combo3-inout-between-retreat-finish|combo3-inout-between-spin-finish|id-between-behind-combo-finish|id-crossover-between-combo-finish|id-pound-crossover-combo-finish)$/ },
  { clip: 'ex_bball_drive_finish', families: ['moving-handles'], bases: /^(cross-layup)$/ },
  { clip: 'ex_bball_drive_finish', families: ['rebounding'], bases: /^(put-back)$/ },
  { clip: 'ex_bball_v_dribble', families: ['ball-handling'], bases: /^(change-of-pace|figure-8|retreat|spider|two-ball-alt|two-ball-pound|wrap|zig-zag)$/ },
  { clip: 'ex_bball_v_dribble', families: ['one-hand-dribble'], bases: /^(front-v|kill|kneeling-front-v|kneeling-kill|kneeling-push-pull|kneeling-rocking|kneeling-side-v|kneeling-snatch-back|kneeling-wide-pound|kneeling-wiper|push-pull|rocking|side-v|snatch-back|wiper)$/ },
  { clip: 'ex_bball_v_dribble', families: ['two-ball-handling'], bases: /^(behind-pound|between-pound|cross-pound|front-v|high-low|in-out|retreat|rhythm|side-v|wide)$/ },
  // ── FITNESS-TPOSE batchC2 (2026-10-26): new authored loops (exerciseBatch*.ts); rows from the loop plan's family/base assignment ──
  { clip: 'ex_bball_closeout', families: ['closeout-series'], bases: /^(closeout-baseline-cut-off|closeout-baseline-drop-slide|closeout-baseline-retreat|closeout-corner-cut-off|closeout-corner-drop-slide|closeout-corner-retreat|closeout-elbow-cut-off|closeout-elbow-drop-slide|closeout-elbow-retreat|closeout-help-cut-off|closeout-help-drop-slide|closeout-help-retreat|closeout-nail-cut-off|closeout-nail-drop-slide|closeout-nail-retreat|closeout-opp-wing-contest|closeout-opp-wing-cut-off|closeout-opp-wing-drop-slide|closeout-opp-wing-retreat|closeout-paint-cut-off|closeout-paint-drop-slide|closeout-paint-retreat)$/ },
  { clip: 'ex_bball_closeout', families: ['defense-drills-2'], bases: /^(chase-screen|deny-backcut|hedge|show|slide-sprint|stunt-recover|tag-recover)$/ },
  { clip: 'ex_bball_triple_threat', families: ['footwork'], bases: /^(jab-cross|jab-go|rip)$/ },
  { clip: 'ex_bball_triple_threat', families: ['post-moves'], bases: /^(face-cross-baseline|face-cross-middle|face-up-baseline|face-up-middle)$/ },
  { clip: 'ex_bball_triple_threat', families: ['triple-threat-series'], bases: /^(catch-pivot-rip|catch-pivot-rip-closeout|jab-cross-drive|jab-cross-drive-closeout|jab-rip|jab-rip-closeout|jab-shoot|jab-shoot-closeout|jab-step-back|jab-step-back-closeout|pivot-drive|pivot-drive-closeout|pivot-jab|pivot-jab-closeout|rip-baseline|rip-baseline-closeout)$/ },
  { clip: 'ex_bball_pass', families: ['passing-2'], bases: /^(baseball-dribble|baseball-partner|behind-dribble|behind-move|behind-partner|bounce-dribble|bounce-move|bounce-partner|chest-dribble|chest-move|fake-move|fake-partner|hook-move|hook-partner|jump-stop-dribble|kick-out-dribble|lob-dribble|lob-partner|one-bounce-dribble|one-bounce-move|one-bounce-partner|overhead-move|overhead-partner|pocket-dribble|pocket-partner|skip-dribble|skip-partner|two-ball-partner|wrap-dribble|wrap-partner)$/ },
  { clip: 'ex_soccer_touches', families: ['soccer-ball-skills'], bases: /^(bells|bells-move|chip|cross-touch|double-touch|double-touch-move|drag-back|drag-back-move|first-touch|gates|half-turn|in-out|in-out-move|inside-hook|inside-hook-move|juggle-foot|juggle-thigh|laces-stop|laces-stop-move|outside-hook|outside-hook-move|outside-taps|outside-taps-move|push-pull|push-pull-move|roll-stop|roll-stop-move|scissor|scissor-move|sole-rolls|sole-rolls-move|sole-stop|sole-stop-move|sole-turn|sole-turn-move|speed-gates|step-overs|step-overs-move|stop-turn|stop-turn-move|toe-taps|toe-taps-move|v-pull|v-pull-move|wall-laces|wall-one|wall-two|weak-wall|weave-inside|weave-outside)$/ },
  { clip: 'ex_volleyball', families: ['volleyball-skills'], bases: /^(approach-swing|back-row|block-approach|block-swing|block-three|dig|float-serve|free-ball|jump-toss|libero|pass-target|pepper|serve-receive|set-target|setter|shuffle-pass|sprawl|wall-pass|wall-set)$/ },
  { clip: 'ex_dynamic_warmup', families: ['dynamic-flow'], bases: /^(swing-sagittal)$/ },
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
  // FITNESS-TPOSE batchA
  ex_knee_to_wall: 1.6, ex_single_leg_squat: 1.4, ex_bridge_single_pulse: 0.8, ex_press_oscillation: 0.9, ex_idle_ready: 0.0, ex_hip_circles_9090: 0.0,
  // FITNESS-TPOSE batchB1
  ex_pushup_variants: 1.05,
  // FITNESS-TPOSE batchB2
  ex_pallof: 1.0, ex_iso_capacity: 2.6, ex_lunge_lateral: 1.2, ex_pullup: 1.1, ex_pulldown: 0.95,
  // FITNESS-TPOSE batchB3
  ex_plank_reach: 1.1, ex_dip: 1.0, ex_sl_rdl: 1.55, ex_row_inverted: 0.95,
  // FITNESS-TPOSE batchB4
  ex_hip_thrust: 1.3, ex_squat_var: 1.25, ex_rotator_cuff: 1.0, ex_leg_curl_slider: 1.2, ex_row_single: 0.8,
  // FITNESS-TPOSE batchB5
  ex_row_seated_cable: 1.0, ex_leg_press: 1.05, ex_straight_arm_pulldown: 0.95, ex_side_plank: 1.4,
  // FITNESS-TPOSE batchB6
  ex_curl_alt: 0.85, ex_face_pull: 1.05, ex_triceps_kickback: 0.85, ex_curl_hammer: 0.85, ex_pushdown_variants: 0.85, ex_calf_raise_single: 0.95,
};

export interface DemoPick {
  clip: string;
  /** seconds into the loop to hold still at (an isometric hold), or null to loop it */
  hold: number | null;
}

/** What a library entry shows on the stage: its loop (or that loop held still), or null — the cue card. */
export function demoFor(e: { family: string; variation: string; equipment: readonly string[] }): DemoPick | null {
  const [base, ...mods] = e.variation.split('+');
  const iso = mods.includes('iso-hold');
  if (mods.some((m) => m !== 'iso-hold' && SHAPE_MODIFIERS.has(m))) return null;
  for (const r of RULES_BY_FAMILY.get(e.family) ?? []) {
    if (!r.bases.test(base)) continue;
    const clip = typeof r.clip === 'string' ? r.clip : r.clip(base, e.equipment);
    if (!clip) return null;
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
    else for (const b of ['x', 'x-weak']) for (const eq of [[], ['barbell']]) { const c = r.clip(b, eq); if (c) out.add(c); }
  }
  return [...out].sort();
})();

/** Floor loops: the stage frames these from the side, low (a push-up seen from the front is a head). */
export const FLOOR_CLIPS: ReadonlySet<string> = new Set(['ex_pushup', 'ex_plank', 'ex_plank_high', 'ex_mountain_climber', 'ex_bridge', 'ex_dead_bug', 'ex_bird_dog', 'ex_crunch', 'ex_floor_press', 'ex_crawl', 'ex_breathe_prone', 'ex_breathe_legs_up_wall', 'ex_hip_circles_9090', 'ex_bridge_single_pulse', 'ex_pushup_variants', 'ex_flow_squat_lunge', 'ex_crunch_variants', 'ex_plank_reach', 'ex_row_inverted', 'ex_hip_thrust', 'ex_leg_curl_slider', 'ex_leg_raise', 'ex_side_plank', 'ex_foam_roll']);
/** Hinges and rows read from the side (the angle at the hips is the movement). */
export const SIDE_CLIPS: ReadonlySet<string> = new Set(['ex_hinge', 'ex_good_morning', 'ex_row', 'ex_knee_to_wall', 'ex_single_leg_squat', 'ex_throw', 'ex_throw_vertical', 'ex_sprint_start', 'ex_olympic_lift', 'ex_curl_supported', 'ex_sprint_drill', 'ex_iso_capacity', 'ex_curl_incline', 'ex_pulldown', 'ex_pullup', 'ex_triceps_lying', 'ex_bench_variants', 'ex_machine_cardio', 'ex_row_chest_supported', 'ex_lateral_raise_bent', 'ex_dip', 'ex_sl_rdl', 'ex_row_single', 'ex_good_morning_var', 'ex_dynamic_warmup', 'ex_step_up', 'ex_grip_wrist', 'ex_row_seated_cable', 'ex_throw_overhead', 'ex_leg_press', 'ex_straight_arm_pulldown', 'ex_sled_push', 'ex_kb_swing', 'ex_pullover', 'ex_face_pull', 'ex_triceps_kickback', 'ex_lunge_walking', 'ex_calf_raise_single', 'ex_pushdown_variants', 'ex_burpee', 'ex_calf_raise_seated', 'ex_tib_raise']);
/** What the stage draws under a loop that needs it: a bench seat, a flat bench to lie on, or an incline bench. Bench loops
 *  lying down are framed from the side, like the floor loops. */
export type DemoProp = 'seat' | 'bench' | 'incline';
export const DEMO_PROPS: Readonly<Record<string, DemoProp>> = {
  ex_seated_press: 'seat', ex_seated_curl: 'seat', ex_seated_lateral_raise: 'seat', ex_seated_triceps: 'seat',
  ex_bench_press: 'bench', ex_fly: 'bench', ex_skull_crusher: 'bench', ex_incline_press: 'incline', ex_incline_fly: 'incline',
  // FITNESS-TPOSE batchB1
  ex_curl_supported: 'seat',
  // FITNESS-TPOSE batchB2
  ex_machine_cardio: 'seat', ex_curl_incline: 'incline', ex_pulldown: 'seat', ex_triceps_lying: 'incline', ex_bench_variants: 'bench',
  // FITNESS-TPOSE batchB4
  ex_grip_wrist: 'seat', ex_step_up: 'seat',
  // FITNESS-TPOSE batchB5
  ex_row_seated_cable: 'seat', ex_leg_press: 'seat',
  // FITNESS-TPOSE batchB6
  ex_pullover: 'bench', ex_calf_raise_seated: 'seat',
};
/** Ball-handling and finishing loops: the stage draws no ball, and the card says so (the Fitness basketball, soccer and
 *  volleyball loops too — FITNESS-TPOSE batchC1, 2026-10-26). */
export const isBallClip = (clip: string | null | undefined): boolean => !!clip && (clip.startsWith('bball_') || clip === 'jumpshot' || clip.startsWith('ex_bball_') || clip === 'ex_soccer_touches' || clip === 'ex_volleyball');
/** A volt arrow the stage lays flat on the floor: where it starts and which way it points, in the athlete's frame (x to their
 *  right, z ahead, metres), and its length (0.4 m if not given). The loops stay on their spot; the arrow shows the travel. */
export interface DemoArrow { x: number; z: number; dx: number; dz: number; len?: number }
export const DEMO_ARROWS: Readonly<Record<string, readonly DemoArrow[]>> = {
  // FITNESS-TPOSE batchC1
  ex_bball_pullup: [{ x: 0, z: 0.32, dx: 0, dz: 1, len: 0.42 }],
  ex_bball_handle_combo: [{ x: 0.2, z: 0.42, dx: -1, dz: 0, len: 0.3 }, { x: -0.2, z: 0.62, dx: 1, dz: 0, len: 0.3 }],
  ex_bball_catch_shoot: [{ x: 0, z: 0.32, dx: 0, dz: 1, len: 0.3 }],
  ex_bball_drive_finish: [{ x: 0.08, z: 0.36, dx: 0, dz: 1, len: 0.62 }],
  ex_bball_v_dribble: [{ x: 0.32, z: 0.36, dx: -0.27, dz: 0.24, len: 0.3 }, { x: 0.05, z: 0.6, dx: -0.27, dz: -0.24, len: 0.3 }],
  // FITNESS-TPOSE batchC2
  ex_bball_closeout: [{ x: 0, z: 0.3, dx: 0, dz: 1, len: 0.5 }],
  ex_bball_triple_threat: [{ x: 0.15, z: 0.25, dx: 0.5, dz: 1, len: 0.35 }],
  ex_bball_pass: [{ x: 0, z: 0.4, dx: 0, dz: 1, len: 0.55 }],
  ex_volleyball: [{ x: 0, z: 0.5, dx: 0, dz: 1, len: 0.45 }],
};

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
