# FEL Kitchens — spec (v0, 2026-09-05)

Folded from the PM's soft prep (`docs/_soft-prep-kitchens/SPEC-MEAL-RX-v0.md`, `ONEPAGER-FULFILLMENT-v0.md`) and the
lane brief (`docs/CLAUDE-KITCHENS-BRIEF.md`). The soft prep is the source of truth for the MealRx schema and the
fulfillment hybrid; this file adapts it to the Mac tree and records what the tree already holds. Studio HOLD. No Publish.

## Audience and job

The athlete. Your Build's current leak and load turn into a **meal Rx**: performance fuel for the body object, one day
plan and one grocery list, surfaced on Build / Kitchens only — never on the Venice court. Non-clinical, food tags only,
no medical claims; the disclaimer rides every meal and fulfilment surface.

## What the tree already has (survey, step 2 of the brief)

| Hit | What it is | Kitchens' relation |
|---|---|---|
| `app/kitchens/page.tsx` → `lib/babylon/kitchens/KitchenHub.tsx` + `KitchenMarket.ts` (M62) | the ghost-kitchen **marketplace**: kitchens list shifts, chefs subscribe and publish meal-prep plans, eaters subscribe; Stripe seam; compliance notice | the hub stays; Kitchens adds a **Fuel** floor at `/kitchens/fuel` and a link from the hub — no second app root, no route collision (`app/(lab)/kitchens` would resolve to the same `/kitchens` path as the hub) |
| `lib/babylon/nutrition/NutritionScore.ts` + `FoodScan.tsx` (M60) | scan-your-plate: plate tags → goal-relative score | untouched; a later fold could tag MealRx recipes with `PlateTag`s |
| `lib/game-data.ts:199` | the hub card `kitchens: FEL Kitchens · The Kitchen · /kitchens` | untouched |
| `lib/prq.ts` | PRQ = mean of the eight profile attributes, **0–100**; grades RECOVERING < 40 · READY · PRIMED ≥ 60 · ELITE ≥ 80 | the snapshot adapter divides by 100 to meet the soft prep's 0–1 thresholds |
| `lib/workout/movement-screen.ts` | `MovementMetrics` → `ScreenResult { pillars (power, mobility, symmetry, stability, cadence, posture), weakest, overall, flags }` | the leak guess reads `weakest` and the valgus / asymmetry metrics |
| `lib/babylon/nexus/neuro-mirror/*` | the Mirror runtime (zones, squat audit faults: kneeValgus, heelRise, armFall, lateralShift, shallow) | read-only; not wired into Kitchens in v0 |
| `BuildStore`, `MovementSignature`, `BuildRx`, `detectLeak`, `radarFromSignature` | **absent** — they live in the Vite twin (`src/core/BuildStore.ts`, `src/types/university.ts`), which is not on this disk | Kitchens owns a small **read-only `BuildSnapshot`** with the same field meanings and a local `LeakId`; when BuildStore lands here, `types.ts` re-exports its `LeakId` and `buildSnapshot.ts` reads its snapshot — nothing else changes |
| DoorDash / Instacart | no hits | documented only (below) |

## Locked decisions (PM, 2026-09-05)

- Grocery list v0 ships first: in-app checklist + share from `MealRx.groceryList`. Zero partner dependency.
- Instacart IDP optional (v0.5): a shopping-list link from the same `GroceryItem[]`; affiliate later; **not** Instacart
  Connect. Apply HOLD until pad-grade + AM paste + Elijah GO.
- No live DoorDash Drive until a real pickup / pack node exists. Drive is typed and documented; its adapter is a no-op.
- `KitchenStore` is separate from the Build store and keyed by `sourceScanDate`. Mirror types are never mutated.
- Build is READ-ONLY upstream. Modes never call MealRx or KitchenStore.

## Modules (this tree)

| File | Role |
|---|---|
| `lib/kitchens/types.ts` | the LOCKED shapes from the soft prep: `MealRx`, `LoadBand`, `MealTheme`, `MealSlot`, `Macros`, `GroceryItem`, `Recipe`, `FulfillmentPath`, `KitchenSnapshot`, `KITCHEN_STORAGE_KEY`, `LeakId` (local until BuildStore lands), `NON_CLINICAL_DISCLAIMER` |
| `lib/kitchens/buildSnapshot.ts` | read-only upstream adapter: `BuildSnapshot { scanDate, prqScore (0–1), leak, leakLabel, pillars? }`; `snapshotFromTree({ prq0to100, screen?, metrics?, scanDate })` — the leak guess is **draft, pending Elijah** |
| `lib/kitchens/mealRxBuilder.ts` | pure `buildMealRx({ signature, recipes, preferredFulfillment })` — the soft prep's algorithm, `LEAK_THEMES`, `LEAK_ONE_LINER`, `loadBandFor` |
| `lib/kitchens/recipes.seed.ts` | the catalogue: `ELIJAH_RECIPES` (`source: 'elijah'`, empty — the marked slot where Elijah's recipes go, they win ties) + `SEED_RECIPES` (fourteen placeholders, honest ordinary macros, food tags only, every theme ≥ 3 options); `KITCHEN_RECIPES` is what the store reads |
| `lib/kitchens/metrics.ts` | the Your Build scan input: `METRIC_FIELDS` (ranges / steps for the seven `MovementMetrics`), `sanitizeMetrics`, `clampMetric`, `loadMetrics` / `saveMetrics` / `clearMetrics` under `fel-kitchen-metrics` (per viewer, localStorage) |
| `lib/kitchens/instacartMint.ts` | the Instacart mint lifted out of the route: `mintInstacartList({ items, linkbackUrl, env, fetchImpl })` → `{ status, body }`; `parseItems` (well-formed lines only, cap 60). The fetch is injected, so the key path is proven without the network |
| `lib/kitchens/fulfillment.ts` | `fulfill(path, list)` → list text · Instacart (minted server-side, see below) · DoorDash `unavailable`; `availablePaths({ instacart })`, `groceryText` |
| `lib/kitchens/instacart.ts` + `app/api/kitchens/instacart-list/route.ts` | IDP payload builder (pure, tested) and the keyed server route (GET availability · POST auth → `mintInstacartList` with the real `fetch`) |
| `lib/kitchens/KitchenStore.ts` | localStorage store (`fel-kitchen-store-v1`, the same pattern as `KitchenMarket`): `snapshot`, `ingest(build)` (archives on a new `sourceScanDate`, cap 14), `setPreferredFulfillment`, `reset` |
| `components/kitchens/fuel-view.tsx`, `your-build-panel.tsx`, `grocery-list.tsx` | the Fuel floor: the Your Build panel (seven sliders, defaults pre-filled, derived leak + load band live, Defaults button), leak chip, load band, themes, day plan, grocery checklist with copy / share, fulfilment path picker (list live; Instacart behind the key; Drive locked) |
| `app/kitchens/fuel/page.tsx` | `/kitchens/fuel`, logged in; builds the snapshot from `/api/profile`'s `prq` + the movement screen the athlete entered (defaults until touched) |

## Flow

```
/api/profile.prq (0–100) + movement screen (default metrics until a scan lands)
  → snapshotFromTree → BuildSnapshot (read-only)
  → buildMealRx (pure) → KitchenStore.current (keyed by sourceScanDate; prior → history)
  → Fuel floor: day plan · grocery checklist · share text
  → fulfill('list') now · 'instacart' when unlocked · 'doordash' documented only
```

## Leak → theme map (draft, pending Elijah) and load band

| LeakId | Themes (primary first) | One-liner (fuel, not PT) |
|---|---|---|
| `mid-back` | recovery, hydration-electrolyte, anti-inflammatory | Fuel that keeps you soft and ready for the next lock. |
| `knee-valgus` | protein-rebuild, joint-support, anti-inflammatory | Rebuild day. Protein first, keep the joints quiet. |
| `hip-drop` | protein-rebuild, carb-timing | Stance-side fuel. Steady protein + timed carbs. |
| `ankle` | hydration-electrolyte, anti-inflammatory, joint-support | Soft tissue day. Fluids + quiet joints. |

`loadBand` — **owner decision 2026-09-05, grade-aligned**: RECOVERING and READY (PRQ < 60) → easy · PRIMED (60–79) → train ·
ELITE (80+) → hard. (The soft prep's 0.75 / 0.88 cuts on a 0–1 scale put every current athlete on an easy day.)

Leak source — **owner decision 2026-09-05: the movement screen** until a Mirror scan is wired: valgus above 0.45 on either knee → `knee-valgus`; asymmetry above 12 % →
`hip-drop`; otherwise the weakest pillar — mobility → `mid-back`, stability → `knee-valgus`, symmetry → `hip-drop`,
posture / power / cadence → `ankle`.

## Fulfilment (LOCKED hybrid)

| Phase | Ships | Gate |
|---|---|---|
| v0 | in-app grocery checklist + copy / share text | schema only — **this commit** |
| v0.5 | Instacart IDP shopping-list link from the same list — **wired behind the key (owner decision 2026-09-05)**: `lib/kitchens/instacart.ts` builds the IDP `products_link` payload (units mapped, optional items labelled, disclaimer as instructions); `POST /api/kitchens/instacart-list` mints the page when `INSTACART_IDP_KEY` exists (dev host by default, `INSTACART_IDP_HOST` for production) and answers 409 `locked` until then; `GET` reports availability so the Fuel floor's button unlocks by itself | the application stays on HOLD (pad-grade + AM paste + Elijah GO); no key in git; verify the endpoint against the IDP docs on the first key |
| v1+ | DoorDash Drive from a pickup / pack node | a real partner kitchen; adapter stays `unavailable` |

## Auth and surfaces

`/kitchens/fuel` requires a session like every lab route. The hub at `/kitchens` links to it. The disclaimer renders on
the Fuel floor and in the share text.

## Out of scope

Studio Preview / Publish · Venice dunk, pad, Pack 5 wallet · Mirror or Build type changes · medical claims, supplements,
calorie-deficit coaching · live Instacart or DoorDash checkout · Stripe meal packs · marketplace scraping.

## Open for Elijah / PM

1. Leak → theme map (draft above; the load band and the leak source are decided).
2. Cookbook source for the first 7–14 recipes (seed recipes are placeholders with honest macros, no voice). The slot is
   `ELIJAH_RECIPES` in `lib/kitchens/recipes.seed.ts`.
3. Whether the Fuel floor also reads the Mirror's squat faults once a scan exists (today the athlete enters the screen
   metrics in the Your Build panel; a Mirror scan would pre-fill the same seven fields).

## Landed

**2026-09-05 (v0 fold):** types · read-only snapshot adapter · pure builder · eight seeds · KitchenStore · Fuel floor
with grocery checklist, copy / share, path picker · Instacart payload builder + keyed route (409 without the key) · hub
link · probe `scripts/probes/_kitchens-fuel.mts`.

**2026-09-05 (kitchens depth):**

1. *Scan input.* The Your Build panel on the Fuel floor (`components/kitchens/your-build-panel.tsx`): the seven
   `MovementMetrics` as sliders with sensible ranges (jump 10–90 cm · depth 60–130° · asymmetry 0–30 % · valgus L/R
   0–1 · cadence 140–200 spm · trunk lean 0–45°), defaults pre-filled, the derived leak and load band updating live, a
   Defaults button. The last metrics persist per viewer under `fel-kitchen-metrics`; `snapshotFromTree` gets them, so
   the MealRx is built from the athlete's screen, not the default one. An unchanged plan keeps its MealRx id on
   rebuild, so the basket ticks survive. The disclaimer stays.
2. *Recipes.* `ELIJAH_RECIPES` (`source: 'elijah'`, empty, marked) + six more seeds (tuna quinoa · ginger chicken
   broth · coconut water + orange · sardines on rye · beef and potatoes · rice cakes + honey) → fourteen seeds, every
   theme with at least three options. `buildMealRx` fills a per-band slot plan (`LOAD_SLOTS`: easy = breakfast, lunch,
   dinner, snack · train adds pre + post · hard adds pre, post + snack) by theme overlap + slot fit (light and quick
   around the session, a full plate at meals); no recipe twice in a day plan; deterministic.
3. *Instacart key path.* `mintInstacartList` with an injectable fetch; the route only does auth and hands it the real
   `fetch`. `lib/kitchens/instacartRoute.test.ts` proves, with a FAKE in-process key and a recording fetch, the exact
   POST (dev host + `/idp/v1/products/products_link`, Bearer header, `shopping_list` payload with mapped units and the
   linkback), the 409 `locked` without the key (fetch never called), 400 / 401 / 502 paths, and the route itself with
   auth mocked and `fetch` stubbed. `.env.example` documents `INSTACART_IDP_HOST`. No real key anywhere.

Tests: `lib/kitchens/*.test.ts` — 4 files, 29 tests (`metrics`, `instacart`, `mealRxBuilder`, `instacartRoute`).
Probe: `BASE=http://localhost:3005 npx tsx scripts/probes/_kitchens-fuel.mts` (BASE defaults to 3000).
