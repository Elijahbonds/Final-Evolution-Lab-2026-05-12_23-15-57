'use client';

// The stage takes the screen its header leaves it (improve-screens phase 1; the rule and the measurements are in
// lib/ui/stageFit.ts). Used by GameShell (every /play game) and by the /try guest dunk, the two shells that put a header
// above a game's host.
import { useEffect, useLayoutEffect, useSyncExternalStore, type RefObject } from 'react';
import { getFeelState, getServerFeelState, subscribeFeel } from '@/lib/feel-panel/feel';
import { chromeHeight, stageFitsHeader, STAGE_FIT_ATTR, STAGE_FIT_CSS, STAGE_FIT_VAR } from '@/lib/ui/stageFit';

const useBeforeFrame = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * `layoutUp`: the page layout is on screen (the shell's header is shown and the stage is not full-bleed). Returns the
 * attribute to spread on the stage: present only while the knob is on and the layout is up, so with the knob at 0, or
 * sideways, or in full screen, nothing below matches and the host keeps its own box. The measurement runs before the
 * frame is drawn and again whenever the header changes size (it wraps differently, or a button arrives).
 */
export function useStageFit(
  headerRef: RefObject<HTMLElement | null>,
  stageRef: RefObject<HTMLElement | null>,
  layoutUp: boolean,
): Record<string, string | undefined> {
  useSyncExternalStore(subscribeFeel, getFeelState, getServerFeelState);   // re-read the knob when the feel panel opens
  const active = layoutUp && stageFitsHeader();
  useBeforeFrame(() => {
    const stage = stageRef.current;
    if (!stage || !active) return;
    const header = headerRef.current;
    const measure = () => {
      const cs = getComputedStyle(stage);
      const h = header ? header.getBoundingClientRect().height : 0;
      stage.style.setProperty(STAGE_FIT_VAR, `${chromeHeight(h, parseFloat(cs.paddingTop), parseFloat(cs.paddingBottom))}px`);
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (header) ro?.observe(header);
    window.addEventListener('resize', measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
      stage.style.removeProperty(STAGE_FIT_VAR);
    };
  }, [active, headerRef, stageRef]);
  return { [STAGE_FIT_ATTR]: active ? '' : undefined };
}

/** The rules the attribute switches on. Rendered once per shell; they match nothing while the attribute is absent. */
export function StageFitStyle() {
  return <style data-fel-fit-rules="" dangerouslySetInnerHTML={{ __html: STAGE_FIT_CSS }} />;
}
