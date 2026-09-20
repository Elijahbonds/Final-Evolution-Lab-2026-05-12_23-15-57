# Does the project reach its own documents? (2026-09-19)

Asked: do we hit the benchmarks in the game-development documents, the synopsis, the full scope and the master
documents — what is missing, where do we fall short, does it tie together, what feels disconnected.

Method: read the documents, then check every claim against the tree. Not the other way round.

## The first finding is about the documents themselves

**There are 123 of them** — 42 markdown files at the repo root, 81 in `docs/`. Almost all are point-in-time reports
from finished passes: `PHASE3_GATE0_REPORT`, `AUDIT_COMPLETION_SUMMARY`, `10PHASE_REMEDIATION_COMPLETE`,
`IMMEDIATE_ACTIONS_COMPLETE`, nine `MODE*_PHASE1_AUDIT` files, six `SHIP-PASS-*` files. They are sediment, not spec.

**And the master document is wrong.** `MASTER_MODE_LIST.md` calls itself "Authority: single source of truth for all
subsequent phases", is dated 2026-08-27, and says:

| It claims | The tree actually holds |
|---|---|
| 18 active modes | 37 in `MODE_INFO`, 51 Babylon mode files |
| Tennis, Golf, Soccer, Baseball, Football, Skate, Surf, Snowboard are "Canvas 2D MOCKUP" | All eight are Babylon 3D. Skate is 1,108 lines, Surf 536, Snowboard 509 |
| No kart, no aero | `VelocityKartMode` 1,142 lines, `AeroAcesMode` 635 |
| Multiplayer ❌ on every mode | `lib/mp` has match-core, service and wiring; the wallet settles MP matches |

Tennis is 28 lines not because it is a stub but because `NetSportMode` + `RallyCore` do the work — "adding a net
sport should cost a config, not a rewrite". A reader of the master list would conclude the opposite.

**So the honest answer to "do we reach the benchmarks" is: the documents cannot tell you.** The tree is ahead of them
almost everywhere, and where it is behind, the documents do not say so either. The benchmark locks in
`PHASE2_BENCHMARK_LOCKS.md` (Mario Tennis Aces for tennis, PGA Tour 2K for golf, MLB The Show for baseball) were
never re-measured after the modes were actually built.

## Where it genuinely falls short: nothing can be found

This is what "feels disconnected" is, and it is not a feeling — it is the navigation.

`components/app-header.tsx` links to exactly three places: `/admin/metrics`, `/cards`, `/store`.

- **`/coach` is linked from nowhere.** The entire coach product — roster, programming, inbox, chat, the invite panel
  built this week — is reachable only by typing the URL.
- **`/training`, the athlete's side of that product, is linked from nowhere** (it did not exist as a route at all
  until today; the component had been sitting unmounted).
- **`/kitchens` is reachable only as a card in the modes grid**, alongside the games, which is the wrong shelf for a
  nutrition floor and a ghost-kitchen marketplace.
- `/story`, `/wallet`, `/profile` are each their own island.

Every one of these surfaces WORKS. A coach who signs up cannot find the coaching product; an athlete who joins a
roster cannot find their programming unless somebody sends them a link. That is the single highest-value fix in this
document and it is a navigation component, not a feature.

## Where it ties together well

Worth saying, because the connective work is real and recent:

- invite → roster → program → session → log → coach inbox is a closed loop
- a shared program now carries the coach's public invite, so reading one can make you their client
- the movement screen scores, prescribes corrective work from the coach's own catalogue, fills the Fuel floor's
  metrics and pays shards — Mirror, coaching and Kitchens meeting in one flow
- the wallet is the one economy: referrals, screens, matches and purchases all settle through the same
  server-granted, idempotent path

## What is actually missing

1. **Navigation** (above). Everything else on this list is smaller.
2. **A live spec.** One document that describes what the product IS, maintained, replacing the 123. The rest should
   be archived, not deleted — they are history, and history that claims to be authority is the problem.
3. **Benchmarks were never re-measured.** Each mode has a locked AAA reference and no pass has scored the built mode
   against it since it was built.
4. **The deployed Prisma client lags the schema.** Two new tables exist on the hosted database and in the shipped
   schema copy, and the live function still throws against them — either it regenerates from a stale cache or
   production points at a different database than `.env.local`. Open, and it blocks the invite in production.
5. **Kart and aero have never had a depth pass.** They were built in a day (2026-09-12) and have not been back
   through the treatment the dunk, hoops and board modes have had.
