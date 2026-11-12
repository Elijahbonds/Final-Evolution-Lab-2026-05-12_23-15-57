// STAT RING (lane/premium-ui P1): the Whoop / Oura read — one number, how full, at a glance. An SVG arc on a quiet track;
// the arc fills on arrival (theme.css fel-ring-fill, zero under reduced motion). A value nobody measured is a dash and an
// empty track, never a made-up number. The ring is one image to a screen reader: "{label}: {value} of {max}".
import { NUM, TYPE } from '@/lib/design/type';
import { t } from '@/lib/i18n';

export function ringGeometry(size: number, stroke: number, value: number | null, max: number) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = value === null || !Number.isFinite(value) || max <= 0 ? 0 : Math.min(1, Math.max(0, value / max));
  return { r, c, pct, offset: c * (1 - pct) };
}

export function StatRing({
  value, max = 100, label, display, size = 128, stroke = 10, color = 'var(--fel-accent)', sub,
}: {
  value: number | null;
  max?: number;
  label: string;
  /** what the centre says (default: the rounded value) */
  display?: string;
  size?: number;
  stroke?: number;
  color?: string;
  /** a word under the number: the status, a unit */
  sub?: string;
}) {
  const { r, c, offset } = ringGeometry(size, stroke, value, max);
  const shown = display ?? (value === null ? '—' : String(Math.round(value)));
  const aria = value === null ? t('ui.ringEmpty', { label }) : t('ui.ring', { label, value: shown, max });
  const big = size >= 112;
  return (
    <figure role="img" aria-label={aria} data-fel-ring className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="absolute inset-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        {value !== null && (
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={offset} className="fel-ring-arc"
            style={{ ['--fel-ring-c' as string]: `${c}`, filter: `drop-shadow(0 0 6px ${color.startsWith('var') ? 'rgba(0,229,255,0.45)' : `${color}73`})` }}
          />
        )}
      </svg>
      <figcaption aria-hidden className="relative flex flex-col items-center leading-none">
        <span className={`${NUM} ${big ? 'text-[44px]' : 'text-[30px]'} leading-none text-white`}>{shown}</span>
        {sub && <span className={`${TYPE.label} mt-1.5 text-fel-dim`}>{sub}</span>}
      </figcaption>
    </figure>
  );
}
