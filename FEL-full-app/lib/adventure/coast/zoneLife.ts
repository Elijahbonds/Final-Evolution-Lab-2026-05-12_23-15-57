/**
 * THE COAST ZONE'S LIFE, phase B (lane/coast-b): the partner's body, the creatures' bodies, and the creature log's keeper.
 * CoastZoneMode owns the frame; this file draws and remembers.
 *
 *   partner body   a creature partner wears the Adventure's creature placeholder (world/view buildCreatureBody), a character
 *                  partner the hero body tinted, as AdventureMode draws them; both moved by the Adventure's movement view.
 *   creatures      zoneCreatures' herd, each in the same placeholder body (its element's colour, wings from stage 2), shown
 *                  only while its 64 m piece is drawn at full or LOD (the zone's streaming), with a small hop while it walks.
 *   the log        LogKeeper: the Adventure save loaded once, a new entry folded in (creatureLog withLog) and stored the
 *                  Adventure's way (save/deviceStore storeAdventureSave under the save policy). It never writes when the
 *                  device copy could not be read cleanly (a corrupt or unreadable save is the Adventure's to recover), and it
 *                  never writes a loaned partner.
 */

import { TransformNode, Vector3, type Scene } from '@babylonjs/core';
import type { AdventureActor, AdventureSave, PartnerDef } from '@/lib/babylon/adventure/contracts';
import type { AdventureHost } from '@/lib/babylon/adventure/host/AdventureHost';
import { bindMovementView, type MovementView } from '@/lib/babylon/adventure/movement/view';
import { buildCreatureBody, placeBody, type PlaceholderBody } from '@/lib/babylon/adventure/world/view';
import { CharacterLibrary, type SpawnedCharacter } from '@/lib/babylon/core/CharacterLibrary';
import { DEFAULT_HERO_URL } from '@/lib/babylon/core/athleteRoster';
import { installSafePlay } from '@/lib/babylon/anim/clipRegistry';
import type { CharacterAnimator } from '@/lib/babylon/anim/CharacterAnimator';
import { loadAdventureSave, storeAdventureSave } from '@/lib/babylon/adventure/save/deviceStore';
import type { SavePolicy } from '@/lib/babylon/adventure/save/policy';
import { pieceAt, pieceKey, type Tier } from './zoneLayout';
import { ZONE_CREATURES, type CreatureHerd } from './zoneCreatures';
import { readLog, withLog, type LogEntry } from './creatureLog';
import type { Sighting } from './zoneUi';

const NO_ANIM: Pick<CharacterAnimator, 'play' | 'setSpeed'> = { play: () => null, setSpeed: () => {} };

// ── the partner's body ───────────────────────────────────────────────────────────────────────────────────────────────

export interface PartnerBody { root: TransformNode; view: MovementView; skinned: boolean; dispose(): void }

export async function mountPartnerBody(scene: Scene, host: AdventureHost, def: PartnerDef, modeId: string): Promise<PartnerBody | null> {
  const q = host.partnerActor;
  if (!q) return null;
  const actor = () => host.world.actors.get(q.id);
  const telemetry = () => host.movement.inspect(q.id);
  const clock = () => host.tSec;
  if (def.kind === 'character') {
    const root = new TransformNode('coast_partner', scene);
    const pose = new TransformNode('coast_partner_pose', scene);
    pose.parent = root;
    const char: SpawnedCharacter = await CharacterLibrary.spawn(scene, DEFAULT_HERO_URL, { position: Vector3.Zero(), yawRad: 0, startClip: 'idle_stand', modeId, tint: '#fde68a' });
    installSafePlay(char.animator, modeId);
    char.root.parent = pose; char.root.position.set(0, 0, 0); char.root.rotation.set(0, 0, 0);
    const view = bindMovementView({ animator: char.animator, poseNode: pose, actor, telemetry, clock });
    placeBody(root, q);
    return { root, view, skinned: true, dispose() { view.dispose(); char.dispose(); pose.dispose(); root.dispose(); } };
  }
  const ph = buildCreatureBody(scene, q, def.element, def.creature?.stage ?? 0);
  const view = bindMovementView({ animator: NO_ANIM, poseNode: ph.pose, actor, telemetry, clock });
  placeBody(ph.root, q);
  return { root: ph.root, view, skinned: false, dispose() { view.dispose(); ph.dispose(); } };
}

// ── the creatures' bodies ────────────────────────────────────────────────────────────────────────────────────────────

export class CreatureBodies {
  private readonly bodies: PlaceholderBody[];
  private t = 0;
  constructor(scene: Scene, private readonly herd: CreatureHerd) {
    this.bodies = herd.walkers.map((w) => buildCreatureBody(scene, { id: `coast_c_${w.def.id}` } as AdventureActor, w.def.element, w.def.stage));
  }

  /** Place every creature; a creature whose piece is drawn far (the streamer) is hidden, and does not move on screen. */
  frame(dt: number, tiers: ReadonlyMap<string, Tier>): number {
    this.t += dt;
    let shown = 0;
    this.herd.walkers.forEach((w, i) => {
      const b = this.bodies[i], s = w.s;
      const [pi, pj] = pieceAt(s.x, s.z);
      const on = (tiers.get(pieceKey(pi, pj)) ?? 'far') !== 'far';
      b.root.setEnabled(on);
      if (!on) return;
      shown++;
      b.root.position.set(s.x, s.y, s.z);
      b.root.rotation.y = s.yaw;
      b.pose.position.y = s.moving ? Math.abs(Math.sin(this.t * 9 + i)) * 0.12 : 0;
    });
    return shown;
  }

  dispose(): void { for (const b of this.bodies) b.dispose(); }
}

// ── the log's keeper ─────────────────────────────────────────────────────────────────────────────────────────────────

export class LogKeeper {
  private save: AdventureSave;
  /** May this keeper write the device save? Only when it was read cleanly (or there was none yet). */
  readonly canStore: boolean;
  stores = 0;
  constructor(private readonly o: { now: () => number; policy: SavePolicy; storage?: Parameters<typeof loadAdventureSave>[0]['storage'] }) {
    const r = loadAdventureSave({ now: o.now(), storage: o.storage });
    this.save = r.save;
    this.canStore = r.status === 'loaded' || r.status === 'migrated' || r.status === 'empty';
  }

  /** The save as read (for the party: its partner, if it has one). */
  get doc(): AdventureSave { return this.save; }
  entries(): LogEntry[] { return readLog(this.save); }

  /** Log `id` at `level`. Returns the new entry's note, or null when it was already logged that far. */
  note(id: string, level: 1 | 2): Sighting | null {
    const next = withLog(this.save, id, level);
    if (!next) return null;
    this.save = next;
    if (this.canStore) { storeAdventureSave(next, { now: this.o.now(), policy: this.o.policy, storage: this.o.storage }); this.stores++; }
    const c = ZONE_CREATURES.find((x) => x.id === id)!;
    return { id, name: c.name, level, at: this.o.now() };
  }
}
