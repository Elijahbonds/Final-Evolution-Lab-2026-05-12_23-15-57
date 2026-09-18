// derbyHud — the pure presentation layer of the Home Run Derby (A+ mission #7; owner benchmark: Wii Sports baseball
// contact + MLB Home Run Derby presentation). Contact grading (the PCI) lives in the mode; these are the derby's counters:
// homers, outs, distance in feet, the longest shot, and the rival's line.

export const OUTS_CAP = 10;

/** A swing that is not a homer is an out. The round ends at OUTS_CAP outs or when the pitches run out. */
export interface DerbyTally { homers: number; outs: number; longestFt: number; totalFt: number }
export function freshDerby(): DerbyTally { return { homers: 0, outs: 0, longestFt: 0, totalFt: 0 }; }

/** Distance in feet from the flight's landing distance in metres (a 3.28 ft/m read, rounded to the foot). */
export function feetFromMetres(m: number): number { return Math.max(0, Math.round(m * 3.28084)); }

/** Bank a swing: a homer adds distance, anything else is an out. Returns whether the round is over. */
export function bankSwing(t: DerbyTally, homer: boolean, distFt = 0, outsCap = OUTS_CAP): boolean {
  if (homer) { t.homers++; t.totalFt += distFt; t.longestFt = Math.max(t.longestFt, distFt); }
  else t.outs++;
  return t.outs >= outsCap;
}

/** The distance line after a homer. */
export function distanceLine(distFt: number, longestFt: number): string {
  return distFt >= longestFt && distFt > 0 ? `${distFt} FT · LONGEST` : `${distFt} FT`;
}

/** Board rows: homers each side, outs and longest for you, the rival's line as given. */
export function derbyBoard(t: DerbyTally, rivalHomers: number, rivalLine = '', names: readonly [string, string] = ['YOU', 'RIVAL'], outsCap = OUTS_CAP): { name: string; score: number | string; line: string }[] {
  return [
    { name: names[0], score: t.homers, line: `${t.outs} / ${outsCap} OUTS${t.longestFt ? ` · LONGEST ${t.longestFt} FT` : ''}` },
    { name: names[1], score: rivalHomers, line: rivalLine },
  ];
}
