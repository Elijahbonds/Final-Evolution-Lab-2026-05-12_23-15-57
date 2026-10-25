'use client';
// COACH-BUSINESS: /coach/business — the coach runs their business here: Free or Pro, payments (Stripe Connect), the
// public profile and marketplace opt-in, packages, sales and refunds, applications, and client-approved results.
// Every number and switch shown comes from GET /api/coach/business; nothing is decided in the browser.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { Dashboard } from '@/lib/coach-business/dashboard';
import { PACKAGE_KINDS, PACKAGE_KIND_LABELS, packagePriceLabel, type PackageKind } from '@/lib/coach-business/packages';
import { MARKET_GOALS, SPORTS } from '@/lib/coach-business/market';
import { PRO_FEATURES, PRO_FEATURE_LABELS } from '@/lib/coach-business/plan';
import { PAYMENTS_NOT_LIVE } from '@/lib/coach-business/config';

export const DASHBOARD_API = '/api/coach/business';

const card = 'rounded-2xl border border-white/10 bg-white/[0.03] p-4';
const h2 = 'text-lg font-bold';
const input = 'min-h-11 w-full rounded-lg border border-white/15 bg-black px-3 text-sm text-white';
const btn = 'min-h-11 rounded-xl bg-cyan-300 px-4 text-sm font-bold text-black disabled:opacity-60';
const ghost = 'min-h-11 rounded-xl border border-white/20 px-3 text-sm font-bold text-white/80 disabled:opacity-60';
const money = (c: number) => `$${(c / 100).toFixed(2)}`;

async function call(url: string, method: string, body?: unknown): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  const r = await fetch(url, { method, headers: body === undefined ? undefined : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  let json: Record<string, unknown> = {};
  try { json = await r.json(); } catch { /* empty */ }
  return { ok: r.ok, status: r.status, json };
}

function said(j: Record<string, unknown>, fallback: string): string {
  return typeof j.message === 'string' ? j.message : typeof j.error === 'string' ? `${fallback} (${j.error})` : fallback;
}

export function BusinessDashboard({ api = DASHBOARD_API }: { api?: string }) {
  const [d, setD] = useState<Dashboard | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [note, setNote] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await fetch(api, { cache: 'no-store' });
      if (!r.ok) { setState('error'); return; }
      setD(await r.json());
      setState('ready');
    } catch { setState('error'); }
  }, [api]);
  useEffect(() => {
    void (async () => {
      // back from Stripe onboarding: read the account's status once, then the dashboard
      if (typeof window !== 'undefined' && /[?&]connect=return/.test(window.location.search)) await call(`${api}/connect`, 'GET').catch(() => null);
      await load();
    })();
  }, [api, load]);

  if (state === 'loading') return <main className="mx-auto max-w-3xl px-4 py-8 text-white/60">Loading your business…</main>;
  if (state === 'error' || !d) return <main className="mx-auto max-w-3xl px-4 py-8 text-white/60">Your business did not load. Reload to try again.</main>;

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-6 text-white" data-business-dashboard>
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-black">Your coaching business</h1>
        <span className={`rounded-full px-3 py-1 text-xs font-black ${d.plan.plan === 'pro' ? 'bg-cyan-300 text-black' : 'border border-white/20 text-white/80'}`} data-plan={d.plan.plan}>
          {d.plan.plan === 'pro' ? 'Coach Pro' : 'Coach Free'}
        </span>
      </header>
      {note ? <p role="status" className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-sm">{note}</p> : null}
      {!d.ready ? <p className={card}>Packages, payments and the marketplace are not set up yet. Your profile still saves.</p> : null}
      <PlanCard d={d} api={api} onNote={setNote} />
      <PaymentsCard d={d} api={api} onNote={setNote} />
      <ProfileCard d={d} api={api} onSaved={load} onNote={setNote} />
      {d.ready ? <PackagesCard d={d} api={api} onSaved={load} onNote={setNote} /> : null}
      {d.ready && d.sales.length ? <SalesCard d={d} api={api} onSaved={load} onNote={setNote} /> : null}
      {d.ready ? <ApplicationsCard d={d} api={api} onSaved={load} /> : null}
      {d.ready ? <HighlightsCard d={d} api={api} onSaved={load} onNote={setNote} /> : null}
    </main>
  );
}

type CardProps = { d: Dashboard; api: string; onNote: (s: string) => void; onSaved?: () => Promise<void> | void };

function PlanCard({ d, api, onNote }: CardProps) {
  const [busy, setBusy] = useState(false);
  const upgrade = async () => {
    setBusy(true);
    const r = await call(`${api}/pro`, 'POST');
    setBusy(false);
    if (r.ok && typeof r.json.url === 'string') { window.location.href = r.json.url; return; }
    onNote(said(r.json, 'Coach Pro could not open.'));
  };
  const clients = d.plan.activeClients;
  return (
    <section id="pro" className={card} aria-labelledby="plan-h">
      <h2 id="plan-h" className={h2}>{d.plan.plan === 'pro' ? 'Coach Pro' : 'Coach Free'}</h2>
      {d.plan.gatesOn && d.plan.plan === 'free' && clients !== null ? (
        <p className="mt-1 text-sm text-white/70" data-client-allowance>{clients} of {d.plan.clientLimit} clients on Free</p>
      ) : null}
      <ul className="mt-3 space-y-1 text-sm text-white/80">
        {PRO_FEATURES.map((f) => (
          <li key={f} className="flex gap-2"><span aria-hidden="true" className={d.plan.plan === 'pro' || !d.plan.gatesOn ? 'text-cyan-300' : 'text-white/30'}>✓</span><span>{PRO_FEATURE_LABELS[f]}</span></li>
        ))}
      </ul>
      {d.plan.plan === 'pro' ? null : !d.plan.gatesOn ? (
        <p className="mt-3 text-sm text-white/60" data-pro-off>Coach Pro is not on sale yet. Nothing is limited until it is.</p>
      ) : d.proPriceCents === null ? (
        <p className="mt-3 text-sm text-white/60">Coach Pro is not on sale yet.</p>
      ) : (
        <button type="button" className={`${btn} mt-3`} disabled={busy} onClick={upgrade}>Upgrade to Pro · {money(d.proPriceCents)} / month</button>
      )}
    </section>
  );
}

function PaymentsCard({ d, api, onNote }: CardProps) {
  const [busy, setBusy] = useState(false);
  const go = async (path: string) => {
    setBusy(true);
    const r = await call(`${api}${path}`, 'POST');
    setBusy(false);
    if (r.ok && typeof r.json.url === 'string') { window.location.href = r.json.url; return; }
    onNote(said(r.json, 'Payments could not open.'));
  };
  const c = d.connect;
  return (
    <section className={card} aria-labelledby="pay-h" data-payments={d.paymentsLive ? 'live' : 'off'}>
      <h2 id="pay-h" className={h2}>Payments</h2>
      {!d.paymentsLive ? (
        <p className="mt-1 text-sm text-white/70" data-payments-not-live>{PAYMENTS_NOT_LIVE} Clients apply from your page and you reply. When payments open, clients pay you directly and FEL keeps 5%.</p>
      ) : !c || !c.detailsSubmitted || !c.chargesEnabled ? (
        <>
          <p className="mt-1 text-sm text-white/70">Clients pay you through Stripe. Money goes to your own Stripe account and FEL keeps 5% of each sale.</p>
          <button type="button" className={`${btn} mt-3`} disabled={busy || !d.ready} onClick={() => go('/connect')}>{c ? 'Finish setting up payments' : 'Set up payments'}</button>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-emerald-300">Payments are on.{c.payoutsEnabled ? ' Payouts go to your bank on Stripe’s schedule.' : ' Add a bank account in Stripe to get paid out.'}</p>
          <button type="button" className={`${ghost} mt-3`} disabled={busy} onClick={() => go('/connect/dashboard')}>Open Stripe (balance and payouts)</button>
        </>
      )}
    </section>
  );
}

const splitList = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

function ProfileCard({ d, api, onSaved, onNote }: CardProps) {
  const p = d.profile;
  const [f, setF] = useState({
    displayName: p?.displayName ?? '', headline: p?.headline ?? '', bio: p?.bio ?? '',
    specialties: (p?.specialties ?? []).join(', '), certifications: (p?.certifications ?? []).join(', '), published: p?.published ?? false,
    listed: d.market.listed, acceptingClients: d.market.acceptingClients, sports: d.market.sports as string[], goals: d.market.goals as string[],
  });
  const [busy, setBusy] = useState(false);
  const toggle = (key: 'sports' | 'goals', k: string) => setF((x) => ({ ...x, [key]: x[key].includes(k) ? x[key].filter((y) => y !== k) : [...x[key], k] }));
  const save = async () => {
    setBusy(true);
    const r = await call(api, 'PUT', {
      displayName: f.displayName, headline: f.headline, bio: f.bio, specialties: splitList(f.specialties), certifications: splitList(f.certifications), published: f.published,
      market: { listed: f.listed, acceptingClients: f.acceptingClients, sports: f.sports, goals: f.goals },
    });
    setBusy(false);
    onNote(r.ok ? 'Profile saved.' : said(r.json, 'Profile did not save.'));
    if (r.ok) await onSaved?.();
  };
  return (
    <section className={card} aria-labelledby="profile-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="profile-h" className={h2}>Your page</h2>
        {p?.published ? <Link href={`/coach/${p.slug}`} className="text-sm font-bold text-cyan-300 underline">View /coach/{p.slug}</Link> : null}
      </div>
      <div className="mt-3 grid gap-3">
        <label className="text-xs font-bold uppercase tracking-wider text-white/50">Name<input className={`${input} mt-1`} value={f.displayName} maxLength={60} onChange={(e) => setF({ ...f, displayName: e.target.value })} /></label>
        <label className="text-xs font-bold uppercase tracking-wider text-white/50">Headline<input className={`${input} mt-1`} value={f.headline} maxLength={120} onChange={(e) => setF({ ...f, headline: e.target.value })} /></label>
        <label className="text-xs font-bold uppercase tracking-wider text-white/50">About you<textarea className={`${input} mt-1 py-2`} rows={4} value={f.bio} maxLength={2000} onChange={(e) => setF({ ...f, bio: e.target.value })} /></label>
        <label className="text-xs font-bold uppercase tracking-wider text-white/50">Specialties (comma between)<input className={`${input} mt-1`} value={f.specialties} onChange={(e) => setF({ ...f, specialties: e.target.value })} /></label>
        <label className="text-xs font-bold uppercase tracking-wider text-white/50">Certifications (comma between)<input className={`${input} mt-1`} value={f.certifications} onChange={(e) => setF({ ...f, certifications: e.target.value })} /></label>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={f.published} onChange={(e) => setF({ ...f, published: e.target.checked })} />Publish my page</label>
      </div>
      {d.ready ? (
        <fieldset className="mt-4 space-y-3" data-market-optin>
          <legend className="text-sm font-bold">Find a coach{d.marketplaceOn ? '' : ' (the list is not open yet)'}</legend>
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={f.listed} onChange={(e) => setF({ ...f, listed: e.target.checked })} />List me</label>
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={f.acceptingClients} onChange={(e) => setF({ ...f, acceptingClients: e.target.checked })} />Taking new clients</label>
          <div className="flex flex-wrap gap-2">{SPORTS.map(([k, l]) => (
            <button key={k} type="button" aria-pressed={f.sports.includes(k)} onClick={() => toggle('sports', k)} className={`min-h-9 rounded-full border px-3 text-xs font-bold ${f.sports.includes(k) ? 'border-cyan-300 bg-cyan-300 text-black' : 'border-white/15 text-white/70'}`}>{l}</button>
          ))}</div>
          <div className="flex flex-wrap gap-2">{MARKET_GOALS.map(([k, l]) => (
            <button key={k} type="button" aria-pressed={f.goals.includes(k)} onClick={() => toggle('goals', k)} className={`min-h-9 rounded-full border px-3 text-xs font-bold ${f.goals.includes(k) ? 'border-cyan-300 bg-cyan-300 text-black' : 'border-white/15 text-white/70'}`}>{l}</button>
          ))}</div>
        </fieldset>
      ) : null}
      <button type="button" className={`${btn} mt-4`} disabled={busy} onClick={save}>Save page</button>
    </section>
  );
}

const EMPTY_PKG = { kind: 'monthly' as PackageKind, title: '', summary: '', price: '', includes: '', capacity: '', sessions: '' };

function PackagesCard({ d, api, onSaved, onNote }: CardProps) {
  const [f, setF] = useState(EMPTY_PKG);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const body = (x: typeof EMPTY_PKG, active = true) => ({
    kind: x.kind, title: x.title, summary: x.summary, priceCents: Math.round(Number(x.price) * 100),
    includes: x.includes.split('\n').map((s) => s.trim()).filter(Boolean),
    capacity: x.capacity ? Number(x.capacity) : null, sessions: x.kind === 'session_pack' && x.sessions ? Number(x.sessions) : null, active,
  });
  const add = async () => {
    setBusy(true);
    const r = await call(`${api}/packages`, 'POST', body(f));
    setBusy(false);
    if (!r.ok) { onNote(said(r.json, 'Package did not save.')); return; }
    setF(EMPTY_PKG); setOpen(false); onNote('Package added.'); await onSaved?.();
  };
  const setActive = async (id: string, active: boolean) => {
    const k = d.packages.find((x) => x.id === id);
    if (!k) return;
    const r = await call(`${api}/packages/${id}`, 'PATCH', { ...k, active });
    onNote(r.ok ? (active ? 'Package back on your page.' : 'Package taken off your page.') : said(r.json, 'That did not save.'));
    await onSaved?.();
  };
  return (
    <section className={card} aria-labelledby="pkg-h" data-packages-card>
      <h2 id="pkg-h" className={h2}>Packages</h2>
      {d.packages.length === 0 ? <p className="mt-1 text-sm text-white/60">No packages yet. Add what you sell: monthly coaching, a session pack, a single review or a program.</p> : null}
      <ul className="mt-3 space-y-2">
        {d.packages.map((k) => (
          <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 p-3" data-package-row={k.kind}>
            <div className="min-w-0">
              <p className="font-bold">{k.title}</p>
              <p className="text-xs text-white/50">{PACKAGE_KIND_LABELS[k.kind]} · {packagePriceLabel(k.priceCents, k.kind)}{k.capacity !== null ? ` · ${k.spotsLeft} of ${k.capacity} open` : ''}{k.active ? '' : ' · off your page'}</p>
            </div>
            <button type="button" className={ghost} onClick={() => setActive(k.id, !k.active)}>{k.active ? 'Take off page' : 'Put back'}</button>
          </li>
        ))}
      </ul>
      {!open ? <button type="button" className={`${ghost} mt-3`} onClick={() => setOpen(true)}>Add a package</button> : (
        <div className="mt-3 grid gap-3" data-package-form>
          <label className="text-xs font-bold uppercase tracking-wider text-white/50">Kind
            <select className={`${input} mt-1`} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as PackageKind })}>
              {PACKAGE_KINDS.map((k) => <option key={k} value={k}>{PACKAGE_KIND_LABELS[k]}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold uppercase tracking-wider text-white/50">Title<input className={`${input} mt-1`} value={f.title} maxLength={80} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
          <label className="text-xs font-bold uppercase tracking-wider text-white/50">Summary<input className={`${input} mt-1`} value={f.summary} maxLength={280} onChange={(e) => setF({ ...f, summary: e.target.value })} /></label>
          <label className="text-xs font-bold uppercase tracking-wider text-white/50">Price in dollars{f.kind === 'monthly' ? ' per month' : ''}<input className={`${input} mt-1`} inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></label>
          <label className="text-xs font-bold uppercase tracking-wider text-white/50">What is included (one per line)<textarea className={`${input} mt-1 py-2`} rows={3} value={f.includes} onChange={(e) => setF({ ...f, includes: e.target.value })} /></label>
          <label className="text-xs font-bold uppercase tracking-wider text-white/50">Capacity (open spots; blank = no limit)<input className={`${input} mt-1`} inputMode="numeric" value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} /></label>
          {f.kind === 'session_pack' ? <label className="text-xs font-bold uppercase tracking-wider text-white/50">Sessions in the pack<input className={`${input} mt-1`} inputMode="numeric" value={f.sessions} onChange={(e) => setF({ ...f, sessions: e.target.value })} /></label> : null}
          <div className="flex flex-wrap gap-2"><button type="button" className={btn} disabled={busy} onClick={add}>Save package</button><button type="button" className={ghost} onClick={() => setOpen(false)}>Cancel</button></div>
        </div>
      )}
    </section>
  );
}

function SalesCard({ d, api, onSaved, onNote }: CardProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const refund = async (id: string) => {
    setBusy(id);
    const r = await call(`${api}/sales/${id}/refund`, 'POST', {});
    setBusy(null);
    onNote(r.ok ? (r.json.status === 'CANCELED' ? 'Cancelled. No further months bill.' : 'Refunded.') : said(r.json, 'Refund did not go through.'));
    await onSaved?.();
  };
  return (
    <section className={card} aria-labelledby="sales-h" data-sales>
      <h2 id="sales-h" className={h2}>Sales</h2>
      <ul className="mt-3 space-y-2 text-sm">
        {d.sales.map((s) => {
          const net = s.amountCents - s.feeCents - (s.refundedCents - s.feeRefundedCents);
          const refundable = s.kind !== 'monthly' && (s.status === 'PAID' || s.status === 'PARTIALLY_REFUNDED');
          const cancellable = s.kind === 'monthly' && s.status === 'ACTIVE';
          return (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 p-3">
              <div className="min-w-0">
                <p className="font-bold">{s.title}{s.livemode ? '' : ' · test'}</p>
                <p className="text-xs text-white/50">{money(s.amountCents)} · FEL 5% {money(s.feeCents)}{s.refundedCents ? ` · refunded ${money(s.refundedCents)}` : ''} · you {money(Math.max(0, net))} before Stripe’s fee · {s.status.toLowerCase().replace('_', ' ')}</p>
              </div>
              {refundable || cancellable ? <button type="button" className={ghost} disabled={busy === s.id} onClick={() => refund(s.id)}>{cancellable ? 'Cancel' : 'Refund'}</button> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ApplicationsCard({ d, api, onSaved }: Omit<CardProps, 'onNote'>) {
  const answer = async (id: string, status: 'ACCEPTED' | 'DECLINED') => { await call(`${api}/applications/${id}`, 'PATCH', { status }); await onSaved?.(); };
  return (
    <section className={card} aria-labelledby="apps-h" data-applications>
      <h2 id="apps-h" className={h2}>Applications</h2>
      {d.applications.length === 0 ? <p className="mt-1 text-sm text-white/60">No applications yet. Adults apply from your page; reply by email, then send your invite link.</p> : (
        <ul className="mt-3 space-y-2 text-sm">
          {d.applications.map((a) => (
            <li key={a.id} className="rounded-xl border border-white/10 p-3">
              <p className="font-bold">{a.applicantName ?? 'Applicant'} {a.applicantEmail ? <a className="font-normal text-cyan-300 underline" href={`mailto:${a.applicantEmail}`}>{a.applicantEmail}</a> : null}</p>
              <p className="text-xs text-white/50">Goal: {MARKET_GOALS.find(([k]) => k === a.goal)?.[1] ?? a.goal} · {a.status.toLowerCase()}</p>
              {a.note ? <p className="mt-1 text-white/75">{a.note}</p> : null}
              {a.status === 'OPEN' ? (
                <div className="mt-2 flex gap-2"><button type="button" className={ghost} onClick={() => answer(a.id, 'ACCEPTED')}>Accept</button><button type="button" className={ghost} onClick={() => answer(a.id, 'DECLINED')}>Decline</button></div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function HighlightsCard({ d, api, onSaved, onNote }: CardProps) {
  const [roster, setRoster] = useState<{ clientId: string; name: string }[]>([]);
  const [clientId, setClientId] = useState('');
  const [text, setText] = useState('');
  useEffect(() => { fetch('/api/coach/roster').then((r) => (r.ok ? r.json() : { roster: [] })).then((j) => setRoster(j.roster ?? [])).catch(() => {}); }, []);
  const ask = async () => {
    const r = await call(`${api}/highlights`, 'POST', { clientId, text });
    if (!r.ok) { onNote(said(r.json, 'That did not save.')); return; }
    onNote(`Saved. Send your client this link to approve it: ${String(r.json.approveUrl ?? '')}`);
    setText(''); await onSaved?.();
  };
  return (
    <section className={card} aria-labelledby="hl-h" data-highlights>
      <h2 id="hl-h" className={h2}>Results on your page</h2>
      <p className="mt-1 text-sm text-white/60">A result shows only after your client approves the exact words. It never shows their name, and never shows for anyone under 18.</p>
      <ul className="mt-3 space-y-2 text-sm">
        {d.highlights.map((h) => <li key={h.id} className="rounded-xl border border-white/10 p-3"><p>“{h.text}”</p><p className="text-xs text-white/50">{h.state === 'approved' ? 'Approved, on your page' : h.state === 'withdrawn' ? 'Withdrawn' : 'Waiting for your client'}</p></li>)}
      </ul>
      {roster.length ? (
        <div className="mt-3 grid gap-2">
          <select className={input} value={clientId} onChange={(e) => setClientId(e.target.value)} aria-label="Client">
            <option value="">Choose a client</option>
            {roster.map((c) => <option key={c.clientId} value={c.clientId}>{c.name}</option>)}
          </select>
          <textarea className={`${input} py-2`} rows={2} maxLength={280} value={text} onChange={(e) => setText(e.target.value)} aria-label="The result, in words your client approves" placeholder="Added 4 inches to their vertical in 10 weeks." />
          <button type="button" className={btn} disabled={!clientId || text.trim().length < 10} onClick={ask}>Ask to share</button>
        </div>
      ) : null}
    </section>
  );
}
