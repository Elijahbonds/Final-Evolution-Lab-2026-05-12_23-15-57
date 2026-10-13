// WHERE THE DUNK COURT'S DRESSING STANDS (vis-hoops-dunk). The dunk contest and the duel play on the same Venice court: the hoop at
// (0, 3.05, −10.28), the runway from (0, −1.2) up to it, the hoopbus across the right front corner and the event tent across
// the left (modes/DunkMode, DUNK_CONFIG). One table of places so the two modes dress it the same way. Visual placement only.

export const DUNK_COURT = {
  startZ: -1.2, rimZ: -10.28,
  /** The judges' table: at the sideline, level with the gather line, its cards turned to the runway. */
  judgesAt: { x: 7.3, z: -3.9 },
  judgesFace: { x: -1.5, z: 0.4 },
} as const;
