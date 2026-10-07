'use client';

// The Studio's HAIR tab (2026-10-07, the hair expansion; owner: four packs, every style its own shape, beards, a second
// colour, accessories). Pick a style from the four packs — each a code-built shape fitted to your own head
// (lib/babylon/creator/hair) — its colour (a covering's fabric), a second colour and where it goes, the accessories that
// fit the style, a beard and its colour. Pure presentation: the Closet writes FaceConfig.hairStyle / hairColor and the
// doc's `hair` block, and records each change as a step of the Studio's undo history (a picker drag is one step).
//
// PHONE FIRST: two style tiles a row on a phone, three wider; every target at least 44 px tall; the pack chips scroll.

import { useState } from 'react';
import { Scissors } from 'lucide-react';
import { BEARD_STYLES, HAIR_ACCS, HAIR_DEFAULTS, HAIR_TONES, type BeardStyle, type CreatorHair, type HairAcc, type HairTone } from '@/lib/creator/look/doc';
import {
  BEARD_LABELS, HAIR_ACC_LABELS, HAIR_PACKS, HAIR_STYLE_BLURB, HAIR_TONE_LABELS, accFits, isCovering, packOf, toggleAcc, type HairPackId,
} from '@/lib/creator/look/hair';
import { HAIR_COLORS } from '@/lib/closet/wearable-catalog';
import { ColourRow } from './character-controls';

export interface HairTabProps {
  style: string;
  colour: string;
  /** the doc's hair block (undefined: nothing set) */
  extras: CreatorHair | undefined;
  onStyle: (style: string) => void;
  onColour: (hex: string, group?: string) => void;
  /** merge a change into the doc's hair block (null clears a field); `group` makes a drag one undo step */
  onExtras: (patch: Partial<Record<keyof CreatorHair, unknown>>, group?: string) => void;
  /** a raised hood or a helmet hides the hair: say so */
  covered?: boolean;
}

const ACC_SWATCHES = ['#D4AF37', '#C0C0C0', '#B87333', '#F2EEE6', '#1A1A1A', '#00E5FF', '#FF3366', '#A855F7'];
const SECOND_SWATCHES = ['#E4C590', '#B0B0B0', '#C68642', '#F2EEE6', '#00E5FF', '#A855F7', '#FF3366', '#7CFC00'];

function Pill({ label, active, onClick, disabled, title }: { label: string; active: boolean; onClick: () => void; disabled?: boolean; title?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title} aria-pressed={active}
      className="min-h-[36px] rounded-full border px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-30"
      style={{ backgroundColor: active ? '#00E5FF' : 'rgba(255,255,255,0.05)', color: active ? '#050505' : 'rgba(255,255,255,0.78)', borderColor: active ? '#00E5FF' : 'rgba(255,255,255,0.12)' }}>
      {label}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-white/45">{title}</div>
      {children}
    </div>
  );
}

export function HairTab(p: HairTabProps) {
  const [pack, setPack] = useState<HairPackId>(() => packOf(p.style) ?? 'textured');
  const shown = HAIR_PACKS.find((k) => k.id === pack) ?? HAIR_PACKS[0];
  const covering = isCovering(p.style);
  const x = p.extras ?? {};
  const acc = x.acc ?? [];
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
        <Scissors className="h-4 w-4 text-cyan-400" />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-white/80">Hair — {p.style}</div>
          <div className="text-[10px] text-white/40">Every style is built to fit your head. Free.</div>
        </div>
      </div>
      {p.covered && <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[11px] text-amber-200">Your hood or helmet is covering the hair right now.</div>}

      <Section title="Style">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Hair packs">
          {HAIR_PACKS.map((k) => <Pill key={k.id} label={k.label} active={pack === k.id} onClick={() => setPack(k.id)} />)}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label={`${shown.label} styles`}>
          {shown.styles.map((s) => {
            const on = p.style === s;
            return (
              <button key={s} type="button" role="radio" aria-checked={on} onClick={() => p.onStyle(s)}
                className="min-h-[56px] rounded-xl border px-3 py-2 text-left transition"
                style={{ borderColor: on ? '#00E5FF' : 'rgba(255,255,255,0.1)', backgroundColor: on ? 'rgba(0,229,255,0.12)' : 'rgba(255,255,255,0.03)' }}>
                <div className="text-xs font-semibold text-white/90">{s}</div>
                <div className="mt-0.5 text-[10px] leading-snug text-white/45">{HAIR_STYLE_BLURB[s] ?? ''}</div>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title={covering ? 'Wrap colour' : 'Hair colour'}>
        <ColourRow label={covering ? 'Wrap colour' : 'Hair colour'} swatches={HAIR_COLORS} value={p.colour} group="colour:hair" onPick={(h, g) => p.onColour(h, g)} />
      </Section>

      <Section title={covering ? 'Trim colour' : 'Second colour'}>
        <div className="flex flex-wrap gap-2">
          <Pill label="None" active={!x.colour2} onClick={() => p.onExtras({ colour2: null, tone: null })} />
          {!x.colour2 && <Pill label="Add" active={false} onClick={() => p.onExtras({ colour2: SECOND_SWATCHES[0] })} />}
        </div>
        {x.colour2 && (
          <>
            <ColourRow label={covering ? 'Trim colour' : 'Second hair colour'} swatches={SECOND_SWATCHES} value={x.colour2} group="colour:hair2" onPick={(h, g) => p.onExtras({ colour2: h }, g)} />
            {!covering && (
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Where the second colour goes">
                {HAIR_TONES.map((t: HairTone) => <Pill key={t} label={HAIR_TONE_LABELS[t]} active={(x.tone ?? HAIR_DEFAULTS.tone) === t} onClick={() => p.onExtras({ tone: t })} />)}
              </div>
            )}
          </>
        )}
      </Section>

      {!covering && (
        <Section title="Accessories">
          <div className="flex flex-wrap gap-2">
            {HAIR_ACCS.map((a: HairAcc) => {
              const fits = accFits(a, p.style);
              return <Pill key={a} label={HAIR_ACC_LABELS[a]} active={acc.includes(a) && fits} disabled={!fits}
                title={fits ? undefined : `${HAIR_ACC_LABELS[a]} don't fit ${p.style}`}
                onClick={() => p.onExtras({ acc: toggleAcc(acc, a) })} />;
            })}
          </div>
          {acc.some((a) => accFits(a, p.style)) && (
            <ColourRow label="Accessory colour" swatches={ACC_SWATCHES} value={x.accColour ?? HAIR_DEFAULTS.accColour} group="colour:hairacc" onPick={(h, g) => p.onExtras({ accColour: h }, g)} />
          )}
        </Section>
      )}

      <Section title="Beard">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Beard">
          <Pill label="None" active={!x.beard} onClick={() => p.onExtras({ beard: null, beardColour: null })} />
          {BEARD_STYLES.map((b: BeardStyle) => <Pill key={b} label={BEARD_LABELS[b]} active={x.beard === b} onClick={() => p.onExtras({ beard: b })} />)}
        </div>
        {x.beard && (
          <>
            <div className="flex flex-wrap gap-2">
              <Pill label="Same as hair" active={!x.beardColour} onClick={() => p.onExtras({ beardColour: null })} />
            </div>
            <ColourRow label="Beard colour" swatches={HAIR_COLORS} value={x.beardColour ?? p.colour} group="colour:beard" onPick={(h, g) => p.onExtras({ beardColour: h }, g)} />
          </>
        )}
      </Section>
    </div>
  );
}
