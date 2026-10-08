// patternParam — which Mirror tab `/play/mirror?pattern=<id>` opens on (MIRROR-MOVES P2, 2026-10-07; plan Phase 2 /
// item #19: "the Mirror reads no ?pattern=").
//
// Two lanes link here already: the coach's Form Check (lib/mirror/liveMovements.ts, MIRROR-FIRST P1) and the Playbook's
// "Check it on camera" (lib/education/lessonMovement.ts, EDU-LINKS P5). Both use the harness's own tab keys. Until this,
// every one of those links opened the Mirror on its first tab and said in words which tab to pick.
//
// THE RULE. The value is matched to a tab key, ignoring case and surrounding space ('pushup', 'PUSHUP', 'pressrow' all
// land). Anything else — missing, empty, an unknown id, a repeated parameter whose first value is unknown — opens the
// default tab, the one the Mirror has always opened on. Never an error page: a stale link still opens the Mirror.
//
// Pure, and the ONE list of tabs: the harness's Pattern type is MirrorTab (mirror-harness.tsx), so a tab added there and
// not here fails to compile, and patternParam.test.ts checks every link the other lanes build lands on its own tab.

/** The Mirror's tabs, in picker order. */
export const MIRROR_TABS = ['pressRow', 'squat', 'lunge', 'hinge', 'pushup', 'jump', 'screen'] as const;
export type MirrorTab = typeof MIRROR_TABS[number];

/** The tab the Mirror opens on with no (or an unknown) `?pattern=`: the one it has always opened on. */
export const DEFAULT_MIRROR_TAB: MirrorTab = 'pressRow';

const BY_LOWER: ReadonlyMap<string, MirrorTab> = new Map(MIRROR_TABS.map((t) => [t.toLowerCase(), t]));

/** `?pattern=` (as Next hands a search param: a string, a repeated param's array, or absent) → the tab to open. */
export function tabFromParam(raw: string | readonly string[] | null | undefined): MirrorTab {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (typeof v !== 'string') return DEFAULT_MIRROR_TAB;
  return BY_LOWER.get(v.trim().toLowerCase()) ?? DEFAULT_MIRROR_TAB;
}

/** True when `raw` names a tab (the login redirect keeps only a known one). */
export function isMirrorTab(raw: unknown): raw is MirrorTab {
  return typeof raw === 'string' && (MIRROR_TABS as readonly string[]).includes(raw);
}
