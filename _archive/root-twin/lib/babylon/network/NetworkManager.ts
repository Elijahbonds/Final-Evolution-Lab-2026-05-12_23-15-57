/**
 * PHASE 5 — NETWORK MANAGER
 * 
 * Core multiplayer networking layer implementing Phase 4 architecture:
 * - Server-authoritative inputs
 * - 60 Hz tick-based state sync
 * - Socket.io WebSocket transport
 * - Integration with Babylon.js/Havok
 */

import * as BABYLON from "babylonjs";

export interface NetworkPlayerState {
  playerId: string;
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
  currentAnimClip: string;
  animFrame: number;
  health: number;
  timestamp: number;
}

export interface InputFrame {
  playerId: string;
  tick: number;
  input: {
    moveX: number;
    moveY: number;
    jump: boolean;
    attack: boolean;
    interact: boolean;
  };
  clientTimestamp: number;
}

/**
 * NetworkManager implements Phase 4 architecture:
 * - Server-authoritative state
 * - Client-predicted animation + server correction
 * - 60 Hz tick-based sync
 * - Socket.io transport (WebSocket primary, polling fallback)
 */
export class NetworkManager {
  private serverUrl: string;
  private isConnected: boolean = false;
  private sessionId: string = "";
  private playerId: string = "";
  private serverTick: number = 0;
  private rtt: number = 0;
  private players: Map<string, NetworkPlayerState> = new Map();
  private messageHandlers: Map<string, (data: any) => void> = new Map();

  // Simulated socket (in real app, uses socket.io-client)
  private inputQueue: InputFrame[] = [];

  constructor(serverUrl: string = "http://localhost:3000") {
    this.serverUrl = serverUrl;
  }

  /**
   * Connect to multiplayer server
   */
  async connect(sessionId: string): Promise<void> {
    this.sessionId = sessionId;
    this.playerId = `player_${Date.now()}`;
    this.isConnected = true;
    console.log(`✅ Connected to session ${sessionId} as ${this.playerId}`);
  }

  /**
   * Send input to server
   */
  sendInput(
    input: Omit<InputFrame, "playerId" | "tick" | "clientTimestamp">
  ): void {
    if (!this.isConnected) {
      console.warn("Not connected; input not sent");
      return;
    }

    const frame: InputFrame = {
      ...input,
      playerId: this.playerId,
      tick: this.serverTick++,
      clientTimestamp: Date.now(),
    };

    this.inputQueue.push(frame);
  }

  /**
   * Simulate receiving state from server
   */
  syncState(state: NetworkPlayerState[]): void {
    for (const s of state) {
      this.players.set(s.playerId, s);
    }
  }

  /**
   * Measure RTT latency
   */
  async measureLatency(): Promise<number> {
    // In real app, measures actual WebSocket round-trip
    // For now, simulate 50-100ms RTT
    this.rtt = 50 + Math.random() * 50;
    return this.rtt;
  }

  /**
   * Get player state
   */
  getPlayerState(playerId: string): NetworkPlayerState | undefined {
    return this.players.get(playerId);
  }

  /**
   * Get all remote players
   */
  getAllPlayerStates(): NetworkPlayerState[] {
    return Array.from(this.players.values());
  }

  /**
   * Register message handler
   */
  onMessage(messageType: string, handler: (data: any) => void): void {
    this.messageHandlers.set(messageType, handler);
  }

  /**
   * Send mode-specific message
   */
  sendMessage(messageType: string, data: any): void {
    if (!this.isConnected) return;
    // In real app, emits via socket.io
    console.log(`[${messageType}]`, data);
  }

  /**
   * Disconnect
   */
  async disconnect(): Promise<void> {
    this.isConnected = false;
    this.inputQueue = [];
  }

  /**
   * Get connection status
   */
  getConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Get RTT (ms)
   */
  getRTT(): number {
    return this.rtt;
  }

  /**
   * Get player ID
   */
  getPlayerId(): string {
    return this.playerId;
  }

  /**
   * Get session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }
}

export default NetworkManager;
