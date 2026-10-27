'use client';

// CombineApp — combine day, end to end on the coach's device (COMBINE-DAY, 2026-10-25): the combines on this phone and
// on the account, setup, the run, the report.
//
// A COMBINE IS A DRAFT ON THIS PHONE FIRST (lib/combine/draft.ts): it runs before the pending SQL is applied and in a gym
// with no signal. Once the account can save (GET says available), every change is sent a moment later — the NUMBERS
// only, as PUT /api/coach/combine/[id] takes them; the server keeps what the gates allow and names what it left on the
// phone. A name the coach typed (held: age unknown) never leaves the phone.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ClipboardList, Loader2, Plus, Trash2 } from 'lucide-react';
import { setBodyPlayDobYear } from '@/lib/move/bodyPlayGrownUp';
import { parseStations } from '@/lib/combine/catalogue';
import { COMING_SOON_LINE, NUMBERS_ONLY_LINE, say } from '@/lib/combine/copy';
import { cleanEvent, dropDraft, keepDraft, loadDrafts, stationProgress } from '@/lib/combine/draft';
import type { CombineEvent } from '@/lib/combine/types';
import { CombineSetup, type CombineCtx } from './combine-setup';
import { CombineRun } from './combine-run';
import { CombineReport } from './combine-report';

export const COMBINE_API = '/api/coach/combine';
/** (new) How long after the last change the combine is sent (ms): one request for a burst of taps. */
export const SYNC_DELAY_MS = 1200;

type View = { kind: 'home' } | { kind: 'setup' } | { kind: 'run'; id: string } | { kind: 'report'; id: string };
type Sync = { state: 'idle' } | { state: 'saving' } | { state: 'saved'; onPhone: number } | { state: 'failed' };

const EMPTY: CombineCtx = { available: false, athletes: [], teams: [], events: [] };

/** The body PUT and POST take: roster athletes only, numbers only. */
export function syncBody(ev: CombineEvent) {
  const roster = ev.athletes.filter((a) => a.source === 'roster' && a.access.testable);
  const results: Record<string, unknown> = {};
  for (const a of roster) if (ev.results[a.id]) results[a.id] = ev.results[a.id];
  return {
    create: { name: ev.name, teamId: ev.teamId, stations: ev.stations.map(({ kind, variant, attempts }) => ({ kind, variant, attempts })), weights: ev.weights, athleteIds: roster.map((a) => a.id) },
    save: { name: ev.name, weights: ev.weights, athleteIds: roster.map((a) => a.id), results },
  };
}

/** A saved combine (GET /api/coach/combine/[id]) as a draft on this phone. */
export function fromServer(e: Record<string, unknown>, localId: string): CombineEvent | null {
  return cleanEvent({
    v: 1, localId, serverId: e.id, name: e.name, createdAt: e.createdAt, updatedAt: e.updatedAt, teamId: e.teamId, teamName: null,
    athletes: Array.isArray(e.athletes) ? (e.athletes as Record<string, unknown>[]).map((a) => ({ ...a, source: 'roster' })) : [],
    stations: parseStations(e.stations), weights: e.weights, results: e.results, reach: {},
  });
}

export function CombineApp({ api = COMBINE_API, dobYear = null }: { api?: string; dobYear?: number | null }) {
  const [ctx, setCtx] = useState<CombineCtx | null>(null);
  const [drafts, setDrafts] = useState<CombineEvent[]>([]);
  const [view, setView] = useState<View>({ kind: 'home' });
  const [sync, setSync] = useState<Sync>({ state: 'idle' });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<CombineEvent | null>(null);

  useEffect(() => { setBodyPlayDobYear(dobYear); return () => setBodyPlayDobYear(undefined); }, [dobYear]);
  useEffect(() => {
    setDrafts(loadDrafts());
    fetch(api).then((r) => (r.ok ? r.json() : EMPTY)).then((j: CombineCtx) => setCtx({ ...EMPTY, ...j })).catch(() => setCtx(EMPTY));
  }, [api]);

  // the account's id for each phone draft, as soon as it exists (a change made while the first save is in flight must
  // not lose it, and must not make a second combine)
  const ids = useRef<Record<string, string>>({});
  const creating = useRef<Record<string, Promise<string | null> | undefined>>({});

  const keep = useCallback((ev: CombineEvent) => {
    const known = ev.serverId ?? ids.current[ev.localId] ?? null;
    const e = known && known !== ev.serverId ? { ...ev, serverId: known } : ev;
    keepDraft(e);
    setDrafts((d) => [e, ...d.filter((x) => x.localId !== e.localId)]);
  }, []);

  const serverIdFor = useCallback((ev: CombineEvent, create: unknown): Promise<string | null> => {
    const known = ev.serverId ?? ids.current[ev.localId];
    if (known) return Promise.resolve(known);
    creating.current[ev.localId] ??= (async () => {
      const r = await fetch(api, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(create) });
      const j = await r.json().catch(() => null);
      if (!r.ok || typeof j?.id !== 'string') return null;
      ids.current[ev.localId] = j.id as string;
      return j.id as string;
    })().catch(() => null).finally(() => { creating.current[ev.localId] = undefined; });
    return creating.current[ev.localId]!;
  }, [api]);

  const send = useCallback(async (ev: CombineEvent) => {
    const body = syncBody(ev);
    if (!body.create.athleteIds.length) return;
    setSync({ state: 'saving' });
    try {
      const id = await serverIdFor(ev, body.create);
      if (!id) { setSync({ state: 'failed' }); return; }
      // stamp the id on the draft as it is NOW (never write back the older copy this save was made from)
      if (ev.serverId !== id) setDrafts((d) => d.map((x) => { if (x.localId !== ev.localId || x.serverId === id) return x; const y = { ...x, serverId: id }; keepDraft(y); return y; }));
      const r = await fetch(`${api}/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body.save) });
      const j = await r.json().catch(() => null);
      setSync(r.ok ? { state: 'saved', onPhone: Array.isArray(j?.keptOnDevice) ? j.keptOnDevice.length : 0 } : { state: 'failed' });
    } catch {
      setSync({ state: 'failed' });
    }
  }, [api, serverIdFor]);

  const update = useCallback((ev: CombineEvent) => {
    keep(ev);
    if (!ctx?.available) return;
    pending.current = ev;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { const p = pending.current; pending.current = null; if (p) void send(p); }, SYNC_DELAY_MS);
  }, [ctx?.available, keep, send]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const openSaved = async (id: string) => {
    const local = drafts.find((d) => d.serverId === id);
    if (local) { setView({ kind: 'report', id: local.localId }); return; }
    const j = await fetch(`${api}/${encodeURIComponent(id)}`).then((r) => r.json()).catch(() => null);
    const ev = j?.event ? fromServer(j.event, `srv-${id}`) : null;
    if (ev) { keep(ev); setView({ kind: 'report', id: ev.localId }); }
  };
  const deleteSaved = async (id: string) => {
    if (!window.confirm('Delete this combine and every result in it from your account?')) return;
    const r = await fetch(`${api}/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => null);
    if (r?.ok) setCtx((c) => (c ? { ...c, events: c.events.filter((e) => e.id !== id) } : c));
  };

  if (!ctx) return <div className="flex justify-center py-16 text-white/40"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  const ev = view.kind === 'run' || view.kind === 'report' ? drafts.find((d) => d.localId === view.id) ?? null : null;
  const numbersOnly = say(NUMBERS_ONLY_LINE);
  const status = !ctx.available ? COMING_SOON_LINE
    : sync.state === 'saving' ? 'Saving…'
      : sync.state === 'failed' ? 'Not saved yet: kept on this phone. It tries again on the next change.'
        : sync.state === 'saved' ? `Saved to your account${sync.onPhone ? `; ${sync.onPhone} kept on this phone only` : ''}.` : null;

  if (view.kind === 'setup') {
    return <CombineSetup ctx={ctx} onCancel={() => setView({ kind: 'home' })} onStart={(e) => { update(e); setView({ kind: 'run', id: e.localId }); }} />;
  }
  if (view.kind === 'run' && ev) {
    return <CombineRun ev={ev} onChange={update} onReport={() => setView({ kind: 'report', id: ev.localId })} onHome={() => setView({ kind: 'home' })} roster={ctx.athletes} saving={ctx.available} status={status} />;
  }
  if (view.kind === 'report' && ev) {
    return <CombineReport ev={ev} onChange={update} onBack={() => setView({ kind: 'run', id: ev.localId })} />;
  }

  const savedOnly = ctx.events.filter((e) => !drafts.some((d) => d.serverId === e.id));
  return (
    <div className="space-y-4" data-combine-home>
      <button type="button" onClick={() => setView({ kind: 'setup' })} data-combine-new className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#00E5FF] text-lg font-black text-black">
        <Plus className="h-5 w-5" /> New combine
      </button>
      {!ctx.available && <p className="text-xs text-white/50" data-combine-coming-soon>{COMING_SOON_LINE}</p>}
      {numbersOnly && <p className="text-xs text-white/45">{numbersOnly}</p>}
      {drafts.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-[11px] uppercase tracking-wider text-white/40">On this phone</h2>
          <ul className="space-y-2">
            {drafts.map((d) => {
              const p = d.stations.reduce((t, s) => { const x = stationProgress(d, s.id); return { done: t.done + x.done, total: t.total + x.total }; }, { done: 0, total: 0 });
              return (
                <li key={d.localId} className="fel-card flex items-center gap-3 rounded-xl p-3" data-combine-draft={d.localId}>
                  <ClipboardList className="h-5 w-5 shrink-0 text-[#00E5FF]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold text-white">{d.name}</span>
                    <span className="block text-xs text-white/45">{new Date(d.createdAt).toLocaleDateString()} · {d.athletes.length} athletes · {p.done}/{p.total} attempts{d.serverId ? ' · saved' : ''}</span>
                  </span>
                  <button type="button" onClick={() => setView({ kind: 'run', id: d.localId })} className="min-h-10 rounded-lg border border-white/20 px-3 text-xs font-bold text-white/85">Run</button>
                  <button type="button" onClick={() => setView({ kind: 'report', id: d.localId })} className="min-h-10 rounded-lg border border-white/20 px-3 text-xs font-bold text-white/85">Report</button>
                  <button type="button" aria-label={`Remove ${d.name} from this phone`} onClick={() => { if (window.confirm(d.serverId ? 'Remove this combine from this phone? The saved copy on your account stays.' : 'Delete this combine? It is only on this phone.')) { dropDraft(d.localId); setDrafts((x) => x.filter((y) => y.localId !== d.localId)); } }}
                    className="grid h-10 w-10 place-items-center rounded-lg text-white/45"><Trash2 className="h-4 w-4" /></button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {savedOnly.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-[11px] uppercase tracking-wider text-white/40">On your account</h2>
          <ul className="space-y-2">
            {savedOnly.map((e) => (
              <li key={e.id} className="fel-card flex items-center gap-3 rounded-xl p-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-white">{e.name}</span>
                  <span className="block text-xs text-white/45">{new Date(e.createdAt).toLocaleDateString()} · {e.athletes} athletes</span>
                </span>
                <button type="button" onClick={() => void openSaved(e.id)} className="min-h-10 rounded-lg border border-white/20 px-3 text-xs font-bold text-white/85">Open</button>
                <button type="button" aria-label={`Delete ${e.name}`} onClick={() => void deleteSaved(e.id)} className="grid h-10 w-10 place-items-center rounded-lg text-white/45"><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {drafts.length === 0 && savedOnly.length === 0 && (
        <p className="text-sm text-white/55">Run a tryout or testing day: pick who is testing and the stations, then take each athlete through them on this device. You get a ranked report at the end.</p>
      )}
    </div>
  );
}
