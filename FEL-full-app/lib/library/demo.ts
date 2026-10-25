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
  { clip: 'ex_split_squat', families: ['split-squat'], bases: /^(bw|offset-kb|landmine)$/ },
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
  { clip: (_b, eq) => (eq.includes('dumbbell') ? 'ex_triceps_overhead_one' : null), families: ['triceps'], bases: /^singl-arm-tricep-extension$/, emits: ['ex_triceps_overhead_one'] },
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
  { clip: (_b, eq) => (eq.includes('dumbbell') ? 'ex_side_bend' : null), families: ['rotation'], bases: /^sid-bend$/, emits: ['ex_side_bend'] },
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
  { clip: (b, eq) => (eq.includes('barbell')) ? null : ({ 'step-ups': 'ex_step_up', bw: 'ex_step_up', db: 'ex_step_up', 'low-bw': 'ex_step_up', 'knee-drive': 'ex_step_up_knee', 'lateral-bw': 'ex_step_up_lat', 'lateral-db': 'ex_step_up_lat' } as Record<string, string>)[b] ?? null, families: ['step-up'], bases: /^(knee-drive|lateral-bw|lateral-db|step-ups|low-bw|bw|db)$/, emits: ['ex_step_up', 'ex_step_up_knee', 'ex_step_up_lat'] },
  { clip: (b) => ({ forward: 'ex_step_down', lateral: 'ex_step_down_lat', 'lateral-db': 'ex_step_down_lat' } as Record<string, string>)[b] ?? null, families: ['step-down'], bases: /^(lateral-db|forward|lateral)$/, emits: ['ex_step_down', 'ex_step_down_lat'] },
  { clip: (b) => ({ 'lat-hold': 'ex_step_down_lat', 'fwd-high': 'ex_step_down' } as Record<string, string>)[b] ?? null, families: ['knee-capacity'], bases: /^(lat-hold|fwd-high)$/, emits: ['ex_step_down_lat', 'ex_step_down'] },
  { clip: (b) => ({ 'box-high': 'ex_sl_box_squat', 'box-mid': 'ex_sl_box_squat', 'singl-leg-high-box-squat': 'ex_sl_box_squat', 'pistol-box': 'ex_sl_box_squat', pistol: 'ex_pistol', 'pistol-squat': 'ex_pistol_goblet', skater: 'ex_skater_squat', 'skater-pad': 'ex_skater_squat' } as Record<string, string>)[b] ?? null, families: ['single-leg-squat'], bases: /^(singl-leg-high-box-squat|pistol-squat|pistol-box|skater-pad|box-high|box-mid|pistol|skater)$/, emits: ['ex_sl_box_squat', 'ex_pistol', 'ex_pistol_goblet', 'ex_skater_squat'] },
  { clip: (b) => ({ 'sl-box': 'ex_sl_box_squat' } as Record<string, string>)[b] ?? null, families: ['db-lower'], bases: /^(sl-box)$/, emits: ['ex_sl_box_squat'] },
  { clip: (b) => ({ 'rfe-bw': 'ex_bulgarian', 'rfe-db': 'ex_bulgarian', 'rfe-bb': 'ex_bulgarian_bar' } as Record<string, string>)[b] ?? null, families: ['split-squat'], bases: /^(rfe-bw|rfe-db|rfe-bb)$/, emits: ['ex_bulgarian', 'ex_bulgarian_bar'] },
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
  return [...out].sort();
})();

/** Floor loops: the stage frames these from the side, low (a push-up seen from the front is a head). */
export const FLOOR_CLIPS: ReadonlySet<string> = new Set(['ex_pushup', 'ex_plank', 'ex_plank_high', 'ex_mountain_climber', 'ex_bridge', 'ex_dead_bug', 'ex_bird_dog', 'ex_crunch', 'ex_floor_press', 'ex_spiderman_pushup', 'ex_archer_pushup'].concat(
  // LIBRARY-ANATOMY-2: the floor positions and every flow (a flow spends most of its time on the floor)
  ['dog', 'child', 'pigeon', 'halfsplit', 'lowlunge', 'kneel', 'ninety', 'shinbox', 'catcamel', 'thread', 'bear', 'cobra', 'lizard', 'butterfly', 'couch', 'frog', 'spider', 'inchworm',
    'supine', 'supine9090', 'legsup', 'kneehug', 'oneknee', 'happybaby', 'kneerock', 'figure4', 'lyinghams', 'prone', 'pike', 'straddle', 'switch', 'rockback', 'childside', 'dogpedal',
    'side', 'openbook', 'clamshell', 'sideraise', 'sideer', 'superman'].map((p) => `ex_pos_${p}`),
  ['ex_reverse_crunch', 'ex_situp', 'ex_situp_34', 'ex_bicycle', 'ex_heel_touch', 'ex_flutter', 'ex_toe_touch', 'ex_vup', 'ex_hollow', 'ex_hollow_tuck', 'ex_hollow_rock', 'ex_dead_bug_heel',
    ...['forearm', 'high', 'bear'].flatMap((b) => ['leg', 'reach', 'knee'].map((a) => `ex_plank_${b}_${a}`)), 'ex_shoulder_tap', 'ex_bear_tap', 'ex_side_plank', 'ex_side_plank_leg',
    'ex_bear_crawl', 'ex_leopard_crawl', 'ex_crab_walk', 'ex_crab_reach', 'ex_plyo_pushup', 'ex_hand_release', 'ex_bridge_march', 'ex_bridge_sl', 'ex_slider_curl'],
  FLOW_CLIPS,
));
/** Hinges and rows read from the side (the angle at the hips is the movement). */
export const SIDE_CLIPS: ReadonlySet<string> = new Set(['ex_hinge', 'ex_good_morning', 'ex_row', 'ex_row_one', 'ex_row_alt', 'ex_kickback', 'ex_kickback_one', 'ex_press_hk', 'ex_press_hk_one', 'ex_press_hk_alt',
  'ex_sl_rdl', 'ex_kickstand_rdl', 'ex_nordic', 'ex_squat_thrust', 'ex_burpee', 'ex_high_knees', 'ex_butt_kicks', 'ex_a_skip', 'ex_b_skip', 'ex_power_skip']);
/** What the stage draws under a loop that needs it: a bench seat, a flat bench to lie on, or an incline bench. Bench loops
 *  lying down are framed from the side, like the floor loops. LIBRARY-ANATOMY-2: and the rest of a gym's furniture a loop
 *  stands, sits, lies or hangs on — a box, benches in front and behind, a pull-up bar, a low bar, dip bars, pads, a wall. */
export type DemoProp = 'seat' | 'bench' | 'incline' | 'box' | 'boxside' | 'stepbox' | 'boxback' | 'rearbench' | 'handbench' | 'feetbench' | 'feetbenchfront' | 'thrust'
  | 'pullbar' | 'lowbar' | 'dipbars' | 'dipbench' | 'legcurl' | 'proneincline' | 'decline' | 'preacher' | 'wall' | 'calfstep' | 'wallback' | 'rowseat';
/** A plain box (metres, the body's frame: +x its right, +y up, +z its front; rx tips it about x — negative raises its −z end).
 *  (The stage puts the body's +x at its own −x: the spawned root carries the importer's mirror.) */
export interface PropBox { w: number; h: number; d: number; x?: number; y: number; z: number; rx?: number }
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
};
export const DEMO_PROPS: Readonly<Record<string, DemoProp>> = {
  ex_seated_press: 'seat', ex_seated_curl: 'seat', ex_seated_lateral_raise: 'seat', ex_seated_triceps: 'seat',
  ex_bench_press: 'bench', ex_fly: 'bench', ex_skull_crusher: 'bench', ex_incline_press: 'incline', ex_incline_fly: 'incline',
  ex_seated_press_one: 'seat', ex_seated_press_alt: 'seat', ex_seated_curl_one: 'seat', ex_seated_curl_alt: 'seat', ex_seated_lateral_raise_one: 'seat',
  ex_seated_triceps_one: 'seat', ex_skull_crusher_one: 'bench', ex_fly_one: 'bench', ex_incline_press_one: 'incline', ex_incline_press_alt: 'incline', ex_incline_fly_one: 'incline',
  ...(PROPPED_LOOPS as Readonly<Record<string, DemoProp>>),
};
/** Ball-handling and finishing loops: the stage draws no ball, and the card says so. */
export const isBallClip = (clip: string | null | undefined): boolean => !!clip && (clip.startsWith('bball_') || clip === 'jumpshot');

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
