// FoodScan — the scan-your-plate UI (M60). Photo (camera on mobile via
// capture attr, file picker on desktop) + 5-second plate tagging + the
// transparent goal-relative score with its reward breakdown. Honest flow
// per NutritionScore.ts: nothing pretends to see the photo until the
// VISION SEAM is wired; the photo is kept as the proof-of-plate record.

import React, { useState } from 'react';
import {
  scorePlate, FoodScanLimits, TAG_LABEL,
  type Goal, type PlateTag, type PlateScore,
} from './NutritionScore';

export default function FoodScan({
  goal = 'maintain',
  trainedToday = false,
  onReward,
}: {
  goal?: Goal;
  trainedToday?: boolean;
  /** ECONOMY SEAM — grant the earned coins/xp/shards to the real wallet. */
  onReward?: (r: { coins: number; xp: number; shards: number }) => void;
}) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [tags, setTags] = useState<PlateTag[]>([]);
  const [result, setResult] = useState<PlateScore | null>(null);

  const pickPhoto = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => { setPhoto(r.result as string); setResult(null); setTags([]); };
    r.readAsDataURL(f);
  };

  const toggle = (t: PlateTag): void =>
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const judge = (): void => {
    if (!photo || tags.length === 0) return;
    const scored = FoodScanLimits.applyCaps(scorePlate(tags, { goal, trainedToday }));
    setResult(scored);
    if (scored.coins + scored.xp + scored.shards > 0) {
      onReward?.({ coins: scored.coins, xp: scored.xp, shards: scored.shards });
    }
  };

  const S: Record<string, React.CSSProperties> = {
    root: { color: '#eef5ee', background: 'linear-gradient(160deg,#16281c 0%,#1e3226 60%,#232e1a 100%)', padding: 16, borderRadius: 12 },
    h1: { fontSize: 20, fontWeight: 800, color: '#7ee2a0' },
    row: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 },
    chip: { padding: '7px 12px', borderRadius: 16, border: '1px solid #3f6a4e', background: 'transparent', color: '#cfe8d6', cursor: 'pointer', fontSize: 13 },
    chipOn: { background: '#3f6a4e', color: '#fff' },
    btn: { padding: '9px 16px', borderRadius: 8, border: 'none', background: '#7ee2a0', color: '#10241a', fontWeight: 700, cursor: 'pointer' },
    photo: { maxWidth: 260, borderRadius: 10, display: 'block', marginTop: 10 },
    score: { fontSize: 40, fontWeight: 800 },
    card: { marginTop: 12, padding: 12, borderRadius: 10, background: 'rgba(0,0,0,0.3)' },
  };

  return (
    <div style={S.root}>
      <div style={S.h1}>SCAN YOUR PLATE</div>
      <div style={{ fontSize: 12, opacity: 0.75 }}>
        judged against YOUR goal ({goal}{trainedToday ? ' · trained today' : ''}) · {FoodScanLimits.remainingToday()} scored scans left today
      </div>

      <div style={S.row}>
        <label style={S.btn}>
          {photo ? 'RETAKE' : '📷 SNAP / UPLOAD'}
          <input type="file" accept="image/*" capture="environment" hidden onChange={pickPhoto} />
        </label>
      </div>
      {photo && <img src={photo} alt="your plate" style={S.photo} />}

      {photo && !result && (
        <>
          <div style={{ ...S.row, marginTop: 14 }}>
            <span style={{ fontSize: 12, opacity: 0.8 }}>WHAT'S ON IT? (tap all that apply)</span>
          </div>
          <div style={S.row}>
            {(Object.keys(TAG_LABEL) as PlateTag[]).map((t) => (
              <button key={t} style={{ ...S.chip, ...(tags.includes(t) ? S.chipOn : {}) }} onClick={() => toggle(t)}>
                {TAG_LABEL[t]}
              </button>
            ))}
          </div>
          <div style={S.row}>
            <button style={S.btn} disabled={tags.length === 0} onClick={judge}>JUDGE MY PLATE</button>
          </div>
        </>
      )}

      {result && (
        <div style={S.card}>
          <div style={{ ...S.score, color: result.score >= 80 ? '#7ee2a0' : result.score >= 55 ? '#ffd75e' : '#ff8a6b' }}>
            {result.score}
          </div>
          <div style={{ fontStyle: 'italic', marginTop: 2 }}>{result.verdictLine}</div>
          <div style={{ ...S.row, fontSize: 14 }}>
            <span>+{result.coins} coins</span>
            <span>+{result.xp} XP</span>
            {result.shards > 0 && <span style={{ color: '#7ee2a0' }}>+{result.shards} ◈ Shards</span>}
          </div>
          <div style={S.row}>
            <button style={S.chip} onClick={() => { setPhoto(null); setResult(null); setTags([]); }}>SCAN ANOTHER</button>
          </div>
        </div>
      )}
    </div>
  );
}
