// POSE VIEWS FOR THE LIVE PREVIEW (2026-10-01). The clips are ones the forge and the authored bus already
// play. Turntable is a camera/root yaw, not a clip. Looping poses are the ones that read as a stance.

export interface PoseView {
  id: string;
  label: string;
  /** Null is the turntable: the body holds its stance and the root yaws. */
  clip: string | null;
  loop: boolean;
}

export const POSE_VIEWS: readonly PoseView[] = [
  { id: 'turntable', label: 'Turntable', clip: null, loop: true },
  { id: 'idle', label: 'Idle', clip: 'idle_stand', loop: true },
  { id: 'walk', label: 'Walk', clip: 'walk', loop: true },
  { id: 'jumpshot', label: 'Jump shot', clip: 'jumpshot', loop: false },
  { id: 'dunk', label: 'Dunk', clip: 'dunk_finish_power', loop: false },
];

const LOOP_CLIPS = new Set(['idle_stand', 'walk', 'run', 'bball_idle_stand', 'bball_dribble_idle']);

/** Whether a previewed clip should loop. One-shots (a dunk, a celebration) play once. */
export function poseLoops(clip: string | null | undefined): boolean {
  if (!clip) return true;
  return LOOP_CLIPS.has(clip);
}
