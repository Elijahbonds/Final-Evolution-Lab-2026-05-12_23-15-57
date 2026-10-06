/**
 * The host's per-tick time budget (A4). The plan's phone budget is a 30 fps frame (33 ms) on a phone 3–4 years old,
 * cooperating with PerfGovernor; at 60 Hz that frame runs TWO sim steps. A phone's JavaScript runs roughly 4–6× slower
 * than the desktop CPU the headless tests measure on, so 1 ms per step here is about 5 ms per step on the phone — two
 * steps ≈ 10 ms, under a third of the frame, leaving the rest to rendering. [TUNE]
 *
 * The test measures the mean (the steady cost) and the 95th percentile (a fight's busy steps), never the single worst
 * step: one garbage collection in a shared CI box is not the sim's cost. Measured at A4 (2026-10-06, the 60 s yard run,
 * 12 bodies): mean ≈ 0.1 ms, p95 ≈ 0.25 ms.
 */
export const HOST_TICK_BUDGET_MS = Object.freeze({ mean: 1, p95: 2.5 });
