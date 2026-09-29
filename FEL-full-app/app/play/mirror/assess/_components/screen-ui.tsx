// The Quick Screen's shared pieces (SCREEN-SHIP, 2026-09-29; SCREEN-FIX): the page frame (system font, portrait-first,
// one column), the "Early version" label, the band chip every result uses (an ICON, a WORD and a COLOUR, never colour
// alone: Squad gate 3), the stop line and the "Have a parent open this" card. No hooks, no client state: the results
// view, the lane page, the privacy page and the tests all render these.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { AlertOctagon, AlertTriangle, ArrowLeft, CheckCircle2, CircleDashed, Users } from 'lucide-react';
import { BAND_WORDS, type BandWord } from '@/lib/screen/PROPOSED-thresholds';
import { EARLY_VERSION, EARLY_VERSION_LINE, PARENT_BODY, PARENT_TITLE, STOP_LINE } from '@/lib/screen/copy';
import { SCREEN_HOME } from '@/lib/screen/routes';
import { SYSTEM_FONT_STACK } from '@/lib/screen/ui';

/** The band's colour token (the app's palette): the chip also carries an icon and a word, so the colour is never alone. */
export const BAND_COLOUR: Record<BandWord | 'unread', string> = {
  green: '#00FF9D', yellow: '#FFB020', red: '#FF5A5F', unread: 'rgba(255,255,255,0.55)',
};
export const UNREAD_WORD = 'Not read';

const ICON = { green: CheckCircle2, yellow: AlertTriangle, red: AlertOctagon, unread: CircleDashed } as const;

export function BandChip({ band, size = 'md' }: { band: BandWord | null; size?: 'md' | 'lg' }) {
  const key = band ?? 'unread';
  const Icon = ICON[key];
  const word = band ? BAND_WORDS[band] : UNREAD_WORD;
  return (
    <span data-band={key} data-colour={BAND_COLOUR[key]} className={`inline-flex items-center gap-1.5 font-bold ${size === 'lg' ? 'text-[16px]' : 'text-[14px]'}`} style={{ color: BAND_COLOUR[key] }}>
      <Icon aria-hidden data-band-icon={key} className={size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'} />
      <span data-band-word>{word}</span>
    </span>
  );
}

/**
 * "Early version", with its line: on every screen that shows a band, a score or a cue. The plain words for the
 * PROPOSED file's own label (S-7); that label stays as it is for the other screens that import it.
 */
export function PreviewLabel({ line = true }: { line?: boolean }) {
  return (
    <div data-preview-label className="flex flex-wrap items-center gap-2">
      <span title={EARLY_VERSION_LINE} className="rounded-full border border-[#FFB020]/50 bg-[#FFB020]/10 px-2.5 py-0.5 text-[12px] font-bold text-[#FFB020]">
        {EARLY_VERSION}
      </span>
      {line ? <span className="text-[12px] text-white/60">{EARLY_VERSION_LINE}.</span> : null}
    </div>
  );
}

/** A small "Early version" tag for a cue. */
export const EarlyTag = () => (
  <span data-early-tag title={EARLY_VERSION_LINE} className="ml-1.5 whitespace-nowrap rounded border border-[#FFB020]/50 px-1.5 py-px align-middle text-[11px] font-bold text-[#FFB020]">{EARLY_VERSION}</span>
);

/** "Not a medical exam. If anything hurts, stop." On the results and the program page (owner, 2026-09-29). */
export const StopLine = ({ className = 'text-[13px] text-white/70' }: { className?: string }) => (
  <p data-stop-line className={className}>{STOP_LINE}</p>
);

/**
 * Under 13, or "rather not say": in place of every link out of the screen (Cyber 3). No link, no button, no field:
 * the words only.
 */
export function ParentCard() {
  return (
    <section data-parent-card className="rounded-2xl border border-[#00E5FF]/30 bg-[#00E5FF]/[0.05] p-4">
      <div className="flex items-center gap-2 text-[#00E5FF]"><Users aria-hidden className="h-5 w-5" /><p className="text-[17px] font-black text-white">{PARENT_TITLE}</p></div>
      <p className="mt-1.5 text-[14px] leading-snug text-white/75">{PARENT_BODY}</p>
    </section>
  );
}

/**
 * The page frame: the system font stack (gate 1), one portrait column, a back arrow and the title.
 *
 * THE BACK ARROW STAYS IN THE SCREEN (S-2). `back` is a function for a step inside one page (the flow's own back), or
 * one of lib/screen/routes.ts's addresses; the start card's is /screen. Never /play/mirror, /login or /try: those
 * mount next-auth (a session request, `nextauth.message` in localStorage) or set a guest cookie.
 */
export function ScreenFrame({ children, right, back = SCREEN_HOME, title = 'Quick Screen' }: { children: ReactNode; right?: ReactNode; back?: string | (() => void); title?: string }) {
  const arrow = 'grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.03] text-white/70';
  return (
    <div data-screen-frame className="relative min-h-screen bg-[#050505] text-white" style={{ fontFamily: SYSTEM_FONT_STACK }}>
      <div className="relative mx-auto max-w-[560px] px-4 pb-10 pt-3">
        <header className="mb-3 flex items-center gap-3">
          {typeof back === 'function' ? (
            <button type="button" onClick={back} data-back aria-label="Back one step" className={arrow}>
              <ArrowLeft className="h-[18px] w-[18px]" />
            </button>
          ) : (
            <Link href={back} prefetch={false} data-back aria-label="Back" className={arrow}>
              <ArrowLeft className="h-[18px] w-[18px]" />
            </Link>
          )}
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#00E5FF]">Free movement check</p>
            <h1 className="truncate text-[22px] font-black leading-none tracking-tight">{title}</h1>
          </div>
          {right ? <div className="ml-auto">{right}</div> : null}
        </header>
        {children}
      </div>
    </div>
  );
}

/** One step's card: a heading and its primary action inside the first screen (gate 1). */
export function StepCard({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <section data-step={testId} className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      {children}
    </section>
  );
}

export const primaryBtn = 'inline-flex w-full items-center justify-center rounded-full bg-[#00E5FF] px-6 py-3.5 text-[16px] font-black text-black disabled:opacity-40';
export const outlineBtn = 'inline-flex w-full items-center justify-center rounded-full border-2 border-[#00E5FF] px-6 py-3 text-[15px] font-bold text-[#00E5FF]';
export const quietBtn = 'inline-flex w-full items-center justify-center rounded-full border border-white/20 px-6 py-3 text-[15px] font-bold text-white';
