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
import { AvatarFigure } from '@/components/avatar-figure';
import { ROSTER } from '@/lib/game-data';
import { Trophy, Zap, Star, ShieldCheck } from 'lucide-react';
import type { PublicStats, Highlight } from '@/lib/creator/card-stats';

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
  /** The owner's athlete — card face when no photo is set. */
  ownerLook?: { avatarKey: string | null; cosmeticAssetId: string | null } | null;
}

/** lane 5 (scouting profile): the masked stat blocks and the owner's pinned highlights, rendered under the card. */
export function CreatorCard({ card, stats, highlights }: { card: CreatorCardData; stats?: PublicStats | null; highlights?: Highlight[] | null }) {
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
          ) : (() => {
            // the owner's athlete IS the card face (their build, their kit
            // accent, their cosmetic) — not an initial on a gradient
            const rosterAvatar = ROSTER.find((r) => r.key === card.ownerLook?.avatarKey) ?? null;
            return rosterAvatar ? (
              <div className="flex h-full w-full items-end justify-center pb-10">
                <AvatarFigure
                  avatar={{ ...rosterAvatar, accent }}
                  size={200}
                  cosmeticAssetId={card.ownerLook?.cosmeticAssetId}
                />
              </div>
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <span className="fel-heading text-6xl font-black" style={{ color: accent }}>
                  {(card.displayName || 'A').slice(0, 1).toUpperCase()}
                </span>
              </div>
            );
          })()}
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

        {stats && <StatBlocks stats={stats} accent={accent} />}
        {highlights && highlights.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-white/40">Highlights</div>
            <div className="space-y-1.5">
              {highlights.map((h) => (
                <div key={`${h.kind}:${h.id}`} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm">
                  <span className="text-white/85">{h.label ?? (h.kind === 'signature' ? `Signature · ${mpModeLabel(h.mode)}` : `${mpModeLabel(h.mode)}${h.won ? ' · W' : ''}`)}</span>
                  <span className="font-mono text-xs" style={{ color: accent }}>{h.score}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const PRQ_ORDER = ['strength', 'speed', 'endurance', 'agility', 'power', 'flexibility', 'recovery', 'mental'];

function StatBlocks({ stats, accent }: { stats: PublicStats; accent: string }) {
  return (
    <div className="mt-4 space-y-4">
      {stats.prq && (
        <div>
          <div className="mb-2 flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-white/40">PRQ profile {stats.prqSource === 'measured' ? <ShieldCheck className="h-3 w-3" style={{ color: accent }} /> : <span className="normal-case tracking-normal text-white/30">· self-reported until measured</span>}</div>
          <div className="space-y-1">
            {PRQ_ORDER.filter((k) => stats.prq && k in stats.prq).map((k) => {
              const v = Math.max(0, Math.min(100, stats.prq![k]));
              return (
                <div key={k} className="flex items-center gap-2 text-[11px]">
                  <span className="w-16 capitalize text-white/50">{k}</span>
                  <div className="h-1.5 flex-1 rounded-full bg-white/10"><div className="h-1.5 rounded-full" style={{ width: `${v}%`, backgroundColor: accent }} /></div>
                  <span className="w-6 text-right font-mono text-white/70">{Math.round(stats.prq![k])}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {stats.mastery.length > 0 && (
        <div>
          <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-white/40">Mastery</div>
          <div className="flex flex-wrap gap-1.5">{stats.mastery.map((m) => <span key={m.mode} className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-white/80">{mpModeLabel(m.mode)} · <span style={{ color: accent }}>{m.label}</span>{m.best != null ? ` · ${m.best}` : ''}</span>)}</div>
        </div>
      )}
      {stats.records.length > 0 && (
        <div>
          <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-white/40">Records</div>
          <div className="grid grid-cols-2 gap-1.5">{stats.records.slice(0, 6).map((r) => <div key={r.mode} className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5 text-[11px]"><div className="text-white/80">{mpModeLabel(r.mode)}</div><div className="font-mono text-white/50">best <span className="text-white">{r.best}</span> · {r.wins}W / {r.sessions}</div></div>)}</div>
          {stats.ladder && <div className="mt-1.5 text-[11px] text-white/50">Ladder best: <span className="text-white/80">{stats.ladder.bestScore}</span> in {mpModeLabel(stats.ladder.mode)}</div>}
        </div>
      )}
      {stats.resiliency && (
        <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-white/70">
          <span>Resiliency · {stats.resiliency.attempts} attempts</span>
          <span>retry rate <span className="text-white">{Math.round(stats.resiliency.retryRate * 100)}%</span>{stats.resiliency.returnedAfterLoss === true ? ' · came back after the last loss' : ''}</span>
        </div>
      )}
      {stats.movement?.delta && (
        <div className="text-[11px] text-white/60">Movement signature delta since last scan: {Object.entries(stats.movement.delta).slice(0, 4).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${Math.round(v * 10) / 10}`).join(' · ')}</div>
      )}
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
