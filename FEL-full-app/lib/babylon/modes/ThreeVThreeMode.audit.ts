/**
 * ThreeVThreeMode Audit Fixes - 10-phase improvement
 */

import {
  assertModeResource,
  safeCharacterSpawn,
  ResourceTracker,
  ModeTelemetry,
} from './modeAuditFixes';

type Body = any; // Simplified for audit

export const THREE_V_THREE_MODE_AUDIT_FIXES = {
  // PHASE 1-3: Critical blockers
  async safeSpawnTeam(
    spawnFn: (index: number, ai: boolean) => Promise<any>,
    count: number,
  ): Promise<any[]> {
    const team = [];
    for (let i = 0; i < count; i++) {
      const char = await safeCharacterSpawn(
        () => spawnFn(i, i > 0),
        () => console.error(`[3v3.Audit] Character ${i} spawn failed`),
        `3v3_char_${i}`,
      );
      if (!char) return []; // Rollback entire team
      team.push(char);
    }
    return team;
  },

  validateCarrierBody(carrierId: string, bodies: Body[]): Body | null {
    const carrier = bodies.find((b) => b.id === carrierId);
    if (!carrier) {
      console.warn(`[3v3.Audit] Carrier ${carrierId} not found`);
      return null;
    }
    return carrier;
  },

  // PHASE 4-6: Gameplay logic
  validatePossessionTimer(timeLeft: number, maxTime: number): boolean {
    if (timeLeft < 0 || timeLeft > maxTime) {
      console.error(`[3v3.Audit] Possession time invalid: ${timeLeft}/${maxTime}`);
      return false;
    }
    return true;
  },

  resetPossessionTimerOnMake(timeLeft: number, madeBasket: boolean): number {
    if (madeBasket) {
      console.log('[3v3.Audit] Basket made — resetting possession timer');
      return 24; // Standard possession reset
    }
    return timeLeft;
  },

  validateAssist(passer: Body | null, scorer: Body | null): boolean {
    if (!passer || !scorer) {
      console.warn('[3v3.Audit] Assist validation failed — passer or scorer invalid');
      return false;
    }
    if (passer.id === scorer.id) {
      console.warn('[3v3.Audit] Assist: same player passed and scored');
      return false;
    }
    return true;
  },

  // PHASE 7-9: Polish
  createShotQualityValidator() {
    return {
      adjustQualityForDefense(baseQuality: string, defenseDist: number): string {
        if (defenseDist < 1.0) return baseQuality === 'good' ? 'contested' : 'bad';
        return baseQuality;
      },
    };
  },

  createAssistTracker() {
    const assists = new Map<string, number>();
    return {
      record(playerId: string): void {
        assists.set(playerId, (assists.get(playerId) ?? 0) + 1);
      },
      getTotal(playerId: string): number {
        return assists.get(playerId) ?? 0;
      },
      report(): Record<string, number> {
        return Object.fromEntries(assists);
      },
    };
  },

  // PHASE 10: Config validation
  validateConfig(cfg: Record<string, any>): boolean {
    const checks = [
      { name: 'targetScore', min: 15, max: 30, value: cfg.targetScore },
      { name: 'possessionSec', min: 20, max: 120, value: cfg.possessionSec },
      { name: 'paintRadius', min: 3, max: 5, value: cfg.paintRadius },
    ];
    let valid = true;
    for (const check of checks) {
      if (check.value === undefined || check.value < check.min || check.value > check.max) {
        console.error(
          `[3v3.Audit] Config invalid: ${check.name} = ${check.value} (expected ${check.min}-${check.max})`,
        );
        valid = false;
      }
    }
    return valid;
  },
};

/**
 * ShowdownMode Audit Fixes
 */
export const SHOWDOWN_MODE_AUDIT_FIXES = {
  // PHASE 1-3: Critical blockers
  async safeSpawnFighters(
    spawnPlayer: () => Promise<any>,
    spawnRival: () => Promise<any>,
    spawnSupport?: () => Promise<any>,
  ): Promise<{ player: any; rival: any; support: any | null }> {
    const player = await safeCharacterSpawn(spawnPlayer, () => {}, 'showdown_player');
    if (!player) return { player: null, rival: null, support: null };

    const rival = await safeCharacterSpawn(spawnRival, () => {}, 'showdown_rival');
    if (!rival) {
      player.dispose();
      return { player: null, rival: null, support: null };
    }

    let support = null;
    if (spawnSupport) {
      support = await safeCharacterSpawn(spawnSupport, () => {}, 'showdown_support');
      // Support failure is non-fatal
    }

    return { player, rival, support };
  },

  validateFighterState(state: any): boolean {
    if (!state || typeof state.health !== 'number') {
      console.error('[Showdown.Audit] FighterState invalid');
      return false;
    }
    return true;
  },

  validateStrikeActive(move: any, window: number): boolean {
    if (!move || !window || window <= 0) {
      console.warn('[Showdown.Audit] Strike window invalid');
      return false;
    }
    return true;
  },

  // PHASE 4-6: Gameplay logic
  validateSubstitutionDest(playerPos: any, rivalPos: any, arenaHalf: number): boolean {
    if (!playerPos || !rivalPos) {
      console.warn('[Showdown.Audit] Substitution: invalid positions');
      return false;
    }
    if (Math.hypot(playerPos.x - rivalPos.x, playerPos.z - rivalPos.z) < 1.5) {
      console.warn('[Showdown.Audit] Substitution destination too close to rival');
      return false;
    }
    return true;
  },

  createUltimateDamageCap() {
    const ULT_MAX_DMG = 50;
    return {
      calculateDamage(baseUltDmg: number, charaDmgMod: number, chakraFull: boolean): number {
        const damage = chakraFull ? baseUltDmg * charaDmgMod : baseUltDmg * charaDmgMod * 0.7;
        return Math.min(ULT_MAX_DMG, damage);
      },
    };
  },

  // PHASE 7-9: Polish
  createAssistCooldown() {
    let cooldownRemaining = 0;
    const COOLDOWN_SEC = 9;

    return {
      update(dt: number): void {
        cooldownRemaining = Math.max(0, cooldownRemaining - dt);
      },
      canUse(): boolean {
        return cooldownRemaining === 0;
      },
      trigger(): void {
        cooldownRemaining = COOLDOWN_SEC;
      },
      getRemainingMs(): number {
        return cooldownRemaining * 1000;
      },
    };
  },

  validateWallState(wallMesh: any): boolean {
    if (!wallMesh) {
      console.warn('[Showdown.Audit] Wall mesh not present');
      return false;
    }
    return true;
  },

  // PHASE 10: Config validation
  validateConfig(cfg: Record<string, any>): boolean {
    const checks = [
      { name: 'arenaHalf', min: 8, max: 16, value: cfg.arenaHalf },
      { name: 'dashChiCost', min: 8, max: 20, value: cfg.dashChiCost },
      { name: 'ultDmg', min: 25, max: 50, value: cfg.ultDmg },
      { name: 'ultRange', min: 1.5, max: 4, value: cfg.ultRange },
      { name: 'assistCooldownSec', min: 5, max: 15, value: cfg.assistCooldownSec },
    ];
    let valid = true;
    for (const check of checks) {
      if (check.value === undefined || check.value < check.min || check.value > check.max) {
        console.error(
          `[Showdown.Audit] Config invalid: ${check.name} = ${check.value} (expected ${check.min}-${check.max})`,
        );
        valid = false;
      }
    }
    return valid;
  },

  validatePhaseTransition(current: string, next: string): boolean {
    const allowed: Record<string, string[]> = {
      intro: ['fighting'],
      fighting: ['fighting', 'ultimate', 'matchOver'],
      ultimate: ['matchOver'],
      matchOver: [],
    };
    return allowed[current]?.includes(next) ?? false;
  },
};
