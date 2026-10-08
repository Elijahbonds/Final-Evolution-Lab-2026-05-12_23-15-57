// DunkAssist — the dunk contest's helping hand, as pure logic (IMPROVE 2026-10-06, owner-picked items from the
// dunk improvements list). Nothing here touches the scene: the mode reads these and decides what to show.
//
//   - the PROP RING by category (X steps categories, the d-pad picks inside one) — 32 entries one press at a time put the
//     crate or the kangaroo 10–20 presses away;
//   - a GUEST'S FIRST JUMPS get a wider slam window, fading to the tuned 0.28 s over two attempts;
//   - the RUNWAY TIPS a standing player cycles through (the d-pad prop, the L1 call, the Y self-lob, the practice runway);
//   - the INPUT that throws a called dunk, so a call can actually be executed.

/** The prop ring's families, in the order X steps through them. */
export type PropCategory = 'plain' | 'oop' | 'lob' | 'obstacle' | 'dubble' | 'special';
export const PROP_CATEGORY_ORDER: readonly PropCategory[] = ['plain', 'oop', 'lob', 'obstacle', 'dubble', 'special'];
export const PROP_CATEGORY_LABEL: Record<PropCategory, string> = {
  plain: 'NO PROP', oop: 'ALLEY-OOPS', lob: 'SELF-LOBS', obstacle: 'OBSTACLES', dubble: 'DUBBLE UP', special: 'SPECIALS',
};

/** What the picker needs to know about the ring: every prop, in ring order, and each one's family. */
export interface PropRing<P extends string> {
  all: readonly P[];
  categoryOf(p: P): PropCategory;
}

/**
 * X: the next family round the ring that has a prop the player may pick, landing on the one last picked in it (`memory`), or
 * its first allowed one. A family with nothing allowed (the specials off the PRO lane, the aliens off Orbit) is passed over and
 * reported in `passed` so the mode can say why. With nothing allowed anywhere else, the current prop stays.
 */
export function nextPropCategory<P extends string>(
  cur: P, ring: PropRing<P>, allowed: (p: P) => boolean, memory: Partial<Record<PropCategory, P>> = {},
): { prop: P; category: PropCategory; passed: P[] } {
  const from = PROP_CATEGORY_ORDER.indexOf(ring.categoryOf(cur));
  const passed: P[] = [];
  for (let step = 1; step <= PROP_CATEGORY_ORDER.length; step++) {
    const cat = PROP_CATEGORY_ORDER[(from + step) % PROP_CATEGORY_ORDER.length];
    const members = ring.all.filter((p) => ring.categoryOf(p) === cat);
    if (!members.length) continue;
    const remembered = memory[cat];
    if (remembered !== undefined && members.includes(remembered) && allowed(remembered)) return { prop: remembered, category: cat, passed };
    const first = members.find(allowed);
    if (first !== undefined) return { prop: first, category: cat, passed };
    passed.push(members[0]);
  }
  return { prop: cur, category: ring.categoryOf(cur), passed };
}

/** The d-pad inside a family: the next allowed prop of `cur`'s own family (wrapping), or `cur` when it is the only one. */
export function stepPropInCategory<P extends string>(cur: P, ring: PropRing<P>, allowed: (p: P) => boolean, dir: 1 | -1 = 1): P {
  const cat = ring.categoryOf(cur);
  const members = ring.all.filter((p) => ring.categoryOf(p) === cat);
  const at = members.indexOf(cur);
  for (let step = 1; step <= members.length; step++) {
    const p = members[(((at + dir * step) % members.length) + members.length) % members.length];
    if (allowed(p)) return p;
  }
  return cur;
}

/**
 * THE GUEST'S FIRST JUMPS. 0.28 s, shrinking 25 % per style tap, is a hard first window for somebody who has never seen the
 * cue. The window is widened by this factor on a player's first jumps — the same way the TV-mode factor widens it — and it
 * fades to exactly 1 (the tuned window, byte for byte) from the third jump on.
 * TUNED (2026-10-06, conservative): 1.4× on the first jump, 1.2× on the second, then 1×.
 */
export const GUEST_SLAM_FACTORS: readonly number[] = [1.4, 1.2];
export function guestSlamFactor(jumpsBefore: number): number {
  if (!Number.isFinite(jumpsBefore) || jumpsBefore < 0) return GUEST_SLAM_FACTORS[0];
  return GUEST_SLAM_FACTORS[Math.floor(jumpsBefore)] ?? 1;
}

/** The runway's standing tips: the controls the opening line has no room for, one at a time. */
export const RUNWAY_TIPS: readonly string[] = [
  'X — NEXT PROP FAMILY · D-PAD picks inside: RIGHT oops, LEFT lobs, DOWN the rest, UP none',
  'L1 — CALL YOUR DUNK: land it for a bonus, miss it and it costs',
  'Y — SELF-LOB standing: toss it up, then run and catch it in the air',
  'R1 — PRACTICE RUNWAY: free dunks, no judges, no rival',
  // dunk-next phase 1 (core/DunkBeats): the flight is a four-beat bar, and nothing on the runway said so
  'IN THE AIR — hit your tricks ON THE BEAT: tick · tick · tick · NOW! — all of them and the slam is a PERFECT FLIGHT',
];
/** Standing still this long before the first tip, then a new tip every IDLE_TIP_EVERY_SEC. */
export const IDLE_TIP_AFTER_SEC = 3, IDLE_TIP_EVERY_SEC = 3.5;
/** The tip for a player who has stood on the runway `idleSec` seconds, or null before the first one is due. */
export function idleTip(idleSec: number, tips: readonly string[] = RUNWAY_TIPS): string | null {
  if (!(idleSec >= IDLE_TIP_AFTER_SEC) || !tips.length) return null;
  return tips[Math.floor((idleSec - IDLE_TIP_AFTER_SEC) / IDLE_TIP_EVERY_SEC) % tips.length];
}

const DIR_WORD: Record<'up' | 'down' | 'left' | 'right', string> = { up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT' };
/** How a trick is thrown, in words the HUD can show: "D-PAD UP + A". */
export function trickInput(t: { dir: 'up' | 'down' | 'left' | 'right'; btn: string }): string {
  return `D-PAD ${DIR_WORD[t.dir]} + ${t.btn}`;
}
