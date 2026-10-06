/**
 * The test yard, assembled (A4): the yard's spec, a host with the party from the save, the camp's runtime, and what
 * the yard LENDS the player for a try-out — never written into their save:
 *
 *   a partner      when the save has none: a creature at its flying stage (rideable and flyable, so riding and a flying
 *                  mount can be tried), or with `partner: 'character'` a built character from Creator slot 0 (it
 *                  fuses, it never carries). Bond 40: fusion tier 2. [PLACEHOLDER] [TUNE]
 *   a spell book   when the save knows no spells: the partner's element bolt, Lift, Bond Surge and Ward equipped,
 *                  Stillness (slow-time) known. In the story these are learned (story flags); the yard is a test yard.
 *   `fuseReady`    the fusion meter starts full, so fusion and fused flight can be tried at once.
 * Flight is available after fusing or mounting a flyer (the owner's rule), and nowhere else.
 *
 * Pure: the page (app/dev/adventure) and the headless tests build the yard through this one function.
 */

import { emptyAdventureSave, type ActorId, type AdventureActor, type AdventureSave, type PrqBand } from '../contracts';
import type { PrqAttr } from '@/lib/prq';
import { AdventureHost } from '../host/AdventureHost';
import { createCharacterPartner, createCreaturePartner } from '../partner/defs';
import type { SpellLoadout } from '../magic/cast';
import { buildSandbox, sandboxWorldSource, type SandboxSpec } from './sandbox';
import { SandboxRuntime } from './sandboxRuntime';

export type SandboxPartnerKind = 'creature' | 'character';

export interface SandboxOptions {
  seed?: number;
  /** The player's save (A3's device save, already loaded and sanitised). Default: an empty save. */
  save?: AdventureSave | null;
  /** The partner the yard lends when the save has none. Default 'creature'. */
  partner?: SandboxPartnerKind;
  fuseReady?: boolean;
  band?: PrqBand | null;
  prqAttrs?: Partial<Record<PrqAttr, number>> | null;
  instrument?: (a: AdventureActor) => AdventureActor;
  onError?: (e: unknown) => void;
}

export interface Sandbox {
  host: AdventureHost;
  spec: SandboxSpec;
  runtime: SandboxRuntime;
  /** The save the host was built from (the player's, with the lent partner if they had none). */
  save: AdventureSave;
  /** True when the partner is the yard's loan (do not store it as theirs). */
  partnerLent: boolean;
}

/** The yard's loan partner. [PLACEHOLDER] species and slot; bond 40 (tier 2). [TUNE] */
export const SANDBOX_BOND = 40;
export const SANDBOX_CREATURE_SPECIES = 'strideraptor';

export function sandboxPartner(kind: SandboxPartnerKind): AdventureSave['partner'] {
  if (kind === 'character') {
    const def = createCharacterPartner({ id: 'yard.partner', creatorSlotId: 'slot-0', element: 'light' });
    def.bond = SANDBOX_BOND;
    return def;
  }
  const def = createCreaturePartner({ id: 'yard.partner', speciesId: SANDBOX_CREATURE_SPECIES })!;
  const c = def.creature!;
  c.stage = Math.max(c.stage, c.flyableAtStage ?? c.rideableAtStage ?? 0);
  def.bond = SANDBOX_BOND;
  return def;
}

/** The yard's loan spell book (when the save knows none). */
export function sandboxLoadout(save: AdventureSave, element: string | null): SpellLoadout {
  if (save.player.spells.known.length > 0) return save.player.spells;
  const bolt = `bolt.${element ?? 'fire'}`;
  return {
    known: [bolt, 'mind.telekinesis', 'partner.surge', 'mind.barrier', 'mind.slowTime'],
    equipped: [bolt, 'mind.telekinesis', 'partner.surge', 'mind.barrier'],
  };
}

export function createSandbox(o: SandboxOptions = {}): Sandbox {
  const spec = buildSandbox();
  const base = o.save ?? emptyAdventureSave(0);
  const partnerLent = !base.partner;
  const save: AdventureSave = partnerLent ? { ...base, partner: sandboxPartner(o.partner ?? 'creature') } : base;
  let runtime: SandboxRuntime | null = null;
  const host = new AdventureHost({
    world: sandboxWorldSource(spec),
    save,
    playerSpawn: spec.player,
    partnerSpawn: spec.partner,
    seed: o.seed,
    band: o.band ?? null,
    prqAttrs: o.prqAttrs ?? null,
    loadout: sandboxLoadout(save, save.partner?.element ?? null),
    instrument: o.instrument,
    onError: o.onError,
    onBleedOut: (id: ActorId) => runtime?.bledOut(id),
  });
  runtime = new SandboxRuntime(host, spec);
  runtime.start();
  if (o.fuseReady) {
    // a spawn's first value (A3's field, set before the first step): the meter starts full
    host.player.fusion.meter = 1;
    const q = host.partnerActor;
    if (q) q.fusion.meter = 1;
  }
  return { host, spec, runtime, save, partnerLent };
}
