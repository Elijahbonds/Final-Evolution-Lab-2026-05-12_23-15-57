// KEY FLOW 3 — coach invite. A coach makes a one-athlete link, copies it, and the athlete who opens it joins the roster.
//
// Two people, two browser contexts (no shared cookies or storage). The fake server keeps one invite table and decides
// every join with the REAL rule, lib/coach/invite.joinWithInvite — so what the flow holds is the product's own logic:
//   * "Link for one athlete" makes an invite; the panel lists it with its typed code (formatCode of codeOfToken);
//   * the QR renders, and the COPY button puts exactly inviteUrl(origin, token) on the clipboard;
//   * the athlete opening that URL sees the coach's name, joins, is told "You are on <coach>'s roster" and is taken to
//     /training;
//   * the one-shot link is then spent: a second athlete opening it is refused with the product's message.
import { randomBytes } from 'node:crypto';
import { inviteUrl, joinWithInvite, type CoachInvite } from '../../../lib/coach/invite';
import { codeFromBytes, codeOfToken, formatCode, tokenWithCode } from '../../../lib/coach/inviteCode';
import { ORIGIN, assert, until, type ApiRequest, type ApiReply } from '../../../scripts/e2e/rig';
import type { Flow } from '../../../scripts/e2e/flow';
import { FakeAuth } from '../fakes/auth';

const COACH = { id: 'coach-1', email: 'coach@example.com', password: 'x', name: 'Jordan Rivers', role: 'COACH' };
const ATHLETE = { id: 'athlete-1', email: 'athlete@example.com', password: 'x', name: 'Sam Athlete' };
const LATE = { id: 'athlete-2', email: 'late@example.com', password: 'x', name: 'Late Athlete' };

class FakeInvites {
  readonly rows: CoachInvite[] = [];
  readonly roster = new Set<string>();
  handle(req: ApiRequest, me: string | undefined): ApiReply | undefined {
    const now = Date.now();
    if (req.path === '/api/coach/invite' && req.method === 'GET') {
      const mine = this.rows.filter((r) => r.coachId === me && !r.closedAtMs);
      return { json: { invites: mine.map((r) => ({ token: r.token, use: r.use, expiresAt: new Date(r.expiresAtMs).toISOString(), joined: r.joined })) } };
    }
    if (req.path === '/api/coach/invite' && req.method === 'POST') {
      if (me !== COACH.id) return { status: 403, json: { error: 'forbidden' } };
      const use = (req.body as { use?: string })?.use === 'many' ? 'many' : 'once';
      const token = tokenWithCode(codeFromBytes(randomBytes(5)), randomBytes(24).toString('base64url'));
      this.rows.push({ token, coachId: COACH.id, coachName: COACH.name, use, createdAtMs: now, expiresAtMs: now + 7 * 864e5, joined: 0 });
      return { json: { token } };
    }
    const m = /^\/api\/coach\/invite\/([^/]+)$/.exec(req.path);
    if (m && req.method === 'POST') {
      if (!me) return { status: 401, json: { error: 'unauthorized' } };
      const inv = this.rows.find((r) => r.token === decodeURIComponent(m[1])) ?? null;
      const out = joinWithInvite(inv, me, now, this.roster.has(me));
      if (!out.ok) return { status: 400, json: { error: out.result, message: out.message } };
      if (out.result === 'joined' && inv) { this.roster.add(me); inv.joined++; if (out.closeInvite) inv.closedAtMs = now; }
      return { json: { ok: true, result: out.result, message: out.message } };
    }
    if (req.path === '/api/coach/invite/bulk') return { status: 404, json: {} };
    return undefined;
  }
}

export const coachInviteFlow: Flow = {
  name: 'coach-invite',
  title: 'A coach makes a one-athlete link and copies it; the athlete who opens it joins the roster; the link is then spent',
  async run(ctx) {
    const invites = new FakeInvites();
    const people = [COACH, ATHLETE, LATE];
    const pages = {
      '/coach': { entry: 'tests/e2e/entries/coach-invite.tsx' },
      '/coach/join/:token': { entry: 'tests/e2e/entries/coach-join.tsx', rig: { coachName: COACH.name } },
    };
    const as = (email: string) => {
      const auth = new FakeAuth(people, email);
      return ctx.session({
        pages, permissions: ['clipboard-read', 'clipboard-write'],
        api: (req) => auth.handle(req) ?? invites.handle(req, auth.signedIn?.id),
      });
    };

    // the coach
    const coach = as(COACH.email);
    const cp = await coach.open('/coach');
    await cp.getByText('No open invites.').waitFor();
    await cp.getByRole('button', { name: 'Link for one athlete' }).click();
    const codeEl = cp.locator('[data-invite-code]').first();
    await codeEl.waitFor();
    const token = invites.rows[0]?.token;
    assert(token, 'POST /api/coach/invite made no invite');
    assert((await codeEl.innerText()).trim() === formatCode(codeOfToken(token) ?? ''), `the panel shows code ${await codeEl.innerText()}, the invite's is ${formatCode(codeOfToken(token) ?? '')}`);
    await cp.getByTitle('Show the QR').first().click();
    const qr = cp.getByAltText('Invite QR code');
    await qr.waitFor();
    assert(((await qr.getAttribute('src')) ?? '').startsWith('data:image/png'), 'the QR is not a PNG');
    await cp.getByTitle('Copy the link').first().click();
    const copied = await cp.evaluate(() => navigator.clipboard.readText());
    assert(copied === inviteUrl(ORIGIN, token), `the copy button copied ${copied}, expected ${inviteUrl(ORIGIN, token)}`);
    await ctx.shot(cp, '1-coach-link');

    // the athlete opens exactly what was copied
    const athlete = as(ATHLETE.email);
    const ap = await athlete.open(new URL(copied).pathname);
    await ap.getByText(`${COACH.name} wants to coach you`).waitFor();
    await ap.getByRole('button', { name: `Join ${COACH.name}` }).click();
    await ap.getByText(`You are on ${COACH.name}'s roster`).waitFor();
    await ctx.shot(ap, '2-athlete-joined');
    assert(invites.roster.has(ATHLETE.id), 'the athlete is not on the roster');
    const landed = await ap.waitForSelector('[data-rig-landed]', { timeout: 10_000 }).then((h) => h.getAttribute('data-rig-landed'));
    assert(landed === '/training', `after joining the athlete went to ${landed}, expected /training`);
    assert(invites.rows[0].closedAtMs, 'the one-athlete invite was not spent by the join');

    // the coach's list no longer offers the spent link
    await cp.reload();
    await cp.getByText('No open invites.').waitFor();

    // a second athlete with the same link is refused
    const late = as(LATE.email);
    const lp = await late.open(new URL(copied).pathname);
    await lp.getByRole('button', { name: `Join ${COACH.name}` }).click();
    await lp.getByText('That invite has already been used.').waitFor();
    assert(!invites.roster.has(LATE.id), 'a spent one-athlete link still added a second athlete');
    await until('the refused join', () => late.called(/^\/api\/coach\/invite\//, 'POST').find((c) => c.status === 400));
    ctx.log(`invite ${formatCode(codeOfToken(token) ?? '')}: copied link joined ${ATHLETE.name}; spent for ${LATE.name}`);
  },
};
