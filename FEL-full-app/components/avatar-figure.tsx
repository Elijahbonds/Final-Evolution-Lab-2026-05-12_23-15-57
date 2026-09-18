'use client';

import type { RosterAvatar } from '@/lib/game-data';
import { getCosmetic } from '@/lib/cosmetics';

// Stylized neon silhouette that morphs per body type. Pure SVG — deterministic, SSR-safe.
const BUILDS: Record<RosterAvatar['build'], { shoulder: number; hip: number; height: number; torso: number; limb: number }> = {
  skinny: { shoulder: 14, hip: 10, height: 100, torso: 4.5, limb: 3.5 },
  athletic: { shoulder: 20, hip: 13, height: 104, torso: 6, limb: 5 },
  strong: { shoulder: 27, hip: 17, height: 102, torso: 9, limb: 7 },
  tall: { shoulder: 19, hip: 12, height: 122, torso: 5.5, limb: 4.5 },
  obese: { shoulder: 26, hip: 30, height: 96, torso: 15, limb: 6.5 },
};

export function AvatarFigure({
  avatar,
  size = 96,
  cosmeticAssetId = null,
}: {
  avatar: RosterAvatar;
  size?: number;
  /** equipped AvatarCard cosmetic (assetId); applied as a rig overlay */
  cosmeticAssetId?: string | null;
}) {
  const b = BUILDS[avatar.build] ?? BUILDS.athletic;
  const c = avatar.accent;
  const cosmetic = getCosmetic(cosmeticAssetId);
  const cx = 50;
  const top = 130 - b.height;
  const headR = avatar.sex === 'female' ? 8.5 : 9.5;
  const headY = top + headR;
  const neckY = headY + headR + 2;
  const chestY = neckY + b.height * 0.16;
  const waistY = neckY + b.height * 0.42;
  const kneeY = neckY + b.height * 0.68;
  const footY = 128;
  const pony = avatar.sex === 'female';

  return (
    <svg viewBox="0 0 100 136" width={size} height={(size * 136) / 100} aria-hidden className="mx-auto block">
      <defs>
        <radialGradient id={`aura-${avatar.key}`} cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor={c} stopOpacity="0.28" />
          <stop offset="100%" stopColor={c} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="100" height="136" fill={`url(#aura-${avatar.key})`} />
      <g stroke={c} strokeLinecap="round" fill="none" style={{ filter: `drop-shadow(0 0 4px ${c})` }}>
        {/* head */}
        <circle cx={cx} cy={headY} r={headR} fill={c} fillOpacity="0.9" stroke="none" />
        {pony && <path d={`M ${cx + headR - 2} ${headY - 3} q 8 4 6 14`} strokeWidth="3" />}
        {/* torso */}
        <path d={`M ${cx} ${neckY} L ${cx} ${waistY}`} strokeWidth={b.torso} />
        {/* shoulders/arms */}
        <path d={`M ${cx - b.shoulder} ${chestY + 6} L ${cx} ${neckY + 2} L ${cx + b.shoulder} ${chestY + 6}`} strokeWidth={b.limb} />
        <path d={`M ${cx - b.shoulder} ${chestY + 6} L ${cx - b.shoulder - 2} ${waistY - 2}`} strokeWidth={b.limb} />
        <path d={`M ${cx + b.shoulder} ${chestY + 6} L ${cx + b.shoulder + 2} ${waistY - 2}`} strokeWidth={b.limb} />
        {/* hips/legs */}
        <path d={`M ${cx - b.hip * 0.55} ${waistY} L ${cx - b.hip} ${kneeY} L ${cx - b.hip - 1} ${footY}`} strokeWidth={b.limb + 1} />
        <path d={`M ${cx + b.hip * 0.55} ${waistY} L ${cx + b.hip} ${kneeY} L ${cx + b.hip + 1} ${footY}`} strokeWidth={b.limb + 1} />
        {/* belly for obese build */}
        {avatar.build === 'obese' && <ellipse cx={cx} cy={(chestY + waistY) / 2 + 3} rx={b.hip * 0.62} ry={b.height * 0.15} fill={c} fillOpacity="0.55" stroke="none" />}
      </g>
      {/* ground glow */}
      <ellipse cx={cx} cy={131} rx="24" ry="3" fill={c} opacity="0.35" />
      {/* AvatarCard cosmetic overlay on the shared rig (v1: 2D layer; GLB swap deferred) */}
      {cosmetic && (
        <g style={{ filter: `drop-shadow(0 0 5px ${cosmetic.color})` }}>
          {cosmetic.slot === 'head' && (
            <path
              d={`M ${cx - headR - 1} ${headY - 1} q ${headR + 1} ${-headR - 5} ${2 * headR + 2} 0`}
              stroke={cosmetic.color}
              strokeWidth="3"
              strokeLinecap="round"
              fill="none"
            />
          )}
          {cosmetic.slot === 'torso' && (
            <path
              d={`M ${cx - b.shoulder * 0.7} ${chestY + 8} L ${cx} ${neckY + 4} L ${cx + b.shoulder * 0.7} ${chestY + 8} L ${cx} ${waistY} Z`}
              stroke={cosmetic.color}
              strokeWidth="2"
              fill={cosmetic.color}
              fillOpacity="0.16"
            />
          )}
          {cosmetic.slot === 'effect' && (
            <circle cx={cx} cy={(neckY + waistY) / 2} r={b.height * 0.34} stroke={cosmetic.color} strokeWidth="1.5" strokeDasharray="3 4" fill="none" opacity="0.7" />
          )}
        </g>
      )}
    </svg>
  );
}
