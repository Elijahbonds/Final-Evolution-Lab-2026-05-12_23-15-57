FEL KITCHENS LANE (parallel product, not dunk)
Goal: stand up athlete kitchen/cookbook layer tied to Neuromechanic Mirror / Your Build, plus fulfillment path.

Repo root (confirm before scaffolding): Mac tree
  /Users/elijahbonds/Developer/FEL-swarm/copilot-worktrees/final-evolution-lab-2026-05-12_23-15-57/finalevolutionus-automatic-carnival/FEL-full-app
Work under FEL-full-app only. Do not invent a second app root.

Fold soft prep (already drafted off-tree — absorb into SPEC, do not rewrite from scratch):
  /workspace/fel-kitchens/SPEC-MEAL-RX-v0.md
  /workspace/fel-kitchens/ONEPAGER-FULFILLMENT-v0.md
Copy/adapt into docs/SPEC-FEL-KITCHENS.md (+ optional docs/SPEC-MEAL-RX.md pointer). Soft prep is source of truth for MealRx schema + fulfillment hybrid.

Locked product decisions (PM brief review):
- Grocery list v0 ships first (in-app checklist + share from MealRx.groceryList). Zero partner dependency.
- Instacart IDP optional (v0.5) — shopping-list link from same GroceryItem[]; affiliate OK later. Not Instacart Connect.
- No live DoorDash Drive in this lane until a real pickup/pack node exists. Drive stays documented-only / out of v0 code path.
- MealRx lives in KitchenStore (new), keyed by sourceScanDate. Do NOT mutate Mirror types yet.
- BuildStore is READ-ONLY upstream (MovementSignature + BuildRx / detectLeak / radar). Modes never call MealRx.

1. Create docs/SPEC-FEL-KITCHENS.md: audience (athlete), cookbook modules, Movement Signature / corrective Rx → meal plans, fulfillment (list v0 → Instacart optional → Drive-later), auth, KitchenStore vs BuildStore, out-of-scope (no dunk/pad/Pack5 wallet/Studio; no live Drive checkout; non-clinical disclaimer).
2. Search tree for kitchen/nutrition/meal/doordash/instacart/BuildStore — report hits (expect BuildStore + Mirror; may be empty kitchens).
3. If empty, scaffold thinnest Next routes under app/(lab)/kitchens/ + lib/kitchens/ stubs:
   - KitchenStore + MealRxBuilder (pure) + GroceryList UI
   - Fulfillment adapter stub: list | instacart | doordash (doordash = no-op / docs-only)
   - Env-only notes for future Instacart/DoorDash keys — no secrets in git
4. Do not edit Venice dunk, pad overlay, Pack 5 wallet, or Studio zips.
5. Commit when green enough for review; title: FEL Kitchens spec + scaffold.
Studio HOLD. No Publish.
