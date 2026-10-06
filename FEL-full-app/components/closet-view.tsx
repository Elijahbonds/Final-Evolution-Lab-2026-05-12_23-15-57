'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Loader2, Shirt, Palette, Check, Coins, Sparkles, Undo2, Redo2, Shuffle, Lock, Unlock, Camera, RotateCw, SplitSquareHorizontal, FlipHorizontal, ClipboardPaste, Sun, X } from 'lucide-react';
import { newIdempotencyKey } from '@/lib/wallet/client';
import { FaceScanCapture } from '@/components/facescan/face-scan-capture';
import { LookConsent } from '@/components/creator/look-consent';
import { readConsent, readLocalLook, writeConsent, writeLocalLook, type StoredConsent } from '@/lib/creator/localLook';
import { closetSaveRequest, decideLookHold } from '@/lib/creator/lookPrivacy';
import { invalidateIdentity } from '@/lib/babylon/core/characterPipeline';
import { canEquip as canEquipItem } from '@/lib/closet/ownership';
import { PublishLookAsCard } from '@/components/pipelines/publish-look';   // PIPELINES (2026-10-06)
import {
  SKIN_TONES, FACE_SHAPES, HAIR_STYLES, HAIR_COLORS, EYE_SHAPES, EYE_COLORS,
  BROWS, MOUTHS, NOSES, defaultFace, defaultEquipped, defaultJersey, sanitizeJersey, SLOTS,
  wearablesForSlot, getWearable, type FaceConfig, type WearableSlot, type JerseyConfig,
} from '@/lib/closet/wearable-catalog';
import { FACE_MORPH_NAMES, faceFieldRenders, faceOptionRenders, type FaceField } from '@/lib/babylon/core/faceMorphs';
import { faceMorphList } from '@/lib/creator/look/faceMorphList';
import { accessoriesForEquipped, wornPartsForEquipped } from '@/lib/closet/wearableAccessories';
import { MAX_SLOTS, emptyCreatorDoc, type CreatorMark, type ColourSlot, type CreatorEyes, type CreatorPart, type CreatorShape, type CreatorSlotV2, type HideKey, type PaintLayer, type PaintRegion, type SlotBody, type SlotFrame } from '@/lib/creator/look/doc';
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
// CREATOR-PLAN phase 4d: the Studio — the stage around the preview, and what the editor tells it
import type { StudioApi, StudioEvents, PreviewLook } from '@/components/closet/avatar-preview';
import { HistoryStrip } from '@/components/closet/studio/history-strip';
import { WalkthroughCard } from '@/components/closet/studio/walkthrough-card';
import { STUDIO_SHOTS, type StudioFocus, type StudioTab } from '@/lib/creator/look/studio/framing';
import { cycle, isFieldTarget, keyAction, type StudioAction } from '@/lib/creator/look/studio/input';
import { isBigChange, jumpHistory, keepCopy, stripEntries, visibleEntries } from '@/lib/creator/look/studio/historyStrip';
import { STUDIO_POSES, STUDIO_VENUES, backdropFor, type StudioVenue } from '@/lib/creator/look/studio/poses';
import { WALK_COPY, WALK_DONE, WALK_START, rememberWalk, walkCurrent, walkReduce, walkSeen, type WalkEvent, type WalkState } from '@/lib/creator/look/studio/walkthrough';
import { fitsBudget, updatePart } from '@/lib/creator/look/parts';
import { REGION_LABELS, newLayer, updateLayer } from '@/lib/creator/look/paint';
import type { FeelCue } from '@/lib/babylon/creator/studio/feel';

// The 3D preview is client-only (Babylon engine on a canvas) — never SSR it.
const AvatarPreview = dynamic(() => import('@/components/closet/avatar-preview'), { ssr: false });
// CREATOR-PLAN phase 2: the Parts tab (place generic shapes on any bone).
const PartsTab = dynamic(() => import('@/components/closet/parts-tab').then((m) => m.PartsTab), { ssr: false });
// CREATOR-PLAN phase 3: the Paint tab (fills, patterns, stamps, text, suit mode).
const PaintTab = dynamic(() => import('@/components/closet/paint-tab').then((m) => m.PaintTab), { ssr: false });
// CREATOR-PLAN phase 4b: the Shape tab (proportions, bulk, the Studio size).
const ShapeTab = dynamic(() => import('@/components/closet/shape-tab').then((m) => m.ShapeTab), { ssr: false });
// CREATOR-PLAN phase 4d: photo mode (loaded when opened).
const PhotoMode = dynamic(() => import('@/components/closet/studio/photo-mode').then((m) => m.PhotoMode), { ssr: false });

/** The editor's tabs, in order (the pad's shoulder buttons and the [ ] keys cycle them). */
const STUDIO_TABS: readonly StudioTab[] = ['face', 'shape', 'parts', 'paint', 'wear', 'skins'];
/** Soft UI sounds and haptics, loaded on first use (SoundKit stays out of the page's first bundle). */
const cue = (c: FeelCue) => { void import('@/lib/babylon/creator/studio/feel').then((m) => m.feel(c)).catch(() => undefined); };

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

export function ClosetView({ adult = false, fullBleed = false }: { adult?: boolean; fullBleed?: boolean }) {
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
  // ── CREATOR-PLAN phase 4d: the Studio's own state (none of it is saved; it is how the editor is looked at) ──
  const studioApi = useRef<StudioApi | null>(null);
  const [partSel, setPartSel] = useState<string | null>(null);
  const [layerSel, setLayerSel] = useState<string | null>(null);
  const [autoSpin, setAutoSpinState] = useState(true);
  const [pose, setPose] = useState('idle');
  const [venue, setVenueState] = useState<StudioVenue['id']>('studio');
  const [showPose, setShowPose] = useState(false);
  const [compare, setCompare] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [openPaste, setOpenPaste] = useState(0);
  const [tapped, setTapped] = useState<{ region: PaintRegion; finest: PaintRegion; xy: { x: number; y: number } | null } | null>(null);
  const [walk, setWalk] = useState<WalkState>(WALK_DONE);
  const [offer, setOffer] = useState<{ before: CreatorSlotV2 } | null>(null);
  /** the look each slot had when it was opened or last saved — what Before shows */
  const baseline = useRef(new Map<string, CreatorSlotV2>());

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
    baseline.current = new Map(list.map((s) => [s.id, s]));
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
    if (!baseline.current.has(id)) baseline.current.set(id, target);
    setPartSel(null); setLayerSel(null); setTapped(null); setCompare(false);
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
  /** Phase 4c: paint layers and the player-drawn stamps they use, written together (one undo step; a stroke is one). */
  const setPaintMarks = (next: PaintLayer[], marks: CreatorMark[], group?: string) => setFace((p) => {
    const d = readCreatorDoc(p) ?? emptyCreatorDoc();
    const out = { ...d, paint: next };
    if (marks.length) out.marks = marks; else delete out.marks;
    return { ...p, creator: out };
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
  // ── CREATOR-PLAN phase 4d: the Studio ──────────────────────────────────────────────────────────────────────────
  /** Edit the doc's parts / paint from their CURRENT value (a drag fires faster than React renders; `group` makes it one
   *  undo step). */
  const editParts = (fn: (parts: CreatorPart[]) => CreatorPart[], group?: string) => setFace((p) => {
    const d = readCreatorDoc(p) ?? emptyCreatorDoc();
    return { ...p, creator: { ...d, parts: fn(d.parts) } };
  }, group);
  const editPaint = (fn: (paint: PaintLayer[]) => PaintLayer[], group?: string) => setFace((p) => {
    const d = readCreatorDoc(p) ?? emptyCreatorDoc();
    return { ...p, creator: { ...d, paint: fn(d.paint) } };
  }, group);
  const selectedPart = useMemo(() => (tab === 'parts' ? doc?.parts.find((p) => p.id === partSel) ?? null : null), [tab, doc, partSel]);
  const selectedLayer = useMemo(() => doc?.paint.find((l) => l.id === layerSel) ?? null, [doc, layerSel]);
  const sticker = tab === 'paint' && selectedLayer && (selectedLayer.type === 'stamp' || selectedLayer.type === 'text' || selectedLayer.type === 'mark') ? selectedLayer : null;
  const focus: StudioFocus = tab === 'parts' && selectedPart ? { kind: 'part', bone: selectedPart.bone }
    : tab === 'paint' && selectedLayer ? { kind: 'layer', region: selectedLayer.region } : null;
  const setAutoSpin = (on: boolean) => { setAutoSpinState(on); studioApi.current?.setAutoSpin(on); };
  const setVenue = (v: StudioVenue['id']) => { setVenueState(v); studioApi.current?.setVenue(v); };
  const playPose = (id: string) => { setPose(id); studioApi.current?.playPose(id); };
  /** Mirror the selected part or layer (a mirrored part costs two of the 64). */
  const toggleMirror = () => {
    if (tab === 'parts' && selectedPart) {
      if (!selectedPart.mirror && !fitsBudget(doc?.parts ?? [], 1)) { cue('deny'); toast.error('No room for a mirror copy — the parts budget is full.'); return; }
      editParts((ps) => updatePart(ps, selectedPart.id, { mirror: !selectedPart.mirror }));
    } else if (tab === 'paint' && selectedLayer) editPaint((ls) => updateLayer(ls, selectedLayer.id, { mirror: !selectedLayer.mirror }));
  };
  /** A tap on the body's region → a new layer there (a stamp lands where the tap was). */
  const addAt = (type: 'fill' | 'pattern' | 'stamp') => {
    if (!tapped) return;
    const colours = type === 'fill' ? [previewPalette.accent.toUpperCase()] : [previewPalette.accent.toUpperCase(), '#FFFFFF'];
    const over: Partial<PaintLayer> = type === 'stamp'
      ? { region: tapped.finest, at: { x: tapped.xy?.x ?? 0.5, y: tapped.xy?.y ?? 0.5, rot: 0, scale: 1, stretch: 1 } }
      : { region: tapped.region };
    const l = newLayer(doc?.paint ?? [], type, colours, over);
    if (!l) { cue('deny'); toast.error('The paint budget is full.'); return; }
    editPaint((ls) => [...ls, l]);
    setTab('paint'); setLayerSel(l.id); setTapped(null);
  };
  const events: StudioEvents = {
    onTapBody: ({ region, finest, xy }) => {
      if (tab === 'paint' && selectedLayer) {
        // the selected layer goes where the tap was: a stamp to the spot, a fill or a pattern to the region
        if (sticker && xy) editPaint((ls) => updateLayer(ls, sticker.id, { region: finest, at: { ...sticker.at, x: xy.x, y: xy.y } }));
        else editPaint((ls) => updateLayer(ls, selectedLayer.id, { region }));
        setTapped(null);
      } else setTapped({ region, finest, xy });
    },
    onTapPart: (id) => { setTab('parts'); setPartSel(id); setTapped(null); },
    onTapEmpty: () => { setTapped(null); if (tab === 'parts') setPartSel(null); if (tab === 'paint') setLayerSel(null); },
    onMovePart: (id, at, group) => editParts((ps) => updatePart(ps, id, at), group),
    onTransformPart: (id, patch, group) => editParts((ps) => updatePart(ps, id, patch), group),
    onMoveSticker: (id, at, group) => editPaint((ls) => updateLayer(ls, id, { region: at.region, at: { ...(ls.find((l) => l.id === id)?.at ?? { rot: 0, scale: 1, stretch: 1, x: 0.5, y: 0.5 }), x: at.x, y: at.y } }), group),
    onPadAction: (a) => act(a),
    onSpin: (on) => setAutoSpinState(on),
  };
  /** One Studio action, from a key, a pad button or a HUD button. */
  const act = (a: StudioAction) => {
    if (typeof a === 'object') { studioApi.current?.setShot(a.shot); return; }
    switch (a) {
      case 'undo': setHist(undo); cue('undo'); break;
      case 'redo': setHist(redo); cue('undo'); break;
      case 'prevTab': case 'nextTab': setTab((t) => cycle(STUDIO_TABS, t, a === 'nextTab' ? 1 : -1)); break;
      case 'prevItem': case 'nextItem': {
        const dir = a === 'nextItem' ? 1 : -1;
        if (tab === 'parts' && doc?.parts.length) setPartSel((id) => cycle(doc.parts.map((p) => p.id), id ?? doc.parts[0].id, dir));
        else if (tab === 'paint' && doc?.paint.length) setLayerSel((id) => cycle(doc.paint.map((l) => l.id), id ?? doc.paint[0].id, dir));
        break;
      }
      case 'photo': setPhotoOpen(true); break;
      case 'beforeAfter': setCompare((c) => !c); break;
      case 'turntable': setAutoSpin(!autoSpin); break;
      case 'mirror': toggleMirror(); break;
      case 'shotIn': studioApi.current?.setShot('in'); break;
      case 'shotOut': studioApi.current?.setShot('out'); break;
      case 'back': if (photoOpen) setPhotoOpen(false); else if (compare) setCompare(false); else if (tapped) setTapped(null); else { setPartSel(null); setLayerSel(null); } break;
      default: break;
    }
  };
  const actRef = useRef(act);
  actRef.current = act;
  // Ctrl/Cmd+Z undoes, Shift+Ctrl/Cmd+Z or Ctrl+Y redoes — not while typing in a text box (the jersey plate has its own).
  // Phase 4d: the Studio's keys too (1/2/3 shots, [ ] tabs, , . items, T turntable, B before/after, P photo, M mirror,
  // Esc back), never while a field has the focus (input.keyAction).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const f = isFieldTarget(e.target as HTMLInputElement | null);
      const a = keyAction(e, f.field, f.text);
      if (!a) return;
      e.preventDefault();
      actRef.current(a);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  // FEARLESS: a big change (a randomise, a pasted look, suit mode, a cluster of parts) offers to keep the look from
  // before it as a new slot — after the change, never in front of it.
  const prevHist = useRef(hist);
  useEffect(() => {
    const prev = prevHist.current;
    prevHist.current = hist;
    if (prev === hist || prev.present.id !== hist.present.id) return;
    const pushed = hist.past.length === prev.past.length + 1 && hist.past[hist.past.length - 1] === prev.present;
    if (pushed && isBigChange(prev.present, hist.present)) setOffer({ before: prev.present });
  }, [hist]);
  const keepBefore = () => {
    if (!offer) return;
    const r = keepCopy(allSlots, offer.before);
    if ('full' in r) { cue('deny'); toast.error(`All ${MAX_SLOTS} slots are full — Undo still has the old look.`); setOffer(null); return; }
    setSlots(r.slots);   // the copy joins the list; the character being edited stays selected
    baseline.current.set(r.id, offer.before);
    toast.success(`Kept the old look as ${r.slots.find((s) => s.id === r.id)?.label ?? 'a new slot'} — Save to keep it.`);
    setOffer(null);
  };
  // THE WALKTHROUGH: once per device (place a part, paint a layer, save)
  useEffect(() => { if (!walkSeen()) setWalk(WALK_START); }, []);
  const walkDo = (e: WalkEvent) => setWalk((w) => { const n = walkReduce(w, e); if (n.over && !w.over) rememberWalk(n); return n; });
  const counts = useRef({ parts: doc?.parts.length ?? 0, paint: doc?.paint.length ?? 0, slot: slot.id, ready: false });
  useEffect(() => {
    const c = counts.current;
    const parts = doc?.parts.length ?? 0, paint = doc?.paint.length ?? 0;
    // only what the player adds counts: not the saved look arriving on load, not switching to another character
    if (c.ready && !loading && c.slot === slot.id) {
      if (parts > c.parts) walkDo('partAdded');
      if (paint > c.paint) walkDo('layerAdded');
    }
    counts.current = { parts, paint, slot: slot.id, ready: !loading };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, slot.id, loading]);
  const walkStep = walkCurrent(walk);
  useEffect(() => { const t = walkStep ? WALK_COPY[walkStep].tab : null; if (t) setTab(t); }, [walkStep]);
  /** What Before shows: the selected character as it was opened or last saved. */
  const beforeLook: PreviewLook | null = useMemo(() => {
    const b = compare ? baseline.current.get(slot.id) : null;
    if (!b) return null;
    const f = slotFace(b) as StoredFace;
    const bd = readCreatorDoc(f);
    const eq = { ...defaultEquipped(), ...(b.equipped ?? {}) } as Equipped;
    const pal = effectivePalette({
      jersey: (eq.tops && getWearable(eq.tops)?.accent) || '#00E5FF', shorts: (eq.shorts && getWearable(eq.shorts)?.accent) || '#0b1220',
      shoes: (eq.shoes && getWearable(eq.shoes)?.accent) || '#A855F7', accent,
    }, bd?.colours);
    return { face: faceOnly(f) as FaceConfig, palette: pal, jersey, wardrobe: { tops: eq.tops ?? null, shorts: eq.shorts ?? null, shoes: eq.shoes ?? null },
      accessories: accessoriesForEquipped(eq), creator: bd, wornParts: wornPartsForEquipped(eq), frame: b.frame ?? null, presentation: b.presentation?.scale ?? null };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compare, slot.id, accent, jersey]);
  const strip = useMemo(() => visibleEntries(stripEntries(hist)), [hist]);
  const back = backdropFor(venue);

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
      baseline.current = new Map(allSlots.map((s) => [s.id, s]));
      walkDo('saved');
      cue('saved');
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

  const dirty = !!savedSig && sigNow !== savedSig;
  const stageH = fullBleed ? 'h-[100dvh]' : 'h-[calc(100dvh-3.5rem)] max-md:h-[calc(100dvh-3.5rem-4.5rem)]';
  const hudBtn = 'pointer-events-auto flex items-center gap-1 rounded-lg border border-white/10 bg-black/55 px-2.5 py-1.5 max-md:px-2 max-md:py-1 font-display text-[10px] font-semibold uppercase tracking-wider text-white/80 backdrop-blur transition hover:border-cyan-400/50';
  const on = (v: boolean) => (v ? { borderColor: 'var(--fel-cyan)', color: 'var(--fel-cyan)', background: 'rgba(0,229,255,0.12)' } : undefined);
  const selLabel = tab === 'parts' && selectedPart ? `Part · ${selectedPart.shape}` : tab === 'paint' && selectedLayer ? `Layer · ${REGION_LABELS[selectedLayer.region]}` : null;
  const selMirror = tab === 'parts' ? selectedPart?.mirror : tab === 'paint' ? selectedLayer?.mirror : undefined;

  // CREATOR-PLAN phase 4d: THE STUDIO — a full-screen stage (the preview, its HUD, the history strip) and the editor
  // beside it (below it on a phone), one editor: every tab below is the Closet's, unchanged.
  return (
    <div className={`flex ${stageH} flex-col overflow-hidden bg-[#050505] md:grid md:grid-cols-[minmax(0,1fr)_minmax(360px,420px)]`}>
      <section aria-label="Studio stage" className="relative min-h-0 flex-[0_0_54%] overflow-hidden md:h-full"
        style={{ background: `radial-gradient(ellipse at 50% 42%, ${back.glow}30 0%, transparent 58%), linear-gradient(180deg, #0c0c11 0%, ${back.base} 100%)` }}>
        {/* The actual game model (forged fel-hero) wearing the draft look —
            what you design here is what spawns in every mode. */}
        <AvatarPreview face={previewFace} palette={previewPalette} jersey={jersey} wardrobe={{ tops: equipped.tops ?? null, shorts: equipped.shorts ?? null, shoes: equipped.shoes ?? null }} accessories={previewAccessories} creator={doc} wornParts={previewWornParts} onMorphs={setMorphNames}
          body={heroBodyForSlot(slot.body, { scanOwned, fallback: serverBody })} frame={slot.frame ?? null} presentation={slot.presentation?.scale ?? null}
          before={beforeLook}
          studio={{ tab, focus, selectedPart, sticker, region: selectedLayer?.region ?? tapped?.region ?? null, knobs: !compare && !photoOpen, events, apiRef: studioApi }} />

        {/* top: the title and the character, the shots and the tools */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
          <div className="min-w-[7rem]">
            <h1 className="flex items-center gap-2 font-display text-lg font-bold uppercase tracking-[0.22em] text-white max-md:text-base max-md:tracking-[0.15em]"><Shirt className="h-5 w-5 text-cyan-400" /> Studio</h1>
            <p className="truncate font-display text-[11px] uppercase tracking-[0.18em] text-white/55">{slot.label || 'This character'}{dirty ? ' · unsaved' : ''}</p>
            {selLabel && (
              <div className="pointer-events-auto mt-2 flex items-center gap-1.5">
                <span className="rounded-md bg-black/55 px-2 py-1 font-display text-[10px] uppercase tracking-wider text-cyan-200 backdrop-blur">{selLabel}</span>
                <button type="button" className={hudBtn} style={on(!!selMirror)} onClick={toggleMirror} aria-pressed={!!selMirror} title="Mirror left and right (M, pad R3)"><FlipHorizontal className="h-3.5 w-3.5" /> Mirror</button>
              </div>
            )}
            {tapped && !selLabel && (
              <div className="pointer-events-auto mt-2 flex flex-wrap items-center gap-1.5" aria-label="Tapped region">
                <span className="rounded-md bg-black/55 px-2 py-1 font-display text-[10px] uppercase tracking-wider text-cyan-200 backdrop-blur">{REGION_LABELS[tapped.region]}</span>
                <button type="button" className={hudBtn} onClick={() => addAt('fill')}>+ Fill</button>
                <button type="button" className={hudBtn} onClick={() => addAt('pattern')}>+ Pattern</button>
                <button type="button" className={hudBtn} onClick={() => addAt('stamp')}>+ Stamp here</button>
                <button type="button" className="pointer-events-auto rounded p-1 text-white/50 hover:text-white" onClick={() => setTapped(null)} aria-label="Clear"><X className="h-3.5 w-3.5" /></button>
              </div>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <button onClick={() => save()} disabled={saving} className="pointer-events-auto flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2 max-md:px-3 max-md:py-1.5 font-display text-xs font-bold uppercase tracking-wider text-black shadow-[0_0_18px_rgba(0,229,255,0.35)] transition hover:bg-cyan-300 disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save Look
            </button>
            <div className="flex gap-1" role="group" aria-label="Camera">
              {STUDIO_SHOTS.map((sh, i) => <button key={sh} type="button" className={hudBtn} onClick={() => act({ shot: sh })} title={`${sh} (${i + 1})`}>{sh}</button>)}
            </div>
            <div className="flex flex-wrap justify-end gap-1">
              <button type="button" className={hudBtn} style={on(autoSpin)} onClick={() => setAutoSpin(!autoSpin)} aria-pressed={autoSpin} title="Turntable (T, pad L3) — or drag the stage to spin"><RotateCw className="h-3.5 w-3.5" /> <span className="max-md:hidden">Spin</span></button>
              <button type="button" className={hudBtn} style={on(compare)} onClick={() => setCompare((c) => !c)} aria-pressed={compare} title="Before / after (B, pad Select)"><SplitSquareHorizontal className="h-3.5 w-3.5" /> <span className="max-md:hidden">Before</span></button>
              <button type="button" className={hudBtn} style={on(showPose)} onClick={() => setShowPose((v) => !v)} aria-pressed={showPose} title="Poses and venue light"><Sun className="h-3.5 w-3.5" /> <span className="max-md:hidden">Pose</span></button>
              <button type="button" className={hudBtn} onClick={() => setPhotoOpen(true)} title="Photo mode (P, pad Start)"><Camera className="h-3.5 w-3.5" /> <span className="max-md:hidden">Photo</span></button>
              <button type="button" className={hudBtn} onClick={() => setOpenPaste((n) => n + 1)} title="Paste a share code as a new character"><ClipboardPaste className="h-3.5 w-3.5" /> <span className="max-md:hidden">Code</span></button>
            </div>
          </div>
        </div>

        {compare && <div className="pointer-events-none absolute left-1/2 top-16 -translate-x-1/2 rounded-full border border-[#FFD700]/60 bg-black/60 px-3 py-1 font-display text-[11px] font-bold uppercase tracking-[0.25em] text-[#FFD700]">Before</div>}

        {showPose && (
          <div className="absolute inset-x-3 top-[7.5rem] z-10 rounded-xl border border-white/10 bg-[#0c0c11]/90 p-3 backdrop-blur md:left-auto md:w-[340px]" aria-label="Pose and light">
            <div className="mb-1.5 font-display text-[10px] uppercase tracking-[0.2em] text-white/40">Pose — from the modes</div>
            <div className="mb-2 flex flex-wrap gap-1.5">{STUDIO_POSES.map((p) => <button key={p.id} type="button" className={hudBtn} style={on(pose === p.id)} onClick={() => playPose(p.id)}>{p.label}</button>)}</div>
            <div className="mb-1.5 font-display text-[10px] uppercase tracking-[0.2em] text-white/40">Light — each venue&apos;s</div>
            <div className="flex flex-wrap gap-1.5">{STUDIO_VENUES.map((v) => <button key={v.id} type="button" className={hudBtn} style={on(venue === v.id)} onClick={() => setVenue(v.id)}>{v.label}</button>)}</div>
            <p className="mt-2 text-[10px] text-white/35">Poses and light are for looking only — they never change the look or the save.</p>
          </div>
        )}

        {offer && (
          <div role="status" className="absolute left-1/2 top-[7.5rem] z-10 flex w-[min(420px,calc(100%-1.5rem))] -translate-x-1/2 flex-wrap items-center gap-2 rounded-xl border border-[#FFD700]/40 bg-[#0c0c11]/92 px-3 py-2 text-[12px] text-white/80 backdrop-blur">
            <span className="flex-1">Big change. Keep the look from before it as a new character?</span>
            <button type="button" onClick={keepBefore} className="rounded-md bg-[#FFD700]/90 px-2.5 py-1 font-display text-[11px] font-bold uppercase text-black">Keep a copy</button>
            <button type="button" onClick={() => setOffer(null)} className="text-[11px] text-white/50 hover:text-white">No thanks</button>
          </div>
        )}

        <div className="pointer-events-none absolute bottom-14 left-3 z-10 max-md:hidden">
          <WalkthroughCard state={walk} onNext={() => walkDo('next')} onSkip={() => walkDo('skip')} />
        </div>

        {photoOpen && (
          <PhotoMode label={slot.label} accent={accent} adult={adult} onClose={() => setPhotoOpen(false)}
            makeCode={(numbers) => encodeSlotCode(slot, { numbers })}
            capture={async (o) => (studioApi.current ? studioApi.current.capture(o) : null)} />
        )}

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 pt-6">
          <HistoryStrip entries={strip} canUndo={canUndo(hist)} canRedo={canRedo(hist)} onUndo={() => act('undo')} onRedo={() => act('redo')}
            onJump={(o) => { setHist((h) => jumpHistory(h, o)); cue('undo'); }} />
        </div>
      </section>

      <aside aria-label="Editor" className="min-h-0 flex-1 overflow-y-auto border-t border-white/10 bg-[#0a0a0f] px-4 py-4 md:border-l md:border-t-0">
        {/* a phone's stage is small: the walkthrough sits at the top of the editor there */}
        <div className="mb-3 md:hidden"><WalkthroughCard state={walk} onNext={() => walkDo('next')} onSkip={() => walkDo('skip')} /></div>
        <div className="mb-4 space-y-3">
          <p className="text-[11px] text-white/45">Design your avatar&apos;s face, gear, and card skin. Everyone belongs here — the options are built to represent you. Tap the body to choose a region, drag the stage to spin, pinch or scroll to zoom.</p>
          <LookConsent adult={adult} consent={consent} onChange={(next) => { setConsent(next); writeConsent(next); }} />
          {/* CREATOR-PLAN phase 4a: the characters (up to 5) — select one to edit it, "Play as" to wear it in every mode */}
          <SlotBar slots={allSlots} selected={selectedId} active={activeId} dirty={dirty}
            onSelect={selectSlot} onPlayAs={(id) => { void save(id); }} onNew={newCharacter} onDuplicate={duplicateCharacter}
            onRename={renameCharacter} onDelete={deleteCharacter} onPaste={pasteCharacter} onShare={shareCode} accent={accent} openPaste={openPaste} />
          <PublishLookAsCard />{/* PIPELINES (2026-10-06): publish the look as a fashion card — under the characters, beside the Studio's Save Look */}
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
        <div>
          <div className="sticky top-0 z-10 -mx-4 mb-4 flex flex-wrap gap-2 bg-[#0a0a0f]/95 px-4 py-2 backdrop-blur">
            <Chip label="Face" active={tab === 'face'} onClick={() => setTab('face')} />
            <Chip label="Shape" active={tab === 'shape'} onClick={() => setTab('shape')} />
            <Chip label="Parts" active={tab === 'parts'} onClick={() => setTab('parts')} />
            <Chip label="Paint" active={tab === 'paint'} onClick={() => setTab('paint')} />
            <Chip label="Wearables" active={tab === 'wear'} onClick={() => setTab('wear')} />
            <Chip label="Card Skins" active={tab === 'skins'} onClick={() => setTab('skins')} accent="#A855F7" />
          </div>

          {tab === 'face' && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
              {/* the 2D sketch: where the face options without a 3D shape yet still show */}
              <div className="rounded-xl border border-white/10 bg-white/[0.02] py-3"><FacePreview face={face} accent={accent} /></div>
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
                canUndo={canUndo(hist)} canRedo={canRedo(hist)} onUndo={() => setHist(undo)} onRedo={() => setHist(redo)}
                selectedId={partSel} onSelect={(id) => { setPartSel(id); setTapped(null); }} />
            </motion.div>
          )}

          {tab === 'paint' && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <PaintTab layers={doc?.paint ?? []} suit={doc?.flags.suit ?? false} onChange={setPaint} onSuit={setSuit} accent={previewPalette.accent} marks={doc?.marks ?? []} onMarks={setPaintMarks}
                canUndo={canUndo(hist)} canRedo={canRedo(hist)} onUndo={() => setHist(undo)} onRedo={() => setHist(redo)}
                selectedId={layerSel} onSelect={(id) => { setLayerSel(id); setTapped(null); }} />
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
      </aside>
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
