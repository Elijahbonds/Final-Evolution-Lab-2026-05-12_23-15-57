# FEL 20-Mode Quality Check Scorecard

> Rated 1-5 per axis. **Target: every axis ≥ 4 before publish.**
> Genre column = general genre inspiration (not a clone target).

| # | Mode | Genre | Core Loop | Game Feel | Visual | Onboarding | Retention | Controller | Mobile | IP Flag |
|---|------|-------|-----------|-----------|--------|------------|-----------|------------|--------|---------|
| 1 | Karate Endless | Endless brawler | 4 | 3 | 4 | 3 | 4 | 1 | 4 | ✅ Clean |
| 2 | Dunk Contest | Slam contest | 5 | 4 | 4 | 3 | 4 | 1 | 3 | ✅ Clean |
| 3 | Match Play (Tennis) | Rally tennis | 4 | 3 | 3 | 4 | 3 | 1 | 1 | ✅ Clean |
| 4 | Brain Brawl | Trivia spin | 4 | 3 | 3 | 4 | 4 | 1 | 1 | ✅ Clean |
| 5 | Skate Run | Trick scorer | 4 | 3 | 3 | 3 | 3 | 1 | 3 | ✅ Clean |
| 6 | Penalty Shootout | Penalty kicks | 4 | 3 | 3 | 3 | 3 | 1 | 2 | ✅ Clean |
| 7 | Home Run Derby | Batting cage | 4 | 3 | 3 | 3 | 3 | 1 | 2 | ✅ Clean |
| 8 | Slalom Descent | Downhill slalom | 4 | 3 | 3 | 3 | 3 | 1 | 3 | ✅ Clean |
| 9 | Surf Break | Wave rider | 4 | 3 | 3 | 3 | 3 | 1 | 3 | ✅ Clean |
| 10 | Links Challenge | Mini golf | 4 | 3 | 4 | 3 | 3 | 1 | 3 | ✅ Clean |
| 11 | Floor Routine | Rhythm game | 4 | 3 | 3 | 3 | 3 | 1 | 3 | ✅ Clean |
| 12 | Iron Paradise | Rep trainer | 3 | 3 | 3 | 3 | 3 | 1 | 4 | ✅ Clean |
| 13 | 1V1 Hoops | 1v1 basketball | 4 | 3 | 3 | 4 | 3 | 1 | 3 | ✅ Clean |
| 14 | 3V3 Streetball | Streetball | 3 | 3 | 3 | 3 | 3 | 1 | 3 | ✅ Clean |
| 15 | 3-Point Shootout | Shooting contest | 4 | 3 | 3 | 3 | 3 | 1 | 3 | ✅ Clean |
| 16 | Karate VS | Fighting versus | 4 | 3 | 3 | 3 | 3 | 1 | 4 | ✅ Clean |
| 17 | Who Scene It | Rapid recall | 3 | 3 | 3 | 2 | 3 | 1 | 1 | ✅ Clean |
| 18 | Big Air | Jump trick | 4 | 3 | 3 | 3 | 3 | 1 | 3 | ✅ Clean |
| 19 | Tiebreak Blitz | Tennis tiebreak | 4 | 3 | 3 | 3 | 3 | 1 | 3 | ✅ Clean |
| 20 | Beach Sprint | Button masher | 3 | 3 | 3 | 3 | 2 | 1 | 3 | ✅ Clean |

## Universal Gaps (apply to ALL modes)

1. **No gamepad support** (Controller = 1 across the board). Need Gamepad API polling.
2. **No screen-shake / hit-flash juice**. Canvas games feel flat on impact.
3. **No score-popup particles** (floating +pts text on scoring actions).

## Per-Mode Top Gaps

### Tennis (Match Play) & Tiebreak Blitz
- **No mobile controls** — unplayable on touch devices.
- Court rendering uses flat fill, no net/line detail.

### Brain Brawl
- **No mobile controls** — wheel/quiz is DOM-based but no explicit touch zones.
- No backdrop image (solid dark bg is intentional for readability, but feels less premium).

### Who Scene It
- **No mobile controls** — DOM buttons work on touch but no instruction text.
- **Weak onboarding** — no explanation of recall mechanic before starting.
- No backdrop, very minimal styling.

### Sprint (Beach Sprint)
- Retention loop is thin — tap fast then done. Needs lane-switch mechanic or photo-finish feedback.

### Training (Iron Paradise)
- Core loop is sound but **exercise transitions are abrupt** — no name callout.

## Fix Plan (prioritized by impact)

1. **Add unified Gamepad API polling** to GameShell (bubbles to all modes automatically).
2. **Add screen-shake utility** (`shakeCanvas`) and floating score popups across all canvas games.
3. **Add mobile touch controls** to Tennis, Brain Brawl, Who Scene It.
4. **Add instruction overlay** improvements to Who Scene It and Sprint.
5. **Polish visual rendering** — add hit-flash on scoring, tighten animation easing.

## IP Compliance

✅ **All 20 modes clean.** No borrowed assets, names, likenesses, or protected expression found. All art is FEL-original (Meshy-generated backdrops, original canvas rendering, DeepMotion mocap for Dunk). Quiz content in Brain Brawl / Who Scene It uses general-knowledge questions with no copyrighted material.
