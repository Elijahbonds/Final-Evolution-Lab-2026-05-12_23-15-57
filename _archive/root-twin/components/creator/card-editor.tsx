'use client';

/**
 * components/creator/card-editor.tsx — owner-only Creator Card editor.
 *
 * Lets a player create/edit the cosmetic fields of their card and publish it.
 * Stats + rarity are computed server-side; the editor only shows them.
 */

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Save, Share2, Eye, EyeOff, Copy, Check } from 'lucide-react';
import { MP_MODES } from '@/lib/mp/match-core';
import { CreatorCard, type CreatorCardData } from './creator-card';

export function CardEditor() {
  const [card, setCard] = useState<CreatorCardData | null>(null);
  const [published, setPublished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const [displayName, setDisplayName] = useState('');
  const [tagline, setTagline] = useState('');
  const [signatureMove, setSignatureMove] = useState('');
  const [mode, setMode] = useState(MP_MODES[0].key);
  const [accent, setAccent] = useState('#00E5FF');
  const [avatarUrl, setAvatarUrl] = useState('');

  const hydrate = (c: CreatorCardData | null, pub?: boolean) => {
    if (!c) return;
    setCard(c);
    setDisplayName(c.displayName ?? '');
    setTagline(c.tagline ?? '');
    setSignatureMove(c.signatureMove ?? '');
    setMode(c.mode ?? MP_MODES[0].key);
    setAccent(c.accent ?? '#00E5FF');
    setAvatarUrl(c.avatarUrl ?? '');
    if (typeof pub === 'boolean') setPublished(pub);
  };

  useEffect(() => {
    fetch('/api/v1/card')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.card) { hydrate(d.card); setPublished(Boolean(d.card.published)); } })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/v1/card', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, tagline, signatureMove, mode, accent, avatarUrl: avatarUrl || null }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(d?.error === 'invalid_accent' ? 'Accent must be a hex color like #00E5FF' : 'Could not save card'); return; }
      hydrate(d.card, d.card?.published);
      toast.success('Card saved. Stats synced from your sessions.');
    } finally { setBusy(false); }
  };

  const togglePublish = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const next = !published;
      const res = await fetch('/api/v1/card/publish', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ published: next }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(d?.error === 'no_card' ? 'Save your card first' : 'Could not update visibility'); return; }
      setPublished(next);
      toast.success(next ? 'Card is now public — share the link!' : 'Card hidden from the public.');
    } finally { setBusy(false); }
  };

  const shareUrl = card ? `${typeof window !== 'undefined' ? window.location.origin : ''}/card/${card.slug}` : '';
  const copy = () => {
    if (!shareUrl) return;
    navigator.clipboard?.writeText(shareUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); }).catch(() => {});
  };

  if (loading) {
    return <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-white/50"><Loader2 className="h-4 w-4 animate-spin" /> Loading your card…</div>;
  }

  const preview: CreatorCardData = {
    slug: card?.slug ?? 'preview',
    displayName: displayName || 'Athlete',
    tagline, mode, rarity: card?.rarity ?? 'common', accent,
    avatarUrl: avatarUrl || null,
    prq: card?.prq ?? 0, topScore: card?.topScore ?? 0, wins: card?.wins ?? 0,
    signatureMove,
  };

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* editor */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h3 className="fel-heading text-lg font-bold text-white">Your Creator Card</h3>
        <p className="mt-1 text-xs text-white/50">Customize the look. PRQ, top score and wins sync from your real sessions.</p>

        <Field label="Display name">
          <input value={displayName} maxLength={40} onChange={(e) => setDisplayName(e.target.value)} className="fel-input" placeholder="Your athlete name" />
        </Field>
        <Field label="Tagline">
          <input value={tagline} maxLength={90} onChange={(e) => setTagline(e.target.value)} className="fel-input" placeholder="Short signature line" />
        </Field>
        <Field label="Signature move">
          <input value={signatureMove} maxLength={40} onChange={(e) => setSignatureMove(e.target.value)} className="fel-input" placeholder="e.g. 720 Windmill" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Signature mode">
            <select value={mode} onChange={(e) => setMode(e.target.value)} className="fel-input">
              {MP_MODES.map((m) => <option key={m.key} value={m.key} className="bg-[#0a0a0a]">{m.label}</option>)}
            </select>
          </Field>
          <Field label="Accent color">
            <div className="flex items-center gap-2">
              <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(accent) ? accent : '#00E5FF'} onChange={(e) => setAccent(e.target.value)} className="h-10 w-12 cursor-pointer rounded-lg border border-white/10 bg-transparent" />
              <input value={accent} maxLength={7} onChange={(e) => setAccent(e.target.value)} className="fel-input" placeholder="#00E5FF" />
            </div>
          </Field>
        </div>
        <Field label="Avatar image URL (optional)">
          <input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} className="fel-input" placeholder="https://cdn.pixabay.com/photo/2019/08/11/18/59/icon-4399701_640.png" />
        </Field>

        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={save} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-[#A855F7] px-5 py-3 font-bold text-white transition-transform hover:scale-[1.03] disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save card
          </button>
          <button onClick={togglePublish} disabled={busy || !card} className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-5 py-3 font-semibold text-white transition-colors hover:border-white/30 disabled:opacity-50">
            {published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{published ? 'Unpublish' : 'Publish'}
          </button>
        </div>

        {card && published && (
          <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-3">
            <div className="flex items-center gap-2 text-xs text-white/60"><Share2 className="h-3.5 w-3.5" /> Public link</div>
            <div className="mt-2 flex gap-2">
              <input readOnly value={shareUrl} className="fel-input flex-1 text-xs" />
              <button onClick={copy} className="inline-flex items-center gap-1 rounded-xl bg-white/10 px-3 text-sm text-white hover:bg-white/20">
                {copied ? <Check className="h-4 w-4 text-[#00FF9D]" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* live preview */}
      <div className="flex flex-col items-center justify-start">
        <span className="mb-3 font-mono text-[11px] uppercase tracking-widest text-white/40">Live preview</span>
        <CreatorCard card={preview} />
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-3">
      <label className="font-mono text-[11px] uppercase tracking-wider text-white/50">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
