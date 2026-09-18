'use client';

/**
 * components/creator/creator-card.tsx — the shareable athlete card render.
 *
 * Pure presentational: give it a card record and it renders the framed,
 * rarity-styled card. Used on the public /card/[slug] page and previewed in the
 * profile editor.
 */

import { RARITY_META, safeAccent, rarityLabel, type CardRarity } from '@/lib/creator/card-core';
import { mpModeLabel } from '@/lib/mp/match-core';
import { Trophy, Zap, Star } from 'lucide-react';

export interface CreatorCardData {
  slug: string;
  displayName: string;
  tagline?: string | null;
  mode: string;
  rarity: string;
  accent: string;
  avatarUrl?: string | null;
  prq: number;
  topScore: number;
  wins: number;
  signatureMove?: string | null;
  views?: number;
}

export function CreatorCard({ card }: { card: CreatorCardData }) {
  const accent = safeAccent(card.accent);
  const rarity = (['common', 'rare', 'epic', 'legendary'].includes(card.rarity) ? card.rarity : 'common') as CardRarity;
  const meta = RARITY_META[rarity];

  return (
    <div
      className="relative w-full max-w-[360px] overflow-hidden rounded-3xl border p-[2px]"
      style={{ borderColor: meta.ring, boxShadow: `0 0 40px ${meta.glow}` }}
    >
      <div className="rounded-[22px] bg-[#0a0a0c] p-5">
        {/* header */}
        <div className="flex items-center justify-between">
          <span
            className="rounded-full px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-widest"
            style={{ backgroundColor: meta.ring, color: '#050505' }}
          >
            {rarityLabel(rarity)}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-widest text-white/40">
            FEL · CREATOR CARD
          </span>
        </div>

        {/* avatar */}
        <div
          className="relative mt-4 aspect-square w-full overflow-hidden rounded-2xl bg-gradient-to-br"
          style={{ backgroundImage: `linear-gradient(135deg, ${accent}22, #050505)` }}
        >
          {card.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.avatarUrl} alt={`${card.displayName} avatar`} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <span className="fel-heading text-6xl font-black" style={{ color: accent }}>
                {(card.displayName || 'A').slice(0, 1).toUpperCase()}
              </span>
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3">
            <h3 className="fel-heading text-xl font-bold leading-tight text-white">{card.displayName}</h3>
            {card.tagline ? <p className="text-xs text-white/60">{card.tagline}</p> : null}
          </div>
        </div>

        {/* signature */}
        <div className="mt-4 flex items-center gap-2">
          <Zap className="h-4 w-4" style={{ color: accent }} />
          <span className="text-sm text-white/80">
            {card.signatureMove || 'Signature move undeclared'}
          </span>
          <span className="ml-auto rounded-md bg-white/[0.06] px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-white/60">
            {mpModeLabel(card.mode)}
          </span>
        </div>

        {/* stats */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Stat icon={<Star className="h-4 w-4" />} label="PRQ" value={card.prq} accent={accent} />
          <Stat icon={<Trophy className="h-4 w-4" />} label="Top" value={card.topScore} accent={accent} />
          <Stat icon={<Zap className="h-4 w-4" />} label="Wins" value={card.wins} accent={accent} />
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: number; accent: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-center">
      <div className="flex items-center justify-center" style={{ color: accent }}>{icon}</div>
      <div className="mt-1 fel-heading text-lg font-bold text-white">{value}</div>
      <div className="font-mono text-[10px] uppercase tracking-wider text-white/40">{label}</div>
    </div>
  );
}
