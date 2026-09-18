# Concept Lock — Court Carnival

**Benchmark (RE-LOCKED by Elijah, 2026-09-01, §7.3 stop-and-ask): Mario Party /
Pac-Man Fever** — the minigame-night party racer. Was Wii Sports Resort; the
owner moved it: "the carnival is supposed to be like Mario party / pac man
fever."

**Mode id:** `carnival` · **Implementation:** `lib/babylon/modes/CourtCarnivalMode.ts`
over the six-event rotation in `lib/babylon/modes/carnivalEvents.ts`, inside
the party-night hub `lib/carnival-run.ts` · **Route:** `/play/carnival`

Mario Party / Pac-Man Fever in one sentence: a NIGHT of short, different
minigames against a rival you can see, points accruing across the lineup, and
a champion at the end of it — the party is the game.

---

## A. The night structure

| # | Criterion | Status | Where |
|---|---|---|---|
| A1 | A lineup of short, DIFFERENT minigames | ✅ | six native events (Slam Rush, Strike Storm, Trick Gauntlet, Hot Shot, Coin Storm, Counter Strike) + external stops, `EVENTS_PER_NIGHT` 4, shuffled |
| A2 | Points accrue across events into one race | ✅ | `myPoints`/`rivalPoints` carry across `nextEvent()` |
| A3 | A rival runs the same night | ✅ | per-event `rivalRange` scores, running total on the bezel |
| A4 | A champion is crowned | ✅ | finale: CARNIVAL CHAMPION / RIVAL TAKES THE CARNIVAL, `ctx.end` |
| A5 | The night is a hub, not a menu | ✅ | `lib/carnival-run.ts` deals tonight's lineup (native round + external stops) behind START THE NIGHT |

## B. The party feel (this pass's build)

| # | Criterion | Status |
|---|---|---|
| B1 | The rival is a PERSON, not a number | ✅ event result: winner celebrates, loser slumps; finale crowns a body — before this pass the rival stood at (2,0,0) as a statue from load to finale |
| B2 | The room answers | ✅ crowdCheer/crowdGroan by who took the event; confetti when you take one |
| B3 | Every event is playable on every input path | ✅ `MODE_VERBS.carnival` (GO/TRICK/POWER/CHARGE) — one deck covers all six events; the Gauntlet's X spin is the documented 4-button-budget casualty (B/Y still give two tricks) |
| B4 | Tonight's lineup never deals a dead stop | ✅ retired `sprint` removed from `CARNIVAL_EXTERNAL_POOL` (it redirected away mid-night) |
| B5 | The frame survives the hub's in-run mount | ✅ canvasOwner token guard in the host — the ?carnival=1 mount double-booted the engine; measured black frame on the mobile leg, watchdog couldn't rescue a dead context |

## C. Presentation

| # | Criterion | Status |
|---|---|---|
| C1 | The race is always legible | ✅ bezel: YOU vs RIVAL, EVENT n/4, event clock, per-event hint, banners |
| C2 | Each event keeps its own venue | ✅ VenueKit court/dojo/field + the skatepark — each event builds its world |
| C3 | The finale is a moment | ✅ whistle, confetti on a win, champion/runner-up bodies, banner |

---

## D. Deviations

**D1 — No board, no spaces, no dice. → RULED.**
Mario Party's board is its connective tissue, but the mode's locked structure
is the night-of-minigames hub (which predates this pass and matches the
re-lock's intent: "the carnival is supposed to be like Mario party" — the
party, not the board). The hub IS the board: tonight's lineup is the path,
the events are the spaces. A literal board map is a different game. Recorded
so it is not re-litigated.

**D2 — External stops are links out, not embedded minigames. → RULED, kept.**
The lineup can deal a night stop that routes to another mode (dunk, 3PT…)
and returns. That is the hub design; embedding every external mode inside
the carnival canvas is out of scope.

**D3 — The rival is simulated, not a second player on the couch. → RULED.**
Mario Party is couch multiplayer; FEL's carnival is a solo night against a
simulated rival with per-event score ranges. Real head-to-head party play is
a networking build, not a carnival build. Recorded.

**D4 — Trick Gauntlet's X spin has no touch button. → DEFERRED.**
The 4-face-button budget is a platform constraint; B/Y still give two
distinct tricks so variety scoring works on a phone. Recorded.

---

## E. Exit criteria

Parity when A1–A5, B1–B5, C1–C3 hold, with D1–D3 ruled and D4 deferred.

**Currently: all hold.**
