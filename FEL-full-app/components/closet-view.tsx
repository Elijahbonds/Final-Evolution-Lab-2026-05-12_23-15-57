'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Loader2, Shirt, Palette, Check, Coins, Sparkles, Undo2, Redo2, Shuffle, Lock, Unlock } from 'lucide-react';
import { newIdempotencyKey } from '@/lib/wallet/client';
import { FaceScanCapture } from '@/components/facescan/face-scan-capture';
import { LookConsent } from '@/components/creator/look-consent';
import { readConsent, readLocalLook, writeConsent, writeLocalLook, type StoredConsent } from '@/lib/creator/localLook';
import { closetSaveRequest, decideLookHold } from '@/lib/creator/lookPrivacy';
import { invalidateIdentity } from '@/lib/babylon/core/characterPipeline';
import { canEquip as canEquipItem } from '@/lib/closet/ownership';
import {
  SKIN_TONES, FACE_SHAPES, HAIR_STYLES, HAIR_COLORS, EYE_SHAPES, EYE_COLORS,
  BROWS, MOUTHS, NOSES, defaultFace, defaultEquipped, defaultJersey, sanitizeJersey, SLOTS,
  wearablesForSlot, getWearable, type FaceConfig, type WearableSlot, type JerseyConfig,
} from '@/lib/closet/wearable-catalog';
import { faceFieldRenders, faceOptionRenders, type FaceField } from '@/lib/babylon/core/faceMorphs';
import { accessoriesForEquipped, wornPartsForEquipped } from '@/lib/closet/wearableAccessories';
import { emptyCreatorDoc, type ColourSlot, type CreatorPart } from '@/lib/creator/look/doc';
import { readCreatorDoc, faceOnly, type StoredFace } from '@/lib/creator/look/storage';
import { effectivePalette } from '@/lib/creator/look/palette';
import { canRedo, canUndo, createHistory, pushHistory, redo, resetHistory, undo, type History } from '@/lib/creator/look/history';
import { RANDOM_SECTIONS, RANDOM_SECTION_FIELDS, randomiseLook, type RandomSection } from '@/lib/creator/look/randomise';

// The 3D preview is client-only (Babylon engine on a canvas) — never SSR it.
const AvatarPreview = dynamic(() => import('@/components/closet/avatar-preview'), { ssr: false });
// CREATOR-PLAN phase 2: the Parts tab (place generic shapes on any bone).
const PartsTab = dynamic(() => import('@/components/closet/parts-tab').then((m) => m.PartsTab), { ssr: false });

type Equipped = Record<WearableSlot, string | null>;
type CardSkin = { id: string; displayName: string; accent: string; rarity: string };

// The free starters come from lib/closet/ownership.ts — the server decides entitlement and this screen
// must not hold a second opinion about it.

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

/** Phase 3 fine-tune sliders — names are the forge's morph targets. */
const FACE_SLIDERS: [string, string][] = [
  ['faceLong', 'Length'], ['faceRound', 'Roundness'], ['faceSquare', 'Jaw'],
  ['faceHeart', 'Heart'], ['faceDiamond', 'Cheekbones'], ['jawOpen', 'Jaw open'], ['browRaise', 'Brow'],
];

/** IMPROVE (2026-10-06): options with no 3D effect yet say so (faceMorphs.faceOptionRenders), instead of pretending. */
const SOON = '3D coming soon — shows in the sketch only';

export function ClosetView({ adult = false }: { adult?: boolean }) {
  // IMPROVE (2026-10-06), CREATOR-PLAN phase 1: the face (and the Creator doc inside it, face.creator) is an undo
  // history. `setFace` records a step; a slider or colour drag passes a group so the whole drag is one step.
  const [hist, setHist] = useState<History<StoredFace>>(() => createHistory<StoredFace>(defaultFace()));
  const face = hist.present;
  const setFace = (next: StoredFace | ((p: StoredFace) => StoredFace), group?: string) =>
    setHist((h) => pushHistory(h, typeof next === 'function' ? next(h.present) : next, group));
  const loadFace = (next: StoredFace) => setHist((h) => resetHistory(h, next));
  const [locks, setLocks] = useState<RandomSection[]>([]);
  const [equipped, setEquipped] = useState<Equipped>(defaultEquipped());
  const [jersey, setJersey] = useState<JerseyConfig>(defaultJersey());
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [skins, setSkins] = useState<CardSkin[]>([]);
  const [skinCardId, setSkinCardId] = useState<string | null>(null);
  const [tab, setTab] = useState<'face' | 'parts' | 'wear' | 'skins'>('face');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [buying, setBuying] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [consent, setConsent] = useState<StoredConsent>({ saveLookNumbers: false, modelTraining: false });
  const hydrated = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/v1/closet');
        const j = await res.json();
        const savedConsent = readConsent();
        const hold = decideLookHold(adult, savedConsent.saveLookNumbers, savedConsent.modelTraining);
        const local = readLocalLook();
        setConsent(savedConsent);
        if (res.ok) {
          let nextFace: FaceConfig = { ...defaultFace(), ...(j.look?.face ?? {}) };
          // The server copy is whatever the hold allowed. The device copy wins for the rest.
          if (!hold.uploadLook && local?.face) nextFace = { ...local.face };
          else if (local?.face?.sliders && !hold.uploadNumbers) nextFace = { ...nextFace, sliders: { ...local.face.sliders } };
          loadFace(nextFace);
          const serverEquipped = { ...defaultEquipped(), ...(j.look?.equipped ?? {}) };
          setEquipped(!hold.uploadLook && local?.equipped ? { ...defaultEquipped(), ...local.equipped } : serverEquipped);
          setOwned(new Set<string>(j.owned ?? []));
          setSkins(j.skins ?? []);
          setSkinCardId(j.look?.skinCardId ?? null);
          setJersey(!hold.uploadLook && local?.jersey ? sanitizeJersey(local.jersey) : sanitizeJersey(j.look?.jersey ?? defaultJersey()));
        } else if (local?.face && !hold.uploadLook) {
          loadFace({ ...local.face });
        }
      } catch { /* ignore */ }
      finally { hydrated.current = true; setLoading(false); }
    })();
  }, [adult]);

  // The look the server is not allowed to keep still has to survive a refresh.
  useEffect(() => {
    if (!hydrated.current || loading) return;
    writeLocalLook({ ...(readLocalLook() ?? {}), face, equipped, jersey });
  }, [face, equipped, jersey, loading]);

  const accent = useMemo(() => skins.find((s) => s.id === skinCardId)?.accent || '#00E5FF', [skins, skinCardId]);
  // Draft palette — the same mapping resolveIdentity() applies at spawn time,
  // so the preview and the game can never disagree about what a wearable does.
  const doc = useMemo(() => readCreatorDoc(face), [face]);
  const itemPalette = useMemo(() => ({
    jersey: (equipped.tops && getWearable(equipped.tops)?.accent) || '#00E5FF',
    shorts: (equipped.shorts && getWearable(equipped.shorts)?.accent) || '#0b1220',
    shoes: (equipped.shoes && getWearable(equipped.shoes)?.accent) || '#A855F7',
    accent,
  }), [equipped, accent]);
  // the Creator doc's colours win, exactly as resolveIdentity does at spawn
  const previewPalette = useMemo(() => effectivePalette(itemPalette, doc?.colours), [itemPalette, doc]);
  const previewAccessories = useMemo(() => accessoriesForEquipped(equipped), [equipped]);
  const previewWornParts = useMemo(() => wornPartsForEquipped(equipped), [equipped]);
  const previewFace = useMemo(() => faceOnly(face) as FaceConfig, [face]);
  const setF = (k: keyof FaceConfig, v: string) => setFace((p) => ({ ...p, [k]: v }));
  const setSlider = (k: string, v: number) => setFace((p) => ({ ...p, sliders: { ...(p.sliders ?? {}), [k]: v } }), `slider:${k}`);
  /** One kit colour on the Creator doc; null hands the slot back to the equipped item's own colour. */
  const setKitColour = (slot: ColourSlot, hex: string | null) => setFace((p) => {
    const d = readCreatorDoc(p) ?? emptyCreatorDoc();
    const colours = { ...d.colours };
    if (hex) colours[slot] = hex.toUpperCase(); else delete colours[slot];
    return { ...p, creator: { ...d, colours } };
  }, hex ? `colour:${slot}` : undefined);
  /** The Creator doc's parts (CREATOR-PLAN phase 2). A drag passes a group so it is one undo step. */
  const setParts = (next: CreatorPart[], group?: string) => setFace((p) => {
    const d = readCreatorDoc(p) ?? emptyCreatorDoc();
    return { ...p, creator: { ...d, parts: next } };
  }, group);
  const roll = () => setFace((p) => {
    const r = randomiseLook({ face: faceOnly(p) as FaceConfig, doc: readCreatorDoc(p) }, locks);
    return { ...p, ...r.face, ...(r.doc ? { creator: r.doc } : {}) };
  });
  // Ctrl/Cmd+Z undoes, Shift+Ctrl/Cmd+Z or Ctrl+Y redoes — not while typing in a field (the jersey plate has its own).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); setHist(undo); }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); setHist(redo); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const canEquip = (itemId: string) => canEquipItem(itemId, owned);

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
        body: JSON.stringify(closetSaveRequest({
          adult, face, equipped, skinCardId, jersey,
          saveLookNumbers: consent.saveLookNumbers, modelTraining: consent.modelTraining,
        })),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'save failed');
      writeConsent(consent);
      writeLocalLook({ ...(readLocalLook() ?? {}), face, equipped, jersey });
      invalidateIdentity(); // next spawn picks up the new look everywhere
      toast.success(adult
        ? 'Look saved — this is how you appear across the Lab.'
        : 'Saved on this device. Your look was not uploaded.');
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
        <div className="mt-3 max-w-xl">
          <LookConsent adult={adult} consent={consent} onChange={(next) => { setConsent(next); writeConsent(next); }} />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[260px_1fr]">
        {/* preview column */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          {/* The actual game model (forged fel-hero) wearing the draft look —
              what you design here is what spawns in every mode. */}
          <AvatarPreview face={previewFace} palette={previewPalette} jersey={jersey} wardrobe={{ tops: equipped.tops ?? null, shorts: equipped.shorts ?? null, shoes: equipped.shoes ?? null }} accessories={previewAccessories} creator={doc} wornParts={previewWornParts} />
          <div className="mt-3">
            <FacePreview face={face} accent={accent} />
          </div>
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
          {(jersey.name || jersey.number > 0) && (
            <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-center">
              <div className="font-mono text-lg font-black tracking-widest text-white">{jersey.number}</div>
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/60">{jersey.name || '—'}</div>
              <div className="mt-0.5 text-[9px] uppercase tracking-wider text-white/30">jersey back</div>
            </div>
          )}
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
              toast.success(adult
                ? 'Avatar built from your scan — review and Save Look.'
                : 'Built on this device. Your look is not uploaded.');
            }}
          />
        )}
        {/* editor column */}
        <div>
          <div className="mb-4 flex gap-2">
            <Chip label="Face" active={tab === 'face'} onClick={() => setTab('face')} />
            <Chip label="Parts" active={tab === 'parts'} onClick={() => setTab('parts')} />
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
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <button type="button" onClick={() => setHist(undo)} disabled={!canUndo(hist)} aria-label="Undo" title="Undo (Ctrl+Z)"
                  className="flex items-center gap-1 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs text-white/80 transition hover:bg-white/10 disabled:opacity-30"><Undo2 className="h-3.5 w-3.5" /> Undo</button>
                <button type="button" onClick={() => setHist(redo)} disabled={!canRedo(hist)} aria-label="Redo" title="Redo (Shift+Ctrl+Z)"
                  className="flex items-center gap-1 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs text-white/80 transition hover:bg-white/10 disabled:opacity-30"><Redo2 className="h-3.5 w-3.5" /> Redo</button>
                <button type="button" onClick={roll} disabled={locks.length === RANDOM_SECTIONS.length}
                  className="flex items-center gap-1 rounded-lg bg-cyan-400/15 px-2.5 py-1.5 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-400/25 disabled:opacity-30"><Shuffle className="h-3.5 w-3.5" /> Randomise</button>
                <div className="flex flex-wrap gap-1.5">
                  {RANDOM_SECTIONS.map((sec) => {
                    const on = locks.includes(sec);
                    return (
                      <button key={sec} type="button" title={`${on ? 'Locked' : 'Unlocked'}: ${RANDOM_SECTION_FIELDS[sec]}`} aria-pressed={on}
                        onClick={() => setLocks((l) => (on ? l.filter((x) => x !== sec) : [...l, sec]))}
                        className="flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] capitalize transition"
                        style={{ borderColor: on ? '#FFD700' : 'rgba(255,255,255,0.12)', color: on ? '#FFD700' : 'rgba(255,255,255,0.6)' }}>
                        {on ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />} {sec}
                      </button>
                    );
                  })}
                </div>
              </div>
              <Group title="Skin Tone"><div className="flex flex-wrap gap-2">{SKIN_TONES.map((c) => <Swatch key={c} color={c} active={face.skinTone === c} onClick={() => setF('skinTone', c)} />)}</div></Group>
              <Group title="Face Shape"><div className="flex flex-wrap gap-2">{FACE_SHAPES.map((s) => <Chip key={s} label={s} active={face.faceShape === s} onClick={() => setF('faceShape', s)} />)}</div></Group>
              <Group title="Hair Style"><div className="flex flex-wrap gap-2">{HAIR_STYLES.map((s) => <Chip key={s} label={s} active={face.hairStyle === s} onClick={() => setF('hairStyle', s)} />)}</div></Group>
              <Group title="Hair Color"><div className="flex flex-wrap gap-2">{HAIR_COLORS.map((c) => <Swatch key={c} color={c} active={face.hairColor === c} onClick={() => setF('hairColor', c)} />)}</div></Group>
              <Group title="Eye Shape" soon={soonField('eyeShape', EYE_SHAPES)}><div className="flex flex-wrap gap-2">{EYE_SHAPES.map((s) => <Chip key={s} label={s} active={face.eyeShape === s} onClick={() => setF('eyeShape', s)} />)}</div></Group>
              <Group title="Eye Color" soon={soonField('eyeColor', EYE_COLORS)}><div className="flex flex-wrap gap-2">{EYE_COLORS.map((c) => <Swatch key={c} color={c} active={face.eyeColor === c} onClick={() => setF('eyeColor', c)} />)}</div></Group>
              <Group title="Brows" soon={soonField('brows', BROWS)}>
                <div className="flex flex-wrap gap-2">{BROWS.map((s) => <Chip key={s} label={faceOptionRenders('brows', s) ? s : `${s} · soon`} active={face.brows === s} onClick={() => setF('brows', s)} />)}</div>
                {faceFieldRenders('brows', BROWS) && <p className="mt-1.5 text-[10px] text-white/35">Options marked “soon” show in the sketch only until their 3D shapes land.</p>}
              </Group>
              <Group title="Mouth" soon={soonField('mouth', MOUTHS)}><div className="flex flex-wrap gap-2">{MOUTHS.map((s) => <Chip key={s} label={s} active={face.mouth === s} onClick={() => setF('mouth', s)} />)}</div></Group>
              <Group title="Nose" soon={soonField('nose', NOSES)}><div className="flex flex-wrap gap-2">{NOSES.map((s) => <Chip key={s} label={s} active={face.nose === s} onClick={() => setF('nose', s)} />)}</div></Group>
              <Group title="Fine-tune">
                <p className="mb-2 text-[11px] text-white/40">Sculpt on top of the shape preset. These are the same morphs the game renders.</p>
                <div className="space-y-2">
                  {FACE_SLIDERS.map(([key, label]) => (
                    <label key={key} className="flex items-center gap-3 text-xs text-white/70">
                      <span className="w-24 shrink-0">{label}</span>
                      <input type="range" min={0} max={100} value={Math.round(((face.sliders?.[key] ?? 0) as number) * 100)}
                        onChange={(e) => setSlider(key, Number(e.target.value) / 100)} className="w-full accent-cyan-400" aria-label={label} />
                      <span className="w-8 text-right tabular-nums text-white/40">{Math.round(((face.sliders?.[key] ?? 0) as number) * 100)}</span>
                    </label>
                  ))}
                  <button type="button" onClick={() => setFace((p) => ({ ...p, sliders: {} }))} className="text-[11px] text-cyan-300/80 hover:text-cyan-200">Reset sculpt</button>
                </div>
              </Group>
            </motion.div>
          )}

          {tab === 'parts' && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <PartsTab parts={doc?.parts ?? []} onChange={setParts} accent={previewPalette.accent}
                canUndo={canUndo(hist)} canRedo={canRedo(hist)} onUndo={() => setHist(undo)} onRedo={() => setHist(redo)} />
            </motion.div>
          )}

          {tab === 'wear' && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <h3 className="mb-1 text-sm font-semibold text-white/80">Jersey ID</h3>
                <p className="mb-3 text-[11px] text-white/40">Your number and name plate, rendered on your hero&apos;s back in every mode.</p>
                <div className="flex items-center gap-3">
                  <div>
                    <label className="mb-1 block text-[10px] uppercase tracking-wider text-white/50">Number</label>
                    <input
                      type="number" min={0} max={99} value={jersey.number}
                      onChange={(e) => setJersey((j) => sanitizeJersey({ ...j, number: e.target.value }))}
                      className="w-20 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-center font-mono text-lg font-bold text-white"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="mb-1 block text-[10px] uppercase tracking-wider text-white/50">Name plate</label>
                    <input
                      type="text" maxLength={12} value={jersey.name} placeholder="YOUR NAME"
                      onChange={(e) => setJersey((j) => sanitizeJersey({ ...j, name: e.target.value }))}
                      className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm font-bold uppercase tracking-wider text-white placeholder:text-white/25"
                    />
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <h3 className="mb-1 text-sm font-semibold text-white/80">Kit colours</h3>
                <p className="mb-3 text-[11px] text-white/40">Any colour, on top of each item&apos;s own. Shows in every mode. Reset hands a slot back to the item&apos;s colour.</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {KIT_COLOUR_SLOTS.map(([slot, label]) => {
                    const own = doc?.colours[slot];
                    const shown = (own ?? previewPalette[slot]).slice(0, 7).toLowerCase();
                    return (
                      <label key={slot} className="flex flex-col gap-1 text-[11px] text-white/60">
                        <span>{label}</span>
                        <span className="flex items-center gap-2">
                          <input type="color" value={/^#[0-9a-f]{6}$/.test(shown) ? shown : '#000000'} aria-label={`${label} colour`}
                            onChange={(e) => setKitColour(slot, e.target.value)} className="h-8 w-10 cursor-pointer rounded border border-white/15 bg-transparent" />
                          <span className="font-mono text-[10px] uppercase text-white/45">{shown}</span>
                        </span>
                        {own && <button type="button" onClick={() => setKitColour(slot, null)} className="self-start text-[10px] text-cyan-300/80 hover:text-cyan-200">Reset</button>}
                      </label>
                    );
                  })}
                </div>
              </div>
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

const KIT_COLOUR_SLOTS: [ColourSlot, string][] = [['jersey', 'Jersey'], ['shorts', 'Shorts'], ['shoes', 'Shoes'], ['accent', 'Accent']];

/** The whole field has no 3D effect yet → the group says so. */
function soonField(field: FaceField, options: readonly string[]): boolean {
  return !faceFieldRenders(field, options);
}

function Group({ title, soon = false, children }: { title: string; soon?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-white/80">
        <Palette className="h-3.5 w-3.5 text-cyan-400" /> {title}
        {soon && <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-normal text-white/45" title={SOON}>3D coming soon</span>}
      </h3>
      {children}
    </div>
  );
}
