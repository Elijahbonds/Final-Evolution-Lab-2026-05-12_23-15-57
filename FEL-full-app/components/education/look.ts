// look — the lesson player's few shared looks, in one file so premium-ui can swap them in one place (PLAT-P04).
// Three button looks per page, and no more: the primary pill (components/ui/fel PrimaryCta), the chip below, and the
// camera / drill link (CameraLink and the drills lane's DrillsLink already share one look).
import { TYPE } from '@/lib/design/type';

/** A secondary action as a chip — the same shape as components/ui/fel Chip with an href, for a <button>. */
export const CHIP_BUTTON = `fel-press inline-flex min-h-11 items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.06] px-3 ${TYPE.label} text-fel-soft hover:bg-white/[0.1] disabled:opacity-35`;

