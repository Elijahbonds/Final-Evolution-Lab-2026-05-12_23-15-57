// WHERE THE DUNK COURT'S DRESSING STANDS (vis-hoops-dunk). The dunk contest and the duel play on the same Venice court: the hoop at
// (0, 3.05, −10.28), the runway from (0, −1.2) up to it, the hoopbus across the right front corner and the event tent across
// the left (modes/DunkMode, DUNK_CONFIG). One table of places so the two modes dress it the same way. Visual placement only.

export const DUNK_COURT = {
  startZ: -1.2, rimZ: -10.28,
  /** The judges' table: behind the baseline on the tent side, in front of the shops, its cards turned to the runway — so it faces the play
   *  camera and the rim-side camera of the judging beat (measured: at the sideline it was a slab on the play frame's edge and out of the
   *  judging shot). The tent stands at x -12.9..-6.9, z -14.1..-8.1 and the hoop's backboard spans x ±0.9; the table (3.9 m long) sits between them. */
  judgesAt: { x: -3.2, z: -12.4 },
  judgesFace: { x: -3.2, z: 2 },
} as const;
