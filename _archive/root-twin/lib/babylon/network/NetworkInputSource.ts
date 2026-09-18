/**
 * NetworkInputSource — Integrates multiplayer networking with existing InputBus
 * 
 * Receives network state updates and synthesizes them into FelInput events
 * compatible with the existing mode input handler.
 */

import type { FelInput } from '../core/InputBus';
import type { NetworkPlayerState } from './NetworkManager';

export interface NetworkInputConfig {
  playerId: string;
  isLocalPlayer: boolean; // true for player 1 (local), false for remote players
}

/**
 * Converts network player state into FelInput-compatible events
 */
export class NetworkInputSource {
  private lastState: NetworkPlayerState | null = null;
  private inputBuffer: FelInput[] = [];

  constructor(private config: NetworkInputConfig) {}

  /**
   * Process incoming network state and generate input events
   */
  processNetworkState(state: NetworkPlayerState): FelInput[] {
    const inputs: FelInput[] = [];

    // Derive input from state changes
    if (!this.lastState) {
      this.lastState = state;
      return inputs;
    }

    // Movement detection
    const velDiff = Math.sqrt(
      Math.pow(state.velocity.x - this.lastState.velocity.x, 2) +
        Math.pow(state.velocity.z - this.lastState.velocity.z, 2)
    );

    if (velDiff > 0.1) {
      // Player is moving
      inputs.push({
        type: 'motion' as any,
        dir: {
          x: state.velocity.x,
          z: state.velocity.z,
        },
      } as any);
    }

    // Attack detection (animation change to attack clip)
    if (
      this.lastState.currentAnimClip !== state.currentAnimClip &&
      state.currentAnimClip.toLowerCase().includes('punch')
    ) {
      inputs.push({
        type: 'action' as any,
        action: 'attack',
      } as any);
    }

    // Jump detection (animation change to jump clip)
    if (
      this.lastState.currentAnimClip !== state.currentAnimClip &&
      state.currentAnimClip.toLowerCase().includes('jump')
    ) {
      inputs.push({
        type: 'action' as any,
        action: 'jump',
      } as any);
    }

    this.lastState = state;
    return inputs;
  }

  /**
   * Buffer input for sending to server
   */
  bufferInput(input: FelInput): void {
    if (this.config.isLocalPlayer) {
      this.inputBuffer.push(input);
    }
  }

  /**
   * Get buffered inputs for transmission
   */
  getBufferedInputs(): FelInput[] {
    const result = [...this.inputBuffer];
    this.inputBuffer = [];
    return result;
  }

  /**
   * Reset state (e.g., mode end)
   */
  reset(): void {
    this.lastState = null;
    this.inputBuffer = [];
  }
}

export default NetworkInputSource;
