// recorderMachine — the record / replay buttons, as states.
//
// Pure. The browser class (gameRecorder.ts) applies this and never invents a transition of its own.
//
//   idle  --arm-buffer-->  buffering     a rolling last-30s buffer, on the device
//   idle  --record-->      recording     a full take, on the device
//   buffering --save-replay or stop--> ready, with a replay clip
//   recording --save-replay--> recording, and a replay clip is kept (the take continues)
//   recording --stop-->    ready, with the full take
//   ready --discard-->     idle, clips dropped
//   any --fail-->          error --reset--> idle
//
// Nothing in a transition uploads. A clip existing only means bytes are in memory.

export type RecPhase = 'idle' | 'buffering' | 'recording' | 'ready' | 'error';

export interface RecModel {
  phase: RecPhase;
  /** A full take is in memory. */
  take: boolean;
  /** The last 30 seconds are in memory. */
  replay: boolean;
  note: string | null;
}

export const REC_IDLE: RecModel = { phase: 'idle', take: false, replay: false, note: null };

export type RecEvent =
  | { type: 'arm-buffer' }
  | { type: 'record' }
  | { type: 'save-replay' }
  | { type: 'stop' }
  | { type: 'discard' }
  | { type: 'fail'; message: string }
  | { type: 'reset' };

const REPLAY_NOTE = 'Last 30 seconds saved on this device.';
const TAKE_NOTE = 'Recording saved on this device.';
const BUFFER_NOTE = 'Keeping the last 30 seconds on this device.';

export function recStep(m: RecModel, e: RecEvent): RecModel {
  if (e.type === 'reset' || e.type === 'discard') return REC_IDLE;
  if (e.type === 'fail') return { phase: 'error', take: false, replay: false, note: e.message };
  if (m.phase === 'error') return m;

  switch (e.type) {
    case 'arm-buffer':
      if (m.phase === 'idle' || m.phase === 'ready') {
        return { phase: 'buffering', take: false, replay: false, note: BUFFER_NOTE };
      }
      return m;
    case 'record':
      if (m.phase === 'recording') return m;
      if (m.phase === 'idle' || m.phase === 'buffering' || m.phase === 'ready') {
        return { phase: 'recording', take: false, replay: false, note: null };
      }
      return m;
    case 'save-replay':
      if (m.phase === 'buffering') return { phase: 'ready', take: m.take, replay: true, note: REPLAY_NOTE };
      if (m.phase === 'recording') {
        return { phase: 'recording', take: m.take, replay: true, note: 'Last 30 seconds saved on this device. The full recording is still going.' };
      }
      return m;
    case 'stop':
      if (m.phase === 'recording') return { phase: 'ready', take: true, replay: m.replay, note: TAKE_NOTE };
      if (m.phase === 'buffering') return { phase: 'ready', take: m.take, replay: true, note: REPLAY_NOTE };
      return m;
    default:
      return m;
  }
}
