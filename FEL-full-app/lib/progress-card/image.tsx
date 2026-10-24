// PROGRESS CARD — the share image's picture, as the element tree next/og's ImageResponse draws (the same built-in
// renderer the creator card's link preview uses: app/card/[slug]/opengraph-image.tsx; no new dependency).
//
// WHAT IS ON IT, and what never is:
//   · the week's numbers that were saved to the account (jump and form for opted-in adults, the streak and days played,
//     runs, and an adult's mode bests), each with its arrow only when both weeks have one;
//   · a dash and a plain word for a number nobody measured — never a placeholder value;
//   · the name ONLY when the owner ticks it AND the account is a verified adult. An under-18 or unknown-age card has no
//     name, no face (there is no photo or avatar on the image at all) and no location (FEL keeps none), whatever the
//     request asks for (owner decision 2026-10-22: teens private by default);
//   · numbers kept only on the phone (a teen's form %) are not on it: the server draws this and never sees them.
// Pure: no Prisma, no Next import (the route wraps it in ImageResponse), so a test can read exactly what it draws.
import type { ProgressTile } from '@/lib/profile-v2/tiles';
import { weekLabel, type CardMode, type ProgressCard } from './summary';

/** 4:5 portrait, the size the dunk poster shares at (components/games/dunk-poster.tsx) (new). */
export const CARD_IMAGE = { width: 1080, height: 1350 } as const;
/** Images one account may draw per window: a draw is real CPU, and a person shares a week a few times at most (new). */
export const IMAGE_LIMIT = { count: 20, windowMs: 10 * 60_000 } as const;

const INK = '#050505';
const PANEL = '#0f0f15';
const TONE = { better: '#00FF9D', worse: '#FF7A2F', same: '#8b97a5' } as const;
const ACCENT: Record<string, string> = { jump: '#00E5FF', form: '#00FF9D', reaction: '#FFD700', streak: '#FF7A2F' };
const ARROW = { up: '↑', down: '↓', same: '=' } as const;

export interface ImageOptions {
  /** The owner asked for their name. Ignored (never drawn) for an under-18 or unknown-age account. */
  showName: boolean;
}

/** Whether the name goes on the image: the owner's tick AND a verified adult's card (a teen's card carries no name). */
export function nameOnImage(card: Pick<ProgressCard, 'name' | 'minorOrUnknown'>, opts: ImageOptions): string | null {
  if (card.minorOrUnknown || !opts.showName) return null;
  const n = card.name?.trim();
  return n ? n.slice(0, 40) : null;
}

/** The empty tile's words on the image (the page has the full sentence and the link). Never implies a hidden number. */
export function emptyWord(t: ProgressTile): string {
  if (t.key === 'reaction') return 'Not tracked yet';
  if (t.key === 'streak') return 'No days played yet';
  // not saved to the account (not opted in, under 18), or kept on the phone: the server never sees it
  if (t.source !== 'account') return 'Not on this card';
  return 'Not measured this week';
}

/** The tile's comparison line on the image: the page's line, except the streak's, shortened to fit a tile. */
export function imageVsLine(t: ProgressTile): string | null {
  if (t.key !== 'streak') return t.vsLine;
  const c = t.compare;
  if (!c || c.thisWeek === null) return null;
  const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;
  return c.direction === null ? (c.thisWeek > 0 ? `${days(c.thisWeek)} played` : null) : `${days(c.thisWeek)} played, was ${c.lastWeek ?? 0}`;
}

/** The line on top of the image: the card's headline, said in the first person where the page speaks to the owner. */
export function imageHeadline(card: Pick<ProgressCard, 'state' | 'tally' | 'headline'>): string {
  if (card.state === 'new') return 'Day one. Nothing measured yet.';
  if (card.state === 'first-week') return 'My first week on record.';
  if (card.state === 'quiet-week') return 'Nothing logged this week yet.';
  if (card.tally.compared === 0) return 'Measured different things each week.';
  return card.headline;
}

function Tile({ t }: { t: ProgressTile }) {
  const trend = t.compare?.trend ?? null;
  const dir = t.compare?.direction ?? null;
  const line = imageVsLine(t);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: 464, height: 250, padding: 28, borderRadius: 28, background: PANEL, border: '2px solid rgba(255,255,255,0.08)' }}>
      <div style={{ display: 'flex', fontSize: 24, letterSpacing: 5, color: ACCENT[t.key] ?? '#fff' }}>{t.label.toUpperCase()}</div>
      {t.value !== null ? (
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 24 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', fontSize: 92, lineHeight: 1, color: '#fff' }}>{t.value}</div>
            <div style={{ display: 'flex', fontSize: 28, marginLeft: 12, marginBottom: 10, color: 'rgba(255,255,255,0.5)' }}>{t.unit}</div>
          </div>
          {line ? (
            <div style={{ display: 'flex', fontSize: 24, lineHeight: 1.25, marginTop: 14, color: trend ? TONE[trend] : 'rgba(255,255,255,0.5)' }}>
              {trend && dir ? `${ARROW[dir]} ${line}` : line}
            </div>
          ) : null}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 24 }}>
          <div style={{ display: 'flex', fontSize: 92, lineHeight: 1, color: 'rgba(255,255,255,0.22)' }}>—</div>
          <div style={{ display: 'flex', fontSize: 24, marginTop: 14, color: 'rgba(255,255,255,0.45)' }}>{emptyWord(t)}</div>
        </div>
      )}
    </div>
  );
}

function ModeRow({ m }: { m: CardMode }) {
  const trend = m.compare.trend;
  const dir = m.compare.direction;
  const best = m.compare.thisWeek;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 0', borderTop: '2px solid rgba(255,255,255,0.07)' }}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', fontSize: 32, color: '#fff' }}>{m.name}</div>
        {m.vsLine ? <div style={{ display: 'flex', fontSize: 24, marginTop: 4, color: trend ? TONE[trend] : 'rgba(255,255,255,0.45)' }}>{trend && dir ? `${ARROW[dir]} ${m.vsLine}` : m.vsLine}</div> : null}
      </div>
      <div style={{ display: 'flex', fontSize: 48, color: best === null ? 'rgba(255,255,255,0.22)' : '#FFD700' }}>{best === null ? '—' : Math.round(best).toLocaleString('en-US')}</div>
    </div>
  );
}

export function ProgressCardImage({ card, opts }: { card: ProgressCard; opts: ImageOptions }) {
  const name = nameOnImage(card, opts);
  const g = card.games;
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', padding: 64, background: `linear-gradient(160deg, #0b2a33 0%, ${INK} 45%)`, color: '#fff', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', fontSize: 24, letterSpacing: 6, color: 'rgba(255,255,255,0.55)' }}>FINAL EVOLUTION LAB</div>
        <div style={{ display: 'flex', fontSize: 24, letterSpacing: 3, color: '#00E5FF' }}>{weekLabel(card).toUpperCase()}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 36 }}>
        <div style={{ display: 'flex', fontSize: 30, letterSpacing: 6, color: 'rgba(255,255,255,0.5)' }}>{name ? `${name.toUpperCase()} · MY WEEK` : 'MY WEEK'}</div>
        <div style={{ display: 'flex', fontSize: 54, lineHeight: 1.15, marginTop: 14, color: '#fff' }}>{imageHeadline(card)}</div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, marginTop: 36 }}>
        {card.metrics.map((t) => <Tile key={t.key} t={t} />)}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 26, flexGrow: 1 }}>
        {g.modes.map((m) => <ModeRow key={m.mode} m={m} />)}
        {g.runsLine ? <div style={{ display: 'flex', fontSize: 26, marginTop: 14, color: 'rgba(255,255,255,0.6)' }}>{g.runsLine}</div> : null}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20, fontSize: 22, color: 'rgba(255,255,255,0.4)' }}>
        <div style={{ display: 'flex' }}>Last 7 days vs the 7 before · measured, not guessed</div>
        <div style={{ display: 'flex', color: '#00E5FF' }}>Get measurably better</div>
      </div>
    </div>
  );
}
