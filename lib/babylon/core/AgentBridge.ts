// AgentBridge — the CONTROL PLANE that lets an AI agent running in the
// browser drive Nexus/FEL end to end: discover what exists, start a mode,
// play it, read structured state back, and know when something broke.
//
// WHY THIS EXISTS
// An agent driving this app today has to do it through pixels: guess where
// "TAP TO START" is, mash keys, and infer from screenshots whether anything
// happened. That is exactly how my own smoke test spent several cycles
// reporting a PASS on a loading screen — the canvas existed, so the check
// was satisfied, while the game had never started. Pixel-driving is not a
// control plane; it is a guess with a screenshot attached.
//
// This exposes the app's ALREADY-EXISTING seams as a stable, documented,
// machine-readable API:
//   · readyMarker (M67)      → real lifecycle state, not a DOM heuristic
//   · ControlSource (M50/M48) → intent-level play, the same path a human takes
//   · PerfMonitor (M67)      → honest frame/shader numbers
// No game logic is duplicated here. If the bridge disagrees with the game,
// the bridge is wrong, because it only ever reads and forwards.
//
// ── SECURITY: WHAT THIS DOES AND DOES NOT GRANT ──────────────────────────
// The bridge is OFF unless explicitly enabled (`?agent=1`, or a stored
// opt-in). When on, it grants CONTROL, never PRIVILEGE: every action is one
// the signed-in user could already perform by tapping. It does not bypass
// the sign-in wall, does not mint currency, does not call the wallet, and
// does not reach the server. An agent with the bridge can play the game; it
// cannot become a different user or grant itself anything. Lab Credits stay
// earned-only through the server-authoritative wallet, which this file has
// no path to.

import type { Scene } from '@babylonjs/core';
import type { AgentControlSource, AgentIntent } from './AgentControlSource';

export const AGENT_BRIDGE_VERSION = '1.0.0';

export type LifecycleState = 'booting' | 'loaded' | 'playing' | 'ended' | 'error';

export interface AgentEvent {
  at: number;
  kind: 'lifecycle' | 'spawn' | 'score' | 'error' | 'warn' | 'action';
  message: string;
  data?: Record<string, unknown>;
}

export interface AgentSnapshot {
  version: string;
  modeId: string | null;
  state: LifecycleState;
  /** True only when the scene is actually running a mode — not merely loaded. */
  playing: boolean;
  score: number | null;
  hero: { x: number; y: number; z: number } | null;
  characters: number;
  metrics: { fps: number; worstFrameMs: number; drawCalls: number } | null;
  errors: string[];
  warnings: string[];
}

/** Everything the bridge can be asked to do, in one machine-readable shape.
 *  An agent calls describe() FIRST and drives from the result rather than
 *  hardcoding — so adding a mode or an action needs no agent change. */
export interface AgentManifest {
  version: string;
  product: string;
  modes: { id: string; route: string; label: string; actions: string[] }[];
  actions: { name: string; args: string; description: string }[];
  lifecycle: LifecycleState[];
}

interface BridgeHost {
  scene: Scene;
  modeId: string;
  /** The agent's control source for the local player slot, when the mode
   *  supports intent-driven play. Absent modes fall back to synthetic input. */
  control?: AgentControlSource;
  /** Mode-supplied readers. All optional — the bridge degrades, never throws. */
  getScore?: () => number;
  getHero?: () => { x: number; y: number; z: number } | null;
  getCharacterCount?: () => number;
  getMetrics?: () => { fps: number; worstFrameMs: number; drawCalls: number };
  /** Programmatic equivalent of tapping the start affordance. */
  start?: () => void | Promise<void>;
}

const MAX_EVENTS = 400;

class Bridge {
  readonly version = AGENT_BRIDGE_VERSION;
  private host: BridgeHost | null = null;
  private events: AgentEvent[] = [];
  private errors: string[] = [];
  private warnings: string[] = [];
  private listeners = new Set<(e: AgentEvent) => void>();
  private manifestModes: AgentManifest['modes'] = [];

  // ── registration (called by ModeHarness) ───────────────────────────────
  attach(host: BridgeHost): void {
    this.host = host;
    this.emit('lifecycle', `attached to "${host.modeId}"`, { modeId: host.modeId });
  }

  detach(): void {
    if (this.host) this.emit('lifecycle', `detached from "${this.host.modeId}"`);
    this.host = null;
  }

  /** Supplied once at boot from the app's own mode registry — the bridge
   *  never hardcodes a mode list that could drift out of date. */
  registerModes(modes: AgentManifest['modes']): void { this.manifestModes = modes; }

  emit(kind: AgentEvent['kind'], message: string, data?: Record<string, unknown>): void {
    const ev: AgentEvent = { at: Date.now(), kind, message, data };
    this.events.push(ev);
    if (this.events.length > MAX_EVENTS) this.events.shift();
    if (kind === 'error') this.errors.push(message);
    if (kind === 'warn') this.warnings.push(message);
    for (const fn of this.listeners) { try { fn(ev); } catch { /* a bad listener must not break the game */ } }
  }

  // ── discovery ──────────────────────────────────────────────────────────
  describe(): AgentManifest {
    return {
      version: this.version,
      product: 'Final Evolution Lab',
      modes: this.manifestModes,
      actions: [
        { name: 'move',   args: '{x:-1..1, y:-1..1, ms?}', description: 'Walk/run. Magnitude > 0.85 sprints.' },
        { name: 'sprint', args: '{ms?}',                   description: 'Full-speed forward.' },
        { name: 'shoot',  args: '{charge:0..1, ms?}',      description: 'Hold the shot meter, then release.' },
        { name: 'dunk',   args: '{ms?}',                   description: 'Drive + slam. Needs turbo and rim proximity.' },
        { name: 'pass',   args: '{}',                      description: 'Pass to the open teammate.' },
        { name: 'steal',  args: '{}',                      description: 'Defensive poke.' },
        { name: 'strike', args: '{which:jab|hook|uppercut|high_kick|roundhouse}', description: 'Karate attack.' },
        { name: 'guard',  args: '{ms?}',                   description: 'Hold the karate guard stance.' },
        { name: 'idle',   args: '{ms?}',                   description: 'Neutral — release every input.' },
      ],
      lifecycle: ['booting', 'loaded', 'playing', 'ended', 'error'],
    };
  }

  // ── observation ────────────────────────────────────────────────────────
  /** The DOM marker is the single source of truth for lifecycle — it is what
   *  readyMarker (M67) already publishes, so the bridge and any external
   *  Playwright driver can never disagree about whether the game is running. */
  private domState(): { modeId: string | null; state: LifecycleState } {
    if (typeof document === 'undefined') return { modeId: null, state: 'booting' };
    const el = document.querySelector('#fel-ready');
    const raw = el?.getAttribute('data-state') ?? 'booting';
    const known: LifecycleState[] = ['booting', 'loaded', 'playing', 'ended', 'error'];
    return {
      modeId: el?.getAttribute('data-mode') ?? this.host?.modeId ?? null,
      state: (known as string[]).includes(raw) ? (raw as LifecycleState) : 'booting',
    };
  }

  state(): AgentSnapshot {
    const { modeId, state } = this.domState();
    const h = this.host;
    const safe = <T>(fn: (() => T) | undefined, fallback: T): T => {
      try { return fn ? fn() : fallback; } catch { return fallback; }
    };
    return {
      version: this.version,
      modeId,
      state,
      playing: state === 'playing',
      score: safe(h?.getScore, null as number | null),
      hero: safe(h?.getHero, null as AgentSnapshot['hero']),
      characters: safe(h?.getCharacterCount, 0),
      metrics: safe(h?.getMetrics, null as AgentSnapshot['metrics']),
      errors: [...this.errors],
      warnings: [...this.warnings],
    };
  }

  recentEvents(limit = 50): AgentEvent[] { return this.events.slice(-limit); }
  onEvent(fn: (e: AgentEvent) => void): () => void {
    this.listeners.add(fn); return () => this.listeners.delete(fn);
  }

  /** Resolve when `predicate` holds. Polls the same snapshot an agent reads,
   *  so "wait until playing" means exactly what state() reports. */
  waitFor(predicate: (s: AgentSnapshot) => boolean, timeoutMs = 20000): Promise<boolean> {
    const started = Date.now();
    return new Promise((resolve) => {
      const tick = () => {
        let ok = false;
        try { ok = predicate(this.state()); } catch { ok = false; }
        if (ok) return resolve(true);
        if (Date.now() - started > timeoutMs) return resolve(false);
        setTimeout(tick, 120);
      };
      tick();
    });
  }

  // ── control ────────────────────────────────────────────────────────────
  /** Start the mode. Prefers the mode's own start hook; falls back to
   *  clicking the visible start affordance so this works even in modes that
   *  have not adopted the hook yet. Returns whether we reached 'playing'. */
  async start(timeoutMs = 25000): Promise<boolean> {
    if (this.state().playing) return true;
    if (this.host?.start) {
      try { await this.host.start(); } catch (e) { this.emit('error', `start() threw: ${String(e).slice(0, 200)}`); }
    } else if (typeof document !== 'undefined') {
      // Fallback: find the start control by accessible text, not coordinates.
      const candidates = Array.from(document.querySelectorAll<HTMLElement>('button, [role="button"], canvas'));
      const target = candidates.find((el) => /tap to start|start|play/i.test(el.textContent ?? ''))
        ?? candidates.find((el) => el.tagName === 'CANVAS');
      target?.click();
      this.emit('action', 'start: clicked the start affordance (no host.start hook)');
    }
    const ok = await this.waitFor((s) => s.playing, timeoutMs);
    this.emit(ok ? 'lifecycle' : 'error', ok ? 'start: playing' : `start: never reached 'playing' in ${timeoutMs}ms`);
    return ok;
  }

  /** Push a raw intent for `ms`, then release. This is the SAME Intent shape
   *  the human input path produces, so agent play exercises real game code —
   *  not a parallel test-only path that can drift from what players hit. */
  async act(intent: Partial<AgentIntent>, ms = 250): Promise<void> {
    if (!this.host?.control) {
      this.emit('warn', 'act(): this mode has no agent ControlSource; use the keyboard fallback');
      return;
    }
    this.host.control.push(intent, ms);
    this.emit('action', `act ${JSON.stringify(intent)} for ${ms}ms`);
    await new Promise((r) => setTimeout(r, ms));
  }

  /** Named high-level actions from describe().actions. */
  async do(action: string, opts: Record<string, number | string> = {}): Promise<boolean> {
    const ms = typeof opts.ms === 'number' ? opts.ms : 300;
    switch (action) {
      case 'move':   await this.act({ moveX: Number(opts.x ?? 0), moveY: Number(opts.y ?? 0) }, ms); return true;
      case 'sprint': await this.act({ moveX: 0, moveY: 1, sprint: true }, ms); return true;
      case 'idle':   await this.act({ moveX: 0, moveY: 0 }, ms); return true;
      case 'shoot': {
        const charge = Math.max(0, Math.min(1, Number(opts.charge ?? 0.8)));
        await this.act({ actionHeld: charge }, Math.round(600 * charge));
        await this.act({ actionHeld: 0, action: true }, 80);
        return true;
      }
      case 'dunk':
        await this.act({ moveX: 0, moveY: 1, sprint: true }, ms);
        await this.act({ action: true, actionHeld: 1 }, 120);
        return true;
      case 'pass':  await this.act({ pass: true }, 80); return true;
      case 'steal': await this.act({ steal: true }, 80); return true;
      case 'guard': await this.act({ guard: true }, ms); return true;
      case 'strike': await this.act({ strike: String(opts.which ?? 'jab') }, 120); return true;
      default:
        this.emit('warn', `do(): unknown action "${action}" — see describe().actions`);
        return false;
    }
  }

  reset(): void { this.events = []; this.errors = []; this.warnings = []; }
}

// ── install ───────────────────────────────────────────────────────────────
declare global {
  interface Window { __NEXUS_AGENT__?: Bridge }
}

/** Enabled ONLY on explicit opt-in. `?agent=1` turns it on for the session;
 *  `?agent=0` turns it off again. A control surface that is on by default in
 *  production is a control surface someone else can drive. */
export function agentEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const q = new URLSearchParams(window.location.search).get('agent');
    if (q === '1') { window.sessionStorage?.setItem('NEXUS_AGENT', '1'); return true; }
    if (q === '0') { window.sessionStorage?.removeItem('NEXUS_AGENT'); return false; }
    return window.sessionStorage?.getItem('NEXUS_AGENT') === '1';
  } catch { return false; }
}

const bridge = new Bridge();

/** Call once at app boot, with the app's real mode registry. */
export function installAgentBridge(modes: AgentManifest['modes']): Bridge | null {
  if (!agentEnabled()) return null;
  bridge.registerModes(modes);
  if (typeof window !== 'undefined') window.__NEXUS_AGENT__ = bridge;
  console.info(`[FEL-AGENT] bridge ${AGENT_BRIDGE_VERSION} enabled — window.__NEXUS_AGENT__ (${modes.length} modes)`);
  return bridge;
}

/** Always safe to call; no-ops when the bridge is disabled. */
export function agentBridge(): Bridge | null {
  return typeof window !== 'undefined' && window.__NEXUS_AGENT__ ? bridge : null;
}

export type { Bridge as AgentBridgeApi };
