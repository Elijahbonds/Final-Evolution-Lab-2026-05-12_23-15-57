import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { CURRENT_POLICY_VERSION, PRIVACY_CONTENT, TERMS_CONTENT } from './policies';
import { BUSINESS_CONTACT_EMAIL, BUSINESS_LEGAL_NAME, BUSINESS_MAILING_ADDRESS } from './legal/business';

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
  '2026-10-01-draft': '18b88eec085ba82b',  // §6: body-tracking files from our own servers only (no jsDelivr / Google fallback)
  '2026-10-07-draft': 'e1c40c0b8dd666d8',  // + §6: the Mirror's "vs your last 3" kept on the device only, never sent, forgettable (mirror-progress)
  '2026-10-07': '1817114b5ef24ce7',        // LEGAL-COPY: Terms §2 18+, Terms §9 + Privacy §11 Contact, Privacy §10 store, §4/§5/§7 fixes; first non-draft label; draft banners removed on the owner's sign-off (follow-up 1)
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

  // LEGAL-COPY (2026-10-07): the label is final (not a draft), it is the single source, and every prior version's
  // fingerprint stays so an old text still resolves.
  it('is the final, non-draft label', () => {
    expect(CURRENT_POLICY_VERSION).toBe('2026-10-07');
    expect(CURRENT_POLICY_VERSION).not.toBe('2026-10-07-draft');
    expect(CURRENT_POLICY_VERSION).not.toMatch(/-draft$/);
  });

  // LEGAL-COPY FOLLOW-UP 1 (2026-10-07; owner sign-off 3:00 PM PT, "yes to privacy"): the text is final, so the
  // DRAFT banners came off both pages in the same version.
  it('carries no draft banner on either page', () => {
    for (const content of [TERMS_CONTENT, PRIVACY_CONTENT]) {
      expect(content).not.toContain('DRAFT');
      expect(content).not.toContain('NOT LEGAL TEXT');
      expect(content).not.toContain('qualified legal counsel');
    }
  });

  it('keeps every earlier version fingerprint (the record of what each signup accepted)', () => {
    for (const v of ['2026-09-24-draft', '2026-09-25-draft', '2026-09-29-draft', '2026-09-29b-draft', '2026-09-29c-draft', '2026-09-30-draft', '2026-10-01-draft', '2026-10-07-draft']) {
      expect(TEXT_BY_VERSION).toHaveProperty(v);
    }
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
    // MIRROR-PROGRESS (2026-10-07): 4 → 5, the Mirror's phone-only "vs your last 3" paragraph (owner: "Add it + version bump")
    expect(paragraphs.length).toBe(5);
    for (const p of paragraphs) expect(p).not.toContain('\n');
  });
});

// MIRROR-PROGRESS (2026-10-07; owner decision 1, and "Add it + version bump"): the Mirror's "vs your last 3" keeps one number
// per finished set on the device for anyone whose Mirror results are not saved (lib/mirror/deviceProgress.ts). §6 says so,
// in the review's own words for the button.
describe('privacy policy, the Mirror\'s phone-only history', () => {
  const text = PRIVACY_CONTENT.toLowerCase();
  it('says what is kept, where, that it is never sent, and how to remove it', async () => {
    const { FORGET_LABEL } = await import('@/app/play/mirror/_components/progress-line');
    expect(text).toContain('compare a set with your last three');
    expect(text).toContain('one number for each finished set');
    expect(text).toContain('on this device only');
    expect(text).toContain('it is never sent');
    expect(PRIVACY_CONTENT).toContain(`"${FORGET_LABEL}"`);
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

// LEGAL-COPY (2026-10-07; Research & Advisor verbatim; FE PM Oct 7 2:39/2:45 PM PT): /terms 18+, a /privacy section on
// what the store keeps about buyers, one business address, and the final version label. The store block is compared to a
// literal copied from the brief with only its two allowed changes (the §10 heading and ${BUSINESS_MAILING_ADDRESS} for
// {BUSINESS_ADDRESS}), so the text cannot drift from what was approved.
const STORE_SECTION = `## 10. When You Buy From the Store

This section covers the Final Evolution coach store: programs, memberships, live 1:1 sessions and video reviews sold by Final Evolution LLC. The rest of this Policy still applies. Only adults 18 and over can buy, book or join a session, based on the birth year given when the account was created.

**What we collect.** Your account name and email. The details of each order and booking: what you bought, the price, when you paid, your session time and time zone, and any cancellations, reschedules or refunds. What you tell us when you book or request a review: your goal, a short note and your yes-or-no answer to "Does anything hurt?". Messages between you and your coach, including when each one was read. If you use a referral code, whose code it was and the reward it earned them. From Stripe, whether your payment went through and the reference numbers Stripe uses for your customer record, checkout, payment and subscription.

**What we don't collect.** Stripe collects your card details directly, and we never see or store your full card number. Live sessions are not recorded. The video room has no recording feature, and the video goes directly between your device and the coach's device.

**Video reviews.** For a video review you upload up to 3 clips of up to 60 seconds each. They are kept in private cloud storage, and only you and your coach can open them, through links that expire within an hour. We delete your original clips 30 days after your review is delivered, or 30 days after the review is cancelled or refunded if it was never delivered. The coach's reply video and written review stay available to you until you ask us to delete them. Your clips are used only for your review. They are never used for marketing, shown publicly or used to train AI.

**Why we use it.** To take payment, give you access to what you bought, schedule and run your sessions, deliver your reviews, let you and your coach message each other, give you a receipt, pay referral rewards, handle cancellations, refunds and disputes, prevent fraud, and keep the business and tax records the law requires. We use your email to identify your account, show it on your receipt and contact you about an order or booking. Your answer about pain is used only to add a safety note to your coaching. It is never scored, sold or used for ads. Buying from the store does not sign you up for marketing emails.

**Who sees it and who we share it with.** Your coach (today that is Elijah Bonds) sees your booking details, notes, clips and messages so they can coach you. Stripe processes payments: we give Stripe your email and an account reference number, and Stripe handles your payment details under its own privacy policy. Google Cloud hosts the site, our database and the review clip storage. To connect a live session, your device uses a Google connection server, and your device and the coach's device can see each other's network (IP) address, as in any direct video call. The person whose referral code you used is not shown your name or what you bought. We do not sell your personal information or share it for advertising. We may disclose information if the law requires it.

**How long we keep it.** Order, payment, refund and referral records: 7 years after the purchase, for tax and accounting, then deleted. Booking and review details, including your goal, note and pain answer: 2 years after the session or review, then deleted. Original review clips: as described above. Messages with your coach: while your program is active and for 2 years after it ends. Live session connection data: it expires after 10 minutes and is then cleared. Your account details: while your account is open. If you ask us to delete something sooner, we will, except records the law requires us to keep.

**Teens and children.** The store is for adults. A teen aged 13 to 17 can use a program only when a parent or legal guardian buys it on their own adult account. The teen gets an unlock code, and no teen account is created. For a teen purchase we keep the parent's order, a scrambled (hashed) copy of the code, a scrambled copy of a random device token and the date the code was used. We do not collect the teen's name, age, scores, images or video, and the teen's progress stays on the teen's phone. Children under 13 cannot use the store.

**Your rights.** You can ask to see the store information we hold about you, get a copy of it, correct it or delete it. Email FinalEvolution.us@gmail.com from the email address on your account, or write to Final Evolution LLC, ${BUSINESS_MAILING_ADDRESS}. We may ask you to confirm it is you, and we will answer within 45 days. We will not charge you or treat you differently for asking. Records the law requires us to keep, such as tax records, are kept until that period ends. Stripe keeps its own payment records under its own policy.

**California residents.** If you live in California, the rights above are yours: to know what we collect and why, to see it, to correct it, to delete it, and not to be treated differently for using these rights. We do not sell or share your personal information, as California law uses those words.`;

describe('privacy policy, the store (§10, LEGAL-COPY)', () => {
  it('carries the approved store text verbatim, at the end after §9 and before §11', () => {
    const i9 = PRIVACY_CONTENT.indexOf('## 9. Changes');
    const i10 = PRIVACY_CONTENT.indexOf('## 10. When You Buy From the Store');
    const i11 = PRIVACY_CONTENT.indexOf('## 11. Contact');
    expect(i9).toBeGreaterThan(-1);
    expect(i10).toBeGreaterThan(i9);
    expect(i11).toBeGreaterThan(i10);
    expect(PRIVACY_CONTENT).toContain(STORE_SECTION);
  });

  it('keeps §1–§9 unchanged in order (§5 cross-references §8)', () => {
    const heads = ['## 1. Data We Collect', '## 2. How We Use Your Data', '## 3. AI-Generated Content', '## 4. Data Retention & Deletion', '## 5. Health-Adjacent Data', '## 6. Camera and Body Tracking', '## 7. Third Parties', '## 8. Your Rights', '## 9. Changes'];
    let at = -1;
    for (const h of heads) {
      const i = PRIVACY_CONTENT.indexOf(h);
      expect(i, h).toBeGreaterThan(at);
      at = i;
    }
  });

  it('leaves no {BUSINESS_ADDRESS} token, "BUSINESS_ADDRESS" text or underscore in the rendered section', () => {
    expect(PRIVACY_CONTENT).not.toContain('{BUSINESS_ADDRESS}');
    expect(PRIVACY_CONTENT).not.toContain('BUSINESS_ADDRESS');
    const section = PRIVACY_CONTENT.slice(PRIVACY_CONTENT.indexOf('## 10.'), PRIVACY_CONTENT.indexOf('## 11.'));
    expect(section).not.toContain('_');
    expect(section).not.toContain('`');
    const lines = section.split('\n');
    expect(lines.filter((l) => l.startsWith('- ')).length).toBe(0);
    expect(lines.filter((l) => l.trim().startsWith('#'))).toEqual(['## 10. When You Buy From the Store']);
    const paragraphs = section.split('\n\n').slice(1).map((p) => p.trim()).filter(Boolean);
    for (const p of paragraphs) expect(p).not.toContain('\n');
  });
});

describe('terms of service, buying is 18+ (LEGAL-COPY)', () => {
  const section = TERMS_CONTENT.slice(TERMS_CONTENT.indexOf('## 2. Account & Eligibility'), TERMS_CONTENT.indexOf('## 3.'));

  it('says buying is for verified adults 18+', () => {
    expect(section).toContain('18 or older');
    expect(section).toContain('verified adults (18+)');
    expect(TERMS_CONTENT).not.toContain('at least 13 years of age');
  });

  it('keeps the teen and under-13 rules the store decided on', () => {
    expect(section.toLowerCase()).toMatch(/13 to 17/);
    expect(section.toLowerCase()).toMatch(/parent or legal guardian’s consent/);
    expect(section.toLowerCase()).toMatch(/bought by your parent or guardian/);
    expect(section.toLowerCase()).toMatch(/can’t create an account for anyone under 13/);
    expect(section.toLowerCase()).toMatch(/nothing from it is saved/);
  });

  it('does not claim an ID check the code does not do (the birth year is self-declared)', () => {
    expect(section.toLowerCase()).not.toMatch(/we verify (your )?id/);
  });
});

describe('legal contact block, one business address (LEGAL-COPY)', () => {
  for (const [name, content, contact] of [['Terms', TERMS_CONTENT, '## 9. Contact'], ['Privacy', PRIVACY_CONTENT, '## 11. Contact']] as const) {
    it(`${name} ends with a ${contact} section carrying the legal name, contact email and Mail line (interpolated)`, () => {
      expect(content).toContain(contact);
      const section = content.slice(content.indexOf(contact));
      expect(section).toContain(BUSINESS_LEGAL_NAME);
      expect(section).toContain(BUSINESS_CONTACT_EMAIL);
      expect(section).toContain(`Mail: ${BUSINESS_MAILING_ADDRESS}`);
    });
  }
});

describe('privacy policy, the Research & Advisor code-vs-policy fixes (LEGAL-COPY req 5)', () => {
  it('§4 no longer claims a non-existent account-delete route, and points to the contact email', () => {
    const section = PRIVACY_CONTENT.slice(PRIVACY_CONTENT.indexOf('## 4.'), PRIVACY_CONTENT.indexOf('## 5.'));
    expect(section).not.toContain('Account deletion removes all personal data.');
    expect(section).toContain(BUSINESS_CONTACT_EMAIL);
    expect(section.toLowerCase()).toContain('until an in-app delete option exists');
  });

  it('§7 names Google Cloud as host/processor alongside Stripe, and keeps the no-sale line', () => {
    const section = PRIVACY_CONTENT.slice(PRIVACY_CONTENT.indexOf('## 7.'), PRIVACY_CONTENT.indexOf('## 8.'));
    expect(section).toContain('We do not sell personal data.');
    expect(section).toContain('Stripe');
    expect(section).toContain('Google Cloud');
  });

  it('§5 drops the stale "(see §7)" share-link reference and keeps the correct "(see §8)"', () => {
    const section = PRIVACY_CONTENT.slice(PRIVACY_CONTENT.indexOf('## 5.'), PRIVACY_CONTENT.indexOf('## 6.'));
    expect(section).not.toContain('(see §7)');
    expect(section).toContain('(see §8)');
  });
});

describe('the support page shows the one business contact email (LEGAL-COPY req 5d)', () => {
  it('imports BUSINESS_CONTACT_EMAIL from lib/legal/business and drops the old address', () => {
    const src = readFileSync(new URL('../app/support/page.tsx', import.meta.url), 'utf8');
    expect(src).not.toContain('finalevolutionlab.com');
    expect(src).toMatch(/import\s*\{\s*BUSINESS_CONTACT_EMAIL\s*\}\s*from\s*['"]@\/lib\/legal\/business['"]/);
  });
});
