// KitchenMarket — the ghost-kitchen subscription marketplace (M62, Phase
// 10). The legitimate build of the food-business idea: a two-sided,
// subscription-based marketplace —
//   KITCHEN PARTNERS list licensed commercial kitchens with bookable
//     recurring shifts (keep idle kitchens employed);
//   CHEFS subscribe monthly to a shift (their production home for meal
//     prep), then publish MEAL-PREP PLANS;
//   EATERS subscribe weekly to a chef's plan (the meal-prep-but-
//     subscription model).
// "Plug into the systems in place" is literal: recurring payments ride the
// exact Stripe subscription pattern shipped in M60's subscriptionApi
// (lookup-key Prices + webhook entitlement — the STRIPE SEAMs below name
// the lookup keys), identity rides the existing profile, and storage is
// the same localStorage + SYNC SEAM pattern as the Studio/Marketplace.
//
// COMPLIANCE, stated plainly (also surfaced in the UI): FEL is a
// marketplace facilitator. Kitchen operators are responsible for their own
// licensing/permits/insurance; chefs for food-safety certification and
// local cottage-food/commissary law. Certification fields below are
// OPERATOR-ENTERED CLAIMS, displayed as such — verification is a real
// operations process, seamed, never faked as a checkmark FEL validated.

export interface KitchenShift {
  id: string;
  days: string;                    // e.g. "Mon/Wed/Fri"
  hours: string;                   // e.g. "6am-11am"
  monthlyUsdCents: number;
  taken: boolean;
}

export interface KitchenListing {
  id: string;
  ownerId: string;
  name: string;
  city: string;                    // city-level only — exact address exchanged after subscription
  blurb: string;
  amenities: string[];             // e.g. ['walk-in cooler', '6-burner range', 'packaging station']
  certClaims: string[];            // OPERATOR-ENTERED claims, labeled as such in UI
  photoDataUrl: string | null;
  shifts: KitchenShift[];
  createdAt: number;
}

export interface MealPlanListing {
  id: string;
  chefId: string;
  chefName: string;
  kitchenId: string;               // where it's produced — ties the two sides together
  title: string;
  blurb: string;
  weeklyMenu: string[];            // 5-7 line items
  mealsPerWeek: number;
  weeklyUsdCents: number;
  dietTags: string[];              // e.g. ['high-protein', 'vegetarian']
  subscribers: number;
  createdAt: number;
}

export interface KitchenSub { kitchenId: string; shiftId: string; chefId: string; at: number }
export interface MealSub { planId: string; eaterId: string; at: number }

const K = {
  kitchens: 'fel_kitchen_listings_v1',
  plans: 'fel_meal_plans_v1',
  kitchenSubs: 'fel_kitchen_subs_v1',
  mealSubs: 'fel_meal_subs_v1',
};

function read<T>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(key) ?? '[]') as T[]; }
  catch { return []; }
}
function write(key: string, v: unknown[]): void { localStorage.setItem(key, JSON.stringify(v.slice(0, 60))); }

export const KitchenMarket = {
  // ── kitchen partner side ────────────────────────────────────────────────
  listKitchen(l: Omit<KitchenListing, 'id' | 'createdAt'>): KitchenListing {
    const full: KitchenListing = { ...l, id: `kit_${Date.now()}_${Math.floor(Math.random() * 1e5)}`, createdAt: Date.now() };
    write(K.kitchens, [full, ...read<KitchenListing>(K.kitchens)]);
    // SYNC SEAM: POST /api/kitchens — plus the ops-verification queue for
    // certification claims before a "verified" badge may ever render.
    return full;
  },
  kitchens(): KitchenListing[] { return read<KitchenListing>(K.kitchens); },
  kitchen(id: string): KitchenListing | null { return this.kitchens().find((k) => k.id === id) ?? null; },

  /** Chef subscribes to a shift. `startCheckout` is the STRIPE SEAM —
   *  M60's createPassCheckout pattern with a per-shift Price:
   *  lookup_key `fel_kitchen_${kitchenId}_${shiftId}` (monthly). Local
   *  state marks the shift taken only after the callback reports success
   *  (in production, only the webhook writes this — same rule as the Pass). */
  async subscribeShift(
    kitchenId: string, shiftId: string, chefId: string,
    startCheckout: (priceLookupKey: string, description: string) => Promise<boolean>,
  ): Promise<boolean> {
    const kitchen = this.kitchen(kitchenId);
    const shift = kitchen?.shifts.find((s) => s.id === shiftId);
    if (!kitchen || !shift || shift.taken) return false;
    const ok = await startCheckout(
      `fel_kitchen_${kitchenId}_${shiftId}`,
      `${kitchen.name} — ${shift.days} ${shift.hours} ($${(shift.monthlyUsdCents / 100).toFixed(2)}/mo)`,
    );
    if (!ok) return false;
    const all = read<KitchenListing>(K.kitchens);
    const s = all.find((x) => x.id === kitchenId)?.shifts.find((x) => x.id === shiftId);
    if (s) s.taken = true;
    write(K.kitchens, all);
    write(K.kitchenSubs, [...read<KitchenSub>(K.kitchenSubs), { kitchenId, shiftId, chefId, at: Date.now() }]);
    return true;
  },
  myKitchenSubs(chefId: string): KitchenSub[] {
    return read<KitchenSub>(K.kitchenSubs).filter((s) => s.chefId === chefId);
  },

  // ── chef side ───────────────────────────────────────────────────────────
  /** Publishing a plan requires an active kitchen subscription — the
   *  marketplace's own integrity rule: every plan names where it's made. */
  publishPlan(p: Omit<MealPlanListing, 'id' | 'createdAt' | 'subscribers'>): MealPlanListing | null {
    const hasKitchen = this.myKitchenSubs(p.chefId).some((s) => s.kitchenId === p.kitchenId);
    if (!hasKitchen) return null;
    const full: MealPlanListing = { ...p, id: `meal_${Date.now()}_${Math.floor(Math.random() * 1e5)}`, createdAt: Date.now(), subscribers: 0 };
    write(K.plans, [full, ...read<MealPlanListing>(K.plans)]);
    // SYNC SEAM: POST /api/meal-plans
    return full;
  },
  plans(): MealPlanListing[] { return read<MealPlanListing>(K.plans); },

  // ── eater side ──────────────────────────────────────────────────────────
  /** Weekly meal-prep subscription. STRIPE SEAM: weekly Price with
   *  lookup_key `fel_meal_${planId}`. */
  async subscribeMeals(
    planId: string, eaterId: string,
    startCheckout: (priceLookupKey: string, description: string) => Promise<boolean>,
  ): Promise<boolean> {
    const plan = this.plans().find((p) => p.id === planId);
    if (!plan) return false;
    const ok = await startCheckout(
      `fel_meal_${planId}`,
      `${plan.title} by ${plan.chefName} — ${plan.mealsPerWeek} meals/wk ($${(plan.weeklyUsdCents / 100).toFixed(2)}/wk)`,
    );
    if (!ok) return false;
    const all = read<MealPlanListing>(K.plans);
    const rec = all.find((x) => x.id === planId);
    if (rec) rec.subscribers++;
    write(K.plans, all);
    write(K.mealSubs, [...read<MealSub>(K.mealSubs), { planId, eaterId, at: Date.now() }]);
    return true;
  },
  myMealSubs(eaterId: string): MealSub[] {
    return read<MealSub>(K.mealSubs).filter((s) => s.eaterId === eaterId);
  },
};

export const COMPLIANCE_NOTICE =
  'FEL is a marketplace facilitator. Kitchen partners are responsible for their own licensing, permits and insurance; chefs for food-safety certification and local commissary/cottage-food law. Certification fields are operator-entered claims until verified by FEL operations.';
