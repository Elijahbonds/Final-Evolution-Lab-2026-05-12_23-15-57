/**
 * lib/cosmetics.ts — AvatarCard cosmetic descriptors for the shared rig.
 *
 * v1 applies cosmetics as a deterministic visual layer on the SHARED avatar
 * representation (components/avatar-figure.tsx). Each cosmetic references a
 * placeholder GLB path for the eventual 3D rig swap.
 *
 * ASSET LICENSING — FLAG: the `glb` paths below are PLACEHOLDERS. No
 * commercial-safe GLB has been confirmed/sourced yet. The 3D GLB swap on the
 * three.js rig is deferred until licensed assets are in hand; the 2D overlay
 * here is the shippable v1 cosmetic. (Per ABACUS_WORKING_CONTEXT compliance:
 * commercial-safe licenses only; unconfirmed assets flagged.)
 */

export type CosmeticSlot = 'head' | 'torso' | 'effect';

export interface CosmeticDescriptor {
  assetId: string;
  slot: CosmeticSlot;
  label: string;
  /** overlay accent applied on the shared AvatarFigure rig */
  color: string;
  /** placeholder GLB for the future 3D rig swap (NOT yet licensed) */
  glb: string;
}

export const COSMETICS: Record<string, CosmeticDescriptor> = {
  avatar_neon_visor: {
    assetId: 'avatar_neon_visor',
    slot: 'head',
    label: 'Neon Visor',
    color: '#00E5FF',
    glb: '/cosmetics/neon-visor.placeholder.glb',
  },
  avatar_carbon_gi: {
    assetId: 'avatar_carbon_gi',
    slot: 'torso',
    label: 'Carbon Weave Gi',
    color: '#FF3366',
    glb: '/cosmetics/carbon-gi.placeholder.glb',
  },
};

export function getCosmetic(assetId: string | null | undefined): CosmeticDescriptor | null {
  if (!assetId) return null;
  return COSMETICS[assetId] ?? null;
}
