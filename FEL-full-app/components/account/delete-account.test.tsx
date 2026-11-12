// ACCOUNT-DELETE: the "Delete my account" panel in account settings, rendered state by state.
import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('next-auth/react', () => ({ signOut: async () => undefined }));

import { DeleteAccountPanel, canSubmit, deleteErrorMessage, type DeletePanelProps } from './delete-account';
import { DELETE_COPY } from '@/lib/data-rights/deleteCopy';

const noop = () => {};
const base: DeletePanelProps = {
  stage: 'closed', block: null, email: '', password: '', confirmed: false, busy: false, error: null,
  onOpen: noop, onCancel: noop, onEmail: noop, onPassword: noop, onConfirmed: noop, onSubmit: noop,
};
const html = (p: Partial<DeletePanelProps>) => renderToStaticMarkup(createElement(DeleteAccountPanel, { ...base, ...p }));
const text = (s: string) => s.replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&');

describe('Delete my account', () => {
  it('closed: one button, nothing destructive on the page yet', () => {
    const h = html({});
    expect(h).toContain(DELETE_COPY.open);
    expect(h).not.toContain('type="password"');
  });

  it('open: what is deleted, what is kept and why, sign-out everywhere, and "Download my data first" (the export)', () => {
    const h = text(html({ stage: 'form' }));
    expect(h).toContain(DELETE_COPY.deleted.title);
    expect(h).toContain(DELETE_COPY.kept.title);
    for (const l of [...DELETE_COPY.deleted.lines, ...DELETE_COPY.kept.lines]) expect(h).toContain(text(l));
    expect(h).toContain(DELETE_COPY.signOut);
    expect(h).toMatch(/href="\/api\/account\/export"[^>]*>.*Download my data first/);
  });

  it('re-authentication and the confirm step: email, password and a checkbox; the button stays disabled until all three', () => {
    const h = html({ stage: 'form' });
    expect(h).toContain('type="email"');
    expect(h).toContain('type="password"');
    expect(h).toContain('type="checkbox"');
    expect(h).toMatch(/<button type="submit" disabled=""/);
    expect(canSubmit({ email: 'a@b.c', password: 'x', confirmed: false, busy: false })).toBe(false);
    expect(canSubmit({ email: 'a@b.c', password: '', confirmed: true, busy: false })).toBe(false);
    expect(canSubmit({ email: ' ', password: 'x', confirmed: true, busy: false })).toBe(false);
    expect(canSubmit({ email: 'a@b.c', password: 'x', confirmed: true, busy: true })).toBe(false);
    expect(canSubmit({ email: 'a@b.c', password: 'x', confirmed: true, busy: false })).toBe(true);
    expect(html({ stage: 'form', email: 'a@b.c', password: 'x', confirmed: true })).not.toMatch(/<button type="submit" disabled=""/);
  });

  it('blocked as a minor: the parent-or-guardian message, and no form', () => {
    const h = text(html({ stage: 'blocked', block: { kind: 'minor' } }));
    expect(h).toContain('Ask your parent or guardian');
    expect(h).not.toContain('type="password"');
  });

  it('blocked by obligations: the list of what to settle, and no form', () => {
    const h = text(html({ stage: 'blocked', block: { kind: 'obligations', items: [{ code: 'subscription', count: 1 }, { code: 'payouts', count: 2 }] } }));
    expect(h).toContain('Settle these first');
    expect(h).toContain('A subscription that will renew');
    expect(h).toContain('2 payouts still on their way to you');
    expect(h).not.toContain('type="password"');
  });

  it('refusals read as plain words', () => {
    expect(deleteErrorMessage(403, 'reauth_failed')).toBe(DELETE_COPY.errors.reauth);
    expect(deleteErrorMessage(429, 'rate_limited')).toBe(DELETE_COPY.errors.rateLimited);
    expect(deleteErrorMessage(400, 'confirm_required')).toBe(DELETE_COPY.errors.confirm);
    expect(deleteErrorMessage(401, 'signed_out')).toBe(DELETE_COPY.errors.signedOut);
    expect(deleteErrorMessage(500, 'failed')).toBe(DELETE_COPY.errors.failed);
  });

  it('is mounted in account settings', () => {
    const page = readFileSync(join(__dirname, '../../app/account/page.tsx'), 'utf8');
    expect(page).toContain("import { DeleteAccount } from '@/components/account/delete-account'");
    expect(page).toContain('<DeleteAccount />');
  });
});
