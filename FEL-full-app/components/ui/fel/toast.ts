// TOAST (lane/premium-ui P1): the app's Toaster (app/layout.tsx, sonner — already a dependency) with the premium look: a
// glass pill at the top, the tone as an icon colour, never colour alone (the message says what happened). Sonner's
// region is a polite live region, so a screen reader hears it.
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { pressFeedback } from '@/lib/design/feedback';
import { readableMs } from '@/lib/readable/rules';

/** Sonner's own default time on screen (ms). */
export const TOAST_MS = 4000;

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

const CLASS = 'fel-glass !rounded-[20px] !border-[color:var(--fel-hairline)] !text-white !font-sans !text-[14px] !shadow-[0_18px_40px_-18px_rgba(0,0,0,0.9)]';

export function felToast(message: string, { tone = 'info', description }: { tone?: ToastTone; description?: string } = {}) {
  if (tone === 'success') pressFeedback('success');
  // READABLE (2026-11-02): up for the read time of the message and its line (words × 0.3 s + 1 s), never less than 4 s
  const opts = { description, className: CLASS, duration: readableMs(`${message} ${description ?? ''}`, TOAST_MS) };
  if (tone === 'success') return toast.success(message, opts);
  if (tone === 'warning') return toast.warning(message, opts);
  if (tone === 'danger') return toast.error(message, opts);
  return toast(message, opts);
}

type Sonner = typeof toast;
type Show = (message: string | ReactNode, data?: Parameters<Sonner>[1]) => string | number;

/** READABLE (2026-11-02): a sonner call that stays up for its read time. A message that reads inside sonner's own 4 s is
 *  passed through untouched; a longer one gets `duration: words × 0.3 s + 1 s` (its own `duration` still wins). */
function timed(show: Show): Show {
  return (message, data) => {
    const text = `${typeof message === 'string' ? message : ''} ${typeof data?.description === 'string' ? data.description : ''}`;
    const ms = readableMs(text, TOAST_MS);
    return ms > TOAST_MS ? show(message, { duration: ms, ...data }) : data === undefined ? show(message) : show(message, data);
  };
}

/** sonner's `toast`, with the read-time floor on the messages that need it. Use it for any toast longer than ten words. */
export const readToast: Sonner = Object.assign(timed(toast), toast, {
  success: timed(toast.success), info: timed(toast.info), warning: timed(toast.warning), error: timed(toast.error), message: timed(toast.message),
});
