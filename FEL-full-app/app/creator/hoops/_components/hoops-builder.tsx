'use client';

// THE HOOPS BUILDER SCREEN (lane/hoops-builder, owner 2026-11-12): "pick height and a position, plus 5 ratings … Earn upgrade points
// by playing." It edits a DRAFT and saves the whole choice; the server re-checks every number (app/api/v1/creator/hoops/route.ts),
// so this screen only decides what it shows and which buttons are live. Every line under a rating comes from the same bands the
// game reads (lib/babylon/hoops/ratings.ts effectLine), so the screen cannot promise a number the game does not play.
//
// No layout shift: the screen draws its full shape on the first frame (a wing at 6'4", every rating 50, no points) and fills the
// numbers in when the build arrives. Every control is at least 44 px; text sits on the type scale; rows wrap rather than clip at
// 150 % text and 200 % zoom.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Minus, Plus } from 'lucide-react';
import { TYPE } from '@/lib/design/type';
import { PrimaryCta } from '@/components/ui/fel/primary-cta';
import { Chip } from '@/components/ui/fel/chip';
import {
  HOOPS_RATING_IDS, HOOPS_POSITIONS, HEIGHT_DEFAULT_IN, HEIGHT_MAX_IN, HEIGHT_MIN_IN, RATING_BASE, RATING_MAX, RATING_MIN,
  POSITION_ABOUT, POSITION_LABEL, RATING_ABOUT, RATING_LABEL, effectLine, heightLabel, heightLine, startingRatings,
  type HoopsPosition, type HoopsRatingId, type HoopsRatings,
} from '@/lib/babylon/hoops/ratings';
import { POINTS_DAY_CAP, POINTS_PER_GAME, POINTS_PER_WIN, pointsSpent, stepCost, type HoopsView } from '@/lib/creator/hoops/hoopsBuild';

const ZERO: HoopsRatings = { speed: 0, handle: 0, shooting: 0, finishing: 0, defense: 0 };
const FULL: HoopsRatings = { speed: RATING_MAX, handle: RATING_MAX, shooting: RATING_MAX, finishing: RATING_MAX, defense: RATING_MAX };

interface Draft { position: HoopsPosition; heightIn: number; steps: HoopsRatings }

const sameDraft = (a: Draft, b: Draft) =>
  a.position === b.position && a.heightIn === b.heightIn && HOOPS_RATING_IDS.every((id) => a.steps[id] === b.steps[id]);

export default function HoopsBuilder() {
  const [view, setView] = useState<HoopsView | null>(null);
  const [saved, setSaved] = useState<Draft>({ position: 'wing', heightIn: HEIGHT_DEFAULT_IN, steps: { ...ZERO } });
  const [draft, setDraft] = useState<Draft>(saved);
  const [note, setNote] = useState('Loading your ratings…');
  const [busy, setBusy] = useState(false);
  const [readOnly, setReadOnly] = useState(false);

  const take = useCallback((v: HoopsView) => {
    const d = { position: v.position, heightIn: v.heightIn, steps: { ...v.steps } };
    setView(v); setSaved(d); setDraft(d);
  }, []);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const r = await fetch('/api/v1/creator/hoops');
        const body = await r.json().catch(() => ({}));
        if (dead) return;
        if (r.status === 401) { setNote('Sign in to build your hoops player.'); return; }
        if (!r.ok || !body?.hoops) { setNote('Could not load your ratings. Try again in a moment.'); return; }
        take(body.hoops as HoopsView);
        setReadOnly(body.readOnly === true);
        setNote(body.readOnly ? 'These ratings were saved by a newer version of the app. Reload to change them.'
          : body.gained > 0 ? `You earned ${body.gained} point${body.gained === 1 ? '' : 's'} since your last visit.` : '');
      } catch {
        if (!dead) setNote('Could not reach the server. Try again in a moment.');
      }
    })();
    return () => { dead = true; };
  }, [take]);

  const ceilings = view?.ceilings ?? FULL;
  const earned = view?.points.earned ?? 0;
  const start = useMemo(() => startingRatings(draft.position, draft.heightIn), [draft.position, draft.heightIn]);
  const spent = pointsSpent(draft.steps);
  const left = Math.max(0, earned - spent);
  const rating = (id: HoopsRatingId) => Math.max(RATING_MIN, Math.min(ceilings[id], start[id] + draft.steps[id]));
  const live = view !== null && !busy && !readOnly;
  const dirty = !sameDraft(draft, saved);

  const canRaise = (id: HoopsRatingId) => live && start[id] + draft.steps[id] < ceilings[id] && left >= stepCost(draft.steps[id] + 1);
  const canLower = (id: HoopsRatingId) => live && draft.steps[id] > 0;
  const step = (id: HoopsRatingId, by: 1 | -1) => setDraft((d) => ({ ...d, steps: { ...d.steps, [id]: Math.max(0, d.steps[id] + by) } }));

  const save = useCallback(async () => {
    setBusy(true); setNote('Saving…');
    try {
      const r = await fetch('/api/v1/creator/hoops', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(draft),
      });
      const body = await r.json().catch(() => ({}));
      if (r.ok && body?.hoops) { take(body.hoops as HoopsView); setNote('Saved. Your next casual hoops game plays with these.'); }
      else if (r.status === 422 || r.status === 409) setNote(((body.issues ?? []) as Array<{ message: string }>).map((i) => i.message).join(' ') || 'Not saved.');
      else if (r.status === 401) setNote('Sign in to save. Nothing was changed.');
      else setNote('Could not save. Nothing was changed.');
    } catch {
      setNote('Could not reach the server. Nothing was changed.');
    } finally {
      setBusy(false);
    }
  }, [draft, take]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6">
      <header className="flex flex-col gap-2">
        <p className={`${TYPE.label} text-fel-soft`}>Creator · Hoops</p>
        <h1 className={`${TYPE.title} text-white`}>Your hoops player</h1>
        <p className={`${TYPE.body} text-fel-soft`}>Pick a position and a height, then spend the points you earn by playing.</p>
      </header>

      {/* POINTS */}
      <section aria-labelledby="hb-points" className="fel-surface flex flex-col gap-2 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="hb-points" className={`${TYPE.heading} text-white`}>Points to spend</h2>
          <p className={`${TYPE.title} tabular-nums text-fel-gold`} data-testid="hb-points-left">{left}</p>
        </div>
        <p className={`${TYPE.small} text-fel-soft`}>
          Earned today: {view?.points.today ?? 0} of {POINTS_DAY_CAP}. {POINTS_PER_GAME} a finished game, {POINTS_PER_GAME + POINTS_PER_WIN} a win.
        </p>
        <p className={`${TYPE.small} text-fel-soft`}>Ranked, staked and arena games use standard ratings for everyone.</p>
      </section>

      {/* POSITION */}
      <section aria-labelledby="hb-position" className="fel-surface flex flex-col gap-3 p-4">
        <h2 id="hb-position" className={`${TYPE.heading} text-white`}>Position</h2>
        <div role="radiogroup" aria-labelledby="hb-position" className="grid grid-cols-3 gap-2">
          {HOOPS_POSITIONS.map((p) => {
            const on = draft.position === p;
            return (
              <button key={p} type="button" role="radio" aria-checked={on} disabled={!live}
                onClick={() => setDraft((d) => ({ ...d, position: p }))}
                className={`fel-press min-h-11 rounded-xl border px-2 ${TYPE.heading} ${on ? 'border-fel-cyan bg-fel-cyan/[0.14] text-white' : 'border-white/12 bg-white/[0.04] text-fel-soft hover:text-white'}`}>
                {POSITION_LABEL[p]}
              </button>
            );
          })}
        </div>
        <p className={`${TYPE.small} text-fel-soft`}>{POSITION_ABOUT[draft.position]}</p>
      </section>

      {/* HEIGHT */}
      <section aria-labelledby="hb-height" className="fel-surface flex flex-col gap-3 p-4">
        <h2 id="hb-height" className={`${TYPE.heading} text-white`}>Height</h2>
        <div className="flex items-center gap-3">
          <StepButton label="Shorter" disabled={!live || draft.heightIn <= HEIGHT_MIN_IN} onClick={() => setDraft((d) => ({ ...d, heightIn: d.heightIn - 1 }))}><Minus aria-hidden className="h-5 w-5" /></StepButton>
          <p className={`${TYPE.title} min-w-[4ch] text-center tabular-nums text-white`} aria-live="polite">{heightLabel(draft.heightIn)}</p>
          <StepButton label="Taller" disabled={!live || draft.heightIn >= HEIGHT_MAX_IN} onClick={() => setDraft((d) => ({ ...d, heightIn: d.heightIn + 1 }))}><Plus aria-hidden className="h-5 w-5" /></StepButton>
        </div>
        <p className={`${TYPE.small} text-fel-soft`}>{heightLine(draft.heightIn)}. Taller finishes and defends better, but is a little slower with a looser handle.</p>
      </section>

      {/* THE FIVE RATINGS */}
      <section aria-labelledby="hb-ratings" className="flex flex-col gap-3">
        <h2 id="hb-ratings" className={`${TYPE.heading} text-white`}>Ratings</h2>
        {HOOPS_RATING_IDS.map((id) => {
          const r = rating(id);
          const atTop = start[id] + draft.steps[id] >= ceilings[id];
          const cost = stepCost(draft.steps[id] + 1);
          return (
            <div key={id} data-testid={`hb-rating-${id}`} className="fel-surface flex flex-col gap-2 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className={`${TYPE.heading} text-white`}>{RATING_LABEL[id]}</h3>
                  <p className={`${TYPE.small} text-fel-soft`}>{RATING_ABOUT[id]}</p>
                </div>
                <p className={`${TYPE.title} shrink-0 tabular-nums text-white`} aria-label={`${RATING_LABEL[id]} ${r}`}>{r}</p>
              </div>
              <Bar value={r} cap={ceilings[id]} />
              <p className={`${TYPE.small} text-fel-text`} aria-live="polite">{effectLine(id, r)}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <StepButton label={`Lower ${RATING_LABEL[id]}`} disabled={!canLower(id)} onClick={() => step(id, -1)}><Minus aria-hidden className="h-5 w-5" /></StepButton>
                <StepButton label={`Raise ${RATING_LABEL[id]}`} disabled={!canRaise(id)} onClick={() => step(id, 1)}><Plus aria-hidden className="h-5 w-5" /></StepButton>
                <p className={`${TYPE.small} text-fel-soft`}>
                  {atTop ? `At the top: ${ceilings[id]}${ceilings[id] < RATING_MAX ? ', set by your body scan' : ''}` : `Next step costs ${cost} point${cost === 1 ? '' : 's'}`}
                </p>
              </div>
            </div>
          );
        })}
        <p className={`${TYPE.small} text-fel-soft`}>Lowering a rating gives its points back. The first 15 steps on a rating cost 1 point, then 2.</p>
      </section>

      <p className={`${TYPE.body} min-h-[3rem] text-fel-gold`} role="status" aria-live="polite">{note}</p>

      <div className="flex flex-wrap gap-2">
        <Chip href="/play/onevone">Play ONES</Chip>
        <Chip href="/play/threevthree">Play THREES</Chip>
        <Chip href="/creator/athlete">Athlete Creator</Chip>
        {dirty && (
          <button type="button" onClick={() => setDraft(saved)} disabled={busy}
            className={`fel-press inline-flex min-h-11 items-center rounded-full border border-white/12 bg-white/[0.06] px-3 ${TYPE.label} text-fel-soft hover:bg-white/[0.1]`}>
            Undo changes
          </button>
        )}
      </div>

      {dirty && live
        ? <PrimaryCta docked onClick={save} testId="hb-save">Save</PrimaryCta>
        : <PrimaryCta docked href="/play/onevone" testId="hb-play">Play a game</PrimaryCta>}
    </div>
  );
}

function StepButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} disabled={disabled} onClick={onClick}
      className="fel-press inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] text-white hover:bg-white/[0.12] disabled:opacity-40">
      {children}
    </button>
  );
}

/** 40 to 90 as a track: the fill to the rating, a tick at the standard 50, and the ceiling marked when it is under 90. */
function Bar({ value, cap }: { value: number; cap: number }) {
  const at = (v: number) => `${((v - RATING_MIN) / (RATING_MAX - RATING_MIN)) * 100}%`;
  return (
    <div aria-hidden className="relative h-2 w-full rounded-full bg-white/[0.08]">
      <div className="absolute inset-y-0 left-0 rounded-full bg-fel-cyan" style={{ width: at(value) }} />
      <div className="absolute -inset-y-1 w-px bg-white/60" style={{ left: at(RATING_BASE) }} />
      {cap < RATING_MAX && <div className="absolute inset-y-0 right-0 rounded-r-full bg-white/[0.04] [background-image:repeating-linear-gradient(45deg,transparent_0_3px,rgba(255,255,255,0.12)_3px_6px)]" style={{ left: at(cap) }} />}
    </div>
  );
}
