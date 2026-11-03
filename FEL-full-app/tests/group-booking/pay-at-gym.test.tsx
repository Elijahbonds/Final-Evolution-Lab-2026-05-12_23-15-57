// GROUP-BOOKING (owner, 2026-11-02): "book now and pay at the gym". The shop front's buy sheet in its new reserve mode:
// no store-terms tick, the button reads "Reserve, pay at the gym", and pressing it POSTs the reserve route ONLY — 0 calls
// to any checkout while online payment is off. With every online switch on (the route answers { mode: 'online' }), the
// same press goes on to the EXISTING coach-business checkout, once.
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react', async (importOriginal) => (await import('@/tests/helpers/hookRuntime')).hookedReact(await importOriginal()));
import { createElement as h, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BuyEntry, BuySheet } from '@/components/shop/buy-sheet';
import { PrimaryCta } from '@/components/ui/fel/primary-cta';
import { GroupJoin, type GroupCardView } from '@/components/group-booking/groups-browser';
import { CHECKOUT_API, RESERVE_API, reserveThenPay } from '@/lib/group-booking/client';
import { mount } from '@/tests/helpers/hookRuntime';

afterEach(() => { vi.unstubAllGlobals(); });

function* walk(n: unknown): Generator<ReactElement<Record<string, unknown>>> {
  if (Array.isArray(n)) { for (const x of n) yield* walk(x); return; }
  if (!isValidElement(n)) return;
  const el = n as ReactElement<Record<string, unknown>>;
  yield el;
  for (const v of Object.values(el.props ?? {})) if (isValidElement(v) || Array.isArray(v)) yield* walk(v);
}

const opt = (kind: 'drop_in' | 'package' | 'full', cents: number, mode: 'at_gym' | 'online' = 'at_gym') => ({
  kind, title: kind, priceCents: cents, priceLabel: mode === 'at_gym' ? `$${cents / 100} · pay at the gym` : `$${cents / 100}`, payMode: mode, sessions: kind === 'drop_in' ? 1 : 8, firstLabel: 'Mon Nov 9', firstDate: '2026-11-09',
});
const card = (over: Partial<GroupCardView> = {}): GroupCardView => ({
  id: 'g1', name: 'Valley Strength', gymId: '24hr-victory', gymName: '24 Hour Fitness Victory', gymAddress: null, dayPair: 'mon_wed', days: 'Mon & Wed', hour: 17, time: '5 pm',
  startLabel: 'Mon Nov 9', endLabel: 'Wed Dec 30', weeks: 8, seatsLeft: 3, full: false, maxSeats: 8, minSeats: 6, trainerName: 'Elijah',
  options: [opt('drop_in', 6500), opt('package', 40000)], lateJoin: false, ...over,
});

type Call = [string, RequestInit | undefined];
const server = (pay: unknown) => {
  const calls: Call[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    calls.push([url, init]);
    if (url === RESERVE_API) return new Response(JSON.stringify({ ok: true, pay, ics: 'BEGIN:VCALENDAR' }), { status: 201 });
    return new Response(JSON.stringify({ url: 'https://checkout.example/x' }), { status: 200 });
  }) as unknown as typeof fetch;
  return { f, calls };
};

describe('reserveThenPay', () => {
  it('online payment off: reserve only — 0 checkout calls — and say "pay at the gym"', async () => {
    const { f, calls } = server({ mode: 'at_gym' });
    const out = await reserveThenPay(f, { url: RESERVE_API, back: '/groups/g1', body: { groupId: 'g1', option: 'package' }, termsVersion: null });
    expect(out).toEqual({ kind: 'done', line: 'Reserved. Pay at the gym when you arrive.' });
    expect(calls.map(([u, i]) => [u, i?.method])).toEqual([[RESERVE_API, 'POST']]);
    expect(calls.filter(([u]) => u === CHECKOUT_API)).toHaveLength(0);
  });
  it('even if a stale page sent a terms version, at_gym never reaches checkout', async () => {
    const { f, calls } = server({ mode: 'at_gym' });
    await reserveThenPay(f, { url: RESERVE_API, back: '/groups', body: {}, termsVersion: 'v1' });
    expect(calls.map(([u]) => u)).toEqual([RESERVE_API]);
  });
  it('every online switch on: the existing coach-business checkout, once, by POST', async () => {
    const { f, calls } = server({ mode: 'online', packageId: 'pk1' });
    const out = await reserveThenPay(f, { url: RESERVE_API, back: '/groups', body: {}, termsVersion: 'v1' });
    expect(out).toEqual({ kind: 'redirect', url: 'https://checkout.example/x' });
    expect(calls.map(([u, i]) => [u, i?.method])).toEqual([[RESERVE_API, 'POST'], [CHECKOUT_API, 'POST']]);
    expect(JSON.parse(String(calls[1][1]!.body))).toEqual({ packageId: 'pk1', termsAccepted: true, termsVersion: 'v1' });
  });
  it('signed out → sign in and come back; a refusal reads as a plain line', async () => {
    const f401 = (async () => new Response('{}', { status: 401 })) as unknown as typeof fetch;
    expect(await reserveThenPay(f401, { url: RESERVE_API, back: '/groups/g1', body: {}, termsVersion: null })).toMatchObject({ kind: 'sign_in', href: expect.stringContaining('%2Fgroups%2Fg1') });
    const full = (async () => new Response(JSON.stringify({ error: 'full', waitlist: true }), { status: 409 })) as unknown as typeof fetch;
    expect(await reserveThenPay(full, { url: RESERVE_API, back: '/groups', body: {}, termsVersion: null })).toEqual({ kind: 'line', line: 'That group just filled. Join the waitlist instead.', href: undefined });
  });
});

describe('the group card: the shop\'s product card + buy sheet in reserve mode', () => {
  it('the entry: "Join", no terms, "Reserve, pay at the gym"; pressing it calls the reserve route and NO checkout', async () => {
    const { f, calls } = server({ mode: 'at_gym' });
    vi.stubGlobal('fetch', f);
    const m = mount(() => GroupJoin({ g: card(), format: '30 min strength & conditioning + 30 min correctives & athletic skill', cancelLine: 'Cancel 24h+ ahead: free.' }));
    const entry = [...walk(m.tree as ReactNode)].find((e) => e.type === BuyEntry)!;
    expect(entry.props).toMatchObject({ label: 'Join', terms: null, payLabel: 'Reserve, pay at the gym' });
    expect((entry.props.item as { priceLabel: string }).priceLabel).toBe('$400 · pay at the gym');   // the package is the default pick
    expect(entry.props.includes).toContain('30 min strength & conditioning + 30 min correctives & athletic skill');
    expect(entry.props.includes).toContain('Cancel 24h+ ahead: free.');
    // the sheet, with exactly the entry's props: one press, and it is reserved
    const sheet = mount(() => BuySheet({ ...(entry.props as never), onClose: () => {} }));
    const flush = () => new Promise((r) => setTimeout(r, 0));
    const find = (f2: (el: ReactElement<Record<string, unknown>>) => boolean) => [...walk(sheet.tree as ReactNode)].find(f2);
    expect(find((e) => e.props.type === 'checkbox')).toBeUndefined();   // no terms tick in reserve mode
    expect(find((e) => e.type === PrimaryCta)!.props.children).toBe('Reserve, pay at the gym');
    (find((e) => e.type === PrimaryCta)!.props.onClick as () => void)();
    await flush(); await flush(); await flush();
    expect(calls.map(([u]) => u)).toEqual([RESERVE_API]);
    expect(JSON.parse(String(calls[0][1]!.body))).toEqual({ groupId: 'g1', option: 'package' });
    expect(find((e) => e.props['data-buy-done'] === true)?.props.children).toBe('Reserved. Pay at the gym when you arrive.');
    expect(find((e) => e.type === PrimaryCta)).toBeUndefined();   // done: no second press
    sheet.unmount(); m.unmount();
  });

  it('a full group: "Full · join the waitlist", no buy entry', () => {
    const html = renderToStaticMarkup(h(GroupJoin, { g: card({ full: true, seatsLeft: 0 }), format: 'f', cancelLine: 'c' }));
    expect(html).toContain('Full · join the waitlist');
    expect(html).toContain('data-action="waitlist"');
    expect(html).not.toContain('data-buy-entry');
  });

  it('a late joiner reads "Joining late? Drop in for $65 a session."', () => {
    const html = renderToStaticMarkup(h(GroupJoin, { g: card({ lateJoin: true, options: [opt('drop_in', 6500)] }), format: 'f', cancelLine: 'c' }));
    expect(html).toContain('Joining late? Drop in for $65 a session.');
    expect(html).toContain('$65 · pay at the gym');
  });

  it('online on: the sheet keeps its terms tick and its "Continue to pay"', () => {
    const m = mount(() => GroupJoin({ g: card({ options: [opt('package', 40000, 'online')] }), format: 'f', cancelLine: 'c' }));
    const entry = [...walk(m.tree as ReactNode)].find((e) => e.type === BuyEntry)!;
    expect(entry.props.terms).toEqual({ href: expect.any(String) });
    expect(entry.props.payLabel).toBeUndefined();
    m.unmount();
  });
});
