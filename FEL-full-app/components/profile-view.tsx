'use client';

import { useEffect, useState } from 'react';
import { healthEraseToast, healthStoredLine } from '@/lib/health/healthDataCopy';
import { prqDisplay } from '@/lib/prq-display';
import { ROSTER } from '@/lib/game-data';
import { AvatarFigure } from '@/components/avatar-figure';
import { Sparkles, Check, Plus, X, Loader2, Download, Trash2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';

// PROFILE V2 (owner 2026-10-24): this file used to BE the profile — a header, the athlete roster, mode mastery, the PRQ
// attributes, data rights and health data, one long page that fetched four things after it hydrated. The profile is now
// app/profile/page.tsx (server-read, components/profile-v2/**); what stayed here are the EDITING and SETTINGS panels,
// each exported and mounted where it belongs:
//   · AthletePicker, PrqFoundation → /profile/edit
//   · PrqDataRights, HealthDataSection → /account
// Mode mastery moved to the profile's Badges block (server-read).

/** Pick the roster body you're building toward (PATCH /api/profile). The current pick comes from the server. */
export function AthletePicker({ initialKey }: { initialKey: string | null }) {
  const [current, setCurrent] = useState<string | null>(initialKey);
  const [saving, setSaving] = useState<string | null>(null);
  const selectAvatar = async (key: string) => {
    if (saving) return;
    setSaving(key);
    try {
      const r = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarKey: key }),
      });
      const j = r?.ok ? await r.json() : null;
      if (j?.profile) setCurrent(j.profile.avatarKey ?? key);
      else toast.error('That didn\'t save.');
    } catch { toast.error('That didn\'t save.'); }
    setSaving(null);
  };
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="fel-heading text-[19px] font-bold text-white">YOUR ATHLETE</h2>
          <p className="text-xs text-white/45">Pick the body type you're building toward. Your athlete shows up across the Lab.</p>
        </div>
        <a
          href="/closet"
          className="inline-flex items-center gap-1.5 rounded-md border border-[#C79BFF]/40 bg-[#C79BFF]/10 px-3 py-1.5 text-xs font-bold text-[#C79BFF] transition-colors hover:bg-[#C79BFF]/20"
        >
          <Sparkles className="h-3.5 w-3.5" /> CUSTOMIZE YOUR LOOK
        </a>
      </div>
      <p className="mt-1 text-[11px] text-white/35">
        Face, gear, and card skin live in the <a href="/closet" className="text-[#C79BFF]/80 underline underline-offset-2 hover:text-[#C79BFF]">Closet</a> — or scan your face there and let it build you.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {ROSTER.map((r) => {
          const selected = current === r.key;
          return (
            <button
              key={r.key}
              type="button"
              onClick={() => selectAvatar(r.key)}
              disabled={!!saving}
              aria-pressed={selected}
              className={`fel-card relative rounded-lg p-3 text-left transition-opacity ${selected ? '' : 'opacity-95 hover:opacity-100'}`}
              style={selected ? { borderColor: `${r.accent}88`, boxShadow: `0 0 20px ${r.accent}33` } : undefined}
            >
              {selected && (
                <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full" style={{ background: r.accent }}>
                  <Check className="h-3.5 w-3.5 text-black" />
                </span>
              )}
              <AvatarFigure avatar={r} size={72} />
              <div className="fel-heading mt-1 text-center text-sm font-bold" style={{ color: r.accent }}>
                {saving === r.key ? 'SAVING…' : r.name.toUpperCase()}
              </div>
              <div className="text-center text-[10px] uppercase tracking-wider text-white/70">
                {r.sex} · {r.build} · {r.bias.join(' / ')}
              </div>
              <p className="mt-1 hidden text-center text-[11px] leading-snug text-white/70 sm:block">{r.tagline}</p>
            </button>
          );
        })}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// PRQ Foundation — honest, traceable attribute vector + manual entry form
// ---------------------------------------------------------------------------

interface PrqVecAttr {
  key: string;
  label: string;
  units: string[];
  measured: { value: number; unit: string; source: string; measuredAt: string; entryId: string } | null;
}

export function PrqDataRights() {
  const [deleting, setDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleExport = () => {
    const a = document.createElement('a');
    a.href = '/api/prq/export';
    a.download = '';
    a.click();
  };

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/prq/delete', { method: 'POST' });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(`Deleted ${j.deleted ?? 0} PRQ entries and ${j.history ?? 0} movement history rows`);
        setShowConfirm(false);
        // Reload the page to refresh PRQ vector
        window.location.reload();
      } else {
        toast.error(j?.error ?? 'Delete failed');
      }
    } catch {
      toast.error('Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="mt-8 rounded-xl border border-white/10 bg-white/[0.02] p-5">
      <h3 className="fel-heading text-lg font-bold text-white mb-1">YOUR DATA RIGHTS</h3>
      {/* REVIEW (2026-09-24, D5): both buttons cover the movement history too (lib/prq-data-rights.ts), the numbers
          worked out from the camera that the privacy policy sends people here to export or delete */}
      <p className="text-xs text-fel-dim mb-4">
        Export or delete your PRQ measurements and your movement history (jumps, dunks, form reads and screens worked out from the camera) at any time.
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleExport}
          className="inline-flex items-center gap-2 rounded-md border border-[#00E5FF]/30 bg-[#00E5FF]/10 px-4 py-2 text-xs font-bold text-[#00E5FF] transition-colors hover:bg-[#00E5FF]/20"
        >
          <Download className="h-3.5 w-3.5" /> EXPORT DATA (JSON)
        </button>
        {!showConfirm ? (
          <button
            data-test-ignore="opens-confirm-dialog"
            onClick={() => setShowConfirm(true)}
            className="inline-flex items-center gap-2 rounded-md border border-[#FF3366]/30 bg-[#FF3366]/10 px-4 py-2 text-xs font-bold text-[#FF3366] transition-colors hover:bg-[#FF3366]/20"
          >
            <Trash2 className="h-3.5 w-3.5" /> DELETE PRQ + MOVEMENT HISTORY
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#FF3366]">Deletes every PRQ entry and all movement history (Mirror dunks, screens, form reads). Bought plans stay. This is permanent.</span>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-md bg-[#FF3366] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
            >
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'YES, DELETE'}
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              className="rounded-md border border-white/20 px-3 py-1.5 text-xs text-white/50 hover:text-white"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MIRROR-COACH P5 (2026-09-29) — Health data: view, withdraw (+ offer erase), and manage coach_view per coach.
//
// Deliberately its own panel, below YOUR DATA RIGHTS rather than folded into it: Privacy §5 promises this data
// (a health intake, per-exercise pain check-ins) is handled "separately from the rest of your account" — withdrawing
// consent here, or erasing what it collected, never touches a PRQ entry or a movement-history row, and the button
// above never touches this. All state lives in app/api/health/consent (GET for the view, POST for every action);
// lib/health/consent.ts is the pure module both the route and this page's own tests read the same rules from.
// ---------------------------------------------------------------------------

interface HealthConsentApiView {
  healthData: { granted: boolean; grantedAt: string | null };
  coaches: { coachId: string; name: string; viewGranted: boolean; grantedAt: string | null }[];
  /** MIRROR-COACH P6 (2026-09-29): readinessCheckIns — the daily check-in, stored under this same consent. Optional
   *  so a response from before P6 still renders (read as 0). MIRROR-COACH P7 FIX (2026-09-29): breathLogs — the Dial-Up
   *  Breath's use log, which the export and both erases carry; optional for the same reason. */
  counts: { healthIntakes: number; painCheckIns: number; readinessCheckIns?: number; breathLogs?: number };
}


export function HealthDataSection() {
  const [view, setView] = useState<HealthConsentApiView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);       // which control is mid-request, so only it spins
  const [showErase, setShowErase] = useState(false);
  const [erasing, setErasing] = useState(false);

  const load = () => {
    fetch('/api/health/consent', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j) setView(j); })
      .catch(() => {});
  };
  useEffect(load, []);

  const post = async (body: Record<string, unknown>, busyKey: string) => {
    if (busy) return;
    setBusy(busyKey);
    try {
      const res = await fetch('/api/health/consent', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => null);
      if (res.ok && j) setView(j);
      else toast.error(j?.error === 'cannot_grant_coach_view' ? 'Turn on health data collection first.' : 'That didn\'t go through.');
    } catch {
      toast.error('That didn\'t go through.');
    } finally {
      setBusy(null);
    }
  };

  const toggleHealthData = (next: boolean) => post({ action: next ? 'grant' : 'revoke', scope: 'health_data' }, 'health_data');
  const toggleCoach = (coachId: string, next: boolean) =>
    post({ action: next ? 'grant' : 'revoke', scope: 'coach_view', coachId }, `coach:${coachId}`);

  const handleErase = async () => {
    if (erasing) return;
    setErasing(true);
    try {
      const res = await fetch('/api/health/consent', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'erase' }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        const e = j?.erased ?? {};
        toast.success(healthEraseToast(e));
        setShowErase(false);
        setView(j);
      } else {
        toast.error('Delete failed');
      }
    } catch {
      toast.error('Delete failed');
    } finally {
      setErasing(false);
    }
  };

  const granted = view?.healthData.granted ?? false;

  return (
    <div className="mt-8 rounded-xl border border-white/10 bg-white/[0.02] p-5">
      <h3 className="fel-heading flex items-center gap-2 text-lg font-bold text-white mb-1">
        <ShieldCheck className="h-4 w-4 text-[#00E5FF]" /> HEALTH DATA
      </h3>
      <p className="text-xs text-fel-dim mb-4">
        Your health intake, pain check-ins, daily check-ins and Dial-Up Breath uses, kept separately from the rest of your account: opt-in only, stored on FEL
        only, never sold, never used for ads, never in a share link, and never scored or paid. See Privacy §5.
      </p>

      <div className="flex items-center justify-between rounded-lg border border-white/10 p-3">
        <div>
          <div className="text-sm font-bold text-white">Health data collection</div>
          <div className="text-xs text-fel-dim">
            {granted
              ? `On${view?.healthData.grantedAt ? ` since ${new Date(view.healthData.grantedAt).toLocaleDateString()}` : ''} — ${healthStoredLine(view?.counts)}`
              : 'Off — nothing is being collected.'}
          </div>
        </div>
        <Switch
          checked={granted}
          disabled={busy === 'health_data' || !view}
          onCheckedChange={toggleHealthData}
          aria-label="Health data collection"
        />
      </div>

      {view && view.coaches.length > 0 && (
        <div className="mt-3 space-y-2">
          <div className="text-xs font-bold uppercase tracking-wider text-white/50">Coach access</div>
          {view.coaches.map((c) => (
            <div key={c.coachId} className="flex items-center justify-between rounded-lg border border-white/10 p-3">
              <div>
                <div className="text-sm text-white">{c.name}</div>
                <div className="text-xs text-white/40">
                  {c.viewGranted ? 'Can see your intake and pain check-ins.' : granted ? 'Not shared.' : 'Turn on health data collection to share.'}
                </div>
              </div>
              <Switch
                checked={c.viewGranted}
                disabled={busy === `coach:${c.coachId}` || !granted}
                onCheckedChange={(next) => toggleCoach(c.coachId, next)}
                aria-label={`Share health data with ${c.name}`}
              />
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {!showErase ? (
          <button
            data-test-ignore="opens-confirm-dialog"
            onClick={() => setShowErase(true)}
            className="inline-flex items-center gap-2 rounded-md border border-[#FF3366]/30 bg-[#FF3366]/10 px-4 py-2 text-xs font-bold text-[#FF3366] transition-colors hover:bg-[#FF3366]/20"
          >
            <Trash2 className="h-3.5 w-3.5" /> ERASE HEALTH DATA
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#FF3366]">Deletes your intake, every pain check-in, every daily check-in and your Dial-Up Breath uses. Your consent records are kept as proof of agreement and withdrawal. Never touches a workout plan or your PRQ history. This is permanent.</span>
            <button
              onClick={handleErase}
              disabled={erasing}
              className="rounded-md bg-[#FF3366] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
            >
              {erasing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'YES, DELETE'}
            </button>
            <button
              onClick={() => setShowErase(false)}
              className="rounded-md border border-white/20 px-3 py-1.5 text-xs text-white/50 hover:text-white"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function PrqFoundation() {
  const [attrs, setAttrs] = useState<PrqVecAttr[]>([]);
  const [prq, setPrq] = useState<{ score: number; measured: number; total: number } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formAttr, setFormAttr] = useState('');
  const [formValue, setFormValue] = useState('');
  const [formUnit, setFormUnit] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadVector = () => {
    fetch('/api/prq/vector', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j) return;
        setAttrs(j.attributes ?? []);
        setPrq({ score: j.prq, measured: j.measuredCount, total: j.totalAttributes });
      })
      .catch(() => {});
  };

  useEffect(() => { loadVector(); }, []);

  const openForm = (attrKey?: string) => {
    setFormAttr(attrKey ?? attrs[0]?.key ?? '');
    setFormValue('');
    setFormUnit('');
    setShowForm(true);
  };

  const submit = async () => {
    if (submitting || !formAttr || !formValue) return;
    setSubmitting(true);
    try {
      const unit = formUnit || (attrs.find((a) => a.key === formAttr)?.units?.[0] ?? 'score');
      const res = await fetch('/api/prq/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attribute: formAttr, value: Number(formValue), unit }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(j?.error ?? 'Failed to log entry');
      } else {
        toast.success('Entry logged');
        setShowForm(false);
        loadVector();
      }
    } catch {
      toast.error('Failed to log entry');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedUnits = attrs.find((a) => a.key === formAttr)?.units ?? ['score'];

  return (
    <>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="fel-heading text-[19px] font-bold text-white">PRQ ATTRIBUTES</h2>
          <p className="text-xs text-white/45">
            Performance Readiness Quotient — every value is traceable to its source.
            {prq && ` ${prq.measured}/${prq.total} measured.`}
          </p>
        </div>
        <button
          data-test-ignore="opens-log-form"
          onClick={() => openForm()}
          className="inline-flex items-center gap-1.5 rounded-md border border-[#00E5FF]/40 bg-[#00E5FF]/10 px-3 py-1.5 text-xs font-bold text-[#00E5FF] transition-colors hover:bg-[#00E5FF]/20"
        >
          <Plus className="h-3.5 w-3.5" /> LOG ENTRY
        </button>
      </div>

      {prq && (() => {
        // the same badge every surface prints (lib/prq-display): "PRQ —" until something is measured
        const d = prqDisplay(prq);
        return (
          <div className="mt-3 inline-flex items-center gap-2 rounded-lg border px-4 py-2 font-mono text-lg font-bold" style={{ color: d.color, borderColor: `${d.color}4d`, background: `${d.color}1a` }}>
            {d.label}
            <span className="text-xs font-normal text-white/40">({d.coverage} measured)</span>
          </div>
        );
      })()}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {attrs.map((attr) => {
          const m = attr.measured;
          const val = m?.value ?? null;
          const color = val === null
            ? '#555'
            : val >= 80 ? '#A855F7' : val >= 60 ? '#00E5FF' : val >= 40 ? '#00FF9D' : '#FFD700';
          // 'camera' = a body-camera jump, an estimate: the label says so (lib/prq.ts PRQ_CAMERA_SOURCE)
          const sourceLabel = m?.source === 'drillResult' ? 'Drill' : m?.source === 'device' ? 'Device' : m?.source === 'manual' ? 'Manual' : m?.source === 'camera' ? 'Camera est.' : null;
          return (
            <div key={attr.key} className="fel-card rounded-lg p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white/80">{attr.label}</span>
                {val !== null ? (
                  <span className="font-mono text-sm font-bold" style={{ color }}>
                    {val.toFixed(1)} <span className="text-[10px] text-white/40">{m?.unit}</span>
                  </span>
                ) : (
                  <span className="text-xs italic text-white/30">not measured</span>
                )}
              </div>
              {val !== null && (
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.min(val, 100)}%`, background: `linear-gradient(90deg, ${color}88, ${color})` }}
                  />
                </div>
              )}
              {sourceLabel && (
                <div className="mt-1.5 flex items-center justify-between text-[10px] text-white/30">
                  <span>Source: {sourceLabel}</span>
                  <span>{new Date(m!.measuredAt).toLocaleDateString('en-US', { timeZone: 'UTC' })}</span>
                </div>
              )}
              {val === null && (
                <button
                  onClick={() => openForm(attr.key)}
                  className="mt-2 text-[10px] font-bold text-[#00E5FF]/70 hover:text-[#00E5FF]"
                >
                  + Log measurement
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Manual Entry Form */}
      {showForm && (
        <div className="fel-panel mt-6 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <h3 className="fel-heading text-lg font-bold text-white">LOG PRQ ENTRY</h3>
            <button onClick={() => setShowForm(false)} className="text-white/40 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mb-4 text-xs text-white/40">
            Record a self-measured value. Source is always “Manual.”
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-white/50">Attribute</label>
              <select
                value={formAttr}
                onChange={(e) => { setFormAttr(e.target.value); setFormUnit(''); }}
                className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
              >
                {attrs.map((a) => (
                  <option key={a.key} value={a.key}>{a.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-white/50">Value</label>
              <input
                type="number"
                step="any"
                min="0"
                value={formValue}
                onChange={(e) => setFormValue(e.target.value)}
                placeholder="e.g. 28"
                className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/25"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-white/50">Unit</label>
              <select
                value={formUnit || selectedUnits[0] || 'score'}
                onChange={(e) => setFormUnit(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
              >
                {selectedUnits.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
          </div>
          <button
            onClick={submit}
            disabled={submitting || !formValue}
            className="fel-heading mt-4 flex items-center justify-center gap-2 rounded-md bg-[#00E5FF] px-6 py-2.5 text-sm font-bold text-black transition-all hover:bg-[#00E5FF]/85 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'SAVE ENTRY'}
          </button>
        </div>
      )}
    </>
  );
}
