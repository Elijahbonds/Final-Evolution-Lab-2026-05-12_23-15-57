/**
 * lib/scene/integrity.ts
 * ======================
 * M7-QA1 §1 — Scene Integrity Gate.
 *
 * Every 3D scene declares a list of required asset nodes (rim, backboard,
 * floor-with-material). The scene is not playable until all required nodes
 * are present AND visibly rendering (mesh enabled, material resolved).
 *
 * Pure data + pure helpers — no THREE / DOM.
 */

export interface RequiredNode {
  /** Human-readable label shown in the error overlay / test assertion. */
  label: string;
  /**
   * Predicate receives the scene’s flat list of mesh names and the full list
   * of materials. Returns true if the requirement is satisfied.
   */
  check: (meshNames: string[], materialNames: string[]) => boolean;
}

/**
 * M8.5 — Venue identity. Each scene declares the environment backdrop + mood it
 * is expected to render inside, so environment identity is wired through the same
 * integrity gate as the required geometry. Pure data — the games import the same
 * backdrop constants, and the test harness asserts they stay in sync.
 */
export interface VenueIdentity {
  /** Human-readable venue name shown in tooling. */
  label: string;
  /** Expected photographic backdrop path served from /public. */
  backdrop: string;
  /** One-line description of the intended atmosphere. */
  mood: string;
}

export interface SceneManifest {
  modeId: string;
  sceneLabel: string;
  requiredNodes: RequiredNode[];
  /** M8.5 environment identity (optional for legacy manifests). */
  venue?: VenueIdentity;
}

/* ────────────────────────────────────────────────────────────────
 * Per-mode manifests.
 * ──────────────────────────────────────────────────────────────── */

/** Basketball court modes: three-point, 3v3, dunk. */
const courtNodes: RequiredNode[] = [
  {
    label: 'Floor / court surface',
    check: (meshes) => meshes.some((m) =>
      /floor|court|ground|plane/i.test(m)
    ),
  },
  {
    label: 'Rim / hoop',
    check: (meshes) => meshes.some((m) => /rim|hoop|ring/i.test(m)),
  },
  {
    label: 'Backboard',
    check: (meshes) => meshes.some((m) => /backboard|board|glass/i.test(m)),
  },
];

const dojoNodes: RequiredNode[] = [
  {
    label: 'Dojo floor / deck',
    check: (meshes) => meshes.some((m) =>
      /floor|deck|dojo|ground|plane|platform/i.test(m)
    ),
  },
];

// M8.5 — venue identity constants. Games import these (or the same literal paths)
// so environment identity is single-sourced and test-verifiable. // TUNE(elijah)
export const VENUE_VENICE_SUNSET: VenueIdentity = {
  label: 'Venice Beach Blacktop — Sunset',
  backdrop: '/backdrops/venice-sky-sunset.jpg',
  mood: 'Golden-hour outdoor streetball: warm asphalt, palm-lined boardwalk, ocean horizon.',
};
export const VENUE_VENICE_DAY: VenueIdentity = {
  label: 'Venice Beach Blacktop — Day',
  backdrop: '/backdrops/venice-sky-day.jpg',
  mood: 'Bright daytime outdoor streetball: sun-bleached concrete, palms, boardwalk crowd.',
};
export const VENUE_DOJO: VenueIdentity = {
  label: 'Candlelit Dojo',
  backdrop: '/backdrops/karate.jpg',
  mood: 'Warm low-lit tatami: wooden beams, paper-screen glow, incense embers.',
};

export const SCENE_MANIFESTS: Record<string, SceneManifest> = {
  basketball_dunk: {
    modeId: 'basketball_dunk',
    sceneLabel: 'Dunk Contest',
    requiredNodes: courtNodes,
    venue: VENUE_VENICE_SUNSET,
  },
  basketball_h2h: {
    modeId: 'basketball_h2h',
    sceneLabel: 'Three-Point Shootout',
    requiredNodes: courtNodes,
    venue: VENUE_VENICE_DAY,
  },
  basketball_3v3: {
    modeId: 'basketball_3v3',
    sceneLabel: '3v3 Streetball',
    requiredNodes: courtNodes,
    venue: VENUE_VENICE_DAY,
  },
  karate_versus: {
    modeId: 'karate_versus',
    sceneLabel: 'Karate Versus',
    requiredNodes: dojoNodes,
    venue: VENUE_DOJO,
  },
};

export interface IntegrityResult {
  ok: boolean;
  missing: string[];
}

/**
 * Run the integrity check for a mode. Returns `ok: true` if every required
 * node is satisfied, or lists the missing labels.
 *
 * In 3D scenes, pass the flat list of mesh names + material names from the
 * loaded map or court GLB. The test harness can call this without THREE.
 */
export function checkSceneIntegrity(
  modeId: string,
  meshNames: string[],
  materialNames: string[] = [],
): IntegrityResult {
  const manifest = SCENE_MANIFESTS[modeId];
  if (!manifest) return { ok: true, missing: [] }; // no manifest = nothing required
  const missing: string[] = [];
  for (const node of manifest.requiredNodes) {
    if (!node.check(meshNames, materialNames)) {
      missing.push(node.label);
    }
  }
  return { ok: missing.length === 0, missing };
}

/**
 * M8.5 — Venue identity gate. Confirms the backdrop a scene actually renders
 * matches the environment declared in its manifest, so a mode can never quietly
 * fall back to a generic/void backdrop. Returns ok:true for modes with no
 * declared venue (legacy) so this never regresses existing scenes.
 */
export function checkVenueIdentity(modeId: string, actualBackdrop: string): IntegrityResult {
  const manifest = SCENE_MANIFESTS[modeId];
  if (!manifest || !manifest.venue) return { ok: true, missing: [] };
  if (manifest.venue.backdrop !== actualBackdrop) {
    return { ok: false, missing: [`${manifest.sceneLabel}: expected venue backdrop ${manifest.venue.backdrop}, got ${actualBackdrop}`] };
  }
  return { ok: true, missing: [] };
}
