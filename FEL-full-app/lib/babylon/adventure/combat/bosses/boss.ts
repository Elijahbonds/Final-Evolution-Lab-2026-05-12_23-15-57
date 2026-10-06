/**
 * A boss in a fight: its brain, its phase, and the phase change (plan A2: "a boss changes phase at its thresholds
 * once each, invulnerable during the change").
 *
 * The phase check runs every step after the hits land. A change: the boss's i-frames for `phaseChangeSec` (cause
 * 'phase', so a hit reads 'iframe', not 'dodged'), the brain interrupted and handed the phase's attack table, its
 * opener forced as the next swing, `boss:phase` emitted, and a 'boss' camera beat for the change. One change per
 * step: a hit that crosses two thresholds enters the next phase now and the one after when the i-frames end, so every
 * phase is entered once, in order, each with its beat.
 */

import type { AdventureActor, AdventureBus } from '../../contracts';
import { fightStateOf } from '../fightState';
import type { WeakPointRef } from '../lock';
import { MonsterBrain, type AttackTokens } from '../monsters/brain';
import type { BossDef } from './defs';

export class BossRuntime {
  /** 0-based index into def.phases. */
  phase = 0;
  readonly brain: MonsterBrain;
  /** Seconds of the camera beat left (the system hints 'boss' at high priority while it runs). */
  beatSec = 0;
  readonly parts: readonly WeakPointRef[];

  constructor(readonly def: BossDef, rng: () => number) {
    const p0 = def.phases[0];
    this.brain = new MonsterBrain({ steering: def.steering, aggroM: def.aggroM, keepAwayM: 0, retreatSec: 0, hoverM: 0 }, p0.attacks, rng);
    this.brain.usesTokens = false;
    this.brain.speedMult = p0.speedMult;
    this.brain.forced = p0.opener;
    this.parts = def.weakPoints.map((w) => ({ part: w.part, offset: w.offset }));
  }

  /** The weak point's multipliers, or null. */
  weakPoint(part: string | undefined): { damageMult: number; poiseMult: number } | null {
    if (!part) return null;
    return this.def.weakPoints.find((w) => w.part === part) ?? null;
  }

  /** Enter the next phase if the boss's HP has reached its threshold. Returns the new phase number (1-based) or 0. */
  checkPhase(boss: AdventureActor, bus: AdventureBus, tokens: AttackTokens): number {
    if (boss.stats.hp.cur <= 0 || boss.iframeSec > 0) return 0;
    const next = this.def.phases[this.phase + 1];
    if (!next) return 0;
    const hp01 = boss.stats.hp.cur / Math.max(1, boss.stats.hp.max);
    if (hp01 > next.fromHp01) return 0;
    this.phase++;
    const fs = fightStateOf(boss);
    boss.iframeSec = this.def.phaseChangeSec;
    fs.iframeCause = 'phase';
    fs.move = null;
    this.brain.interrupt(tokens);
    this.brain.attacks = next.attacks;
    this.brain.speedMult = next.speedMult;
    this.brain.forced = next.opener;
    this.beatSec = this.def.phaseChangeSec;
    // The phase's element: kept on A2's record, never on stats.element (A3's field).
    fs.element = next.element !== undefined ? next.element : fs.element;
    bus.emit('boss:phase', { bossId: boss.id, phase: this.phase + 1 });
    return this.phase + 1;
  }

  /** The phase's element (a phase may change it). */
  elementNow(): BossDef['element'] {
    const p = this.def.phases[this.phase];
    return p.element !== undefined ? p.element : this.def.element;
  }
}
