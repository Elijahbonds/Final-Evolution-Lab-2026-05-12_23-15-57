/**
 * lib/anim/rebinder.ts — Phase 1 deliverable B: AnimationRebinder.
 *
 * PURE matching core (no THREE, no DOM) so it is unit-testable headless. Takes
 * a source clip's track/bone names + a target skeleton's bone names and builds
 * a bone map:
 *   1. exact-name match first
 *   2. then normalized match (strip mixamorig:, fel_, Armature| prefixes and
 *      |baselayer suffixes, drop separators, lowercase)
 *   3. every unmatched source bone is reported with its closest target
 *      candidate (by normalized Levenshtein distance) — never silently dropped.
 *
 * The THREE-touching retarget (rewrite AnimationClip track names) lives in a
 * thin wrapper (rebindClipTracks) that consumes this pure map.
 */

/** Strip skeleton-specific decoration so bones from different rigs compare. */
export function normalizeBoneName(raw: string): string {
  let s = raw;
  // Track names arrive as "NodeName.property" (three) — drop the property.
  const dot = s.lastIndexOf('.');
  if (dot > 0 && /^(position|quaternion|rotation|scale|weights|morphTargetInfluences)$/.test(s.slice(dot + 1))) {
    s = s.slice(0, dot);
  }
  // Babylon/Blender export decoration: "Armature|Clip|baselayer" — for a BONE
  // name we only ever see the node segment, but guard anyway.
  s = s.replace(/\|baselayer$/i, '');
  if (s.includes('|')) s = s.split('|').pop() as string;
  // Common retarget prefixes.
  s = s.replace(/^mixamorig[:_]?/i, '');
  s = s.replace(/^fel[:_]?/i, '');
  s = s.replace(/^armature[:_|]?/i, '');
  s = s.replace(/^bip\d*[:_ ]?/i, '');
  // Drop separators + lowercase so "Left_Arm", "LeftArm", "left arm" unify.
  s = s.replace(/[\s._:-]/g, '').toLowerCase();
  return s;
}

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(
        dp[j] + 1,
        dp[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = tmp;
    }
  }
  return dp[n];
}

export interface BoneMatch {
  source: string;
  target: string;
  kind: 'exact' | 'normalized';
}
export interface BoneMiss {
  source: string;
  normalized: string;
  closestCandidate: string | null;
  closestDistance: number;
}
export interface BoneMap {
  matched: BoneMatch[];
  unmatched: BoneMiss[];
  /** source bone -> target bone, only for matched. */
  map: Record<string, string>;
  matchedCount: number;
  unmatchedCount: number;
}

export function buildBoneMap(sourceBones: string[], targetBones: string[]): BoneMap {
  const targetByExact = new Map<string, string>();
  const targetByNorm = new Map<string, string>();
  for (const t of targetBones) {
    targetByExact.set(t, t);
    const n = normalizeBoneName(t);
    if (!targetByNorm.has(n)) targetByNorm.set(n, t);
  }

  const matched: BoneMatch[] = [];
  const unmatched: BoneMiss[] = [];
  const map: Record<string, string> = {};

  for (const src of sourceBones) {
    if (targetByExact.has(src)) {
      matched.push({ source: src, target: targetByExact.get(src)!, kind: 'exact' });
      map[src] = targetByExact.get(src)!;
      continue;
    }
    const norm = normalizeBoneName(src);
    if (targetByNorm.has(norm)) {
      matched.push({ source: src, target: targetByNorm.get(norm)!, kind: 'normalized' });
      map[src] = targetByNorm.get(norm)!;
      continue;
    }
    // closest candidate for a loud warning
    let best: string | null = null;
    let bestDist = Infinity;
    for (const [tnorm, tname] of targetByNorm) {
      const d = levenshtein(norm, tnorm);
      if (d < bestDist) {
        bestDist = d;
        best = tname;
      }
    }
    unmatched.push({ source: src, normalized: norm, closestCandidate: best, closestDistance: bestDist });
  }

  return {
    matched,
    unmatched,
    map,
    matchedCount: matched.length,
    unmatchedCount: unmatched.length,
  };
}

/**
 * Rewrite THREE AnimationClip track names from source rig to target rig using a
 * BoneMap. Kept thin + separate from the pure matcher. `THREE.AnimationClip` is
 * duck-typed (tracks[].name) so this file needs no static THREE import.
 *
 * Fails LOUDLY: any track whose bone has no match is reported via onUnmatched
 * and DROPPED from the rebound clip (so the caller can decide to fall back to
 * idle) — it is never silently pointed at a wrong/bind-pose target.
 */
export interface RebindResult<Clip> {
  clip: Clip;
  keptTracks: number;
  droppedTracks: string[];
  boneMap: BoneMap;
}

export function rebindClipTracks<
  Track extends { name: string; clone?: () => Track },
  Clip extends { name: string; duration: number; tracks: Track[]; clone?: () => Clip },
>(
  clip: Clip,
  sourceBones: string[],
  targetBones: string[],
  opts: { onUnmatched?: (miss: BoneMiss) => void; makeClip: (name: string, duration: number, tracks: Track[]) => Clip } ,
): RebindResult<Clip> {
  const boneMap = buildBoneMap(sourceBones, targetBones);
  for (const miss of boneMap.unmatched) opts.onUnmatched?.(miss);

  const kept: Track[] = [];
  const dropped: string[] = [];
  for (const track of clip.tracks) {
    const dot = track.name.lastIndexOf('.');
    const bone = dot > 0 ? track.name.slice(0, dot) : track.name;
    const prop = dot > 0 ? track.name.slice(dot) : '';
    const target = boneMap.map[bone] ?? (boneMap.map[normalizeBoneName(bone)] as string | undefined);
    if (!target) {
      dropped.push(track.name);
      continue;
    }
    const nt = (track.clone ? track.clone() : { ...track }) as Track;
    nt.name = `${target}${prop}`;
    kept.push(nt);
  }

  const clip2 = opts.makeClip(clip.name, clip.duration, kept);
  return { clip: clip2, keptTracks: kept.length, droppedTracks: dropped, boneMap };
}
