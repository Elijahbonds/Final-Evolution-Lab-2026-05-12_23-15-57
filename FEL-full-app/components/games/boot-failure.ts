import type { Dispatch, SetStateAction } from 'react';
import type { ModePhase } from '@/lib/babylon';

const DEFAULT_BOOT_ERROR = 'Failed to load this mode. Check your connection and try again.';

export function failBabylonBoot(
  label: string,
  error: unknown,
  setPhase: Dispatch<SetStateAction<ModePhase>>,
  setLoadError: Dispatch<SetStateAction<string | null>>,
): void {
  console.error(`${label} boot failed`, error);
  setLoadError(DEFAULT_BOOT_ERROR);
  setPhase('error');
}
