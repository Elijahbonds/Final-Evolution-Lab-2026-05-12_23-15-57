// _creative-card-economy — pass 5 phase 2: publishing an approved public card pays CREATIVE_CARD_PUBLISH; a remix by another
// player pays CREATIVE_CARD_REMIX_ROYALTY to the parent's owner. Both through the wallet; read the ledger to prove it.
import { request } from 'playwright-core';
async function login(email: string, password = 'playtest-local-only') {
  const rc = await request.newContext({ baseURL: 'http://localhost:3000' });
  const csrf = (await (await rc.get('/api/auth/csrf')).json()).csrfToken as string;
  await rc.post('/api/auth/callback/credentials', { form: { csrfToken: csrf, email, password, json: 'true' } });
  return rc;
}
const card = (title: string, remixOf?: string) => ({ title, primary: 'sport', secondary: [], sportDesignation: 'basketball', art: { kind: 'sport' }, stats: { moveset: ['windmill'], gearModifier: {}, hypeMultiplier: 1, bpmSyncBonus: 0 }, rarity: { tier: 'common', statMultiplier: 1 }, isPublic: true, licenseAccepted: true, ...(remixOf ? { remixOf } : {}) });
const host = await login('playtest@fel.local'); const guest = await login('mentee@fel.local');
const w0 = await (await host.get('/api/v1/wallet')).json();
const c1 = await (await host.post('/api/v1/creative-card', { data: card(`Proof card ${Date.now()}`) })).json();
const w1 = await (await host.get('/api/v1/wallet')).json();
console.log(`publish: card ${c1.card?.id ?? c1.id ?? JSON.stringify(c1).slice(0, 100)} review ${c1.card?.reviewState ?? c1.reviewState} · host coins ${w0.coins} → ${w1.coins} (Δ ${w1.coins - w0.coins})`);
const parentId = c1.card?.id ?? c1.id;
const r = await (await guest.post('/api/v1/creative-card', { data: card(`Remix ${Date.now()}`, parentId) })).json();
const w2 = await (await host.get('/api/v1/wallet')).json();
console.log(`remix by mentee: card ${r.card?.id ?? r.id ?? JSON.stringify(r).slice(0, 100)} · host coins ${w1.coins} → ${w2.coins} (Δ ${w2.coins - w1.coins})`);
const ledger = await (await host.get('/api/v1/wallet/ledger')).json().catch(() => null);
const rows = (ledger?.entries ?? ledger?.ledger ?? []).filter((e: { reasonCode?: string }) => /CREATIVE_CARD/.test(e.reasonCode ?? '')).slice(0, 4);
console.log('ledger:', rows.map((e: { reasonCode: string; delta: number | string }) => `${e.reasonCode} ${e.delta}`).join(' | ') || JSON.stringify(ledger).slice(0, 120));
await host.dispose(); await guest.dispose();
