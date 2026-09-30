import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { CURRENT_POLICY_VERSION, PRIVACY_CONTENT, TERMS_CONTENT } from './policies';

// CONTEXT (2026-09-24): the camera section went in under the version that signups had been recording for the text
// without it, so User.policyVersion could no longer say which text anyone accepted. The version has to move with the
// text. Each version maps to a fingerprint of the Terms + Privacy text it labels (the version string itself taken out),
// so an edit to either text fails here until CURRENT_POLICY_VERSION moves and its fingerprint is added.
const TEXT_BY_VERSION: Record<string, string> = {
  '2026-09-24-draft': 'ffc1193b4f45a4c8',   // + §6 Camera and Body Tracking (movement play, phase 2)
  '2026-09-25-draft': '2950422a8d3c13c7',   // + §6's space check paragraph (movement play, phase 4)
  '2026-09-29-draft': 'da452d02a10d392e',   // + §5 Health-Adjacent Data rewrite (mirror-coach, phase 5)
  '2026-09-29b-draft': 'da6275bf1062a1d8',  // + §5 names the daily readiness check-in (mirror-coach, phase 6)
  '2026-09-29c-draft': '7c6a27b255d6eda1',  // + §5 names the Dial-Up Breath use log and its week after an erase (mirror-coach, phase 7)
  '2026-09-30-draft': 'abc709bb13372227',  // + §5 keeps consent records; an erase does not restart the breath's first week (mirror-coach-erase)
};

describe('the policy version', () => {
  const fingerprint = () => createHash('sha256')
    .update((TERMS_CONTENT + '\n' + PRIVACY_CONTENT).split(CURRENT_POLICY_VERSION).join(''))
    .digest('hex').slice(0, 16);

  it('moves with the text: a changed Terms or Privacy needs a new CURRENT_POLICY_VERSION', () => {
    expect(
      TEXT_BY_VERSION[CURRENT_POLICY_VERSION],
      `the policy text changed under version ${CURRENT_POLICY_VERSION}: bump it and add '<new version>': '${fingerprint()}'`,
    ).toBe(fingerprint());
  });

  it('is past the version signed up to before the camera section, and both pages print it', () => {
    expect(CURRENT_POLICY_VERSION).not.toBe('2026-07-15-draft');
    expect(CURRENT_POLICY_VERSION).not.toBe('2026-09-24-draft');   // live without the space check paragraph
    expect(CURRENT_POLICY_VERSION).not.toBe('2026-09-25-draft');   // live with the old three-sentence §5
    expect(CURRENT_POLICY_VERSION.length).toBeLessThanOrEqual(60);   // /api/signup's zod cap on policyVersion
    expect(TERMS_CONTENT).toContain(`**Version: ${CURRENT_POLICY_VERSION}**`);
    expect(PRIVACY_CONTENT).toContain(`**Version: ${CURRENT_POLICY_VERSION}**`);
  });
});

// Body play, the Mirror, Prove It and face scan all use the camera, and the privacy page never said so. These pin
// what it has to tell a player, each of which is how the code behaves (MediaPipe runs in the browser, and the routes
// they save to take numbers only).
describe('privacy policy, the camera', () => {
  const text = PRIVACY_CONTENT.toLowerCase();

  it('names the camera features', () => {
    for (const f of ['camera', 'body', 'the mirror', 'prove it', 'face scan']) expect(text).toContain(f);
  });

  it('says the picture stays in the browser and is never stored', () => {
    expect(text).toContain('processed on your device');
    expect(text).toContain('never leaves your browser');
    expect(text).toContain('never stored');
  });

  it('says only derived numbers may be saved, and the model files are downloaded to the device', () => {
    expect(text).toMatch(/only numbers worked out from the camera/);
    expect(text).toContain('jump height');
    expect(text).toMatch(/model files are downloaded to your device/);
  });

  it('names where the model files come from, as the code fetches them', () => {
    // face scan's MODEL_URL is Google's bucket; the pose wasm/models resolve to /pose/ with jsDelivr/Google as the
    // fallback (lib/pose/assets.ts). A policy that says nothing leaves Stripe as the only third party it names.
    const face = readFileSync(new URL('../components/facescan/face-scan-capture.tsx', import.meta.url), 'utf8');
    const assets = readFileSync(new URL('./pose/assets.ts', import.meta.url), 'utf8');
    if (/storage\.googleapis\.com/.test(face)) expect(PRIVACY_CONTENT).toMatch(/Face scan's model file comes from Google's servers/);
    if (/cdn\.jsdelivr\.net/.test(assets)) expect(PRIVACY_CONTENT).toMatch(/jsDelivr/);
    expect(assets).toMatch(/LOCAL_WASM_BASE = '\/pose\/wasm'/);
    expect(text).toContain('never include your picture');
  });

  it('is written the way the page renderer reads it', () => {
    // app/privacy's simpleMarkdown makes every source line its own <p> and every _x_ an <em>, so a wrapped sentence
    // would render as broken paragraphs: one line per paragraph, no underscores.
    const start = PRIVACY_CONTENT.indexOf('## 6. Camera');
    expect(start).toBeGreaterThan(-1);
    const section = PRIVACY_CONTENT.slice(start, PRIVACY_CONTENT.indexOf('## 7.', start));
    expect(section).not.toContain('_');
    const paragraphs = section.split('\n\n').slice(1).map((p) => p.trim()).filter(Boolean);
    expect(paragraphs.length).toBe(4);
    for (const p of paragraphs) expect(p).not.toContain('\n');
  });
});

// MIRROR-COACH P5 (2026-09-29): owner decisions #4, #17, #18 — a health intake and per-exercise pain check-ins are
// opt-in, FEL-only, never sold/advertised/shared/scored/paid, coach-visible only with a live grant, exportable and
// erasable on their own, gated behind a guardian for a minor, and addressed against consumer-health-data laws (e.g.
// Washington's My Health My Data Act) rather than left to ordinary privacy language. §5 has to say all of this.
describe('privacy policy, health-adjacent data (P5)', () => {
  const start = PRIVACY_CONTENT.indexOf('## 5. Health-Adjacent Data');
  const section = PRIVACY_CONTENT.slice(start, PRIVACY_CONTENT.indexOf('## 6.', start));
  const text = section.toLowerCase();

  it('exists as its own section, before the camera section', () => {
    expect(start).toBeGreaterThan(-1);
    expect(PRIVACY_CONTENT.indexOf('## 6.')).toBeGreaterThan(start);
  });

  it('says what is collected: intake answers, pain check-ins, birth year', () => {
    expect(text).toContain('intake');
    expect(text).toContain('pain check-in');
    expect(text).toContain('birth year');
  });

  it('requires a separate opt-in before any of it is collected', () => {
    expect(text).toMatch(/none of this is collected until you say yes to it/);
    expect(text).toMatch(/separately from creating an account or accepting this policy/);
  });

  it('says it is never sold, never used for ads, never on a share link, never scored or paid', () => {
    expect(text).toContain('we do not sell this data');
    expect(text).toMatch(/target advertising/);
    expect(text).toMatch(/never appears on a share link/);
    expect(text).toMatch(/never used to compute your prq/);
    expect(text).toMatch(/never earns lab credits, shards or any other reward/);
  });

  it('says who can see it: the person, and a coach only with access turned on', () => {
    expect(text).toMatch(/only you, by default/);
    expect(text).toMatch(/turning on coach access for one specific coach/);
  });

  // MIRROR-COACH P7 FIX (2026-09-29): the export and both erases carry the Dial-Up Breath's use log, so §5 names it.
  // MIRROR-COACH-ERASE (2026-09-30): consent records stay, and an erase does not restart the first-opt-in week.
  it('names the Dial-Up Breath use log, keeps consent records, and does not restart the first-opt-in week after an erase', () => {
    expect(text).toMatch(/dial-up breath/);
    expect(text).toMatch(/which session it was for and when, and nothing else/);
    expect(text).toMatch(/your daily check-ins and your dial-up breath uses/);
    expect(text).toMatch(/your consent records are kept, as proof of what you agreed to and when you withdrew/);
    expect(text).toMatch(/the first time you opt in, the dial-up breath waits a week before it is offered/);
    expect(text).toMatch(/erasing this data does not start that week over/);
  });

  it('points to Health data in account settings for view/export/erase and for withdrawing consent', () => {
    const mentions = section.match(/Health data in your account settings/g) ?? [];
    expect(mentions.length).toBeGreaterThanOrEqual(2);
    expect(text).toMatch(/view, export or erase this data/);
    expect(text).toMatch(/withdrawing consent stops new collection immediately/);
  });

  it('requires a guardian for a minor, and sends a minor to an adult rather than anything else', () => {
    expect(text).toMatch(/a parent or guardian has to give that consent/);
    expect(text).toMatch(/always tells you to stop and tell an adult/);
  });

  it('addresses consumer-health-data law by name and extends the rights everywhere', () => {
    expect(text).toContain('consumer health data');
    expect(text).toMatch(/my health my data act/);
    expect(text).toMatch(/we extend the same protections everywhere, to everyone/);
  });

  it('describes camera reads honestly: no diagnosis, and never a claim to reduce risk or prevent injury (honesty rule)', () => {
    expect(text).toMatch(/do not diagnose/);
    expect(text).toMatch(/builds capacity for/);
    expect(text).toMatch(/never what it prevents or reduces the risk of/);
  });

  it('is written the way the page renderer reads it: one line per paragraph, no underscores', () => {
    expect(section).not.toContain('_');
    const paragraphs = section.split('\n\n').slice(1).map((p) => p.trim()).filter(Boolean);
    expect(paragraphs.length).toBeGreaterThanOrEqual(7);
    for (const p of paragraphs) expect(p).not.toContain('\n');
  });
});

// MOVEMENT PLAY P4 (2026-09-25): body play runs a space check before it starts (lib/move/spaceCheck), reads how bright
// the picture is (lib/move/luma: a small canvas sample, counted and dropped), remembers per game that the player chose
// it (localStorage: fel-body-play-<game>), and shows a small mirrored self-view. The page has to say so.
describe('privacy policy, the space check', () => {
  const text = PRIVACY_CONTENT.toLowerCase();
  it('says what the check reads and that nothing from it leaves the device', () => {
    expect(text).toContain('space check');
    expect(text).toContain('how bright the picture is');
    expect(text).toMatch(/both happen on your device, and nothing from them is sent or saved/);
  });
  it('says the choice is remembered on this device only, and the self-view is only on the player\'s screen', () => {
    expect(text).toContain('remembered on this device only');
    expect(text).toContain('self-view');
    expect(text).toContain('shown only on your screen');
  });
});
