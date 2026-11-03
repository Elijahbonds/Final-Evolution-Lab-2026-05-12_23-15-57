'use client';
// GroupsBrowser — GROUP-BOOKING (owner, 2026-11-02): "People need to be able to join my groups". Open groups by gym, days
// and time, with seats left; join in ≤ 3 taps: a gym chip → the group's Join → "Reserve, pay at the gym" (the 4-week
// package is picked by default; drop-in and the full 8 weeks are one tap in the sheet). The card and the sheet are the shop
// front's (components/shop: ProductCard, BuyEntry/BuySheet) in their reserve mode: no store terms, no checkout while
// online payment is off (lib/group-booking/client.ts). A full group shows "Full · join the waitlist".
import { useMemo, useState } from 'react';
import { ProductCard } from '@/components/shop/product-card';
import { BuyEntry } from '@/components/shop/buy-sheet';
import { SHOP_LOOK as L } from '@/components/shop/look';
import { AddToCalendar } from '@/components/coach-store/add-to-calendar';
import type { ShopItem } from '@/lib/shop/model';
import { BUYER_TERMS } from '@/lib/payments/terms';
import { GROUP_COPY as T, errorLine, lateJoinLine } from '@/lib/group-booking/copy';
import { RESERVE_API, WAITLIST_API, postJson, reserveThenPay } from '@/lib/group-booking/client';
import { loginPath } from '@/lib/auth/safeNext';

export interface GroupOption { kind: 'drop_in' | 'package' | 'full'; title: string; priceCents: number; priceLabel: string; payMode: 'at_gym' | 'online'; sessions: number; firstLabel: string; firstDate: string }
export interface GroupCardView {
  id: string; name: string; gymId: string; gymName: string; gymAddress: string | null; dayPair: string; days: string; hour: number; time: string;
  startLabel: string; endLabel: string; weeks: number; seatsLeft: number; full: boolean; maxSeats: number; minSeats: number; trainerName: string;
  options: GroupOption[]; lateJoin: boolean;
}
export interface GroupsBoardView {
  available: boolean; groups?: GroupCardView[]; gyms?: { id: string; name: string; address: string | null }[]; format?: string; cancelLine?: string;
  times?: { hour: number; label: string }[]; sizes?: { min: number; max: number; weeks: number };
}

const DAY_CHIPS = [{ id: 'mon_wed', label: 'Mon & Wed' }, { id: 'tue_thu', label: 'Tue & Thu' }];

function Chips<T extends string | number>({ label, value, set, items }: { label: string; value: T | null; set: (v: T | null) => void; items: { id: T; label: string }[] }) {
  return (
    <div className="mt-3" role="group" aria-label={label}>
      <div className={L.chips}>
        <button type="button" className={`${L.chip} ${value === null ? L.chipOn : ''}`} aria-pressed={value === null} onClick={() => set(null)}>{T.any}</button>
        {items.map((i) => (
          <button key={String(i.id)} type="button" className={`${L.chip} ${value === i.id ? L.chipOn : ''}`} aria-pressed={value === i.id} onClick={() => set(i.id)} data-chip={String(i.id)}>{i.label}</button>
        ))}
      </div>
    </div>
  );
}

function OptionPicker({ options, value, set }: { options: GroupOption[]; value: string; set: (k: GroupOption['kind']) => void }) {
  return (
    <div className="mt-4 flex flex-col gap-2" role="radiogroup" aria-label="Pick one">
      {options.map((o) => (
        <button key={o.kind} type="button" role="radio" aria-checked={value === o.kind} data-option={o.kind} onClick={() => set(o.kind)}
          className={`fel-press flex min-h-12 items-center justify-between gap-3 rounded-2xl px-4 text-left text-sm ${value === o.kind ? 'bg-white/[0.14] text-white' : 'bg-white/[0.05] text-fel-soft'}`}>
          <span><span className="font-semibold">{o.title}</span><span className="block text-xs text-fel-soft">from {o.firstLabel}</span></span>
          <span className="shrink-0 font-semibold text-fel-cyan">{o.priceLabel}</span>
        </button>
      ))}
    </div>
  );
}

export function GroupJoin({ g, format, cancelLine }: { g: GroupCardView; format: string; cancelLine: string }) {
  const def = g.options.find((o) => o.kind === 'package') ?? g.options[0];
  const [pick, setPick] = useState<GroupOption['kind']>(def?.kind ?? 'drop_in');
  const [ics, setIcs] = useState<string | null>(null);
  const [wait, setWait] = useState<string | null>(null);
  const opt = g.options.find((o) => o.kind === pick) ?? def;
  const back = `/groups/${g.id}`;
  const item: ShopItem = {
    id: g.id, kind: 'group_class', title: g.name, oneLine: `${g.gymName} · ${g.days} · ${g.time}`,
    priceLabel: opt ? opt.priceLabel : null, cadence: 'once', state: 'buy',
  };
  const joinWaitlist = async () => {
    const r = await postJson(fetch, WAITLIST_API, { groupId: g.id });
    if (r?.status === 401) { window.location.href = loginPath(back); return; }
    setWait(r?.status === 201 ? T.waitlisted : (typeof r?.json.message === 'string' ? r.json.message : errorLine(r?.json.error)));
  };
  if (!opt) return null;
  return (
    <ProductCard item={item} side={g.full ? 'Full' : T.seatsLeft(g.seatsLeft)}>
      {g.lateJoin ? <p className={`${L.cardLine} mt-2`} data-late-join>{lateJoinLine(g.options.find((o) => o.kind === 'drop_in')?.priceCents ?? opt.priceCents)}</p> : null}
      {g.full ? (
        wait ? <p className={L.soon} role="status">{wait}</p>
          : <button type="button" className={L.buy} onClick={() => { void joinWaitlist(); }} data-action="waitlist">{T.full}</button>
      ) : (
        <BuyEntry
          item={item} label={T.join} action="join"
          includes={[format, `${g.days} · ${g.time} · ${g.startLabel} – ${g.endLabel}`, g.gymAddress ? `${g.gymName}, ${g.gymAddress}` : g.gymName, cancelLine]}
          terms={opt.payMode === 'online' ? { href: BUYER_TERMS.coach_package.href } : null}
          payLabel={opt.payMode === 'online' ? undefined : T.reserve} busyLabel={opt.payMode === 'online' ? undefined : T.reserving}
          extra={<OptionPicker options={g.options} value={pick} set={setPick} />}
          after={ics ? <AddToCalendar ics={ics} className={L.buy} /> : null}
          pay={() => reserveThenPay(fetch, {
            url: RESERVE_API, back, body: { groupId: g.id, option: opt.kind, date: opt.kind === 'drop_in' ? opt.firstDate : undefined },
            termsVersion: opt.payMode === 'online' ? BUYER_TERMS.coach_package.version : null, onReserved: (r) => setIcs(r.ics),
          })}
        />
      )}
    </ProductCard>
  );
}

export function GroupsBrowser({ board }: { board: GroupsBoardView }) {
  const [gym, setGym] = useState<string | null>(null);
  const [days, setDays] = useState<string | null>(null);
  const [hour, setHour] = useState<number | null>(null);
  const groups = useMemo(() => (board.groups ?? []).filter((g) => (!gym || g.gymId === gym) && (!days || g.dayPair === days) && (hour === null || g.hour === hour)), [board.groups, gym, days, hour]);
  return (
    <section data-groups-browser>
      <Chips label="Gym" value={gym} set={setGym} items={(board.gyms ?? []).map((g) => ({ id: g.id, label: g.name }))} />
      <Chips label="Days" value={days} set={setDays} items={DAY_CHIPS} />
      <Chips label="Time" value={hour} set={setHour} items={(board.times ?? []).map((t) => ({ id: t.hour, label: t.label }))} />
      <p className={`${L.lede} mt-4`}>{board.format}</p>
      <div className={`${L.grid} mt-4`}>
        {groups.map((g) => <GroupJoin key={g.id} g={g} format={board.format ?? ''} cancelLine={board.cancelLine ?? ''} />)}
      </div>
      {!groups.length ? <p className={`${L.lede} mt-4`} role="status">No open groups here yet. Try another gym or time.</p> : null}
    </section>
  );
}
