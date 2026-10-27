'use client';
// Carries the app's Motion setting (lib/a11y/reducedMotion.ts) onto <html> as data-fel-motion, so CSS can honour it:
// app/theme.css zeroes the --fel-dur-* tokens and stops the premium animations under data-fel-motion="reduce", and
// "full" overrides the device's prefers-reduced-motion. 'system' removes the attribute and the device decides.
import { useEffect } from 'react';
import { onMotionChange, readMotionPref } from '@/lib/a11y/reducedMotion';
import { MOTION_ATTR, motionAttrValue } from '@/lib/design/motion';

export function applyMotionAttr(root: HTMLElement = document.documentElement): void {
  const v = motionAttrValue(readMotionPref());
  if (v) root.setAttribute(MOTION_ATTR, v); else root.removeAttribute(MOTION_ATTR);
}

export function useMotionAttr(): void {
  useEffect(() => {
    applyMotionAttr();
    return onMotionChange(() => applyMotionAttr());
  }, []);
}
