'use client';
// hoops-p08 (2026-11-12): the control hint a hoops host draws — for the first plays only, and on a touch screen in the touch deck's own
// words (lib/babylon/ui/hudHints.ts holds the rules; this is the React glue). Also the device, for the 3v3 pass chip's button name.
import { useEffect, useRef, useState } from 'react';
import { detectDevice } from '@/lib/ui/controlsScreen';
import { detectPadFamily, type PadFamily } from '@/lib/input/padLabels';
import { HintBudget, hintForDevice, type HintDevice } from '@/lib/babylon/ui/hudHints';

/** The device in the player's hands: a connected pad, else a touch screen, else the keys. Re-read when a pad comes or goes. */
export function useHintDevice(): { device: HintDevice; family: PadFamily | null } {
  const [d, setD] = useState<{ device: HintDevice; family: PadFamily | null }>({ device: 'keys', family: null });
  useEffect(() => {
    const read = () => setD((prev) => {
      const seen = detectDevice(), device: HintDevice = seen === 'pad' ? 'pad' : seen === 'touch' ? 'touch' : 'keys';
      const family = device === 'pad' ? detectPadFamily() : null;
      return prev.device === device && prev.family === family ? prev : { device, family };
    });
    read();
    window.addEventListener('gamepadconnected', read);
    window.addEventListener('gamepaddisconnected', read);
    return () => { window.removeEventListener('gamepadconnected', read); window.removeEventListener('gamepaddisconnected', read); };
  }, []);
  return d;
}

/** The hint to draw ('' = none): the mode's `hint` (`line`), through the play budget and the device's words. Counts plays from `hud`
 *  while `playing`. */
export function useHoopsHint(mode: string, line: unknown, hud: Readonly<Record<string, unknown>>, playing: boolean, device: HintDevice): string {
  const budget = useRef<HintBudget | null>(null);
  budget.current ??= new HintBudget(mode);
  const [, bump] = useState(0);
  useEffect(() => {
    if (!playing) return;
    const before = budget.current!.gate('x');
    budget.current!.observe(hud);
    if (budget.current!.gate('x') !== before) bump((n) => n + 1);   // the budget just ran out: draw once more without the hint
  }, [hud, playing]);
  return playing && typeof line === 'string' ? budget.current.gate(hintForDevice(line, mode, device)) : '';
}
