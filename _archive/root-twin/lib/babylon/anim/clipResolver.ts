// clipResolver — every requested clip resolves to something playable, loudly.

import { CLIP_ALIASES, FALLBACK_CLIP } from './clipAliases';

export interface ResolvedClip { clip: string; speedRatio: number; exact: boolean }

const SUFFIX = /_c\d+$/;
const missing = new Set<string>();

/** Find a clip in `available` matching `wanted`, exact first, then de-suffixed
 *  ('run_c64' matches 'run') — defense-in-depth against the M30 suffix bug. */
function findClip(wanted: string, available: Set<string>): string | null {
  if (available.has(wanted)) return wanted;
  for (const nm of available) {
    if (nm.replace(SUFFIX, '') === wanted) return nm;
  }
  return null;
}

export function resolveClip(name: string, available: Set<string>): ResolvedClip {
  const exact = findClip(name, available);
  if (exact) return { clip: exact, speedRatio: 1, exact: exact === name };

  const alias = CLIP_ALIASES[name];
  if (alias) {
    const hit = findClip(alias[0], available);
    if (hit) return { clip: hit, speedRatio: alias[1], exact: false };
  }

  if (!missing.has(name)) {
    missing.add(name);
    // Loud by design — the silent-null path is how the T-pose shipped 3 times.
    console.error(
      `[FEL-ANIM] MISSING CLIP "${name}" — no exact/alias match in ` +
      `[${[...available].join(', ')}]. Fallback "${FALLBACK_CLIP[0]}". ` +
      `Missing so far: ${[...missing].join(', ')}`,
    );
  }
  const fb = findClip(FALLBACK_CLIP[0], available);
  if (fb) return { clip: fb, speedRatio: FALLBACK_CLIP[1], exact: false };
  const first = [...available][0] ?? '';
  return { clip: first, speedRatio: 1, exact: false };
}

export const missingClipList = (): string[] => [...missing];
export const missingClipCount = (): number => missing.size;
