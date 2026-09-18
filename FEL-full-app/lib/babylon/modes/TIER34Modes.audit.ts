/**
 * TIER 3 & TIER 4 Audit Fixes
 * 
 * Tier 3 (Medium): FootballRushMode, SkateRunMode, SnowboardSlalomMode, SurfBreakMode, BoardRunMode
 * Tier 4 (Supporting): DanceMode, precisionModes, NetSportMode
 */

import { IsolatedRNG, ModeTelemetry } from './modeAuditFixes';

// ============================================================================
// TIER 3 - MEDIUM PRIORITY MODES
// ============================================================================

export const FOOTBALL_RUSH_MODE_AUDIT_FIXES = {
  validateFootballConfig(cfg: Record<string, any>): boolean {
    const checks = [
      { name: 'fieldLength', min: 80, max: 120, value: cfg.fieldLength },
      { name: 'endZoneDepth', min: 10, max: 20, value: cfg.endZoneDepth },
      { name: 'playerCount', min: 2, max: 11, value: cfg.playerCount },
    ];
    return checks.every(c => !c.value || (c.value >= c.min && c.value <= c.max));
  },

  createRushRNG() {
    return new IsolatedRNG(Date.now());
  },
};

export const SKATE_RUN_MODE_AUDIT_FIXES = {
  validateSkateConfig(cfg: Record<string, any>): boolean {
    const checks = [
      { name: 'trackLength', min: 200, max: 2000, value: cfg.trackLength },
      { name: 'defaultSpeed', min: 10, max: 50, value: cfg.defaultSpeed },
    ];
    return checks.every(c => !c.value || (c.value >= c.min && c.value <= c.max));
  },

  createSkatePhysics() {
    return {
      applyFriction(velocity: number, dt: number): number {
        return velocity * (1 - 0.15 * dt);
      },
      applyGravity(velocityY: number, dt: number): number {
        return velocityY - 9.81 * dt;
      },
    };
  },
};

export const SNOWBOARD_SLALOM_MODE_AUDIT_FIXES = {
  validateSnowboardConfig(cfg: Record<string, any>): boolean {
    const checks = [
      { name: 'courseLength', min: 100, max: 500, value: cfg.courseLength },
      { name: 'gateCount', min: 10, max: 50, value: cfg.gateCount },
      { name: 'timeLimit', min: 30, max: 300, value: cfg.timeLimit },
    ];
    return checks.every(c => !c.value || (c.value >= c.min && c.value <= c.max));
  },

  createGateValidator() {
    return {
      validateGatePass(boardPos: any, gatePos: any, gateWidth: number): boolean {
        if (!boardPos || !gatePos) return false;
        const dist = Math.hypot(boardPos.x - gatePos.x, boardPos.z - gatePos.z);
        return dist < gateWidth / 2;
      },
    };
  },
};

export const SURF_BREAK_MODE_AUDIT_FIXES = {
  validateSurfConfig(cfg: Record<string, any>): boolean {
    const checks = [
      { name: 'waveHeight', min: 1, max: 10, value: cfg.waveHeight },
      { name: 'breakIntensity', min: 0.1, max: 1.0, value: cfg.breakIntensity },
    ];
    return checks.every(c => !c.value || (c.value >= c.min && c.value <= c.max));
  },

  createWavePhysics() {
    return {
      getWaveHeight(time: number, period: number): number {
        const waveMax = 3;
        return Math.sin((time / period) * Math.PI * 2) * waveMax;
      },
    };
  },
};

export const BOARD_RUN_MODE_AUDIT_FIXES = {
  validateBoardRunConfig(cfg: Record<string, any>): boolean {
    const checks = [
      { name: 'trackLength', min: 50, max: 500, value: cfg.trackLength },
      { name: 'boostDuration', min: 1, max: 5, value: cfg.boostDuration },
    ];
    return checks.every(c => !c.value || (c.value >= c.min && c.value <= c.max));
  },

  createBoardTelemetry() {
    const telemetry = new ModeTelemetry();
    return {
      recordBoost(): void { telemetry.event('boost_used', 1); },
      recordCrash(): void { telemetry.event('crash', 1); },
      report(): void { telemetry.report(); },
    };
  },
};

// ============================================================================
// TIER 4 - SUPPORTING MODES
// ============================================================================

export const DANCE_MODE_AUDIT_FIXES = {
  validateDanceConfig(cfg: Record<string, any>): boolean {
    const checks = [
      { name: 'beatDuration', min: 0.25, max: 2, value: cfg.beatDuration },
      { name: 'choreographyLength', min: 4, max: 64, value: cfg.choreographyLength },
    ];
    return checks.every(c => !c.value || (c.value >= c.min && c.value <= c.max));
  },

  validateBeatHit(hitTime: number, beatTime: number, tolerance: number): number {
    const offset = Math.abs(hitTime - beatTime);
    if (offset > tolerance) {
      return 0; // Miss
    }
    return 1 - offset / tolerance; // Accuracy 0-1
  },

  createDanceTelemetry() {
    const telemetry = new ModeTelemetry();
    return {
      recordMove(moveId: string, accuracy: number): void {
        telemetry.event(`move_${moveId}`, accuracy);
      },
      report(): void { telemetry.report(); },
    };
  },
};

export const PRECISION_MODES_AUDIT_FIXES = {
  createAimingValidator() {
    return {
      validateHitZone(aimAngle: number, targetAngle: number, tolerance: number): number {
        const offset = Math.abs(aimAngle - targetAngle);
        const normalized = offset > 180 ? 360 - offset : offset;
        if (normalized > tolerance) return 0;
        return 1 - normalized / tolerance;
      },
    };
  },

  createTimingValidator() {
    return {
      validateTiming(playerTime: number, windowStart: number, windowEnd: number): number {
        if (playerTime < windowStart || playerTime > windowEnd) return 0;
        const midpoint = (windowStart + windowEnd) / 2;
        const offset = Math.abs(playerTime - midpoint);
        const maxOffset = (windowEnd - windowStart) / 2;
        return 1 - offset / maxOffset;
      },
    };
  },

  validatePrecisionConfig(cfg: Record<string, any>): boolean {
    const checks = [
      { name: 'targetRadius', min: 0.1, max: 2, value: cfg.targetRadius },
      { name: 'timingWindow', min: 0.1, max: 1, value: cfg.timingWindow },
    ];
    return checks.every(c => !c.value || (c.value >= c.min && c.value <= c.max));
  },
};

export const NET_SPORT_MODE_AUDIT_FIXES = {
  validateNetSportConfig(cfg: Record<string, any>): boolean {
    const checks = [
      { name: 'courtLength', min: 20, max: 40, value: cfg.courtLength },
      { name: 'netHeight', min: 1.5, max: 3, value: cfg.netHeight },
      { name: 'targetScore', min: 5, max: 25, value: cfg.targetScore },
    ];
    return checks.every(c => !c.value || (c.value >= c.min && c.value <= c.max));
  },

  validateNetClear(ballY: number, netHeight: number): boolean {
    return ballY > netHeight;
  },

  createNetSportTelemetry() {
    const telemetry = new ModeTelemetry();
    return {
      recordVolley(): void { telemetry.event('volley', 1); },
      recordServe(): void { telemetry.event('serve', 1); },
      recordNetDrop(): void { telemetry.event('net_drop', 1); },
      report(): void { telemetry.report(); },
    };
  },
};
