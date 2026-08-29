'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Loader2, Shirt, Palette, Check, Coins, Sparkles } from 'lucide-react';
import { newIdempotencyKey } from '@/lib/wallet/client';
import { FaceScanCapture } from '@/components/facescan/face-scan-capture';
import { invalidateIdentity } from '@/lib/babylon/core/characterPipeline';
import {
  SKIN_TONES, FACE_SHAPES, HAIR_STYLES, HAIR_COLORS, EYE_SHAPES, EYE_COLORS,
  BROWS, MOUTHS, NOSES, defaultFace, defaultEquipped, WEARABLES, SLOTS,
  wearablesForSlot, getWearable, type FaceConfig, type WearableSlot,
} from '@/lib/closet/wearable-catalog';

type Equipped = Record<WearableSlot, string | null>;
type CardSkin = { id: string; displayName: string; accent: string; rarity: string };

const FREE_ITEMS = new Set(['top_lab', 'shorts_court', 'shoes_flight']);

function Swatch({ color, active, onClick }: { color: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="h-9 w-9 rounded-full border-2 transition"
      style={{ backgroundColor: color, borderColor: active ? '#00E5FF' : 'rgba(255,255,255,0.15)', boxShadow: active ? '0 0 12px #00E5FF' : 'none' }}
      aria-label={color}
    />
  );
}

function Chip({ label, active, onClick, accent = '#00E5FF' }: { label: string; active: boolean; onClick: () => void; accent?: string }) {
  return (
    <button
      onClick={onClick}
      className="rounded-full px-3 py-1.5 text-xs font-medium transition"
      style={{
        backgroundColor: active ? accent : 'rgba(255,255,255,0.05)',
        color: active ? '#050505' : 'rgba(255,255,255,0.75)',
        border: `1px solid ${active ? accent : 'rgba(255,255,255,0.12)'}`,
      }}
    >
      {label}
    </button>
  );
}

/** Lightweight CSS face preview driven by FaceConfig (no 3D dependency here). */
function FacePreview({ face, accent }: { face: FaceConfig; accent: string }) {
  const radius = face.faceShape === 'Round' ? '50%' : face.faceShape === 'Square' ? '22%' : face.faceShape === 'Long' ? '46% 46% 42% 42%' : '46% 46% 50% 50%';
  return (
    <div className="relative mx-auto" style={{ width: 140, height: 168 }}>
      {/* hair back */}
      <div className="absolute left-1/2 top-2 -translate-x-1/2" style={{ width: 128, height: 120, backgroundColor: face.hairColor, borderRadius: '50% 50% 40% 40%', opacity: face.hairStyle === 'Bald' ? 0 : 1 }} />
      {/* face */}
      <div className="absolute left-1/2 top-6 -translate-x-1/2" style={{ width: 104, height: 124, backgroundColor: face.skinTone, borderRadius: radius, boxShadow: `inset -8px -10px 18px rgba(0,0,0,0.25)` }}>
        {/* brows */}
        <div className="absolute" style={{ top: 44, left: 20, width: 22, height: 4, backgroundColor: face.hairColor, borderRadius: 4, transform: face.brows === 'Arched' ? 'rotate(-8deg)' : 'none' }} />
        <div className="absolute" style={{ top: 44, right: 20, width: 22, height: 4, backgroundColor: face.hairColor, borderRadius: 4, transform: face.brows === 'Arched' ? 'rotate(8deg)' : 'none' }} />
        {/* eyes */}
        <div className="absolute" style={{ top: 52, left: 22, width: 18, height: face.eyeShape === 'Monolid' ? 7 : 11, backgroundColor: '#fff', borderRadius: '50%' }}>
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 8, height: 8, borderRadius: '50%', backgroundColor: face.eyeColor }} />
        </div>
        <div className="absolute" style={{ top: 52, right: 22, width: 18, height: face.eyeShape === 'Monolid' ? 7 : 11, backgroundColor: '#fff', borderRadius: '50%' }}>
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 8, height: 8, borderRadius: '50%', backgroundColor: face.eyeColor }} />
        </div>
        {/* nose */}
        <div className="absolute left-1/2 -translate-x-1/2" style={{ top: 66, width: face.nose === 'Wide' ? 16 : 9, height: 22, backgroundColor: 'rgba(0,0,0,0.10)', borderRadius: '40% 40% 50% 50%' }} />
        {/* mouth */}
        <div className="absolute left-1/2 -translate-x-1/2" style={{ top: 96, width: face.mouth === 'Wide' ? 42 : face.mouth === 'Full' ? 34 : 28, height: face.mouth === 'Full' ? 10 : 6, backgroundColor: '#c0596b', borderRadius: 8 }} />
      </div>
      {/* hair front accent for styles */}
      {face.hairStyle !== 'Bald' && (
        <div className="absolute left-1/2 top-3 -translate-x-1/2" style={{ width: 110, height: 34, backgroundColor: face.hairColor, borderRadius: '50% 50% 30% 30%' }} />
      )}
      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: accent, color: '#050505' }}>{face.hairStyle}</div>
    </div>
  );
}

export function ClosetView() {
  const [face, setFace] = useState<FaceConfig>(defaultFace());
  const [equipped, setEquipped] = useState<Equipped>(defaultEquipped());
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [skins, setSkins] = useState<CardSkin[]>([]);
  const [skinCardId, setSkinCardId] = useState<string | null>(null);
  const [tab, setTab] = useState<'face' | 'wear' | 'skins'>('face');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [buying, setBuying] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/v1/closet');
        const j = await res.json();
        if (res.ok) {
          setFace({ ...defaultFace(), ...(j.look?.face ?? {}) });
          setEquipped({ ...defaultEquipped(), ...(j.look?.equipped ?? {}) });
          setOwned(new Set<string>(j.owned ?? []));
          setSkins(j.skins ?? []);
          setSkinCardId(j.look?.skinCardId ?? null);
        }
      } catch { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, []);

  const accent = useMemo(() => skins.find((s) => s.id === skinCardId)?.accent || '#00E5FF', [skins, skinCardId]);
  const setF = (k: keyof FaceConfig, v: string) => setFace((p) => ({ ...p, [k]: v }));

  const canEquip = (itemId: string) => owned.has(itemId) || FREE_ITEMS.has(itemId);

  const buy = async (itemId: string) => {
    const w = getWearable(itemId);
    if (!w) return;
    setBuying(itemId);
    try {
      const res = await fetch('/api/v1/closet/buy', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, idempotency_key: newIdempotencyKey() }),
      });
      const j = await res.json();
      if (res.status === 409) { toast.error('Not enough coins. Top up in the Wallet.'); return; }
      if (!res.ok) throw new Error(j?.error || 'buy failed');
      setOwned((p) => new Set(p).add(itemId));
      toast.success(`${w.name} unlocked!`);
    } catch (e: any) { toast.error(e?.message || 'Purchase failed'); }
    finally { setBuying(null); }
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/v1/closet', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ face, equipped, skinCardId }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'save failed');
      invalidateIdentity(); // next spawn picks up the new look everywhere
      toast.success('Look saved — this is how you appear across the Lab.');
    } catch (e: any) { toast.error(e?.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-cyan-400" /></div>;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-5">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-white"><Shirt className="h-6 w-6 text-cyan-400" /> Closet</h1>
        <p className="text-sm text-white/50">Design your avatar&apos;s face, gear, and card skin. Everyone belongs here — the options are built to represent you.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-[260px_1fr]">
        {/* preview column */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <FacePreview face={face} accent={accent} />
          <div className="mt-5 space-y-1.5 text-xs text-white/60">
            {SLOTS.map((slot) => {
              const it = equipped[slot] ? getWearable(equipped[slot]!) : null;
              return (
                <div key={slot} className="flex items-center justify-between">
                  <span className="capitalize text-white/40">{slot}</span>
                  <span className="font-medium text-white/80">{it?.name ?? '—'}</span>
                </div>
              );
            })}
          </div>
          <button onClick={save} disabled={saving} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 py-2.5 text-sm font-bold text-black transition hover:bg-cyan-300 disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save Look
          </button>
        </div>

        {scanning && (
          <FaceScanCapture
            onClose={() => setScanning(false)}
            onResult={(partial) => {
              setFace((p) => ({ ...p, ...partial }));
              setScanning(false);
              setTab('face');
              toast.success('Avatar built from your scan — review and Save Look.');
            }}
          />
        )}
        {/* editor column */}
        <div>
          <div className="mb-4 flex gap-2">
            <Chip label="Face" active={tab === 'face'} onClick={() => setTab('face')} />
            <Chip label="Wearables" active={tab === 'wear'} onClick={() => setTab('wear')} />
            <Chip label="Card Skins" active={tab === 'skins'} onClick={() => setTab('skins')} accent="#A855F7" />
          </div>

          {tab === 'face' && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
              <button onClick={() => setScanning(true)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-400/40 bg-cyan-400/10 py-2.5 text-sm font-bold text-cyan-300 transition hover:bg-cyan-400/20">
                <Sparkles className="h-4 w-4" /> Scan My Face
              </button>
              <p className="-mt-3 text-[11px] leading-relaxed text-white/40">Auto-build your avatar from your camera or a photo. Runs entirely in your browser — nothing is uploaded. You can fine-tune every option below afterwards.</p>
              <Group title="Skin Tone"><div className="flex flex-wrap gap-2">{SKIN_TONES.map((c) => <Swatch key={c} color={c} active={face.skinTone === c} onClick={() => setF('skinTone', c)} />)}</div></Group>
              <Group title="Face Shape"><div className="flex flex-wrap gap-2">{FACE_SHAPES.map((s) => <Chip key={s} label={s} active={face.faceShape === s} onClick={() => setF('faceShape', s)} />)}</div></Group>
              <Group title="Hair Style"><div className="flex flex-wrap gap-2">{HAIR_STYLES.map((s) => <Chip key={s} label={s} active={face.hairStyle === s} onClick={() => setF('hairStyle', s)} />)}</div></Group>
              <Group title="Hair Color"><div className="flex flex-wrap gap-2">{HAIR_COLORS.map((c) => <Swatch key={c} color={c} active={face.hairColor === c} onClick={() => setF('hairColor', c)} />)}</div></Group>
              <Group title="Eye Shape"><div className="flex flex-wrap gap-2">{EYE_SHAPES.map((s) => <Chip key={s} label={s} active={face.eyeShape === s} onClick={() => setF('eyeShape', s)} />)}</div></Group>
              <Group title="Eye Color"><div className="flex flex-wrap gap-2">{EYE_COLORS.map((c) => <Swatch key={c} color={c} active={face.eyeColor === c} onClick={() => setF('eyeColor', c)} />)}</div></Group>
              <Group title="Brows"><div className="flex flex-wrap gap-2">{BROWS.map((s) => <Chip key={s} label={s} active={face.brows === s} onClick={() => setF('brows', s)} />)}</div></Group>
              <Group title="Mouth"><div className="flex flex-wrap gap-2">{MOUTHS.map((s) => <Chip key={s} label={s} active={face.mouth === s} onClick={() => setF('mouth', s)} />)}</div></Group>
              <Group title="Nose"><div className="flex flex-wrap gap-2">{NOSES.map((s) => <Chip key={s} label={s} active={face.nose === s} onClick={() => setF('nose', s)} />)}</div></Group>
            </motion.div>
          )}

          {tab === 'wear' && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              {SLOTS.map((slot) => (
                <div key={slot}>
                  <h3 className="mb-2 text-sm font-semibold capitalize text-white/80">{slot}</h3>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <button onClick={() => setEquipped((p) => ({ ...p, [slot]: null }))} className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-left text-xs text-white/50 transition hover:border-white/25">None</button>
                    {wearablesForSlot(slot).map((w) => {
                      const isOwned = canEquip(w.itemId);
                      const isOn = equipped[slot] === w.itemId;
                      return (
                        <div key={w.itemId} className="rounded-xl border p-3 transition" style={{ borderColor: isOn ? w.accent : 'rgba(255,255,255,0.1)', backgroundColor: isOn ? `${w.accent}18` : 'rgba(255,255,255,0.02)' }}>
                          <div className="mb-2 h-10 rounded-lg" style={{ background: `linear-gradient(135deg, ${w.accent}, transparent)` }} />
                          <div className="text-xs font-semibold text-white">{w.name}</div>
                          {isOwned ? (
                            <button onClick={() => setEquipped((p) => ({ ...p, [slot]: w.itemId }))} className="mt-2 w-full rounded-lg py-1.5 text-[11px] font-bold" style={{ backgroundColor: isOn ? w.accent : 'rgba(255,255,255,0.08)', color: isOn ? '#050505' : '#fff' }}>{isOn ? 'Equipped' : 'Equip'}</button>
                          ) : (
                            <button onClick={() => buy(w.itemId)} disabled={buying === w.itemId} className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg bg-yellow-400/90 py-1.5 text-[11px] font-bold text-black disabled:opacity-60">
                              {buying === w.itemId ? <Loader2 className="h-3 w-3 animate-spin" /> : <Coins className="h-3 w-3" />} {w.coinPrice}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </motion.div>
          )}

          {tab === 'skins' && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <p className="mb-3 flex items-center gap-2 text-sm text-white/60"><Sparkles className="h-4 w-4 text-purple-400" /> Apply one of your Creator Cards as your avatar&apos;s aura skin.</p>
              {skins.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 text-center text-sm text-white/50">No Creator Cards yet. Build one from the Cards tab to unlock card skins.</div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <button onClick={() => setSkinCardId(null)} className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-left text-xs text-white/50 transition hover:border-white/25">No skin</button>
                  {skins.map((s) => {
                    const on = skinCardId === s.id;
                    return (
                      <button key={s.id} onClick={() => setSkinCardId(s.id)} className="rounded-xl border p-4 text-left transition" style={{ borderColor: on ? s.accent : 'rgba(255,255,255,0.1)', backgroundColor: on ? `${s.accent}18` : 'rgba(255,255,255,0.02)' }}>
                        <div className="mb-2 h-12 rounded-lg" style={{ background: `linear-gradient(135deg, ${s.accent}, transparent)` }} />
                        <div className="text-xs font-semibold text-white">{s.displayName}</div>
                        <div className="text-[10px] uppercase text-white/40">{s.rarity}</div>
                        {on && <div className="mt-1 text-[10px] font-bold" style={{ color: s.accent }}>Applied</div>}
                      </button>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-white/80"><Palette className="h-3.5 w-3.5 text-cyan-400" /> {title}</h3>
      {children}
    </div>
  );
}
