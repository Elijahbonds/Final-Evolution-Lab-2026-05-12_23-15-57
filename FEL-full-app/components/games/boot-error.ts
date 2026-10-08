import type { ModePhase } from '@/lib/babylon';

type BootErrorOptions = {
  disposed?: boolean;
  label?: string;
  setPhase: (phase: ModePhase) => void;
  setLoadError: (message: string) => void;
};

export function bootErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return 'Failed to load this mode.';
}

export function surfaceBootError(error: unknown, opts: BootErrorOptions): void {
  if (opts.disposed) return;
  if (opts.label) console.error(opts.label, error);
  opts.setLoadError(bootErrorMessage(error));
  opts.setPhase('error');
}
