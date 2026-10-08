// The grade badge — only when the MODE reported one. Nothing here grades a run itself.
//
//   · a letter in stats.grade ('S', 'A', …), or freerun's number (1 D … 5 S: FreeRunMode "details are numbers");
//   · the Cypher's accuracy (0..100), lettered by the dance judge's own gradeFor — the proof line already does this;
//   · Velocity Kart's medal (stats.medal: 0 none … 3 gold).
// Every other mode sends no grade, and the card shows none (the mode follow-ups list says which could).

import { gradeFor } from '@/lib/babylon/core/danceTracks';
import type { EndRun } from './types';

export interface GradeBadge {
  label: string;
  kind: 'letter' | 'medal';
  color: string;
}

const LETTER_COLOR: Record<string, string> = { S: '#FFD700', A: '#00FF9D', B: '#00E5FF', C: '#E5E7EB', D: '#FF7A2F', F: '#FF3366' };
const MEDALS = ['', 'BRONZE', 'SILVER', 'GOLD'] as const;
const MEDAL_COLOR: Record<string, string> = { GOLD: '#FFD700', SILVER: '#D7DEE8', BRONZE: '#D08A4E' };

export function gradeBadge(mode: string, run: Pick<EndRun, 'stats'>): GradeBadge | null {
  const s = run.stats ?? {};
  const g = s.grade;
  if (typeof g === 'string' && /^[SABCDF][+-]?$/.test(g.trim().toUpperCase())) {
    const label = g.trim().toUpperCase();
    return { label, kind: 'letter', color: LETTER_COLOR[label[0]] ?? '#E5E7EB' };
  }
  if (typeof g === 'number' && Number.isInteger(g) && g >= 1 && g <= 5) {
    const label = 'DCBAS'[g - 1];
    return { label, kind: 'letter', color: LETTER_COLOR[label] };
  }
  if (mode === 'dance' && typeof s.accuracy === 'number' && Number.isFinite(s.accuracy)) {
    const label = gradeFor(s.accuracy / 100);
    return { label, kind: 'letter', color: LETTER_COLOR[label] };
  }
  if (typeof s.medal === 'number' && Number.isInteger(s.medal) && s.medal >= 1 && s.medal <= 3) {
    const label = MEDALS[s.medal];
    return { label, kind: 'medal', color: MEDAL_COLOR[label] };
  }
  return null;
}
