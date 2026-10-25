// The live session's shared words and the join answer's shape (COACH-LIVE, 2026-10-25). Product lines, not policy.
import type { LinkMode } from '@/lib/coach/live/link';
import type { LiveRole } from '@/lib/coach/live/gate';

export interface LiveJoin {
  role: LiveRole;
  clientVideo: boolean;
  clientBand: 'adult' | 'teen';
  iceServers: RTCIceServer[];
}

export const NOT_RECORDED = 'Not recorded. Only the summary is kept.';

export const MODE_WORDS: Readonly<Record<LinkMode, string>> = {
  connecting: 'Connecting…',
  direct: 'Connected',
  relay: 'Through our server',
  closed: 'Ended',
};
