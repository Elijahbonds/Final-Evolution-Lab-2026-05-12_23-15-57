// _disciplines-smoke — lane 4 on the dev DB: a cooking card publishes (approved, public), a scene pack goes to review,
// a bad fashion payload is refused, unknown disciplines are refused, and browse filters by the new discipline.
import { request } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:3000';
const rc = await request.newContext({ baseURL: BASE });
const csrf = (await (await rc.get('/api/auth/csrf')).json()).csrfToken as string;
await rc.post('/api/auth/callback/credentials', { form: { csrfToken: csrf, email: process.env.CLIENT_EMAIL ?? 'client@fel.local', password: process.env.CLIENT_PASSWORD ?? 'client-local-only', callbackUrl: `${BASE}/`, json: 'true' } });
const out: Record<string, string> = {}; const say = (k: string, ok: boolean, note = '') => { out[k] = `${ok ? 'PASS' : 'FAIL'}${note ? ' — ' + note : ''}`; };
const base = { secondary: [], stats: { moveset: [], gearModifier: {}, hypeMultiplier: 1, bpmSyncBonus: 0 }, rarity: { tier: 'common', statMultiplier: 1 }, isPublic: true, licenseAccepted: true };
const stamp = Date.now();
const cook = await rc.post('/api/v1/creative-card', { data: { ...base, title: `Overnight oats ${stamp}`, primary: 'cooking', art: { kind: 'cooking', steps: ['Mix oats and milk', 'Fridge overnight'], ingredients: ['1 cup oats', '1 cup milk'], fuelTags: ['pre-game', 'quick'] } } });
const cookJ = await cook.json();
say('cooking publishes', cook.status() === 201 && cookJ.card?.reviewState === 'approved' && cookJ.card?.isPublic === true, `${cook.status()} · ${cookJ.card?.reviewState} · public ${cookJ.card?.isPublic}`);
const scene = await rc.post('/api/v1/creative-card', { data: { ...base, title: `Which court ${stamp}`, primary: 'scene', art: { kind: 'scene', venueId: 'basketball_h2h', cameraPath: 'sweep', questions: [{ prompt: 'Which court is this?', options: ['Venice', 'Blossom Park', 'Orbit', 'Rooftop'], answer: 0 }] } } });
const sceneJ = await scene.json();
say('scene → review', scene.status() === 201 && sceneJ.card?.reviewState === 'pending_review' && sceneJ.card?.isPublic === false, `${scene.status()} · ${sceneJ.card?.reviewState}`);
const badFashion = await rc.post('/api/v1/creative-card', { data: { ...base, title: 'bad look', primary: 'fashion', art: { kind: 'fashion', lookId: 'l1', wearableIds: ['top_lab'], palette: ['blue'] } } });
say('fashion refuses bad palette', badFashion.status() === 422, `${badFashion.status()} ${(await badFashion.json()).error ?? ''}`);
const unknown = await rc.post('/api/v1/creative-card', { data: { ...base, title: 'x', primary: 'crypto', art: { kind: 'crypto' } } });
say('unknown discipline refused', unknown.status() === 422, `${unknown.status()}`);
const browse = await (await rc.get('/api/v1/creative-card?discipline=cooking')).json();
say('browse by cooking', Array.isArray(browse.cards) && browse.cards.some((c: any) => c.id === cookJ.card?.id) && browse.cards.every((c: any) => c.primary === 'cooking'), `${browse.cards?.length ?? 0} cooking cards public`);
const mine = await (await rc.get('/api/v1/creative-card?mine=1')).json();
say('my cards list both', mine.cards?.some((c: any) => c.primary === 'scene') && mine.cards?.some((c: any) => c.primary === 'cooking'), `${mine.cards?.length ?? 0} mine`);
console.log(JSON.stringify(out, null, 1));
