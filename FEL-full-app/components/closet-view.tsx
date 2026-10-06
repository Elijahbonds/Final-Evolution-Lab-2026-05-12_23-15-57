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
import { FACE_MORPH_NAMES, faceFieldRenders, faceOptionRenders, type FaceField } from '@/lib/babylon/core/faceMorphs';
import { faceMorphList } from '@/lib/creator/look/faceMorphList';
import { accessoriesForEquipped, wornPartsForEquipped } from '@/lib/closet/wearableAccessories';
import { MAX_SLOTS, emptyCreatorDoc, type ColourSlot, type CreatorEyes, type CreatorPart, type CreatorShape, type CreatorSlotV2, type HideKey, type PaintLayer, type SlotBody, type SlotFrame } from '@/lib/creator/look/doc';
import { readCreatorDoc, faceOnly, type StoredFace } from '@/lib/creator/look/storage';
import {
  addSlot, blankSlot, canAddSlot, duplicateSlot, ensureSlots, heroBodyForSlot, mergeDeviceNumbers, newSlotId, newSlotLabel,
  removeSlot, renameSlot, replaceSlot, slotBodyOf, slotFace, withFace,
} from '@/lib/creator/look/slots';
import { decodeSlotCode, encodeSlotCode, type DecodeError } from '@/lib/creator/look/shareCode';
import type { HeroBodyKind } from '@/lib/babylon/core/heroBody';
import { SlotBar } from '@/components/closet/slot-bar';
import { BodyControls, ColourRow, EyeControls, HideControls } from '@/components/closet/character-controls';
import { effectivePalette } from '@/lib/creator/look/palette';
import { canRedo, canUndo, createHistory, pushHistory, redo, undo, type History } from '@/lib/creator/look/history';
import { RANDOM_SECTIONS, RANDOM_SECTION_FIELDS, randomiseLook, randomiseShape, type RandomSection, type ShapeRandomSection } from '@/lib/creator/look/randomise';
import { sanitizeSlotPresentation, sanitizeStampText } from '@/lib/creator/look/sanitize';

// The 3D preview is client-only (Babylon engine on a canvas) — never SSR it.
const AvatarPreview = dynamic(() => import('@/components/closet/avatar-preview'), { ssr: false });
// CREATOR-PLAN phase 2: the Parts tab (place generic shapes on any bone).
const PartsTab = dynamic(() => import('@/components/closet/parts-tab').then((m) => m.PartsTab), { ssr: false });
// CREATOR-PLAN phase 3: the Paint tab (fills, patterns, stamps, text, suit mode).
const PaintTab = dynamic(() => import('@/components/closet/paint-tab').then((m) => m.PaintTab), { ssr: false });
// CREATOR-PLAN phase 4b: the Shape tab (proportions, bulk, the Studio size).
const ShapeTab = dynamic(() => import('@/components/closet/shape-tab').then((m) => m.ShapeTab), { ssr: false });

type Equipped = Record<WearableSlot, string | null>;
type CardSkin = { id: string; displayName: string; accent: string; rarity: string };

// The free starters come from lib/closet/ownership.ts — the server decides entitlement and this screen
// must not hold a second opinion about it.

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

/** IMPROVE (2026-10-06): options with no 3D effect yet say so (faceMorphs.faceOptionRenders), instead of pretending. */
const SOON = '3D coming soon — shows in the sketch only';

const PASTE_ERRORS: Record<DecodeError, string> = {
  empty: 'Paste a share code first.',
  too_long: 'That code is too long to be a character.',
  not_a_code: 'That is not a share code (they start with FEL).',
  unsupported_version: 'That code is from a newer version, or this browser cannot unpack it.',
  corrupt: 'That code is damaged — check it was copied whole.',
  invalid: 'That code holds no character.',
};

export function ClosetView({ adult = false }: { adult?: boolean }) {
  // CREATOR-PLAN phase 4a (owner, 2026-10-06: "5 max slots"): the Closet edits ONE CHARACTER at a time, the selected
  // slot. Its working copy is an undo history of that slot alone (phase 1's history held the whole face, slots and all,
  // in every step): switching slots is not a step, and each slot keeps its own history while you switch between them.
  // `face` / `setFace` are that slot seen as the StoredFace the editors already speak (slots.slotFace / withFace), so
  // every editor below is unchanged; a slider or colour drag still passes a group so the whole drag is one step.
  const initial = useMemo(() => ensureSlots(defaultFace(), 'male'), []);
  const [slots, setSlots] = useState<CreatorSlotV2[]>(initial.slots);
  const [activeId, setActiveId] = useState(initial.active);
  const [selectedId, setSelectedId] = useState(initial.active);
  const [hist, setHist] = useState<History<CreatorSlotV2>>(() => createHistory<CreatorSlotV2>(initial.slots[0]));
  const stash = useRef(new Map<string, History<CreatorSlotV2>>());
  const [savedSig, setSavedSig] = useState('');
  const [scanOwned, setScanOwned] = useState(false);
  const [serverBody, setServerBody] = useState<HeroBodyKind>('kit-male');
  const slot = hist.present;
  const face = useMemo(() => slotFace(slot) as StoredFace, [slot]);
  const setFace = (next: StoredFace | ((p: StoredFace) => StoredFace), group?: string) =>
    setHist((h) => pushHistory(h, withFace(h.present, typeof next === 'function' ? next(slotFace(h.present) as StoredFace) : next), group));
  const setSlot = (fn: (s: CreatorSlotV2) => CreatorSlotV2, group?: string) => setHist((h) => pushHistory(h, fn(h.present), group));
  /** every slot, with the working copy in it */
  const allSlots = useMemo(() => replaceSlot(slots, slot), [slots, slot]);
  const [locks, setLocks] = useState<RandomSection[]>([]);
  const [shapeLocks, setShapeLocks] = useState<ShapeRandomSection[]>([]);
  // the selected character's worn items (each slot wears its own; the save filters them through what you own)
  const equipped = useMemo(() => ({ ...defaultEquipped(), ...(slot.equipped ?? {}) }) as Equipped, [slot]);
  const setEquipped = (fn: (p: Equipped) => Equipped) => setSlot((s) => ({ ...s, equipped: fn({ ...defaultEquipped(), ...(s.equipped ?? {}) } as Equipped) }));
  const [jersey, setJersey] = useState<JerseyConfig>(defaultJersey());
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [skins, setSkins] = useState<CardSkin[]>([]);
  const [skinCardId, setSkinCardId] = useState<string | null>(null);
  const [tab, setTab] = useState<'face' | 'shape' | 'parts' | 'paint' | 'wear' | 'skins'>('face');
  // CREATOR-PLAN phase 4c: the face sliders come from the morph targets the LOADED body carries (the preview reports them
  // on every spawn), so a morph baked into the GLB in phase 5 appears here without code; the forge's seven until it reports
  const [morphNames, setMorphNames] = useState<string[]>(() => [...FACE_MORPH_NAMES]);
  const faceSliders = useMemo(() => faceMorphList(morphNames), [morphNames]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [buying, setBuying] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [consent, setConsent] = useState<StoredConsent>({ saveLookNumbers: false, modelTraining: false });
  const hydrated = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        // CREATOR-PLAN phase 4a: hero-body says which body this account plays and whether it owns a scan (a slot may pick it)
        const [res, hb] = await Promise.all([
          fetch('/api/v1/closet'),
          fetch('/api/v1/hero-body').then((r) => (r.ok ? r.json() : null)).catch(() => null) as Promise<{ body?: HeroBodyKind; scanOwned?: boolean } | null>,
        ]);
        const j = await res.json();
        const savedConsent = readConsent();
        const hold = decideLookHold(adult, savedConsent.saveLookNumbers, savedConsent.modelTraining);
        const local = readLocalLook();
        setConsent(savedConsent);
        const kind: HeroBodyKind = hb?.body === 'scan' || hb?.body === 'kit-female' ? hb.body : 'kit-male';
        setServerBody(kind);
        setScanOwned(hb?.scanOwned === true);
        if (res.ok) {
          let nextFace: StoredFace = { ...defaultFace(), ...(j.look?.face ?? {}) };
          // The server copy is whatever the hold allowed. The device copy wins for the rest (phase 4a: per slot).
          if (!hold.uploadLook && local?.face) nextFace = { ...local.face };
          else if (local?.face && !hold.uploadNumbers) nextFace = mergeDeviceNumbers(nextFace, local.face) as unknown as StoredFace;
          const serverEquipped = { ...defaultEquipped(), ...(j.look?.equipped ?? {}) };
          loadSlots(nextFace, slotBodyOf(kind), !hold.uploadLook && local?.equipped ? { ...defaultEquipped(), ...local.equipped } : serverEquipped);
          setOwned(new Set<string>(j.owned ?? []));
          setSkins(j.skins ?? []);
          setSkinCardId(j.look?.skinCardId ?? null);
          setJersey(!hold.uploadLook && local?.jersey ? sanitizeJersey(local.jersey) : sanitizeJersey(j.look?.jersey ?? defaultJersey()));
        } else if (local?.face && !hold.uploadLook) {
          loadSlots({ ...local.face }, slotBodyOf(kind), { ...defaultEquipped(), ...(local.equipped ?? {}) });
        }
      } catch { /* ignore */ }
      finally { hydrated.current = true; setLoading(false); }
    })();
  }, [adult]);

  // The look the server is not allowed to keep still has to survive a refresh. Phase 4a: every slot, and the face's top
  // level is the playing character (what raceLook and an older reader see).
  const storedFace = useMemo(() => buildStoredFace(allSlots, activeId), [allSlots, activeId]);
  const activeEquippedNow = useMemo(() => ({ ...defaultEquipped(), ...(allSlots.find((s) => s.id === activeId)?.equipped ?? {}) }), [allSlots, activeId]);
  useEffect(() => {
    if (!hydrated.current || loading) return;
    writeLocalLook({ ...(readLocalLook() ?? {}), face: storedFace as FaceConfig, equipped: activeEquippedNow, jersey });
  }, [storedFace, activeEquippedNow, jersey, loading]);
  const sigNow = useMemo(() => JSON.stringify([allSlots, activeId]), [allSlots, activeId]);

  /** Open a face's characters (a look saved before slots becomes one slot), each wearing `eq` unless it has its own. */
  function loadSlots(f: StoredFace, body: SlotBody, eq: Record<string, string | null>) {
    const r = ensureSlots(f, body, eq as CreatorSlotV2['equipped']);
    const list = r.slots.map((s) => (s.equipped ? s : { ...s, equipped: { ...eq } as CreatorSlotV2['equipped'] }));
    stash.current.clear();
    setSlots(list);
    setActiveId(r.active);
    setSelectedId(r.active);
    setHist(createHistory(list.find((s) => s.id === r.active) ?? list[0]));
    setSavedSig(JSON.stringify([list, r.active]));
  }
  /** Go to a slot of `next` (the slot list after an operation), keeping each slot's own undo history. */
  const goTo = (next: CreatorSlotV2[], id: string) => {
    stash.current.set(selectedId, hist);
    for (const k of [...stash.current.keys()]) if (!next.some((s) => s.id === k)) stash.current.delete(k);
    const target = next.find((s) => s.id === id);
    if (!target) return;
    setSlots(next);
    setSelectedId(id);
    const kept = stash.current.get(id);
    setHist(kept && kept.present === target ? kept : createHistory(target));
  };
  const selectSlot = (id: string) => { if (id !== selectedId) goTo(allSlots, id); };
  const newCharacter = () => {
    if (!canAddSlot(allSlots)) return;
    const s = { ...blankSlot({ id: newSlotId(allSlots), label: newSlotLabel(allSlots), body: slot.body === 'scan' ? 'male' : slot.body }), equipped: { ...defaultEquipped() } };
    goTo(addSlot(allSlots, s), s.id);
  };
  const duplicateCharacter = (id: string) => {
    const next = duplicateSlot(allSlots, id);
    const added = next.find((s) => !allSlots.some((a) => a.id === s.id));
    if (added) goTo(next, added.id);
  };
  const renameCharacter = (id: string, label: string) => {
    const clean = sanitizeStampText(label);
    if (!clean) return;
    if (id === selectedId) setSlot((s) => ({ ...s, label: clean }));
    else setSlots((list) => renameSlot(list, id, clean));
  };
  const deleteCharacter = (id: string) => {
    const r = removeSlot(allSlots, id, activeId);
    if (r.slots === allSlots) return;
    setActiveId(r.active ?? r.slots[0].id);
    if (id === selectedId) { stash.current.delete(id); goTo(r.slots, r.active ?? r.slots[0].id); }
    else { stash.current.delete(id); setSlots(r.slots); }
  };
  const pasteCharacter = async (code: string): Promise<string | null> => {
    const r = await decodeSlotCode(code);
    if (!r.ok) return PASTE_ERRORS[r.error];
    if (!canAddSlot(allSlots)) return `${MAX_SLOTS} characters is the most — delete one first.`;
    const s: CreatorSlotV2 = {
      id: newSlotId(allSlots), label: newSlotLabel(allSlots, 'IMPORT'),
      body: r.slot?.body ?? (slot.body === 'female' ? 'female' : 'male'), base: r.base, doc: r.doc, equipped: { ...defaultEquipped() },
    };
    if (r.slot?.sliders) s.sliders = r.slot.sliders;
    if (r.slot?.frame) s.frame = r.slot.frame;
    if (r.slot?.presentation) s.presentation = r.slot.presentation;
    goTo(addSlot(allSlots, s), s.id);
    toast.success('Added as a new character — Save to keep it.');
    return null;
  };
  const shareCode = (numbers: boolean) => encodeSlotCode(slot, { numbers });

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
  /** The Creator doc's paint layers (CREATOR-PLAN phase 3). A drag passes a group so it is one undo step. */
  const setPaint = (next: PaintLayer[], group?: string) => setFace((p) => {
    const d = readCreatorDoc(p) ?? emptyCreatorDoc();
    return { ...p, creator: { ...d, paint: next } };
  }, group);
  /** Suit mode and the layers it comes with, as one undo step. */
  const setSuit = (on: boolean, paint: PaintLayer[]) => setFace((p) => {
    const d = readCreatorDoc(p) ?? emptyCreatorDoc();
    return { ...p, creator: { ...d, paint, flags: { ...d.flags, suit: on } } };
  });
  /** The procedural eyes block (phase 4a). Defaults are dropped by the sanitiser, so an untouched look carries nothing. */
  const setEyes = (e: CreatorEyes, group?: string) => setFace((p) => {
    const d = readCreatorDoc(p) ?? emptyCreatorDoc();
    return { ...p, creator: { ...d, eyes: e } };
  }, group);
  /** What the doc hides (phase 4a), as one undo step. */
  const setHide = (h: Partial<Record<HideKey, true>>) => setFace((p) => {
    const d = readCreatorDoc(p) ?? emptyCreatorDoc();
    return { ...p, creator: { ...d, flags: { ...d.flags, hide: h } } };
  });
  /** The Creator doc's shape (CREATOR-PLAN phase 4b): proportions and bulk. A drag passes a group so it is one undo step. */
  const setShape = (next: CreatorShape, group?: string) => setFace((p) => {
    const d = readCreatorDoc(p) ?? emptyCreatorDoc();
    return { ...p, creator: { ...d, shape: { ...next, face: d.shape.face } } };
  }, group);
  /** The slot's Studio size (phase 4b): a slot field, never the doc, so no mode can read it. */
  const setPresentation = (scale: number | null, group?: string) => setSlot((s) => {
    const n = { ...s };
    const p = scale == null ? undefined : sanitizeSlotPresentation({ scale });
    if (p) n.presentation = p; else delete n.presentation;
    return n;
  }, group);
  const rollShape = () => setFace((p) => {
    const d = readCreatorDoc(p) ?? emptyCreatorDoc();
    return { ...p, creator: { ...d, shape: randomiseShape(d.shape, shapeLocks) } };
  });
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

  // Phase 4a: a save stores every character and which one is played; "Play as" is a save with another one playing.
  const save = async (playAs?: string) => {
    setSaving(true);
    try {
      const active = playAs ?? activeId;
      const out = buildStoredFace(allSlots, active);
      const eqOut = { ...defaultEquipped(), ...(allSlots.find((s) => s.id === active)?.equipped ?? {}) };
      const res = await fetch('/api/v1/closet', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(closetSaveRequest({
          adult, face: out as FaceConfig, equipped: eqOut, skinCardId, jersey,
          saveLookNumbers: consent.saveLookNumbers, modelTraining: consent.modelTraining,
        })),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'save failed');
      if (playAs) setActiveId(playAs);
      setSavedSig(JSON.stringify([allSlots, active]));
      writeConsent(consent);
      writeLocalLook({ ...(readLocalLook() ?? {}), face: out as FaceConfig, equipped: eqOut, jersey });
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

      {/* CREATOR-PLAN phase 4a: the characters (up to 5) — select one to edit it, "Play as" to wear it in every mode */}
      <div className="mb-5">
        <SlotBar slots={allSlots} selected={selectedId} active={activeId} dirty={!!savedSig && sigNow !== savedSig}
          onSelect={selectSlot} onPlayAs={(id) => { void save(id); }} onNew={newCharacter} onDuplicate={duplicateCharacter}
          onRename={renameCharacter} onDelete={deleteCharacter} onPaste={pasteCharacter} onShare={shareCode} accent={accent} />
      </div>

      <div className="grid gap-6 md:grid-cols-[260px_1fr]">
        {/* preview column */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          {/* The actual game model (forged fel-hero) wearing the draft look —
              what you design here is what spawns in every mode. */}
          <AvatarPreview face={previewFace} palette={previewPalette} jersey={jersey} wardrobe={{ tops: equipped.tops ?? null, shorts: equipped.shorts ?? null, shoes: equipped.shoes ?? null }} accessories={previewAccessories} creator={doc} wornParts={previewWornParts} onMorphs={setMorphNames}
            body={heroBodyForSlot(slot.body, { scanOwned, fallback: serverBody })} frame={slot.frame ?? null} presentation={slot.presentation?.scale ?? null} />
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
          <button onClick={() => save()} disabled={saving} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 py-2.5 text-sm font-bold text-black transition hover:bg-cyan-300 disabled:opacity-60">
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
          <div className="mb-4 flex flex-wrap gap-2">
            <Chip label="Face" active={tab === 'face'} onClick={() => setTab('face')} />
            <Chip label="Shape" active={tab === 'shape'} onClick={() => setTab('shape')} />
            <Chip label="Parts" active={tab === 'parts'} onClick={() => setTab('parts')} />
            <Chip label="Paint" active={tab === 'paint'} onClick={() => setTab('paint')} />
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
              <Group title={`Body — ${slot.label || 'this character'}`}>
                <BodyControls body={slot.body} frame={slot.frame ?? null} scanOwned={scanOwned} numbersSaved={consent.saveLookNumbers && adult}
                  onBody={(b) => setSlot((s) => ({ ...s, body: b }))}
                  onFrame={(f: SlotFrame | null, g?: string) => setSlot((s) => { const n = { ...s }; if (f) n.frame = f; else delete n.frame; return n; }, g)} />
              </Group>
              {/* CREATOR-PLAN phase 4a (tool #5): any colour for skin, hair and eyes */}
              <Group title="Skin Tone"><ColourRow label="Skin tone" swatches={SKIN_TONES} value={face.skinTone} group="colour:skin" onPick={(h, g) => setFace((p) => ({ ...p, skinTone: h }), g)} /></Group>
              <Group title="Face Shape"><div className="flex flex-wrap gap-2">{FACE_SHAPES.map((s) => <Chip key={s} label={s} active={face.faceShape === s} onClick={() => setF('faceShape', s)} />)}</div></Group>
              <Group title="Hair Style"><div className="flex flex-wrap gap-2">{HAIR_STYLES.map((s) => <Chip key={s} label={s} active={face.hairStyle === s} onClick={() => setF('hairStyle', s)} />)}</div></Group>
              <Group title="Hair Color"><ColourRow label="Hair colour" swatches={HAIR_COLORS} value={face.hairColor} group="colour:hair" onPick={(h, g) => setFace((p) => ({ ...p, hairColor: h }), g)} /></Group>
              <Group title="Eye Shape" soon={soonField('eyeShape', EYE_SHAPES)}><div className="flex flex-wrap gap-2">{EYE_SHAPES.map((s) => <Chip key={s} label={s} active={face.eyeShape === s} onClick={() => setF('eyeShape', s)} />)}</div></Group>
              <Group title="Eye Color"><ColourRow label="Eye colour" swatches={EYE_COLORS} value={face.eyeColor} group="colour:eye" onPick={(h, g) => setFace((p) => ({ ...p, eyeColor: h }), g)} /></Group>
              {/* CREATOR-PLAN phase 4a (tool #3): the procedural eyes */}
              <Group title="Eyes"><EyeControls eyes={doc?.eyes} onChange={setEyes} /></Group>
              {/* CREATOR-PLAN phase 4a (tool #4): hide the eyeballs, ears, head or hair (masks, helmets, mascot heads) */}
              <Group title="Hide"><HideControls hide={doc?.flags.hide} onChange={setHide} /></Group>
              <Group title="Brows" soon={soonField('brows', BROWS)}>
                <div className="flex flex-wrap gap-2">{BROWS.map((s) => <Chip key={s} label={faceOptionRenders('brows', s) ? s : `${s} · soon`} active={face.brows === s} onClick={() => setF('brows', s)} />)}</div>
                {faceFieldRenders('brows', BROWS) && <p className="mt-1.5 text-[10px] text-white/35">Options marked “soon” show in the sketch only until their 3D shapes land.</p>}
              </Group>
              <Group title="Mouth" soon={soonField('mouth', MOUTHS)}><div className="flex flex-wrap gap-2">{MOUTHS.map((s) => <Chip key={s} label={s} active={face.mouth === s} onClick={() => setF('mouth', s)} />)}</div></Group>
              <Group title="Nose" soon={soonField('nose', NOSES)}><div className="flex flex-wrap gap-2">{NOSES.map((s) => <Chip key={s} label={s} active={face.nose === s} onClick={() => setF('nose', s)} />)}</div></Group>
              <Group title="Fine-tune">
                <p className="mb-2 text-[11px] text-white/40">Sculpt on top of the shape preset. These are the same morphs the game renders.</p>
                <div className="space-y-2">
                  {!faceSliders.length && <p className="text-[11px] text-white/40">This body has no face shapes to sculpt. Saved values are kept for a body that has them.</p>}
                  {faceSliders.map(({ key, label }) => (
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

          {tab === 'shape' && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <ShapeTab shape={doc?.shape ?? emptyCreatorDoc().shape} presentation={slot.presentation?.scale ?? null}
                onShape={setShape} onPresentation={setPresentation} locks={shapeLocks} onLocks={setShapeLocks} onRoll={rollShape}
                canUndo={canUndo(hist)} canRedo={canRedo(hist)} onUndo={() => setHist(undo)} onRedo={() => setHist(redo)}
                numbersSaved={consent.saveLookNumbers && adult} />
            </motion.div>
          )}

          {tab === 'parts' && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <PartsTab parts={doc?.parts ?? []} onChange={setParts} accent={previewPalette.accent}
                canUndo={canUndo(hist)} canRedo={canRedo(hist)} onUndo={() => setHist(undo)} onRedo={() => setHist(redo)} />
            </motion.div>
          )}

          {tab === 'paint' && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <PaintTab layers={doc?.paint ?? []} suit={doc?.flags.suit ?? false} onChange={setPaint} onSuit={setSuit} accent={previewPalette.accent}
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

/** The face a save stores (phase 4a): every character, which one is played, and the played one materialised on the top
 *  level (the server re-derives that top level itself; this keeps the device copy the same shape). */
function buildStoredFace(all: CreatorSlotV2[], active: string): StoredFace {
  const a = all.find((s) => s.id === active) ?? all[0];
  return { ...(slotFace(a) as StoredFace), creatorSlots: all, activeSlot: a.id };
}

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
