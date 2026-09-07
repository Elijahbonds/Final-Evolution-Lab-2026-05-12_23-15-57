// proofLine — pass 5 phase 3: one line that says what happened, per mode, from the mode's own session stats. Rendered on
// the results card ("Share proof · …") and minted onto the challenge card as `display`. Dunk keeps its make/miss line.
import { gradeFor } from '@/lib/babylon/core/danceTracks';
export interface ProofInput { score: number; opponentScore?: number; won: boolean; outcome?: string; stats?: Record<string, number | string | boolean> }
const n = (s: ProofInput['stats'], k: string): number | null => { const v = s?.[k]; return typeof v === 'number' && Number.isFinite(v) ? v : null; };
const wl = (r: ProofInput) => (r.won ? 'WON' : 'LOST');
export function proofLineFor(mode: string, r: ProofInput): string | null {
  const s = r.stats ?? {};
  switch (mode) {
    case 'dunkContest': {
      const m = n(s, 'makes') ?? 0, x = n(s, 'misses') ?? 0, tot = m + x;
      const rival = r.opponentScore != null ? ` vs ${r.opponentScore}` : '';
      const outcome = r.won ? 'You won' : 'You lost';
      if (m > 0) return `You slammed ${m}/${tot} · ${r.score} pts${rival} · ${outcome}`;
      if (tot > 0) return `You missed every dunk · ${r.score} pts${rival} · ${outcome}`;
      return `You missed · ${r.score} pts${rival} · ${outcome}`;
    }
    case 'dunkduel': { const p1 = n(s, 'p1'), p2 = n(s, 'p2'); return p1 !== null && p2 !== null ? `Duel ${p1} vs ${p2} · ${(r.outcome?.replace(/_/g, ' ') ?? '').toLowerCase()}`.trim() : null; }
    case 'karateVersus': case 'mixedcombat': { const rounds = n(s, 'rounds'), foe = n(s, 'foeWins'); return rounds !== null ? `${wl(r)} IN ${rounds} ROUNDS${foe !== null ? ` · RIVAL TOOK ${foe}` : ''}` : null; }
    case 'showdown': { const foe = n(s, 'foeRounds'); return `${wl(r)}${foe !== null ? ` · RIVAL TOOK ${foe} ROUND${foe === 1 ? '' : 'S'}` : ''}`; }
    case 'duel': { const foe = n(s, 'foeWins'); return `${wl(r)}${foe !== null ? ` · RIVAL TOOK ${foe}` : ''}${s.weapon ? ` · ${String(s.weapon).toUpperCase()}` : ''}`; }
    case 'karateEndless': { const wave = n(s, 'wave'), kos = n(s, 'kos'); return wave !== null ? `WAVE ${wave} · ${kos ?? 0} KOS` : null; }
    case 'hoops1v1': { const foe = n(s, 'foeScore'); return `${r.score}–${foe ?? r.opponentScore ?? 0} · ${wl(r)}`; }
    case 'hoops3v3': return `${r.score}–${r.opponentScore ?? 0} · ${wl(r)}`;
    case 'threePoint': { const pts = n(s, 'points') ?? r.score; return `${pts} PTS DOWNTOWN · ${wl(r)}`; }
    case 'skateboarding': { const combo = n(s, 'bestCombo'), coins = n(s, 'coinsCollected'); return `${r.score} PTS${combo !== null ? ` · x${Math.round(combo)} BEST CHAIN` : ''}${coins !== null ? ` · ${coins} COINS` : ''}`; }
    case 'snowboarding': { const gates = n(s, 'gatesHit'), t = n(s, 'elapsed'); return `${gates ?? 0} GATES${t !== null ? ` · ${t}s` : ''} · ${r.score} PTS`; }
    case 'surfing': { const flow = n(s, 'bestFlow'), barrels = n(s, 'barrels'); return `${r.score} PTS${barrels !== null ? ` · ${barrels} BARREL${barrels === 1 ? '' : 'S'}` : ''}${flow !== null ? ` · FLOW ${flow}` : ''}`; }
    case 'bigAir': case 'gymnastics': return `${r.score} PTS · ${r.outcome === 'win' ? 'STOMPED' : 'COMPLETE'}`;
    case 'sprint': { const st = n(s, 'stumbles'); return `${r.score} PTS${st !== null ? ` · ${st} STUMBLE${st === 1 ? '' : 'S'}` : ''} · ${wl(r)}`; }
    case 'golf': { const strokes = n(s, 'strokes'), holes = n(s, 'holes'); return strokes !== null ? `${strokes} STROKES${holes !== null ? ` · ${holes} HOLES` : ''}` : `${r.score} PTS`; }
    case 'baseball': { const hits = n(s, 'hits'), misses = n(s, 'misses'); return hits !== null ? `${hits}/${hits + (misses ?? 0)} CONTACT · ${r.score} PTS` : null; }
    case 'soccer': return `${r.score} PTS · ${r.outcome?.replace(/_/g, ' ') ?? wl(r)}`;
    case 'football': { const yards = n(s, 'yards'), ev = n(s, 'evades') ?? n(s, 'evaded'), tr = n(s, 'trucks'); return `${yards ?? 0} YDS${ev !== null ? ` · ${ev} EVADES` : ''}${tr !== null ? ` · ${tr} TRUCKS` : ''}`; }
    case 'tennis': case 'tiebreak': case 'volleyball': return `${r.score}–${r.opponentScore ?? 0} · ${wl(r)}`;
    case 'carnival': { const ev = n(s, 'events'), rp = n(s, 'rivalPoints'); return `${r.score}–${rp ?? r.opponentScore ?? 0} OVER ${ev ?? '?'} EVENTS · ${r.won ? 'CHAMPION' : 'RUNNER-UP'}`; }
    case 'dance': {
      const stars = n(s, 'stars'), acc = n(s, 'accuracy'), combo = n(s, 'maxCombo');
      const grade = acc !== null ? gradeFor(acc / 100) : null;
      return `${r.score} PTS${stars !== null ? ` · ${'★'.repeat(Math.max(0, Math.min(5, stars)))}` : ''}${acc !== null ? ` · ${acc}%` : ''}${grade ? ` · GRADE ${grade}` : ''}${combo !== null ? ` · ×${combo} COMBO` : ''}`;
    }
    case 'who_scene_it': case 'whoSceneIt': {
      const c = n(s, 'correct'), t = n(s, 'total'), p = n(s, 'players'), p2 = n(s, 'p2score'), w = n(s, 'winner');
      if (p === 2) return `${r.score}–${p2 ?? 0} · ${w === 0 ? 'P1 TAKES IT' : w === 1 ? 'P2 TAKES IT' : 'TIE'}`;
      return `${c ?? 0}/${t ?? 0} SCENES · ${r.score} PTS · ${wl(r)}`;
    }
    default: return null;
  }
}
