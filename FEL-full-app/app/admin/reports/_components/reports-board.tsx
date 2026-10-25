'use client';

import { useCallback, useEffect, useState } from 'react';
import { APPEAL_LABEL, REASON_LABEL, REPORT_REASONS, type AppealReason, type ReportReason } from '@/lib/safety/reportPresets';

interface Report { id: string; reportedId: string | null; targetKind: string; targetRef: string; reason: string; note: string | null; createdAt: string }
interface Appeal { id: string; userId: string; kind: string; reason: string; createdAt: string; endsAt: string | null; appealReason: string | null; appealNote: string | null; appealedAt: string | null }

const label = (r: string) => REASON_LABEL[r as ReportReason] ?? r;

export function ReportsBoard() {
  const [data, setData] = useState<{ available: boolean; reports: Report[]; appeals: Appeal[] } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(() => fetch('/api/report/admin').then((r) => r.json()).then(setData).catch(() => setData({ available: false, reports: [], appeals: [] })), []);
  useEffect(() => { void load(); }, [load]);

  const post = async (body: Record<string, unknown>) => {
    const res = await fetch('/api/report/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const out = await res.json().catch(() => ({}));
    setMsg(res.ok ? `Done: ${out.status ?? out.appealStatus}` : `Refused: ${out.error ?? res.status}`);
    void load();
  };

  if (!data) return <p className="mt-6 text-sm text-white/50">Loading…</p>;
  if (!data.available) return <p className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/60" data-testid="queue-not-ready">The reports tables are not set up yet (prisma/pending/2026-10-25-user-reports.sql).</p>;
  return (
    <div className="mt-6 space-y-8">
      {msg && <p className="text-xs text-[#FFD700]" data-testid="queue-msg">{msg}</p>}
      <section>
        <h2 className="fel-heading text-lg font-bold text-white">Open reports ({data.reports.length})</h2>
        <ul className="mt-3 space-y-3">
          {data.reports.map((r) => <ReportRow key={r.id} r={r} act={(action, reason) => post({ op: 'report', reportId: r.id, action, reason })} />)}
          {!data.reports.length && <li className="text-sm text-white/40">Nothing open.</li>}
        </ul>
      </section>
      <section>
        <h2 className="fel-heading text-lg font-bold text-white">Open appeals ({data.appeals.length})</h2>
        <ul className="mt-3 space-y-3">
          {data.appeals.map((a) => (
            <li key={a.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4" data-testid="appeal-row">
              <p className="text-sm font-bold text-white">{a.kind} · {label(a.reason)} <span className="font-mono text-[11px] text-white/40">account {a.userId}</span></p>
              <p className="mt-1 text-xs text-white/60">Appeal: {APPEAL_LABEL[a.appealReason as AppealReason] ?? a.appealReason}{a.appealNote ? ` — “${a.appealNote}”` : ''}</p>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => post({ op: 'appeal', moderationId: a.id, decision: 'lift' })} className="rounded-lg bg-[#00FF9D] px-3 py-1.5 text-xs font-bold text-black">Lift</button>
                <button type="button" onClick={() => post({ op: 'appeal', moderationId: a.id, decision: 'uphold' })} className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-bold text-white">Uphold</button>
              </div>
            </li>
          ))}
          {!data.appeals.length && <li className="text-sm text-white/40">No open appeals.</li>}
        </ul>
      </section>
    </div>
  );
}

function ReportRow({ r, act }: { r: Report; act: (action: string, reason: ReportReason) => void }) {
  const [reason, setReason] = useState<ReportReason>((REPORT_REASONS as readonly string[]).includes(r.reason) ? (r.reason as ReportReason) : 'other');
  return (
    <li className="rounded-xl border border-white/10 bg-white/[0.03] p-4" data-testid="report-row">
      <p className="text-sm font-bold text-white">{label(r.reason)} <span className="font-normal text-white/50">· {r.targetKind} {r.targetRef}</span></p>
      <p className="mt-0.5 font-mono text-[11px] text-white/40">{r.reportedId ? `account ${r.reportedId}` : 'no account resolved'} · {new Date(r.createdAt).toLocaleString()}</p>
      {r.note && <p className="mt-1 text-xs text-white/70">“{r.note}”</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select value={reason} onChange={(e) => setReason(e.target.value as ReportReason)} className="rounded-lg border border-white/15 bg-black px-2 py-1 text-xs text-white">
          {REPORT_REASONS.map((x) => <option key={x} value={x}>{REASON_LABEL[x]}</option>)}
        </select>
        <button type="button" onClick={() => act('dismiss', reason)} className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-bold text-white">Dismiss</button>
        <button type="button" onClick={() => act('warn', reason)} disabled={!r.reportedId} className="rounded-lg bg-[#FFD700] px-3 py-1.5 text-xs font-bold text-black disabled:opacity-40">Warn</button>
        <button type="button" onClick={() => act('mute', reason)} disabled={!r.reportedId} className="rounded-lg bg-[#FF9500] px-3 py-1.5 text-xs font-bold text-black disabled:opacity-40">Mute 7 days</button>
        <button type="button" onClick={() => act('ban', reason)} disabled={!r.reportedId} className="rounded-lg bg-[#FF3366] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40">Ban</button>
      </div>
    </li>
  );
}
