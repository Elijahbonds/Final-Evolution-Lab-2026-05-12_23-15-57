// The card's link preview (lane 5 S3): a shared /card/<slug> renders as the card itself — name, rarity, PRQ, top score,
// wins — on every platform that reads Open Graph. Built-in next/og, no new dependency.
import { ImageResponse } from 'next/og';
import { prisma } from '@/lib/db';
import { getPublicCard } from '@/lib/creator/card-service';
import { RARITY_META, safeAccent, rarityLabel, type CardRarity } from '@/lib/creator/card-core';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params }: { params: { slug: string } }) {
  const card = await getPublicCard(prisma, String(params?.slug ?? '').toLowerCase());
  const accent = safeAccent(card?.accent);
  const rarity = (card && ['common', 'rare', 'epic', 'legendary'].includes(card.rarity) ? card.rarity : 'common') as CardRarity;
  const ring = RARITY_META[rarity].ring;
  const stat = (label: string, value: string | number) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '18px 34px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)' }}>
      <div style={{ fontSize: 54, fontWeight: 800, color: '#fff' }}>{value}</div>
      <div style={{ fontSize: 18, letterSpacing: 4, color: 'rgba(255,255,255,0.45)' }}>{label}</div>
    </div>
  );
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 56, background: `linear-gradient(135deg, ${accent}22, #050505 55%)`, color: '#fff', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 26, letterSpacing: 6, color: 'rgba(255,255,255,0.5)' }}>FINAL EVOLUTION LAB · CREATOR CARD</div>
          <div style={{ fontSize: 22, letterSpacing: 4, padding: '10px 22px', borderRadius: 999, background: ring, color: '#050505', fontWeight: 800 }}>{rarityLabel(rarity).toUpperCase()}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 88, fontWeight: 900, lineHeight: 1 }}>{`${card?.displayName ?? 'Card not found'}`}</div>
          <div style={{ fontSize: 30, color: 'rgba(255,255,255,0.65)', marginTop: 14 }}>{card?.tagline ?? (card?.signatureMove ? `Signature: ${card.signatureMove}` : 'Real sports, real training — your reps become real stats.')}</div>
        </div>
        <div style={{ display: 'flex', gap: 22 }}>
          {stat('PRQ', card?.prq ?? 0)}{stat('TOP', card?.topScore ?? 0)}{stat('WINS', card?.wins ?? 0)}
          <div style={{ marginLeft: 'auto', alignSelf: 'flex-end', fontSize: 22, color: accent }}>{`fel · /card/${card?.slug ?? ''}`}</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
