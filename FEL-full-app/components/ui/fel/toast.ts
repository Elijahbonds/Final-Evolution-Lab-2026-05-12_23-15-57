// TOAST (lane/premium-ui P1): the app's Toaster (app/layout.tsx, sonner — already a dependency) with the premium look: a
// glass pill at the top, the tone as an icon colour, never colour alone (the message says what happened). Sonner's
// region is a polite live region, so a screen reader hears it.
import { toast } from 'sonner';
import { pressFeedback } from '@/lib/design/feedback';

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

const CLASS = 'fel-glass !rounded-[20px] !border-[color:var(--fel-hairline)] !text-white !font-sans !text-[14px] !shadow-[0_18px_40px_-18px_rgba(0,0,0,0.9)]';

export function felToast(message: string, { tone = 'info', description }: { tone?: ToastTone; description?: string } = {}) {
  if (tone === 'success') pressFeedback('success');
  const opts = { description, className: CLASS };
  if (tone === 'success') return toast.success(message, opts);
  if (tone === 'warning') return toast.warning(message, opts);
  if (tone === 'danger') return toast.error(message, opts);
  return toast(message, opts);
}
