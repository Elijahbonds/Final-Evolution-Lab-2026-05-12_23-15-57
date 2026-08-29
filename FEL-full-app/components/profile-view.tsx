'use client';

import { useEffect, useState } from 'react';
import { MasteryBadge } from '@/components/mastery-badge';
import { motion } from 'framer-motion';
import { PRQ_ATTRS } from '@/lib/prq';
import { ROSTER } from '@/lib/game-data';
import { AvatarFigure } from '@/components/avatar-figure';
import { Flame, Sparkles, Coins, Gem, Check, Plus, X, Loader2, Download, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const ATTR_LABELS: Record<string, string> = {
  strength: 'Strength',
  speed: 'Speed',
  endurance: 'Endurance',
  agility: 'Agility',
  power: 'Power',
  flexibility: 'Flexibility',
  recovery: 'Recovery',
  mental: 'Mental',
};

export function ProfileView({ userName, email }: { userName: string; email: string }) {
  const [data, setData] = useState<any>(null);
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
      if (j?.profile) setData(j);
    } catch {}
    setSaving(null);
  };

  useEffect(() => {
    let live = true;
    fetch('/api/profile')
      .then((r) => (r?.ok ? r.json() : null))
      .then((j) => {
        if (live && j?.profile) setData(j);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const grade = data?.grade;
  const p = data?.profile;
  const currentAvatar = ROSTER.find((r) => r.key === p?.avatarKey) ?? null;

  return (
    <main className="mx-auto max-w-[900px] px-4 py-6">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="fel-panel rounded-xl p-6">
        <div className="flex flex-wrap items-center gap-5">
          <div
            className="flex h-20 w-20 items-center justify-center rounded-full border-2 text-3xl font-bold fel-heading"
            style={{ borderColor: grade?.color ?? '#00E5FF', color: grade?.color ?? '#00E5FF', boxShadow: `0 0 28px ${grade?.color ?? '#00E5FF'}44` }}
          >
            {currentAvatar ? <AvatarFigure avatar={currentAvatar} size={54} cosmeticAssetId={p?.cosmeticAssetId} /> : (userName?.[0] ?? 'A').toUpperCase()}
          </div>
          <div>
            <h1 className="fel-heading text-3xl font-bold text-white">{userName}</h1>
            <p className="font-mono text-xs text-white/70">{email}</p>
            {currentAvatar && (
              <p className="fel-heading text-sm font-bold" style={{ color: currentAvatar.accent }}>{currentAvatar.name.toUpperCase()}</p>
            )}
            {grade && (
              <span
                className="fel-heading mt-2 inline-block rounded px-2.5 py-0.5 text-sm font-bold"
                style={{ background: `${grade?.color}1c`, color: grade?.color, border: `1px solid ${grade?.color}55` }}
              >
                {grade?.label} · PRQ {Math.round(data?.prq ?? 0)}
              </span>
            )}
          </div>
          <div className="ml-auto grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
            {[
              { icon: Coins, label: 'Credits', value: p?.labCredits, color: '#FFD700' },
              { icon: Sparkles, label: 'XP', value: p?.xp, color: '#00FF9D' },
              { icon: Gem, label: 'Shards', value: p?.shards, color: '#A855F7' },
              { icon: Flame, label: 'Streak', value: p?.streakDays, color: '#FF3366' },
            ].map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.label} className="text-center">
                  <div className="flex items-center justify-center gap-1 font-mono text-xl font-bold" style={{ color: s.color }}>
                    <Icon className="h-4 w-4" />
                    {s.value ?? '–'}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-white/70">{s.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      </motion.div>

      <h2 className="fel-heading mt-8 text-2xl font-bold text-white">SELECT YOUR ATHLETE</h2>
      <p className="text-xs text-white/45">Pick the body type you're building toward. Your athlete shows up across the Lab.</p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {ROSTER.map((r, i) => {
          const selected = p?.avatarKey === r.key;
          return (
            <motion.button
              key={r.key}
              initial={{ y: 10 }}
              animate={{ y: 0 }}
              transition={{ delay: 0.03 * i }}
              onClick={() => selectAvatar(r.key)}
              disabled={!!saving}
              className={`fel-card relative rounded-lg p-3 text-left transition-all ${selected ? '' : 'opacity-95 hover:opacity-100'}`}
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
            </motion.button>
          );
        })}
      </div>

      <MasteryPanel />
      <PrqFoundation />
      <PrqDataRights />
    </main>
  );
}

// ---------------------------------------------------------------------------
// M13.3 Mastery panel — per-mode graded ladder badges (never decay)
// ---------------------------------------------------------------------------
function MasteryPanel() {
  const [map, setMap] = useState<Record<string, { tier: string; tierIndex: number }>>({});
  useEffect(() => {
    let live = true;
    fetch('/api/mastery')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (live && j?.mastery) setMap(j.mastery); })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  const entries = Object.entries(map).filter(([, v]) => v.tierIndex > 0);
  return (
    <>
      <h2 className="fel-heading mt-8 text-2xl font-bold text-white">MODE MASTERY</h2>
      <p className="text-xs text-white/45">Earned on a rolling window of your best sessions per mode. Tiers never decay.</p>
      {entries.length === 0 ? (
        <p className="mt-4 rounded-lg border border-white/10 bg-white/[0.02] p-4 text-sm text-white/40">
          No mastery tiers yet — play any mode a few times to start climbing Bronze → Venice Legend.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {entries.map(([mode, v]) => (
            <div key={mode} className="fel-card flex items-center justify-between rounded-lg p-3">
              <span className="fel-heading text-sm font-bold uppercase text-white/80">{mode}</span>
              <MasteryBadge tierIndex={v.tierIndex} />
            </div>
          ))}
        </div>
      )}
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

function PrqDataRights() {
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
        toast.success(`Deleted ${j.deleted ?? 0} PRQ entries`);
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
      <p className="text-xs text-white/40 mb-4">
        Export or delete your PRQ measurement data at any time.
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
            <Trash2 className="h-3.5 w-3.5" /> DELETE ALL PRQ DATA
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#FF3366]">Are you sure? This is permanent.</span>
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

function PrqFoundation() {
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
          <h2 className="fel-heading text-2xl font-bold text-white">PRQ ATTRIBUTES</h2>
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

      {prq && (
        <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[#A855F7]/30 bg-[#A855F7]/10 px-4 py-2 font-mono text-lg font-bold text-[#A855F7]">
          PRQ {prq.score.toFixed(1)}
          <span className="text-xs font-normal text-white/40">
            ({prq.measured}/{prq.total} measured)
          </span>
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {attrs.map((attr, i) => {
          const m = attr.measured;
          const val = m?.value ?? null;
          const color = val === null
            ? '#555'
            : val >= 80 ? '#A855F7' : val >= 60 ? '#00E5FF' : val >= 40 ? '#00FF9D' : '#FFD700';
          const sourceLabel = m?.source === 'drillResult' ? 'Drill' : m?.source === 'device' ? 'Device' : m?.source === 'manual' ? 'Manual' : null;
          return (
            <motion.div
              key={attr.key}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.04 * i }}
              className="fel-card rounded-lg p-4"
            >
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
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(val, 100)}%` }}
                    transition={{ duration: 0.8, delay: 0.1 + 0.04 * i }}
                    className="h-full rounded-full"
                    style={{ background: `linear-gradient(90deg, ${color}88, ${color})`, boxShadow: `0 0 10px ${color}66` }}
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
            </motion.div>
          );
        })}
      </div>

      {/* Manual Entry Form */}
      {showForm && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="fel-panel mt-6 rounded-xl p-5"
        >
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
        </motion.div>
      )}
    </>
  );
}
