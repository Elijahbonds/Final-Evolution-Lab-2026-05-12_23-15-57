// Controller Link — shared types.
//
// The whole point of this layer is that the session/join/lobby machinery never
// needs to know what a mode does. A mode declares which control SCHEMAS it
// wants; the controller page renders the matching UI; every input arrives back
// at the host as a ControlEvent and is handed to that mode's existing
// FelModeBridge.sendInput(). Adding a mode touches a registry entry, nothing
// in the transport or lobby code.

/** Room codes are short enough to read off a TV and type on a phone. */
export type RoomCode = string;

/** Stable per-device id, persisted in the phone's localStorage so a reconnect
 *  after a WiFi drop rejoins the SAME player slot instead of a new one. */
export type PeerId = string;

export type SchemaKind = 'motion' | 'button' | 'dpad';

/** A button a mode wants drawn on the phone. `action` is passed straight to
 *  the mode's sendInput(), so it is the mode's own vocabulary — not ours. */
export interface ButtonSpec {
  action: string;
  label: string;
  color?: string;
  /** Emit `${action}:down` / `${action}:up` instead of a single tap event. */
  hold?: boolean;
}

export interface MotionSpec {
  /** Action emitted on gesture completion (e.g. 'shoot'). */
  action: string;
  /** Human instruction rendered on the phone. */
  hint: string;
  /** Which axis drives the charge. 'pitch' = tilt back/forward. */
  axis: 'pitch' | 'roll';
  /** Degrees of tilt that map to a full-power charge. */
  fullChargeDeg?: number;
}

export interface DpadSpec {
  /** Emitted as `${action}` with payload {dir}. */
  action: string;
  /** Restrict to 4-way; default is 4-way. */
  diagonals?: boolean;
}

export type SchemaSpec =
  | { kind: 'button'; buttons: ButtonSpec[] }
  | { kind: 'motion'; motion: MotionSpec }
  | { kind: 'dpad'; dpad: DpadSpec };

/** What a mode declares. Registered in schemas/registry.ts, keyed by mode id. */
export interface ModeControllerConfig {
  /** Mode id — must match the id the mode passes to registerFelMode(). */
  modeId: string;
  title: string;
  /** Max simultaneous controllers this mode can use. 1 for solo modes. */
  maxPlayers: number;
  /** Whether the join flow should ask for a display name. */
  askName?: boolean;
  schemas: SchemaSpec[];
}

/** One input from a phone. Deliberately small — this is the hot path. */
export interface ControlEvent {
  /** Mode-vocabulary action, handed to FelModeBridge.sendInput(). */
  a: string;
  /** Optional payload (charge power, direction, timing). */
  p?: unknown;
  /** Client send time (epoch ms) — used for the latency readout. */
  t: number;
}

/** Wire envelope. Kept separate from ControlEvent so control-plane messages
 *  (ping, hello, lobby) never get mistaken for gameplay input. */
export type LinkMessage =
  | { type: 'hello'; peerId: PeerId; name: string }
  | { type: 'input'; ev: ControlEvent }
  | { type: 'ping'; t: number }
  | { type: 'pong'; t: number }
  | { type: 'lobby'; peers: LobbyPeer[]; config: ModeControllerConfig }
  | { type: 'assign'; slot: number };

export interface LobbyPeer {
  peerId: PeerId;
  name: string;
  slot: number | null;
  ready: boolean;
  /** Last measured round-trip over the data channel, ms. */
  rttMs: number | null;
  connected: boolean;
}

export type LinkState =
  | 'idle'
  | 'signaling'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed';
