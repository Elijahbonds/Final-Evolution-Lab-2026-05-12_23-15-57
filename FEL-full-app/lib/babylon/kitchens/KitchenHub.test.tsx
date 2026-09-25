import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// The note after SUBSCRIBE or a shift booking is set after an await, when the server render has already finished, so
// it never reaches the markup. Recording the useState setters lets these tests read the note the hub actually set.
vi.mock('react', async (importOriginal) => (await import('@/tests/helpers/stateLog')).recordingReact(await importOriginal()));

import KitchenHub from './KitchenHub';
import {
  KitchenMarket, CHECKOUT_NOT_LIVE_NOTE, SAVED_NOT_BOOKED, checkoutNote, checkoutNotLive, heldKitchenLabel, hubCheckout,
  listedNote, mealSubLabel, planPublishedNote, takenShiftLabel,
} from './KitchenMarket';
import { button, buttons, drive, field, findAll, settle, typeInto } from '@/tests/helpers/driveRender';
import { loggedStrings, stateLog } from '@/tests/helpers/stateLog';

// A fake success, in any of the words the hub has used for one.
const FAKE_SUCCESS = /Subscribed|eat well|Shift is yours|Plan live/;

// The Kitchen hub is mounted with no Stripe seam (app/kitchens/_components/loader.tsx: <KitchenHub />), and it used to
// "simulate" a successful checkout: SUBSCRIBE said "Subscribed — eat well" and a shift said "Shift is yours" with nothing
// charged and nothing booked. Owner decision 2026-09-24: say checkout is not live instead. These tests press the real
// hub's buttons with no seam passed, so they fail if a simulated success comes back anywhere on that default path.
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => { m.delete(k); },
    setItem: (k, v) => { m.set(k, String(v)); },
  };
}

const PLAN = {
  id: 'meal_1', chefId: 'chef', chefName: 'Chef', kitchenId: 'kit_1', title: 'Plan', blurb: '', weeklyMenu: ['a', 'b', 'c'],
  mealsPerWeek: 5, weeklyUsdCents: 8900, dietTags: [], subscribers: 0, createdAt: 0,
};
const KITCHEN = {
  id: 'kit_1', ownerId: 'owner', name: 'Test Kitchen', city: 'Venice', blurb: '', amenities: [], certClaims: [],
  photoDataUrl: null, createdAt: 0, shifts: [{ id: 'sh_am', days: 'Mon', hours: '5am-11am', monthlyUsdCents: 60000, taken: false }],
};

describe('Kitchens with no checkout seam (the hub as /kitchens mounts it)', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); stateLog.length = 0; });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('SUBSCRIBE on the real hub subscribes nobody and counts nobody', async () => {
    localStorage.setItem('fel_meal_plans_v1', JSON.stringify([PLAN]));
    const { tree } = drive(() => KitchenHub({}));
    button(tree, /^SUBSCRIBE$/).props.onClick();
    await settle();
    expect(KitchenMarket.myMealSubs('me')).toEqual([]);
    expect(KitchenMarket.plans()[0].subscribers).toBe(0);
    expect(localStorage.getItem('fel_meal_subs_v1')).toBeNull();
    // and what it says after the await is that checkout is not live, never a subscription
    expect(loggedStrings()).toContain(CHECKOUT_NOT_LIVE_NOTE);
    expect(loggedStrings().filter((s) => FAKE_SUCCESS.test(s))).toEqual([]);
  });

  it('booking a shift on the real hub (COOK floor) books nothing and leaves the shift open', async () => {
    localStorage.setItem('fel_kitchen_listings_v1', JSON.stringify([KITCHEN]));
    const { tree } = drive(() => KitchenHub({}), [(t) => button(t, /^COOK$/).props.onClick()]);
    const shift = button(tree, /5am-11am/);
    expect(shift.props.disabled).toBe(false);
    shift.props.onClick();
    await settle();
    expect(KitchenMarket.kitchen('kit_1')?.shifts[0].taken).toBe(false);
    expect(KitchenMarket.myKitchenSubs('me')).toEqual([]);
    expect(loggedStrings()).toContain(CHECKOUT_NOT_LIVE_NOTE);
    expect(loggedStrings().filter((s) => FAKE_SUCCESS.test(s))).toEqual([]);
  });

  it('LIST IT does not call the shifts bookable while checkout is not live', () => {
    const { html } = drive(() => KitchenHub({}), [
      (t) => button(t, /^LIST A KITCHEN$/).props.onClick(),
      (t) => typeInto(field(t, /kitchen name/), 'Night Kitchen'),
      (t) => typeInto(field(t, /city/), 'Venice'),
      (t) => button(t, /^LIST IT/).props.onClick(),
    ]);
    expect(html).toContain('Kitchen listed on this device only. Its 3 shifts can be booked once checkout is live.');
    expect(html).not.toMatch(/bookable shifts/);
    expect(html).toMatch(/NOT LIVE YET/);
    expect(KitchenMarket.kitchens().map((k) => k.name)).toEqual(['Night Kitchen']);
  });

  it('with a seam wired the same buttons do book, the banner goes, and LIST IT may say bookable', async () => {
    localStorage.setItem('fel_meal_plans_v1', JSON.stringify([PLAN]));
    const seam = vi.fn(async () => true);
    const { tree, html } = drive(() => KitchenHub({ startCheckout: seam }));
    expect(html).not.toMatch(/NOT LIVE YET/);
    button(tree, /^SUBSCRIBE$/).props.onClick();
    await settle();
    expect(seam).toHaveBeenCalledWith('fel_meal_meal_1', expect.stringContaining('Plan by Chef'));
    expect(KitchenMarket.plans()[0].subscribers).toBe(1);
    expect(loggedStrings()).toContain('Subscribed — eat well'); // the log does see a success when there is one
    expect(loggedStrings()).not.toContain(CHECKOUT_NOT_LIVE_NOTE);
    const listed = drive(() => KitchenHub({ startCheckout: seam }), [
      (t) => button(t, /^LIST A KITCHEN$/).props.onClick(),
      (t) => typeInto(field(t, /kitchen name/), 'Day Kitchen'),
      (t) => typeInto(field(t, /city/), 'Venice'),
      (t) => button(t, /^LIST IT/).props.onClick(),
    ]);
    expect(listed.html).toContain('Kitchen listed with 3 bookable shifts');
  });

  it('shows the NOT LIVE YET banner on the page as mounted', () => {
    expect(renderToStaticMarkup(createElement(KitchenHub))).toMatch(/NOT LIVE YET/);
    expect(buttons(drive(() => KitchenHub({})).tree, /SUBSCRIBE/)).toHaveLength(0); // no plans seeded: nothing to press
  });
});

// Before the fix a SUBSCRIBE or a shift with no seam "succeeded" and was saved on the device. Those records are still
// in players' localStorage, so while checkout is not live the hub has to label them saved, not booked.
describe('records the old simulated checkout left on a device', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
    stateLog.length = 0;
    localStorage.setItem('fel_meal_plans_v1', JSON.stringify([{ ...PLAN, subscribers: 1 }]));
    localStorage.setItem('fel_meal_subs_v1', JSON.stringify([{ planId: 'meal_1', eaterId: 'me', at: 1 }]));
    localStorage.setItem('fel_kitchen_listings_v1', JSON.stringify([{ ...KITCHEN, shifts: [{ ...KITCHEN.shifts[0], taken: true }] }]));
    localStorage.setItem('fel_kitchen_subs_v1', JSON.stringify([{ kitchenId: 'kit_1', shiftId: 'sh_am', chefId: 'me', at: 1 }]));
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('EAT: the saved subscription reads SAVED ON THIS DEVICE · NOT BOOKED, and no subscriber count is claimed', () => {
    const { html } = drive(() => KitchenHub({}));
    expect(html).toContain(SAVED_NOT_BOOKED);
    expect(html).not.toContain('SUBSCRIBED ✓');
    expect(html).not.toMatch(/\d+ subscribed/);
  });

  it('COOK: the saved shift reads held on this device, not TAKEN, and so does the kitchen it lets you publish from', () => {
    const { html, tree } = drive(() => KitchenHub({}), [(t) => button(t, /^COOK$/).props.onClick()]);
    expect(html).toContain('HELD ON THIS DEVICE (not booked)');
    expect(html).not.toMatch(/· TAKEN/);
    const options = findAll(tree, (el) => el.type === 'option').map((el) => el.props.children);
    expect(options).toContain('Test Kitchen (held on this device, not booked)');
  });

  it('GO LIVE from that kitchen says the plan is saved on this device only, not live', () => {
    const { html } = drive(() => KitchenHub({}), [
      (t) => button(t, /^COOK$/).props.onClick(),
      (t) => typeInto(field(t, /plan title/), 'Week One'),
      (t) => findAll(t, (el) => el.type === 'select')[0].props.onChange({ target: { value: 'kit_1' } }),
      (t) => typeInto(field(t, /the week/), 'oats\nrice\nbeans'),
      (t) => button(t, /^GO LIVE$/).props.onClick(),
    ]);
    expect(html).toContain('Plan saved on this device only. Nobody can subscribe to it until checkout is live.');
    expect(loggedStrings().filter((s) => FAKE_SUCCESS.test(s))).toEqual([]);
  });

  it('with a seam wired the same records read as the real thing', () => {
    const seam = async () => true;
    expect(drive(() => KitchenHub({ startCheckout: seam })).html).toContain('SUBSCRIBED ✓');
    expect(drive(() => KitchenHub({ startCheckout: seam })).html).toContain('1 subscribed');
    const cook = drive(() => KitchenHub({ startCheckout: seam }), [(t) => button(t, /^COOK$/).props.onClick()]);
    expect(cook.html).toContain('· TAKEN');
    expect(cook.html).not.toMatch(/on this device/);
  });
});

describe('the hub checkout helpers', () => {
  it('with no seam the checkout is not live and answers no, whatever it is asked', async () => {
    const { live, checkout } = hubCheckout();
    expect(live).toBe(false);
    expect(checkout).toBe(checkoutNotLive);
    expect(await checkout('fel_meal_x', 'anything')).toBe(false);
  });

  it('with a seam the checkout is the seam', () => {
    const seam = async () => true;
    expect(hubCheckout(seam)).toEqual({ live: true, checkout: seam });
  });

  it('says what happened: not live, unavailable, or done', () => {
    expect(checkoutNote('shift', false, false)).toBe(CHECKOUT_NOT_LIVE_NOTE);
    expect(checkoutNote('meals', false, false)).toBe(CHECKOUT_NOT_LIVE_NOTE);
    expect(checkoutNote('shift', false, true)).toBe('Shift unavailable');
    expect(checkoutNote('meals', false, true)).toBe('Checkout failed');
    expect(checkoutNote('shift', true, true)).toMatch(/Shift is yours/);
    expect(checkoutNote('meals', true, true)).toMatch(/Subscribed/);
    expect(listedNote(false)).not.toMatch(/bookable/);
    expect(listedNote(true)).toMatch(/bookable/);
  });

  it('labels a stored record as saved, not booked, until checkout is live', () => {
    expect(mealSubLabel(false)).toBe(SAVED_NOT_BOOKED);
    expect(mealSubLabel(true)).toBe('SUBSCRIBED ✓');
    expect(takenShiftLabel(false)).not.toMatch(/TAKEN/);
    expect(takenShiftLabel(true)).toBe(' · TAKEN');
    expect(heldKitchenLabel(false)).toMatch(/not booked/);
    expect(heldKitchenLabel(true)).toBe('');
    expect(planPublishedNote(false)).not.toMatch(FAKE_SUCCESS);
    expect(planPublishedNote(true)).toBe('Plan live on the EAT floor');
  });
});
