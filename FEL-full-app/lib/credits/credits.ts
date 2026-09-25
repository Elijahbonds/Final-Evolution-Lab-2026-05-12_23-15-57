// credits — the outside assets, models, motion, voices, typefaces and engines the app ships, what each is used for,
// and the licence it comes under.
//
// HOTFIX (2026-09-24): the app shipped CMU, Kenney, Quaternius, MakeHuman, MediaPipe and Kokoro material with no
// credits page, and CMU's required acknowledgement appeared nowhere. /credits renders this list, and
// lib/credits/credits.test.ts ties it to the manifests: every file under public/ must resolve to an entry here, and
// every licence string a manifest carries must be one an entry claims.
//
// Nothing here is guessed. Each licence comes from the files in `recordedIn` (this repo) or the records in `evidence`
// (the owner's older repo, or the licensor's own published terms). Where no record settles it, the entry is PENDING:
// the page says "licence being confirmed", `missing` holds the owner's question, and the id sits on PENDING_OWNER.
//
// HOTFIX (2026-09-24): the owner's ban (no NC, ND, SA, personal-use or unlabeled licence) is an ALLOWLIST now, not a
// list of bad words. A licence ships only if it is a named open licence, one of our own first-party statements, or a
// source's own terms that were read and pinned in REVIEWED_TERMS. Anything else counts as unlabeled. PENDING_OWNER is
// an exact list: a new unlabeled entry fails the test, and so does a pending entry whose licence has been recorded.

/** CMU's required acknowledgement, word for word. The test fails if a character of it changes. */
export const CMU_ACKNOWLEDGEMENT =
  'The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217.';

/** Shown in place of a licence the owner is still confirming. The ban treats it as unlabeled unless it is on PENDING_OWNER. */
export const LICENCE_PENDING = 'licence being confirmed';

export type CreditSection = 'motion' | 'models' | 'sound' | 'software' | 'type' | 'ours';

/**
 * open         a public licence named in OPEN_LICENCES (CC0, Apache-2.0, MIT, OFL-1.1…)
 * terms        the source's own written terms, read and pinned in REVIEWED_TERMS (CMU, Meshy…)
 * first-party  made by the owner or by us
 * pending      no record settles it yet; the owner has been asked (PENDING_OWNER)
 */
export type LicenceStatus = 'open' | 'terms' | 'first-party' | 'pending';

export interface Credit {
  id: string;
  section: CreditSection;
  title: string;
  by: string;
  /** What in the app uses it, in plain words. */
  used: string;
  /** The licence as it is recorded, or LICENCE_PENDING. */
  licence: string;
  licenceUrl?: string;
  status: LicenceStatus;
  /** The source's own site. */
  link?: string;
  /** Text the source requires us to show, rendered word for word. */
  notice?: string;
  /** The files in THIS repo that record this source and its licence (the test checks each exists). */
  recordedIn: string[];
  /** Records outside this repo that settle the licence: the owner's older repo, the licensor's published terms. */
  evidence?: string[];
  /**
   * The files under public/ this entry credits, relative to public/. A path ending in '/' is a folder; any other path
   * is that file, or a folder of that name. The longest match wins, so a folder can hand one file to another entry.
   */
  covers: string[];
  /** The exact licence strings the manifests carry for this source (scripts/mocap/sources.mts, clip data, JSON manifests). */
  manifestLicences: string[];
  /** An installed package whose package.json "license" must equal `licence` (the test reads it). */
  npmPackage?: string;
  /** For a pending licence: the question the owner has to answer. */
  missing?: string;
}

/** The public licences that may ship, each with its text. A licence string outside this list is not "open". */
export const OPEN_LICENCES: Record<string, string> = {
  'CC0 1.0': 'https://creativecommons.org/publicdomain/zero/1.0/',
  CC0: 'https://creativecommons.org/publicdomain/zero/1.0/',
  'CC BY 4.0': 'https://creativecommons.org/licenses/by/4.0/',
  'CC BY 3.0': 'https://creativecommons.org/licenses/by/3.0/',
  'Apache-2.0': 'https://www.apache.org/licenses/LICENSE-2.0',
  MIT: 'https://opensource.org/license/mit',
  'BSD-2-Clause': 'https://opensource.org/license/bsd-2-clause',
  'BSD-3-Clause': 'https://opensource.org/license/bsd-3-clause',
  ISC: 'https://opensource.org/license/isc-license-txt',
  Unlicense: 'https://unlicense.org/',
  'OFL-1.1': 'https://openfontlicense.org/',
};

/** The first-party statements that may ship. */
export const FIRST_PARTY_LICENCES: readonly string[] = [
  "Owner's own capture", "Owner's own artwork", 'Our own work', 'Our own work, dedicated CC0',
];

const CMU_TERMS = 'CMU Graphics Lab terms: free to include in commercially sold products; the data itself may not be resold, even converted';
const MESHY_TERMS = "Made on the owner's Meshy subscription; Meshy's terms give a subscriber's output to the subscriber";
const OPENAI_TERMS = "Owner's own output: OpenAI's terms assign image output to the user";

// HOTFIX (2026-09-24): the SEELE descriptors are gone. Nothing read them, and the pack they came from is licensed to the
// owner and "not redistributable outside this project", so they are no longer shipped or credited.

/** A source's own terms, read and pinned by entry id. A 'terms' entry ships only if its licence is the one pinned here. */
export const REVIEWED_TERMS: Record<string, string> = {
  cmu: CMU_TERMS,
  meshy: MESHY_TERMS,
  'openai-image': OPENAI_TERMS,
};

/**
 * HOTFIX (2026-09-24): the licences no record settles yet, each an entry id whose `missing` line is the owner's
 * question. The test accepts exactly this list and prints it on every run. Add to it only with the owner's say-so;
 * take an id off it in the same change that records its licence.
 *
 * Empty since the owner answered all three (2026-09-24): the Venice court and the story hub are Meshy exports made on
 * the owner's paid subscription (now under the Meshy entry), and the venue card images are the owner's own AI art.
 */
export const PENDING_OWNER: readonly string[] = [];

export const CREDITS: Credit[] = [
  // ── motion ──────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'cmu',
    section: 'motion',
    title: 'CMU Graphics Lab Motion Capture Database',
    by: 'Carnegie Mellon University',
    used: 'Rival and style motion (combat, hoops, capoeira, tricking, parkour) and the body-reading test captures. We read the cgspeed BVH conversion and retarget it onto our rig.',
    licence: CMU_TERMS,
    status: 'terms',
    link: 'http://mocap.cs.cmu.edu/',
    notice: CMU_ACKNOWLEDGEMENT,
    recordedIn: ['scripts/mocap/sources.mts', 'lib/babylon/anim/authored/mocapOpponents.ts', 'lib/babylon/anim/authored/mocapStyles.ts', 'lib/pose/__fixtures__/'],
    evidence: [
      'scripts/mocap/sources.mts header: "free to include in commercially-sold products; the data itself may not be resold, even converted (mocap.cs.cmu.edu). Owner approved these terms 2026-09-14."',
      'mocap.cs.cmu.edu (FAQ / info): the terms above and the acknowledgement text, which the page shows word for word',
    ],
    covers: [],
    manifestLicences: ['CMU Graphics Lab Motion Capture Database (mocap.cs.cmu.edu) — free in commercial products, not for resale of the data'],
  },
  {
    id: 'quaternius-ual',
    section: 'motion',
    title: 'Universal Animation Library 2 (Standard)',
    by: 'Quaternius',
    used: 'Hit reactions, knockdowns and get-ups for the rivals.',
    licence: 'CC0 1.0',
    licenceUrl: OPEN_LICENCES['CC0 1.0'],
    status: 'open',
    recordedIn: ['scripts/mocap/sources.mts', 'lib/babylon/anim/authored/mocapOpponents.ts'],
    covers: [],
    manifestLicences: ['Quaternius Universal Animation Library 2 — CC0 1.0'],
  },
  {
    id: 'owner-captures',
    section: 'motion',
    title: "The owner's own motion captures",
    by: 'Recorded by the owner, converted with DeepMotion Animate 3D',
    used: 'Moves captured from the owner’s own videos: dunks, jumps, shots, and the golf, tennis, volleyball, baseball, football and board takes.',
    licence: "Owner's own capture",
    status: 'first-party',
    recordedIn: ['scripts/mocap/sources.mts', 'scripts/mocap/_inventory.mts', 'docs/history/HUMAN-MODEL-RESEARCH.md'],
    evidence: [
      'rork-final-evolution-lab 0271102 (nexus/assets-qa) infra/ASSET_ATTRIBUTION.md: "DeepMotion mocap: owner\'s own recorded performances processed through the owner\'s DeepMotion account"',
      // HOTFIX (2026-09-24): the files themselves say who made them. Every take here carries a DeepMotion Animate 3D
      // animation named "My Movie 198/199_customModel_…"; the test reads that name, so a clip from anywhere else fails.
      'public/models/clips/*.glb: each take carries a "My Movie 19x_customModel_…" animation, DeepMotion Animate 3D\'s export naming',
    ],
    covers: ['models/clips/', 'mocap/dunk.json'],
    manifestLicences: ["owner's own DeepMotion capture"],
  },

  // ── models and art ──────────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'meshy',
    section: 'models',
    title: 'Meshy',
    by: 'The owner’s Meshy exports (meshy.ai)',
    used: 'Rival and crowd bodies, the owner’s own body model, some rival run, walk and strike clips, balls, hoops, boards, helmets, the planes and karts, the kit packs, the venue maps (the Venice court among them), the story mode’s hub map and the backdrop art.',
    licence: MESHY_TERMS,
    status: 'terms',
    link: 'https://www.meshy.ai/',
    recordedIn: [
      'scripts/map/pipeline.mts', 'scripts/backdrop/pipeline.mts', 'docs/history/MESHY-ASSETS-2026-09-05.md',
      'docs/CAST-MESHY-2026-09-22.md', 'public/models/athletes/*.json', 'public/models/crowd/*.json', 'scripts/mocap/sources.mts',
      'docs/SPEC-COURT-LOCATIONS.md',
    ],
    evidence: [
      'rork-final-evolution-lab 0271102 (nexus/assets-qa) infra/ASSET_ATTRIBUTION.md: "Meshy outputs (venues, props, character rigs, preset animations): generated under the repository owner\'s Meshy subscription; licensed to subscriber per Meshy ToS."',
      'rork-final-evolution-lab ae3bae6 infra/asset_sources.json: "Owner-generated via Meshy subscription (Meshy ToS: outputs licensed to subscriber)"',
      'Meshy\'s terms: a paid plan\'s output belongs to the subscriber; free-plan output is CC BY 4.0 (also recorded in lib/babylon/platform/GenerationService.ts). Either way no banned licence.',
      // HOTFIX (2026-09-24): the five npc_* clips are Meshy animation exports, not DeepMotion takes. Their animations are
      // named "Armature|running|baselayer", "Armature|walking_man|baselayer" and "Armature|Boxing_Guard_…|baselayer",
      // exactly as Meshy names the clips in the owner's 2026-09-22 drop (Meshy_AI_Animation_Running_withSkin.glb).
      'public/models/clips/npc_*.glb: "…|baselayer" animation names, Meshy\'s own export naming',
      // HOTFIX (2026-09-24): the owner settled the two maps our records disagreed on or had no record of.
      'The owner, 2026-09-24: models/maps/venice-blue-court.glb (and its baked copy) and models/story-hub.glb are Meshy exports made on the owner\'s paid Meshy subscription. Older notes call the court "the Luma scan"; the commit that put its current bytes in (e25e9797) calls it the "luma-inspo locked Meshy court"',
    ],
    covers: [
      'models/athletes/', 'models/crowd/', 'models/meshy/', 'models/props/meshy', 'models/vehicles/', 'models/kits/', 'models/maps/',
      'models/candidates/meshy22/', 'models/candidates/elijah-meshy.glb', 'models/candidates/elijah-meshy.mobile.glb',
      'models/elijah.glb', 'models/elijah-hero.glb', 'models/elijah-hero.json', 'models/elijah-meshy.glb', 'models/elijah-meshy.mobile.glb',
      'models/clips/npc_ericnash_combo.glb', 'models/clips/npc_ericnash_run.glb', 'models/clips/npc_ericnash_walk.glb',
      'models/clips/npc_tall_run.glb', 'models/clips/npc_tall_walk.glb',
      'models/story-hub.glb',
      'backdrops/',
    ],
    manifestLicences: ["owner's Meshy animation exports (~/Downloads/FEL_hero_upload/Elijah*.glb)"],
  },
  {
    id: 'kenney',
    section: 'models',
    title: 'Kenney game kits',
    by: 'Kenney (kenney.nl)',
    used: 'Venue props: trees, bushes, barriers, ramps, rails, benches and blocks (the city-suburban, mini-arena, mini-skate, minigolf, nature and racing kits).',
    licence: 'CC0 1.0',
    licenceUrl: OPEN_LICENCES['CC0 1.0'],
    status: 'open',
    link: 'https://kenney.nl/',
    recordedIn: ['public/models/props/manifest.json', 'scripts/venue/curate-props.mts'],
    covers: ['models/props/'],
    manifestLicences: ['CC0 1.0 — Kenney (kenney.nl), via github.com/shorepine/kenney'],
  },
  {
    id: 'makehuman',
    section: 'models',
    title: 'MakeHuman community assets (MPFB2)',
    by: 'MakeHuman Community',
    used: 'The kit bodies the hero is built from, with their skins, hair and clothes.',
    licence: 'CC0',
    licenceUrl: OPEN_LICENCES.CC0,
    status: 'open',
    link: 'https://github.com/makehumancommunity/mpfb2',
    recordedIn: ['public/models/skins/manifest.json', 'scripts/avatar/skins/export-skins.mts', 'scripts/avatar/mpfb/dress-kit.py', 'docs/history/HUMAN-MODEL-RESEARCH.md'],
    // HOTFIX (2026-09-24): models/_forge/ left this entry for 'fel': it holds the code-built FORGE hero, not a kit body.
    covers: ['models/skins/', 'models/fel-hero.glb', 'models/fel-hero.json', 'models/fel-hero.mobile.glb', 'models/candidates/'],
    manifestLicences: ['CC0 (MakeHuman community assets)'],
  },
  {
    id: 'openai-image',
    section: 'models',
    title: 'Venice golden-hour reference image',
    by: 'Generated by the owner with OpenAI’s image model',
    used: 'A reference picture kept beside the Venice court model. No screen shows it.',
    licence: OPENAI_TERMS,
    status: 'terms',
    recordedIn: ['public/models/maps/venice-golden-hour.png'],
    evidence: [
      'The file\'s own C2PA manifest: claim generator "OpenAI Media Service API", softwareAgent "gpt-image" 2.0, digitalSourceType trainedAlgorithmicMedia, created 2026-07-06',
      'OpenAI Terms of Use, "Ownership of content": the user owns the Output, and OpenAI assigns to the user its right, title and interest in it',
    ],
    covers: ['models/maps/venice-golden-hour.png'],
    manifestLicences: [],
  },
  {
    id: 'venue-cards',
    section: 'models',
    title: 'Venue card images',
    // HOTFIX (2026-09-24): the owner made all sixteen. The files carry no metadata naming the tool, so none is named here.
    by: 'The owner, made with a paid AI image tool',
    used: 'The pictures on the venue cards.',
    licence: "Owner's own artwork",
    status: 'first-party',
    recordedIn: ['lib/game-data.ts'],
    evidence: [
      'The owner, 2026-09-24: the sixteen public/venues/*.jpg images are the owner\'s own AI-generated art, made on a paid plan of an AI image tool. They arrived with the imported web baseline (8721ec28, 2026-08-09) and carry no metadata of their own',
    ],
    covers: ['venues/'],
    manifestLicences: [],
  },

  // ── voices and sound ────────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'kokoro',
    section: 'sound',
    title: 'Kokoro-82M',
    by: 'hexgrad; ONNX export by onnx-community',
    used: 'The voices of the MC, the crowd, the players, the coach and the quiz host. The words are our own scripts, rendered offline on our own machine.',
    licence: 'Apache-2.0',
    licenceUrl: OPEN_LICENCES['Apache-2.0'],
    status: 'open',
    link: 'https://huggingface.co/hexgrad/Kokoro-82M',
    recordedIn: ['tools/voice/render-mic.py', 'docs/SPEC-THE-MIC.md', 'lib/babylon/audio/mic/cast.ts'],
    covers: ['audio/voice/'],
    manifestLicences: [],
  },
  {
    id: 'fel-808',
    section: 'sound',
    title: '808 drum and synth kit',
    by: 'Final Evolution Lab',
    used: 'The music mode’s drum and synth samples, synthesised from scratch with no samples from anywhere else.',
    licence: 'Our own work, dedicated CC0',
    status: 'first-party',
    recordedIn: ['scripts/gen-808-kit.py'],
    covers: ['audio/kits/'],
    manifestLicences: [],
  },

  // ── software the browser runs ───────────────────────────────────────────────────────────────────────────────────
  {
    id: 'babylonjs',
    section: 'software',
    title: 'Babylon.js',
    by: 'The Babylon.js contributors',
    used: 'The 3D engine.',
    licence: 'Apache-2.0',
    licenceUrl: OPEN_LICENCES['Apache-2.0'],
    status: 'open',
    link: 'https://www.babylonjs.com/',
    recordedIn: ['node_modules/@babylonjs/core/package.json'],
    covers: [],
    manifestLicences: [],
    npmPackage: '@babylonjs/core',
  },
  {
    id: 'havok',
    section: 'software',
    title: 'Havok Physics for Babylon.js',
    by: 'Havok',
    used: 'Physics.',
    licence: 'MIT',
    licenceUrl: OPEN_LICENCES.MIT,
    status: 'open',
    recordedIn: ['node_modules/@babylonjs/havok/package.json'],
    covers: ['vendor/havok/'],
    manifestLicences: [],
    npmPackage: '@babylonjs/havok',
  },
  {
    id: 'draco',
    section: 'software',
    title: 'Draco',
    by: 'Google',
    used: 'Decodes compressed meshes.',
    licence: 'Apache-2.0',
    licenceUrl: OPEN_LICENCES['Apache-2.0'],
    status: 'open',
    link: 'https://github.com/google/draco',
    recordedIn: ['node_modules/draco3dgltf/package.json'],
    covers: ['loaders/draco/'],
    manifestLicences: [],
    npmPackage: 'draco3dgltf',
  },
  {
    id: 'basis',
    section: 'software',
    title: 'Basis Universal transcoder',
    by: 'Binomial LLC',
    used: 'Decodes compressed textures.',
    licence: 'Apache-2.0',
    licenceUrl: OPEN_LICENCES['Apache-2.0'],
    status: 'open',
    link: 'https://github.com/BinomialLLC/basis_universal',
    recordedIn: ['public/loaders/basis/README.md'],
    covers: ['loaders/basis/'],
    manifestLicences: [],
  },
  {
    id: 'mediapipe',
    section: 'software',
    title: 'MediaPipe Tasks Vision and the Pose Landmarker models',
    by: 'Google',
    used: 'Reads body landmarks from the camera, on your device.',
    licence: 'Apache-2.0',
    licenceUrl: OPEN_LICENCES['Apache-2.0'],
    status: 'open',
    link: 'https://github.com/google-ai-edge/mediapipe',
    // HOTFIX (2026-09-24): the pose models and wasm are self-hosted under public/pose/ (d03c24b3), and its README records
    // their licence; the test reads it every run.
    recordedIn: ['node_modules/@mediapipe/tasks-vision/package.json', 'public/pose/README.md'],
    covers: ['pose/'],
    manifestLicences: [],
    npmPackage: '@mediapipe/tasks-vision',
  },
  {
    id: 'mediapipe-face-model',
    section: 'software',
    title: 'MediaPipe Face Landmarker model',
    by: 'Google',
    used: 'The face scan’s landmark model, loaded from Google’s MediaPipe model storage.',
    licence: 'Apache-2.0',
    licenceUrl: OPEN_LICENCES['Apache-2.0'],
    status: 'open',
    link: 'https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker',
    recordedIn: ['components/facescan/face-scan-capture.tsx'],
    evidence: [
      'face_landmarker.task bundles three models, per Google\'s Face Landmarker guide: BlazeFace (short range), Face Mesh V2 and Blendshape V2',
      'Google\'s model cards for those three (storage.googleapis.com/mediapipe-assets/…Model Card….pdf) license each under the Apache License 2.0',
    ],
    covers: [],
    manifestLicences: [],
  },

  // ── typefaces ───────────────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'fonts',
    section: 'type',
    title: 'Barlow Condensed, IBM Plex Sans and JetBrains Mono',
    // HOTFIX (2026-09-24): next/font/google downloads the files at build time and serves them from our own origin, so
    // the browser never asks Google for them.
    by: 'Google Fonts families, self-hosted at build time by next/font',
    used: 'The app’s headings, body text and numbers.',
    licence: 'OFL-1.1',
    licenceUrl: OPEN_LICENCES['OFL-1.1'],
    status: 'open',
    recordedIn: ['app/layout.tsx'],
    evidence: [
      'github.com/google/fonts: all three families sit in its ofl/ folder (ofl/barlowcondensed, ofl/ibmplexsans, ofl/jetbrainsmono), the SIL Open Font License 1.1 set',
      'Upstream: github.com/IBM/plex LICENSE.txt and github.com/JetBrains/JetBrainsMono OFL.txt are the SIL Open Font License 1.1',
    ],
    covers: [],
    manifestLicences: [],
  },

  // ── ours ────────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'owner-brand',
    section: 'ours',
    title: 'Final Evolution marks and photographs',
    by: 'The owner',
    used: 'The crest, the wordmark, the badge and the portrait photographs.',
    // public/brand/README.md records the folder as the owner's own artwork. It says the photographs were "supplied"
    // and does not name who took them; that question is in the owner's list, not a gap in this record.
    licence: "Owner's own artwork",
    status: 'first-party',
    recordedIn: ['public/brand/README.md'],
    covers: ['brand/'],
    manifestLicences: [],
  },
  {
    id: 'fel',
    section: 'ours',
    title: 'Final Evolution Lab',
    by: 'Final Evolution Lab',
    used: 'What we make ourselves: the voice scripts, the synthesised sound effects and walk-out music, the painted beach sky, the code-built first hero and its rivals, the Venice pier and sail-boat props, the link-preview image, the navigation meshes, the icon and the app’s data files.',
    licence: 'Our own work',
    status: 'first-party',
    recordedIn: [
      'lib/babylon/audio/SoundKit.ts', 'lib/babylon/music/WalkOut.ts', 'scripts/backdrop/paint-beach-dome.py', 'scripts/venue/navmesh-gen.mts',
      'scripts/anim-audit.ts', 'scripts/avatar/forge.mts', 'scripts/avatar/roster.mts', 'docs/history/SHIP-PASS-3.md', 'docs/history/SHIP-PASS-6-LOOK.md',
    ],
    evidence: [
      'models/_forge/: the FORGE hero and its roster, "built from nothing but code" (scripts/avatar/forge.mts, scripts/avatar/roster.mts), archived there 2026-09-04 (docs/history/SHIP-PASS-3.md)',
      'models/props/venice/: "the second writer\'s venice kit (far pier, three sail billboards)" (docs/history/SHIP-PASS-6-LOOK.md); the files are Blender boxes and cylinders (pier_deck, pier_post_*, sail_hull/mast/cloth) with flat materials and no textures',
      'og-image.png: the app\'s name and tagline in the brand colours over plain circles and lines; no outside imagery in it',
    ],
    covers: [
      'favicon.svg', 'models/navmesh/', 'anim-audit/', 'agent-manifest.json', 'backdrops/baked/beach.jpg',
      'models/_forge/', 'models/props/venice/', 'og-image.png',
    ],
    manifestLicences: [],
  },
];

/** Files under public/ that are not assets, each with the reason. */
export const NOT_ASSETS: Record<string, string> = {
  '_prisma/': 'the generated Prisma client, copied into public/ for the deploy bundle (docs/DEPLOY-NOTES-PRISMA.md): server code, not an asset',
};

const matches = (path: string, cover: string) =>
  cover.endsWith('/') ? path.startsWith(cover) : path === cover || path.startsWith(cover + '/');

/** The entry that credits a file under public/ (path relative to public/, no leading slash), or null. Longest match wins. */
export function creditForPublicPath(path: string, credits: Credit[] = CREDITS): Credit | null {
  const p = path.replace(/^\/+/, '').replace(/^public\//, '');
  let best: Credit | null = null, bestLen = -1;
  for (const c of credits) for (const cover of c.covers) {
    if (matches(p, cover) && cover.length > bestLen) { best = c; bestLen = cover.length; }
  }
  return best;
}

/** The reason a public/ path is not an asset, or null. */
export function notAssetReason(path: string): string | null {
  const p = path.replace(/^\/+/, '').replace(/^public\//, '');
  for (const [cover, why] of Object.entries(NOT_ASSETS)) if (matches(p, cover)) return why;
  return null;
}

/** The entry that claims a licence string a manifest carries, or null. */
export function creditForManifestLicence(licence: string, credits: Credit[] = CREDITS): Credit | null {
  return credits.find((c) => c.manifestLicences.includes(licence)) ?? null;
}

export type BannedRule = 'NC' | 'ND' | 'SA' | 'personal-use' | 'copyleft' | 'unlabeled';

/**
 * Names the banned kind a piece of text describes (a licence, a sidecar's `source`, a model's copyright line), or null.
 * This only NAMES the rule for a failure message and screens free text; it never lets a licence through. That is
 * licenceRule's allowlist. "SA" and "ND" count only as licence terms (BY-SA, BY-NC-ND), never a company suffix ("Google SA").
 */
export function bannedTerms(text: string): Exclude<BannedRule, 'unlabeled'> | null {
  const t = text ?? '';
  if (/\bBY[- _]NC\b|\bnon[- ]?commercial\b|\bnot for (?:any )?commercial\b|\bno commercial\b|\bcommercial use (?:is )?(?:prohibited|forbidden|not (?:allowed|permitted))\b/i.test(t)) return 'NC';
  if (/\bBY[- _](?:NC[- _])?ND\b|\bno[- ]?deriv/i.test(t)) return 'ND';
  if (/\bBY[- _](?:NC[- _])?SA\b|\bshare[- ]?alike\b/i.test(t)) return 'SA';
  if (/\bpersonal[- ](?:use|projects?|licen[cs]e)\b|\bfor personal\b|\b(?:educational|editorial|evaluation|demo(?:nstration)?) (?:use|purposes) only\b/i.test(t)) return 'personal-use';
  if (/\b(?:A|L)?GPL\b|\bGNU (?:Affero |Lesser )?General Public\b|\bODbL\b|\bOpen Database License\b/i.test(t)) return 'copyleft';
  return null;
}

/**
 * The owner's ban (RORK addendum, 2026-09-24): no non-commercial, no-derivatives, share-alike, personal-use or
 * unlabeled licence ships. Returns the rule an entry's licence breaks, or null. An allowlist: a licence that is not a
 * named open licence, one of our first-party statements, or terms pinned for that entry id, counts as unlabeled.
 * A pending licence counts as unlabeled too; PENDING_OWNER is what lets the known ones through (licenceProblems).
 */
export function licenceRule(c: Pick<Credit, 'id' | 'licence' | 'status'>): BannedRule | null {
  const l = (c.licence ?? '').trim();
  const named = bannedTerms(l);
  if (named) return named;
  const own = (o: Record<string, string>, k: string) => Object.prototype.hasOwnProperty.call(o, k);
  switch (c.status) {
    case 'open': return own(OPEN_LICENCES, l) ? null : 'unlabeled';
    case 'first-party': return FIRST_PARTY_LICENCES.includes(l) ? null : 'unlabeled';
    case 'terms': return own(REVIEWED_TERMS, c.id) && REVIEWED_TERMS[c.id] === l ? null : 'unlabeled';
    default: return 'unlabeled';
  }
}

/**
 * Everything wrong with the list's licences, as sentences. Empty means the ban holds. A banned licence is always a
 * problem; an unlabeled one is a problem unless its id is on the pending list (with a question for the owner); and a
 * pending id whose licence is now recorded, or that no entry has, is a problem too, so the list cannot go stale.
 */
export function licenceProblems(credits: Credit[] = CREDITS, pending: readonly string[] = PENDING_OWNER): string[] {
  const out: string[] = [];
  const ids = new Set(credits.map((c) => c.id));
  for (const c of credits) {
    const rule = licenceRule(c);
    if (rule && rule !== 'unlabeled') out.push(`${c.id}: BANNED ${rule} licence "${c.licence}". Remove the asset or replace it.`);
    else if (rule === 'unlabeled' && !pending.includes(c.id)) out.push(`${c.id}: UNLABELED licence "${c.licence}". Record a permitted licence; PENDING_OWNER takes new ids only with the owner's say-so.`);
    else if (rule === 'unlabeled' && (c.status !== 'pending' || c.licence !== LICENCE_PENDING || (c.missing?.trim().length ?? 0) < 20)) {
      out.push(`${c.id}: on PENDING_OWNER, so it must be status "pending", show "${LICENCE_PENDING}" and say in \`missing\` what the owner must answer.`);
    }
    for (const l of c.manifestLicences) {
      const named = bannedTerms(l);
      if (named) out.push(`${c.id}: BANNED ${named} manifest licence "${l}".`);
    }
  }
  for (const id of pending) {
    if (!ids.has(id)) out.push(`${id}: on PENDING_OWNER but no entry has this id.`);
    else if (!licenceRule(credits.find((c) => c.id === id)!)) out.push(`${id}: its licence is recorded now; take it off PENDING_OWNER.`);
  }
  return out;
}

export const SECTION_TITLES: Record<CreditSection, string> = {
  motion: 'Motion',
  models: 'Models and art',
  sound: 'Voices and sound',
  software: 'Software the browser runs',
  type: 'Typefaces',
  ours: 'Our own work',
};

export const SECTION_ORDER: CreditSection[] = ['motion', 'models', 'sound', 'software', 'type', 'ours'];

export function creditsInSection(section: CreditSection, credits: Credit[] = CREDITS): Credit[] {
  return credits.filter((c) => c.section === section);
}
