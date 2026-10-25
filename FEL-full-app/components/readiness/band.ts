// The band chip's colours, shared by the check, Today's line and the coach's panel (COACH-READINESS, 2026-10-25). Its own
// file so Today and the coach's board never pull the camera component (and body-play's SelfView) into their bundles.
import type { ReadinessBand } from '@/lib/coach/readiness/types';

export const BAND_STYLE: Record<ReadinessBand, string> = {
  ready: 'border-[#00FF9D]/50 bg-[#00FF9D]/10 text-[#00FF9D]',
  normal: 'border-[#00E5FF]/40 bg-[#00E5FF]/10 text-[#00E5FF]',
  low: 'border-[#FFB020]/60 bg-[#FFB020]/10 text-[#FFB020]',
  building: 'border-white/20 bg-white/5 text-white/70',
};
