/** Mode ids parked out of every player-facing listing. Remove an entry and the mode comes back everywhere. */
export const UNLISTED_MODES = ['training'] as const;

export type UnlistedModeId = (typeof UNLISTED_MODES)[number];

const UNLISTED: ReadonlySet<string> = new Set<string>(UNLISTED_MODES);

/** Is this mode id parked? Accepts the catalogue/session spelling ('training'); null and unknown ids are listed. */
export function isUnlistedMode(id: string | null | undefined): boolean {
  return typeof id === 'string' && UNLISTED.has(id);
}
