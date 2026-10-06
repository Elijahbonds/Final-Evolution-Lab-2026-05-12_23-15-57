// lib/soundtrack/rights.ts — CREATOR SOUNDTRACK (owner, 2026-10-06: "rights text = use proposed wording (versioned +
// timestamped)"). The attestation a creator ticks before a track can be submitted, and the record a card keeps of it.
//
// The card stores {text, version, at} (the plan's piece A, `rights`). The catalogue plays a card only if its record names
// a version listed here and carries this version's exact words, so a changed wording is a new version, and a card that
// agreed to an older one is still known to have agreed to exactly that. lane/create-hub shows RIGHTS_TEXT in step 2 and
// stores rightsRecord(); nothing here is ever rewritten in place: add a version, never edit one.

export interface RightsRecord { text: string; version: string; at: string }

export const RIGHTS_VERSIONS: Readonly<Record<string, string>> = {
  'music-2026-10-06':
    "I made this, or I own all rights to every sound in it. No samples, beats, vocals or AI imitations of artists I don't " +
    'have rights to. FEL may play it in menus, loading screens, games, replays and the end screen, credited to me.',
};

export const RIGHTS_VERSION = 'music-2026-10-06';
export const RIGHTS_TEXT = RIGHTS_VERSIONS[RIGHTS_VERSION];

export function rightsRecord(now: Date = new Date()): RightsRecord {
  return { text: RIGHTS_TEXT, version: RIGHTS_VERSION, at: now.toISOString() };
}

/** A stored record is valid when its version is known, its words are that version's words, and it has a time. */
export function isValidRights(r: unknown): r is RightsRecord {
  if (!r || typeof r !== 'object') return false;
  const x = r as Record<string, unknown>;
  return typeof x.version === 'string' && RIGHTS_VERSIONS[x.version] !== undefined && x.text === RIGHTS_VERSIONS[x.version]
    && typeof x.at === 'string' && !Number.isNaN(Date.parse(x.at));
}
