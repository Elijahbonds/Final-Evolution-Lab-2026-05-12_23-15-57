export const PRQ_ATTRS = [
  'strength',
  'speed',
  'endurance',
  'agility',
  'power',
  'flexibility',
  'recovery',
  'mental',
] as const;

export type PrqAttr = (typeof PRQ_ATTRS)[number];

export interface PrqGrade {
  key: 'ELITE' | 'PRIMED' | 'READY' | 'RECOVERING';
  label: string;
  color: string;
  speedMult: number;
  hangBonus: number;
}

export function prqScore(attrs: Record<string, number> | null | undefined): number {
  if (!attrs) return 0;
  const vals = PRQ_ATTRS.map((a) => Number(attrs?.[a] ?? 0));
  const sum = vals.reduce((s, v) => s + (isFinite(v) ? v : 0), 0);
  return Math.round((sum / (PRQ_ATTRS.length || 1)) * 10) / 10;
}

export function prqGrade(score: number | null | undefined): PrqGrade {
  const s = score ?? 0;
  if (s >= 80) return { key: 'ELITE', label: 'ELITE', color: '#A855F7', speedMult: 1.15, hangBonus: 0.3 };
  if (s >= 60) return { key: 'PRIMED', label: 'PRIMED', color: '#00E5FF', speedMult: 1.05, hangBonus: 0.15 };
  if (s >= 40) return { key: 'READY', label: 'READY', color: '#00FF9D', speedMult: 1.0, hangBonus: 0 };
  return { key: 'RECOVERING', label: 'RECOVERING', color: '#FFD700', speedMult: 0.9, hangBonus: -0.1 };
}

export const MODE_WEIGHTS: Record<string, number> = {
  karateEndless: 1.0,
  dunkContest: 1.0,
  tennis: 0.9,
  brainBrawl: 0.8,
  skateboarding: 1.0,
  soccer: 1.1,
  baseball: 1.0,
  snowboarding: 1.0,
  surfing: 1.0,
  golf: 0.9,
  gymnastics: 1.1,
  training: 1.0,
  hoops1v1: 1.0,
  hoops3v3: 1.0,
  threePoint: 0.9,
  karateVersus: 1.1,
  whoSceneIt: 0.8,
  bigAir: 1.0,
  tiebreak: 0.9,
  sprint: 1.0,
  storyMode: 1.2,
};

// Attributes each mode primarily trains
export const MODE_ATTRS: Record<string, PrqAttr[]> = {
  karateEndless: ['strength', 'agility', 'endurance', 'mental'],
  dunkContest: ['power', 'speed', 'flexibility'],
  tennis: ['agility', 'speed', 'endurance'],
  brainBrawl: ['mental', 'recovery'],
  skateboarding: ['agility', 'flexibility', 'mental'],
  soccer: ['power', 'agility', 'mental'],
  baseball: ['strength', 'power', 'speed'],
  snowboarding: ['agility', 'speed', 'mental'],
  surfing: ['flexibility', 'endurance', 'mental'],
  golf: ['mental', 'flexibility', 'power'],
  gymnastics: ['flexibility', 'strength', 'agility'],
  training: ['strength', 'endurance', 'recovery'],
  hoops1v1: ['agility', 'power', 'mental'],
  hoops3v3: ['mental', 'agility', 'endurance'],
  threePoint: ['mental', 'flexibility', 'speed'],
  karateVersus: ['strength', 'agility', 'mental'],
  whoSceneIt: ['mental', 'recovery'],
  bigAir: ['power', 'agility', 'flexibility'],
  tiebreak: ['speed', 'agility', 'mental'],
  sprint: ['speed', 'power', 'endurance'],
  storyMode: ['strength', 'speed', 'agility', 'power', 'mental'],
};

export function computePrqDelta(opts: {
  mode: string;
  score: number;
  won: boolean;
  duration: number;
}): number {
  const weight = MODE_WEIGHTS?.[opts?.mode] ?? 0.8;
  const completionBonus = opts?.won ? 1.2 : 1.0;
  const timeFactor = Math.min(Math.max((opts?.duration ?? 0) / 120, 0.25), 1);
  // normalize score to a 0-10 band so deltas stay sane across modes
  const normScore = Math.min((opts?.score ?? 0) / 10, 10);
  const delta = normScore * 0.1 * weight * completionBonus * timeFactor;
  return Math.round(Math.min(delta, 2.5) * 100) / 100;
}
