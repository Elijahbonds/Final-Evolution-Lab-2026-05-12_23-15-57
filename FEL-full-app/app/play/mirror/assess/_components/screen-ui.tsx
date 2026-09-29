// The Quick Screen's shared pieces (SCREEN-SHIP, 2026-09-29): the page frame (system font, portrait-first, one column),
// the "PROPOSED · preview" label, and the band chip every result uses: an ICON, a WORD and a COLOUR, never colour alone
// (Squad gate 3). No hooks, no client state: the results view, the lane page and the tests all render these.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { AlertOctagon, AlertTriangle, ArrowLeft, CheckCircle2, CircleDashed } from 'lucide-react';
import { BAND_WORDS, PREVIEW_LINE, PROVISIONAL_LABEL, type BandWord } from '@/lib/screen/PROPOSED-thresholds';
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

/** "PROPOSED · preview", with its line: on every screen that shows a band, a score or a cue. */
export function PreviewLabel({ line = true }: { line?: boolean }) {
  return (
    <div data-preview-label className="flex flex-wrap items-center gap-2">
      <span title={PREVIEW_LINE} className="rounded-full border border-[#FFB020]/50 bg-[#FFB020]/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[#FFB020]">
        {PROVISIONAL_LABEL}
      </span>
      {line ? <span className="text-[12px] text-white/60">{PREVIEW_LINE}.</span> : null}
    </div>
  );
}

/** A small "PROPOSED" tag for a cue. */
export const ProposedTag = () => (
  <span title={PREVIEW_LINE} className="ml-1.5 rounded border border-[#FFB020]/50 px-1.5 py-px align-middle text-[10px] font-bold uppercase tracking-[0.1em] text-[#FFB020]">PROPOSED</span>
);

/** The page frame: the system font stack (gate 1), one portrait column, a back link and the title. */
export function ScreenFrame({ children, right, back = '/play/mirror', title = 'Quick Screen' }: { children: ReactNode; right?: ReactNode; back?: string; title?: string }) {
  return (
    <div data-screen-frame className="relative min-h-screen bg-[#050505] text-white" style={{ fontFamily: SYSTEM_FONT_STACK }}>
      <div className="relative mx-auto max-w-[560px] px-4 pb-10 pt-3">
        <header className="mb-3 flex items-center gap-3">
          <Link href={back} prefetch={false} aria-label="Back to the Mirror"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.03] text-white/70">
            <ArrowLeft className="h-[18px] w-[18px]" />
          </Link>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#00E5FF]">The Mirror</p>
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
