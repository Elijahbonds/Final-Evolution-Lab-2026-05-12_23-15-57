# FEL Kitchens — Meal Rx schema stub (v0.1)

Status: soft prep refine. Spec only. No hard build. No Claude dunk steal. Studio HOLD.
Aligned to: `SPEC-MIRROR-BUILD.md`, `MovementSignature` (`src/types/university.ts`), `BuildRx` / `BuildStore` (`src/core/BuildStore.ts`), fulfillment one-pager.

## PM locks (2026-09-05)

| Decision | Status |
|---|---|
| `KitchenStore` separate from `BuildStore` | **LOCKED** |
| Hybrid fulfillment: list → Instacart IDP → Drive if partner | **LOCKED** |
| Leak → theme map | Draft OK, **pending Elijah** |
| Instacart IDP apply | **HOLD** until pad-grade + AM paste + Elijah GO |
| Hard Claude scaffold | **HOLD** until pad-grade + AM paste |

## Purpose

Turn Your Build's current leak + Movement Signature into a **meal Rx** (performance fuel for the body object). Surfaces on Build / Kitchens only — never on Venice court. Non-clinical. Same spirit as `NON_CLINICAL_DISCLAIMER`.

## Upstream inputs (read-only from Build)

Do **not** mutate Mirror / BuildStore types. Kitchens reads a snapshot.

### `MovementSignature` (existing)

| Field | Use in Meal Rx |
|---|---|
| `scanDate`, `intervalWeek` | Freshness / plan window; KitchenStore key |
| `prqScore` | `loadBand` |
| `asymmetryIndex` | Optional recovery-emphasis weight when high |
| `mobilityScore`, `stabilityScore`, `reactiveStiffness` | Radar → secondary theme weights |
| `kineticChainLeakage.{ankle,knee,hip,lumbar}` | Leak ranking (same as `detectLeak`) |
| `restrictedJoints`, `compensationPatterns`, `diagnosticNotes` | Leak detection only (BuildStore already) |
| FMS 0–3 scores | Derived only; never player-facing meal copy |
| `disclaimer` | Carry through on meal + fulfill surfaces |

### `BuildRx` (existing)

| Field | Use |
|---|---|
| `leak: LeakId` | Primary meal-theme key |
| `leakLabel` | Player-facing leak chip |
| `corrective`, `rnt`, `bandN` | Context only — **never** reprint as meal copy |

### Radar (derived)

`radarFromSignature` → `{ mobility, stability, symmetry, reactive }` — optional recipe-tag weights.

## KitchenStore (LOCKED shape)

```ts
/** Persist key — localStorage fine for soft/sandbox. */
export const KITCHEN_STORAGE_KEY = 'fel-kitchen-store-v1';

export interface KitchenSnapshot {
  /** Latest MealRx for the current Build scan, or null if none built. */
  current: MealRx | null;
  /** Prior MealRx keyed by sourceScanDate (cap ~14). */
  history: MealRx[];
  /** Recipe catalog seed (static until content GO). */
  recipes: Recipe[];
  /** Default fulfill path until adapters unlock. v0 = 'list'. */
  preferredFulfillment: FulfillmentPath;
}

export type FulfillmentPath = 'list' | 'instacart' | 'doordash' | 'none';
```

Rules:
- Key MealRx by `sourceScanDate` (from `MovementSignature.scanDate`).
- On new Build scan: if `sourceScanDate` changes, archive prior `current` into `history`, rebuild.
- Modes never call KitchenStore. Silent `NeuromechanicCard` ingest stays Build-only.
- Prefer deep-link from Your Build hub ("Today's fuel") into Kitchens surface — do not fork a second Mirror.

## Types (Kitchens owns)

```ts
import type { LeakId } from '../core/BuildStore'; // or re-export; do not fork LeakId

export interface MealRx {
  id: string;                      // uuid
  schemaVersion: 1;
  createdAt: string;               // ISO
  sourceScanDate: string;          // MovementSignature.scanDate
  leak: LeakId;
  leakLabel: string;
  loadBand: LoadBand;
  themes: MealTheme[];             // 1–3 max, primary first
  dayPlan: MealSlot[];
  groceryList: GroceryItem[];      // flattened + deduped from dayPlan recipes
  disclaimer: string;
  /** Hint only — adapter may fall back to 'list' if path locked/unavailable. */
  fulfillmentHint: FulfillmentPath;
}

export type LoadBand = 'easy' | 'train' | 'hard';

export type MealTheme =
  | 'recovery'
  | 'protein-rebuild'
  | 'anti-inflammatory'
  | 'hydration-electrolyte'
  | 'carb-timing'
  | 'joint-support';               // food tags only — no medical claims

export interface MealSlot {
  slot: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'pre' | 'post';
  recipeId: string;
  title: string;                   // denormalized for UI
  minutes: number;
  macros: Macros;
  themes: MealTheme[];
}

export interface Macros {
  kcal: number;
  proteinG: number;
  carbG: number;
  fatG: number;
}

export interface GroceryItem {
  name: string;
  qty: number;
  unit: 'g' | 'ml' | 'each' | 'tbsp' | 'tsp' | 'cup' | 'oz';
  aisleHint?: string;
  optional?: boolean;
  /** When Instacart path unlocks — leave null in v0. */
  externalSkuHint?: string | null;
}

export interface Recipe {
  id: string;
  title: string;
  prepMinutes: number;
  macros: Macros;
  themes: MealTheme[];
  ingredients: GroceryItem[];
  athleteNote?: string;            // Elijah voice, optional
  source: 'seed' | 'elijah' | 'blueprint';
}
```

## Builder contract (pure)

```ts
/** Pure. No I/O. No BuildStore writes. */
export function buildMealRx(input: {
  signature: MovementSignature;
  rx: BuildRx;                     // lastRx or rxFromSignature(sig)
  recipes: Recipe[];               // from KitchenSnapshot.recipes
  preferredFulfillment?: FulfillmentPath; // default 'list'
}): MealRx;
```

Algorithm (v0.1 stub):
1. `leak` / `leakLabel` from `rx`.
2. `loadBand` from `prqScore` thresholds below.
3. `themes` = leak map (primary) ∪ loadBand extras (hard adds `carb-timing` + `recovery` snack bias).
4. Pick ≤4 `MealSlot`s from `recipes` matching themes (greedy tag overlap); fallback to any seed recipe.
5. Flatten + merge `groceryList` by `name`+`unit` (sum qty).
6. `fulfillmentHint` = preferred if unlocked else `'list'`.
7. Always set `disclaimer` from signature or shared non-clinical string.

## Leak → theme map (draft — pending Elijah)

| LeakId | Primary themes | Player one-liner (fuel, not PT) |
|---|---|---|
| `mid-back` | recovery, hydration-electrolyte, anti-inflammatory | Fuel that keeps you soft and ready for the next lock. |
| `knee-valgus` | protein-rebuild, joint-support, anti-inflammatory | Rebuild day. Protein first, keep the joints quiet. |
| `hip-drop` | protein-rebuild, carb-timing | Stance-side fuel. Steady protein + timed carbs. |
| `ankle` | hydration-electrolyte, anti-inflammatory, joint-support | Soft tissue day. Fluids + quiet joints. |

`loadBand` from `prqScore` (stub — tune with Elijah):
- `< 0.75` → `easy`
- `0.75–0.88` → `train`
- `> 0.88` → `hard`

## Flow

```
BuildStore.snapshot (read-only)
  → signature + lastRx (or rxFromSignature)
  → buildMealRx(...)
  → KitchenStore.current
  → Your Build "Today's fuel" / Kitchens UI
  → groceryList → fulfill adapter (list | instacart | doordash)
```

## Cookbook layer

- Recipes live in `KitchenSnapshot.recipes`.
- Books lane owns Amazon print/Kindle + own-store audio.
- Kitchens owns in-app recipe objects only.
- Content source for first 7–14 recipes still TBD (Elijah) — schema does not block.

## Fulfillment (see ONEPAGER — LOCKED hybrid)

v0 adapter ships **list only**. Instacart / Drive are typed on `FulfillmentPath` but gated until Elijah + pad-grade + AM paste. No IDP apply yet.

## Out of scope

- Live MediaPipe / mutating `MovementSignature`
- Medical claims, supplements, calorie-deficit coaching
- Venice / pad / Studio / Publish
- Live DoorDash or Instacart checkout
- Second dunk writer / dunk file edits

## Still open (Elijah / PM)

1. Confirm or edit leak→theme map + loadBand thresholds.
2. Cookbook source for first 7–14 recipes.
3. Paste target root (sandbox Vite vs Next) when AM pastes Claude brief.
