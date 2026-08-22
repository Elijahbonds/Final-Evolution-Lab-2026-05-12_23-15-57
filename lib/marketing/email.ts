/**
 * lib/marketing/email.ts — server-only email senders for the marketing funnel.
 * Thin wrapper over the Abacus notification API. Every send is best-effort:
 * a failure NEVER breaks the calling request.
 */

import 'server-only';

const API = 'https://apps.abacus.ai/api/sendNotificationEmail';

function appName(): string {
  const url = process.env.NEXTAUTH_URL || '';
  try { return url ? new URL(url).hostname.split('.')[0] : 'FinalEvolutionLab'; } catch { return 'FinalEvolutionLab'; }
}
function senderEmail(): string {
  const url = process.env.NEXTAUTH_URL || '';
  try { return `noreply@${new URL(url).hostname}`; } catch { return 'no-reply@mail.abacusai.app'; }
}

async function send(opts: {
  notificationId?: string;
  subject: string;
  body: string;
  recipient: string;
  replyTo?: string;
}): Promise<boolean> {
  if (!opts.notificationId) return false;
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deployment_token: process.env.ABACUSAI_API_KEY,
        app_id: process.env.WEB_APP_ID,
        notification_id: opts.notificationId,
        subject: opts.subject,
        body: opts.body,
        is_html: true,
        recipient_email: opts.recipient,
        reply_to: opts.replyTo,
        sender_email: senderEmail(),
        sender_alias: 'Final Evolution Lab',
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (j?.notification_disabled) return true; // user opted out; treat as handled
    return Boolean(j?.success);
  } catch (e) {
    console.error('[marketing/email] send failed', e);
    return false;
  }
}

function shell(inner: string): string {
  return `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;background:#0b0b0f;color:#fff;border-radius:14px;overflow:hidden;border:1px solid #1c1c24">
    <div style="padding:22px 24px;background:linear-gradient(135deg,#00131a,#0b0b0f)">
      <span style="font-size:20px;font-weight:800;letter-spacing:.5px;color:#00E5FF">FINAL EVOLUTION</span>
      <span style="font-size:20px;font-weight:800;color:#fff"> LAB</span>
    </div>
    <div style="padding:24px">${inner}</div>
    <div style="padding:16px 24px;border-top:1px solid #1c1c24;font-size:11px;color:#6b7280">You're receiving this because you joined Final Evolution Lab.</div>
  </div>`;
}

export async function sendWelcomeEmail(to: string, name?: string | null): Promise<boolean> {
  const url = process.env.NEXTAUTH_URL || '';
  const inner = `
    <h2 style="margin:0 0 10px;font-size:22px">Welcome${name ? `, ${name}` : ''} 🔥</h2>
    <p style="color:#c7cbd1;line-height:1.6">You just stepped into the lab. Train across every mode, earn <b style="color:#FFD700">coins</b> and prestige <b style="color:#C79BFF">shards</b>, and climb the ranks.</p>
    <p style="color:#c7cbd1;line-height:1.6">Jump in and play your first session to start earning.</p>
    <a href="${url}/modes" style="display:inline-block;margin-top:8px;background:#00E5FF;color:#001014;font-weight:700;padding:11px 20px;border-radius:10px;text-decoration:none">Enter the Lab</a>`;
  return send({ notificationId: process.env.NOTIF_ID_WELCOME_EMAIL, subject: 'Welcome to Final Evolution Lab', body: shell(inner), recipient: to });
}

export async function notifyAdminNewLead(email: string, source: string): Promise<boolean> {
  const owner = 'elijahbonds1@gmail.com';
  const inner = `<h2 style="margin:0 0 10px;font-size:20px">New lead captured</h2>
    <p style="color:#c7cbd1"><b>Email:</b> ${email}<br/><b>Source:</b> ${source}<br/><b>When:</b> ${new Date().toISOString()}</p>`;
  return send({ notificationId: process.env.NOTIF_ID_NEW_LEAD_CAPTURED, subject: `New FEL lead: ${email}`, body: shell(inner), recipient: owner, replyTo: email });
}

export async function sendReengageEmail(to: string, name: string | null | undefined, coins: number, shards: number): Promise<boolean> {
  const url = process.env.NEXTAUTH_URL || '';
  const inner = `<h2 style="margin:0 0 10px;font-size:22px">Your lab is waiting${name ? `, ${name}` : ''}</h2>
    <p style="color:#c7cbd1;line-height:1.6">You've banked <b style="color:#FFD700">${coins.toLocaleString('en-US')} coins</b> and <b style="color:#C79BFF">${shards.toLocaleString('en-US')} shards</b>. Come back for a run and keep the streak alive.</p>
    <a href="${url}/modes" style="display:inline-block;margin-top:8px;background:#00FF9D;color:#00140c;font-weight:700;padding:11px 20px;border-radius:10px;text-decoration:none">Play Now</a>`;
  return send({ notificationId: process.env.NOTIF_ID_COME_BACK_PLAY, subject: 'Your Final Evolution Lab rewards are waiting', body: shell(inner), recipient: to });
}

export async function sendReferralRewardEmail(to: string, name: string | null | undefined, shards: number): Promise<boolean> {
  const url = process.env.NEXTAUTH_URL || '';
  const inner = `<h2 style="margin:0 0 10px;font-size:22px">Referral reward unlocked 💠</h2>
    <p style="color:#c7cbd1;line-height:1.6">Someone joined using your link — you earned <b style="color:#C79BFF">${shards} shards</b>. Keep sharing to earn more.</p>
    <a href="${url}/profile" style="display:inline-block;margin-top:8px;background:#A855F7;color:#fff;font-weight:700;padding:11px 20px;border-radius:10px;text-decoration:none">See your rewards</a>`;
  return send({ notificationId: process.env.NOTIF_ID_REFERRAL_REWARD, subject: 'You earned a referral reward', body: shell(inner), recipient: to });
}
