# The headed rig — a repeatable 7.5 / Soft / dunk=PASS run

Owner decision (2026-10-01): the headed device lab is the single biggest unlock. This is the checklist so a
headed run is *repeatable* and produces a **replayable artifact**, not a screenshot and a memory. The capture
loop is `window.__FEL_QA__.saveTranscript()` (RUN-CAPTURE, #84 + the save loop), gated behind `?agent=1`.

## The rig

- One phone you will actually hold (the audience's screen, not a dev laptop) and one run of the production
  build — `next start` on this machine, or the deployed site. `?agent=1` arms the QA handle on loopback/`next
  dev`; on a production build it arms only on this machine (`isLoopbackHost`).
- One mode at a time. One run = one transcript. Don't batch modes in a session.
- Score **before** you look at the transcript. The number is your eye; the file is the evidence.

## Per run

1. Open the mode with `?agent=1` (`/play/<mode>?agent=1`).
2. Play it the way a player would — full session, to the end card.
3. In the console: `window.__FEL_QA__.saveTranscript('<mode>-<verdict>')` → a JSON file lands in Downloads,
   e.g. `dunk-pass-2026-10-01T….json`. Name the verdict in the label so the file sorts.
4. Write the score (0–10) and the one-line reason on the PR or the scorecard.
5. Attach the transcript to the mode's evidence (the PR, or the scorecard's evidence column).

## The gates this feeds

| Gate | Where it runs | What "pass" needs |
|---|---|---|
| **7.5 re-score** (every ENABLED Arena mode) | `/play/<mode>?agent=1` | a headed score ≥ 7.5 + the transcript |
| **dunk=PASS** | `/play/dunk?agent=1` | a headed PASS on the RESULTS-TRUTH settlement path + the transcript |
| **Soft=PASS** | `/play/mirror/assess?agent=1` (hands-free, #80) | a real phone run of the hands-free flow, start to finish, no taps mid-run |

## Reading a transcript

`{ v, modeId, capturedAt, events[], bodyLog[], hud, result }`. `events` is the press/response timeline (a press
with no answer inside the window is the UNCLEAR-CAUSE signal); `result` is the posted score/outcome. A
`silentPct` from `__FEL_QA__.summary()` over the window is the arcade-readable grade.

## Disk + privacy

Transcripts are local files; nothing uploads. The body log holds pose *event kinds and lag*, never frames or
video. Delete a run's file when its verdict is recorded — they are evidence, not an archive.
