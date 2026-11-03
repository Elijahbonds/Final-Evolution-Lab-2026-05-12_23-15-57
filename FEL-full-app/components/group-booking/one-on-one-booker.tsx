'use client';
// OneOnOneBooker — GROUP-BOOKING (owner, 2026-11-02): "book me or my trainers sessions online ... and in person". Who
// (Elijah, or a trainer once the owner switches trainers on) → online or in person → the gym (in person) → a time →
// confirm: ≤ 4 taps to a booked time (with one coach, "who" is already picked).
//   · In person: the owner's price (config, "$100 · pay at the gym"), the trainer's own hours at one of the gyms, booked
//     here (POST /api/group-booking/one-on-one) and paid at the gym.
//   · Online: the coach store's EXISTING live 1:1 — its slots (/api/coach-store/<slug>/slots) and, on confirm, its own book
//     page with the time preselected (/coach/<slug>/book/<listing>?slot=…), which runs its checkout, video room, cancel and
//     reschedule. No listing (or the store off) → "Opens soon"; a price is never invented.
import { useEffect, useState } from 'react';
import { SHOP_LOOK as L } from '@/components/shop/look';
import { PrimaryCta } from '@/components/ui/fel/primary-cta';
import { OpensSoon } from '@/components/shop/opens-soon';
import { ProductCard } from '@/components/shop/product-card';
import { AddToCalendar } from '@/components/coach-store/add-to-calendar';
import type { ShopItem } from '@/lib/shop/model';
import { GROUP_COPY as T } from '@/lib/group-booking/copy';
import { ONE_ON_ONE_API, reserveThenPay } from '@/lib/group-booking/client';
import { loginPath } from '@/lib/auth/safeNext';

interface Choice { mode: 'online' | 'in_person'; available: boolean; priceCents: number | null; minutes: number; needsGym: boolean; priceLabel: string | null }
interface Trainer { id: string; name: string; gyms: { id: string; name: string; address: string | null }[]; choices: Choice[]; online: { slug: string; listingId: string; durationMin: number } | null }
export interface OneOnOneView { available: boolean; trainers?: Trainer[]; cancelLine?: string }
interface Slot { startsAt: string; label: string }

const BACK = '/groups/one-on-one';
const timeLabel = (iso: string) => new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' });

function Step({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="mt-5"><p className={L.sectionTitle}>{label}</p><div className={L.chips}>{children}</div></div>;
}

export function OneOnOneBooker({ view }: { view: OneOnOneView }) {
  const trainers = view.trainers ?? [];
  const [who, setWho] = useState<string | null>(trainers.length === 1 ? trainers[0].id : null);
  const [mode, setMode] = useState<'online' | 'in_person' | null>(null);
  const [gym, setGym] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [ics, setIcs] = useState<string | null>(null);
  const t = trainers.find((x) => x.id === who) ?? null;
  const choice = t?.choices.find((c) => c.mode === mode) ?? null;

  useEffect(() => {
    setSlots(null); setSlot(null);
    if (!t || !mode) return;
    const url = mode === 'online'
      ? (t.online ? `/api/coach-store/${encodeURIComponent(t.online.slug)}/slots?duration=${t.online.durationMin === 60 ? 60 : 30}` : null)
      : `${ONE_ON_ONE_API}?trainer=${encodeURIComponent(t.id)}`;
    if (!url) return;
    let live = true;
    fetch(url).then(async (r) => {
      if (r.status === 401) { window.location.href = loginPath(BACK); return; }
      const j = (await r.json().catch(() => ({}))) as { slots?: Slot[] };
      if (live) setSlots((j.slots ?? []).slice(0, 24));
    }).catch(() => { if (live) setSlots([]); });
    return () => { live = false; };
  }, [t?.id, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!view.available || !trainers.length) return <OpensSoon />;
  const ready = !!t && !!choice && choice.available && (!choice.needsGym || !!gym) && !!slot;
  const item: ShopItem | null = t && choice ? {
    id: `${t.id}-${mode}`, kind: 'session', title: `1:1 with ${t.name} · ${mode === 'online' ? 'online' : 'in person'}`,
    oneLine: slot ? `${timeLabel(slot)}${gym ? ` · ${t.gyms.find((g) => g.id === gym)?.name ?? ''}` : ''}` : null,
    priceLabel: choice.priceLabel, cadence: 'once', state: 'buy',
  } : null;

  return (
    <section data-one-on-one>
      {trainers.length > 1 ? (
        <Step label="Who">
          {trainers.map((x) => <button key={x.id} type="button" className={`${L.chip} ${who === x.id ? L.chipOn : ''}`} onClick={() => { setWho(x.id); setMode(null); setGym(null); }}>{x.name}</button>)}
        </Step>
      ) : <p className={`${L.cardTitle} mt-4`}>{t?.name}</p>}
      {t ? (
        <Step label="Type">
          {t.choices.map((c) => (
            <button key={c.mode} type="button" disabled={!c.available} data-mode={c.mode} aria-pressed={mode === c.mode}
              className={`${L.chip} ${mode === c.mode ? L.chipOn : ''} disabled:opacity-50`} onClick={() => { setMode(c.mode); setGym(null); }}>
              {c.mode === 'online' ? 'Online' : 'In person'} · {c.available ? c.priceLabel ?? 'Price set by your coach' : T.opensSoon}
            </button>
          ))}
        </Step>
      ) : null}
      {t && choice?.needsGym ? (
        <Step label="Gym">
          {t.gyms.map((g) => <button key={g.id} type="button" data-gym={g.id} aria-pressed={gym === g.id} className={`${L.chip} ${gym === g.id ? L.chipOn : ''}`} onClick={() => setGym(g.id)}>{g.name}</button>)}
        </Step>
      ) : null}
      {t && choice && (!choice.needsGym || gym) ? (
        <div className="mt-5">
          <p className={L.sectionTitle}>Time (Los Angeles)</p>
          {slots === null ? <p className={L.lede}>Loading…</p> : !slots.length ? <p className={L.lede}>No open times in the next few weeks.</p> : (
            <div className="grid grid-cols-2 gap-2">
              {slots.map((s) => (
                <button key={s.startsAt} type="button" data-slot={s.startsAt} aria-pressed={slot === s.startsAt}
                  className={`${L.chip} justify-center ${slot === s.startsAt ? L.chipOn : ''}`} onClick={() => setSlot(s.startsAt)}>{timeLabel(s.startsAt)}</button>
              ))}
            </div>
          )}
        </div>
      ) : null}
      {ready && item ? (
        mode === 'online' && t.online ? (
          <a className={`${L.buy} w-full`} data-action="confirm-online" href={`/coach/${encodeURIComponent(t.online.slug)}/book/${encodeURIComponent(t.online.listingId)}?slot=${encodeURIComponent(slot!)}`}>Confirm and pay</a>
        ) : (
          <div className="mt-5">
            <ProductCard item={item}>
            <ConfirmInPerson cancelLine={view.cancelLine ?? ''} ics={ics} pay={() => reserveThenPay(fetch, {
              url: ONE_ON_ONE_API, back: BACK, body: { trainerId: t.id, gymId: gym, startsAt: slot },
              termsVersion: null, onReserved: (r) => setIcs(r.ics),
            })} />
            </ProductCard>
          </div>
        )
      ) : null}
      {!ready && view.cancelLine ? <p className={`${L.lede} mt-4`}>{view.cancelLine}</p> : null}
    </section>
  );
}

/** The confirm step, one tap: reserve (pay at the gym), then say so, with the calendar file. */
function ConfirmInPerson({ cancelLine, ics, pay }: { cancelLine: string; ics: string | null; pay: () => ReturnType<typeof reserveThenPay> }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; line: string } | null>(null);
  const go = async () => {
    if (busy) return;
    setBusy(true); setNote(null);
    const out = await pay();
    setBusy(false);
    if (out.kind === 'redirect') { window.location.href = out.url; return; }
    if (out.kind === 'sign_in') { window.location.href = out.href; return; }
    setNote({ ok: out.kind === 'done', line: out.line });
  };
  if (note?.ok) return <div data-booked><p role="status" className={L.done}>{note.line}</p>{ics ? <AddToCalendar ics={ics} className={L.buy} /> : null}</div>;
  return (
    <>
      <p className={`${L.cardLine} mt-4`}>{cancelLine}</p>
      <div className={L.cta}><PrimaryCta onClick={() => { void go(); }}>{busy ? T.reserving : T.reserve}</PrimaryCta></div>
      {note ? <p role="alert" className={L.alert}>{note.line}</p> : null}
    </>
  );
}
