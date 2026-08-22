// KitchenHub — the ghost-kitchen marketplace UI (M62). Three floors:
// KITCHENS (partners list spaces + recurring shifts), COOK (chefs browse,
// subscribe to a shift, publish meal-prep plans — only from a kitchen they
// hold), EAT (weekly meal-prep subscriptions). Stripe checkout rides the
// injected seam; the compliance notice renders permanently.

import React, { useState } from 'react';
import { KitchenMarket, COMPLIANCE_NOTICE, type KitchenShift } from './KitchenMarket';

type Floor = 'eat' | 'cook' | 'kitchens';

export default function KitchenHub({
  profile = { id: 'me', name: 'You' },
  startCheckout,
}: {
  profile?: { id: string; name: string };
  /** STRIPE SEAM — M60 subscription pattern. Absent = simulated success + console note. */
  startCheckout?: (priceLookupKey: string, description: string) => Promise<boolean>;
}) {
  const [floor, setFloor] = useState<Floor>('eat');
  const [rev, setRev] = useState(0);
  const [note, setNote] = useState('');
  // kitchen form
  const [kName, setKName] = useState(''); const [kCity, setKCity] = useState('');
  const [kBlurb, setKBlurb] = useState(''); const [kAmenities, setKAmenities] = useState('');
  const [kCerts, setKCerts] = useState(''); const [kRate, setKRate] = useState(600);
  // plan form
  const [pTitle, setPTitle] = useState(''); const [pMenu, setPMenu] = useState('');
  const [pMeals, setPMeals] = useState(10); const [pPrice, setPPrice] = useState(89);
  const [pKitchen, setPKitchen] = useState('');
  void rev;

  const say = (m: string) => { setNote(m); setTimeout(() => setNote(''), 3000); };
  const checkout = async (key: string, desc: string): Promise<boolean> => {
    if (startCheckout) return startCheckout(key, desc);
    console.info(`[FEL-KITCHEN] STRIPE SEAM not wired — simulating checkout for "${desc}" (price lookup_key: ${key})`);
    return true;
  };

  const listKitchen = (): void => {
    if (!kName.trim() || !kCity.trim()) { say('Name and city first'); return; }
    const shifts: KitchenShift[] = [
      { id: 'sh_am', days: 'Mon/Wed/Fri', hours: '5am-11am', monthlyUsdCents: kRate * 100, taken: false },
      { id: 'sh_pm', days: 'Mon/Wed/Fri', hours: '8pm-2am', monthlyUsdCents: Math.round(kRate * 0.8) * 100, taken: false },
      { id: 'sh_we', days: 'Sat/Sun', hours: '6am-6pm', monthlyUsdCents: Math.round(kRate * 1.2) * 100, taken: false },
    ];
    KitchenMarket.listKitchen({
      ownerId: profile.id, name: kName.trim(), city: kCity.trim(), blurb: kBlurb.trim(),
      amenities: kAmenities.split(',').map((s) => s.trim()).filter(Boolean),
      certClaims: kCerts.split(',').map((s) => s.trim()).filter(Boolean),
      photoDataUrl: null, shifts,
    });
    setKName(''); setKCity(''); setKBlurb(''); setKAmenities(''); setKCerts('');
    setRev((r) => r + 1);
    say('Kitchen listed with 3 bookable shifts');
  };

  const takeShift = async (kitchenId: string, shiftId: string): Promise<void> => {
    const ok = await KitchenMarket.subscribeShift(kitchenId, shiftId, profile.id, checkout);
    setRev((r) => r + 1);
    say(ok ? 'Shift is yours — publish your meal plan from COOK' : 'Shift unavailable');
  };

  const publishPlan = (): void => {
    if (!pTitle.trim() || !pKitchen) { say('Title + pick your kitchen'); return; }
    const menu = pMenu.split('\n').map((s) => s.trim()).filter(Boolean);
    if (menu.length < 3) { say('Give the week at least 3 menu lines'); return; }
    const rec = KitchenMarket.publishPlan({
      chefId: profile.id, chefName: profile.name, kitchenId: pKitchen,
      title: pTitle.trim(), blurb: menu[0], weeklyMenu: menu,
      mealsPerWeek: Math.max(3, pMeals | 0), weeklyUsdCents: Math.max(15, pPrice | 0) * 100,
      dietTags: [],
    });
    if (!rec) { say('You need an active shift at that kitchen first (COOK → subscribe)'); return; }
    setPTitle(''); setPMenu('');
    setRev((r) => r + 1);
    say('Plan live on the EAT floor');
  };

  const S: Record<string, React.CSSProperties> = {
    root: { color: '#f4efe6', background: 'linear-gradient(160deg,#2e1c14 0%,#3a2a1a 55%,#1c2a20 100%)', padding: 16, borderRadius: 12 },
    h1: { fontSize: 20, fontWeight: 800, color: '#ffb347' },
    tabs: { display: 'flex', gap: 8, margin: '10px 0' },
    tab: { padding: '6px 14px', borderRadius: 20, border: '1px solid #8a6a3a', background: 'transparent', color: '#e8dcc2', cursor: 'pointer' },
    tabOn: { background: '#8a6a3a', color: '#fff' },
    row: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 },
    input: { padding: 8, borderRadius: 8, border: '1px solid #8a6a3a', background: '#241a10', color: '#f4efe6' },
    area: { width: '100%', minHeight: 90, padding: 10, borderRadius: 8, border: '1px solid #8a6a3a', background: '#241a10', color: '#f4efe6', fontFamily: 'inherit' },
    btn: { padding: '8px 14px', borderRadius: 8, border: 'none', background: '#ffb347', color: '#241505', fontWeight: 700, cursor: 'pointer' },
    btnAlt: { padding: '6px 12px', borderRadius: 8, border: '1px solid #ffb347', background: 'transparent', color: '#ffb347', cursor: 'pointer', fontSize: 13 },
    card: { padding: 12, borderRadius: 10, background: 'rgba(0,0,0,0.3)', marginTop: 8 },
    tagRow: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 },
    tag: { fontSize: 11, padding: '3px 8px', borderRadius: 10, background: '#3a2a14', color: '#e8cf9e' },
    compliance: { marginTop: 14, padding: '8px 12px', borderLeft: '3px solid #ffb347', fontSize: 11, opacity: 0.8, lineHeight: 1.5 },
    note: { marginTop: 10, padding: '8px 12px', borderRadius: 8, background: '#8a6a3a', color: '#fff', width: 'fit-content' },
  };

  return (
    <div style={S.root}>
      <div style={S.h1}>FEL KITCHENS</div>
      <div style={{ fontSize: 12, opacity: 0.75 }}>idle kitchens working · chefs cooking · meal prep on subscription</div>

      <div style={S.tabs}>
        {([['eat', 'EAT'], ['cook', 'COOK'], ['kitchens', 'LIST A KITCHEN']] as [Floor, string][]).map(([f, l]) => (
          <button key={f} style={{ ...S.tab, ...(floor === f ? S.tabOn : {}) }} onClick={() => setFloor(f)}>{l}</button>
        ))}
      </div>

      {floor === 'eat' && (
        <>
          {KitchenMarket.plans().length === 0 && <div style={{ opacity: 0.6, fontSize: 13 }}>no meal plans yet — chefs are firing up</div>}
          {KitchenMarket.plans().map((p) => {
            const kitchen = KitchenMarket.kitchen(p.kitchenId);
            const mine = KitchenMarket.myMealSubs(profile.id).some((s) => s.planId === p.id);
            return (
              <div key={p.id} style={S.card}>
                <div style={{ fontWeight: 700 }}>{p.title} <span style={{ opacity: 0.6, fontWeight: 400 }}>· {p.chefName}</span></div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>
                  {p.mealsPerWeek} meals/wk · ${(p.weeklyUsdCents / 100).toFixed(2)}/wk · made at {kitchen?.name ?? 'a partner kitchen'}{kitchen ? `, ${kitchen.city}` : ''} · {p.subscribers} subscribed
                </div>
                <div style={S.tagRow}>{p.weeklyMenu.slice(0, 5).map((m, i) => <span key={i} style={S.tag}>{m}</span>)}</div>
                <div style={S.row}>
                  {mine
                    ? <span style={{ color: '#7ee2a0', fontWeight: 700 }}>SUBSCRIBED ✓</span>
                    : <button style={S.btn} onClick={() => void KitchenMarket.subscribeMeals(p.id, profile.id, checkout).then((ok) => { setRev((r) => r + 1); say(ok ? 'Subscribed — eat well' : 'Checkout failed'); })}>SUBSCRIBE</button>}
                </div>
              </div>
            );
          })}
        </>
      )}

      {floor === 'cook' && (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 6 }}>1 — GET A KITCHEN</div>
          {KitchenMarket.kitchens().map((k) => (
            <div key={k.id} style={S.card}>
              <div style={{ fontWeight: 700 }}>{k.name} <span style={{ opacity: 0.6, fontWeight: 400 }}>· {k.city}</span></div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>{k.blurb}</div>
              <div style={S.tagRow}>
                {k.amenities.map((a) => <span key={a} style={S.tag}>{a}</span>)}
                {k.certClaims.map((c) => <span key={c} style={{ ...S.tag, background: '#2a3a24', color: '#bfe8a0' }}>claims: {c}</span>)}
              </div>
              <div style={S.row}>
                {k.shifts.map((s) => (
                  <button key={s.id} style={{ ...S.btnAlt, ...(s.taken ? { opacity: 0.4, cursor: 'default' } : {}) }}
                    disabled={s.taken}
                    onClick={() => void takeShift(k.id, s.id)}>
                    {s.days} {s.hours} — ${(s.monthlyUsdCents / 100).toFixed(0)}/mo{s.taken ? ' · TAKEN' : ''}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 16 }}>2 — PUBLISH YOUR MEAL PLAN</div>
          <div style={S.row}>
            <input style={S.input} placeholder="plan title…" value={pTitle} onChange={(e) => setPTitle(e.target.value)} />
            <select style={S.input} value={pKitchen} onChange={(e) => setPKitchen(e.target.value)}>
              <option value="">where's it made?</option>
              {KitchenMarket.myKitchenSubs(profile.id).map((s) => {
                const k = KitchenMarket.kitchen(s.kitchenId);
                return k ? <option key={s.kitchenId + s.shiftId} value={k.id}>{k.name}</option> : null;
              })}
            </select>
            <label style={{ fontSize: 12 }}>meals/wk
              <input style={{ ...S.input, width: 64, marginLeft: 6 }} type="number" min={3} value={pMeals} onChange={(e) => setPMeals(Number(e.target.value))} />
            </label>
            <label style={{ fontSize: 12 }}>$/wk
              <input style={{ ...S.input, width: 72, marginLeft: 6 }} type="number" min={15} value={pPrice} onChange={(e) => setPPrice(Number(e.target.value))} />
            </label>
          </div>
          <textarea style={S.area} placeholder={'the week\'s menu — one line per item…'} value={pMenu} onChange={(e) => setPMenu(e.target.value)} />
          <div style={S.row}><button style={S.btn} onClick={publishPlan}>GO LIVE</button></div>
        </>
      )}

      {floor === 'kitchens' && (
        <>
          <div style={S.row}>
            <input style={S.input} placeholder="kitchen name…" value={kName} onChange={(e) => setKName(e.target.value)} />
            <input style={S.input} placeholder="city…" value={kCity} onChange={(e) => setKCity(e.target.value)} />
            <label style={{ fontSize: 12 }}>base $/mo
              <input style={{ ...S.input, width: 80, marginLeft: 6 }} type="number" min={100} value={kRate} onChange={(e) => setKRate(Number(e.target.value))} />
            </label>
          </div>
          <div style={S.row}>
            <input style={{ ...S.input, minWidth: 260 }} placeholder="one-line pitch…" value={kBlurb} onChange={(e) => setKBlurb(e.target.value)} />
            <input style={{ ...S.input, minWidth: 220 }} placeholder="amenities, comma-separated…" value={kAmenities} onChange={(e) => setKAmenities(e.target.value)} />
            <input style={{ ...S.input, minWidth: 220 }} placeholder="certifications you hold, comma-separated…" value={kCerts} onChange={(e) => setKCerts(e.target.value)} />
          </div>
          <div style={S.row}>
            <button style={S.btn} onClick={listKitchen}>LIST IT (3 standard shifts auto-created)</button>
          </div>
          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 8 }}>
            AM prep · late-night · weekend shifts are generated from your base rate; a real listing flow would let you edit each — kept simple for v1.
          </div>
        </>
      )}

      <div style={S.compliance}>{COMPLIANCE_NOTICE}</div>
      {note && <div style={S.note}>{note}</div>}
    </div>
  );
}
