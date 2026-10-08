/**
 * The starter spell table (plan A2: "one bolt per element, telekinesis, slow-time, barrier, foresight, all
 * [PLACEHOLDER] names"), plus the partner's spells (the owner's "C": your partner's element is yours, and it grows
 * when you fuse).
 *
 * The owner's magic is "A and C": elements and mind powers, LEARNED THROUGH THE STORY (each spell names the story
 * flag that teaches it; the save's known list is the gate), POWERED BY ENERGY (every spell costs it, all or nothing),
 * LEVELLING WITH STATS (power scales with the Adventure level and the PRQ mental attribute: damage.ts), and partner
 * magic that takes the partner's element and scales with the fusion tier (partner.ts).
 *
 * Names are generic and [PLACEHOLDER] (the IP line: no spell name from a feel reference). Every number is [TUNE].
 */

import { FOCUS } from '@/lib/babylon/core/MatrixFocus';
import { ELEMENTS, SPELL_SHAPES, type Element, type SpellDef } from '../contracts';

const PH = (s: string): string => `[PLACEHOLDER] ${s}`;
const cap = (s: string): string => s[0].toUpperCase() + s.slice(1);

/** Bolt speed, m/s (a bolt is a projectile: it can be sidestepped). [TUNE] */
export const BOLT_SPEED = 24;
export const BOLT_RADIUS = 0.35;
/** A partner cone's half-angle, degrees. [TUNE] */
export const CONE_HALF_DEG = 35;
/** How long a barrier and foresight last, seconds. [TUNE] */
export const BARRIER_SEC = 6;
export const FORESIGHT_SEC = 5;

/**
 * Each element's bolt: the same shape, a different temper. Fast and light (wind, lightning) or slow and heavy
 * (earth); the totals stay within a narrow band so no element is simply better (its advantage ring decides more).
 */
const BOLT_TEMPER: Readonly<Record<Element, { power: number; castSec: number; energy: number }>> = {
  fire: { power: 20, castSec: 0.3, energy: 14 },
  water: { power: 17, castSec: 0.25, energy: 12 },
  earth: { power: 23, castSec: 0.4, energy: 15 },
  wind: { power: 15, castSec: 0.18, energy: 10 },
  lightning: { power: 18, castSec: 0.2, energy: 13 },
  ice: { power: 18, castSec: 0.3, energy: 13 },
  light: { power: 19, castSec: 0.28, energy: 14 },
  shadow: { power: 19, castSec: 0.28, energy: 14 },
};

const bolt = (e: Element): SpellDef => ({
  id: `bolt.${e}`, name: PH(`${cap(e)} Bolt`), kind: 'element', element: e, shape: 'bolt',
  energyCost: BOLT_TEMPER[e].energy, castSec: BOLT_TEMPER[e].castSec, cooldownSec: 0.8, power: BOLT_TEMPER[e].power,
  rangeM: 20, requires: { storyFlag: `learned:${e}` }, mirrorChargeable: true,
});

export const STARTER_SPELLS: readonly SpellDef[] = [
  ...ELEMENTS.map(bolt),
  { id: 'mind.telekinesis', name: PH('Lift'), kind: 'mind', element: null, mind: 'telekinesis', shape: 'grab',
    energyCost: 10, castSec: 0.15, cooldownSec: 1.5, power: 22, rangeM: 12, channelPerSec: 12,
    requires: { storyFlag: 'learned:telekinesis' } },
  // Slow-time is MatrixFocus held on purpose: its scales, its minimum to start, its drain (on energy, not a meter).
  { id: 'mind.slowTime', name: PH('Stillness'), kind: 'mind', element: null, mind: 'slowTime', shape: 'self',
    energyCost: FOCUS.minToStart, castSec: 0, cooldownSec: 0.5, power: 0, rangeM: 0, channelPerSec: FOCUS.drainPerSec,
    requires: { storyFlag: 'learned:slowTime' } },
  { id: 'mind.barrier', name: PH('Ward'), kind: 'mind', element: null, mind: 'barrier', shape: 'self',
    energyCost: 25, castSec: 0.2, cooldownSec: 8, power: 40, rangeM: 0, requires: { storyFlag: 'learned:barrier' } },
  { id: 'mind.foresight', name: PH('Insight'), kind: 'mind', element: null, mind: 'foresight', shape: 'self',
    energyCost: 20, castSec: 0.2, cooldownSec: 12, power: 0, rangeM: 0, requires: { storyFlag: 'learned:foresight' } },
  // The partner's spells: no element of their own, the partner's at cast time (partner.ts); they grow with fusion.
  { id: 'partner.surge', name: PH('Bond Surge'), kind: 'partner', element: null, shape: 'cone',
    energyCost: 18, castSec: 0.3, cooldownSec: 2.5, power: 20, rangeM: 6 },
  { id: 'partner.burst', name: PH('Bond Burst'), kind: 'partner', element: null, shape: 'nova',
    energyCost: 35, castSec: 0.5, cooldownSec: 10, power: 30, rangeM: 0, radiusM: 5, requires: { fusionTier: 2 } },
];

/** The shapes the cast code implements. 'wall' and 'zone' are in the contract for later spells; none ships yet. */
export const IMPLEMENTED_SHAPES: ReadonlySet<SpellDef['shape']> = new Set(['bolt', 'cone', 'nova', 'grab', 'self']);

/** Authoring lint for a spell table. Empty = valid. */
export function validateSpells(spells: readonly SpellDef[]): string[] {
  const errs: string[] = [];
  const ids = new Set<string>();
  for (const s of spells) {
    if (ids.has(s.id)) errs.push(`${s.id}: duplicate id`);
    ids.add(s.id);
    if (!s.name.startsWith('[PLACEHOLDER]')) errs.push(`${s.id}: name must stay [PLACEHOLDER] until the owner names it`);
    if (!SPELL_SHAPES.includes(s.shape)) errs.push(`${s.id}: unknown shape ${s.shape}`);
    if (!IMPLEMENTED_SHAPES.has(s.shape)) errs.push(`${s.id}: shape ${s.shape} is not implemented`);
    if (!(s.energyCost >= 0) || !(s.castSec >= 0) || !(s.cooldownSec >= 0) || !(s.power >= 0)) errs.push(`${s.id}: negative number`);
    if (s.kind === 'element' && !s.element) errs.push(`${s.id}: an element spell needs an element`);
    if (s.kind === 'mind' && !s.mind) errs.push(`${s.id}: a mind spell needs a power`);
    if (s.kind === 'partner' && s.element) errs.push(`${s.id}: a partner spell takes the partner's element, not its own`);
  }
  return errs;
}
