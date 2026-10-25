// The NextAuth endpoints the real next-auth/react client calls, faked at the HTTP edge (QG-01).
//
// signIn('credentials', { redirect: false }) is the real client: it GETs /api/auth/providers and /api/auth/csrf, POSTs
// the form to /api/auth/callback/credentials (with the CSRF token) and reads /api/auth/session. This fake keeps the
// accounts the flow created and answers those four the way NextAuth v4 does, so a wrong password is CredentialsSignin.
import { ORIGIN, type ApiReply, type ApiRequest } from '../../../scripts/e2e/rig';

export interface FakeUser { id: string; email: string; password: string; name: string; role?: string }

export class FakeAuth {
  readonly users = new Map<string, FakeUser>();
  signedIn: FakeUser | null = null;
  readonly csrf = 'rig-csrf-' + Math.random().toString(36).slice(2);

  constructor(seed: FakeUser[] = [], signedInAs?: string) {
    for (const u of seed) this.users.set(u.email, u);
    if (signedInAs) this.signedIn = this.users.get(signedInAs) ?? null;
  }

  add(u: FakeUser): void { this.users.set(u.email, u); }

  session(): unknown {
    const u = this.signedIn;
    return u ? { user: { id: u.id, email: u.email, name: u.name, role: u.role ?? 'USER' }, expires: '2099-01-01T00:00:00.000Z' } : {};
  }

  /** Answers /api/auth/*; undefined for any other path. */
  handle(req: ApiRequest): ApiReply | undefined {
    if (!req.path.startsWith('/api/auth/')) return undefined;
    const p = req.path.slice('/api/auth/'.length);
    if (p === 'providers') {
      return { json: { credentials: { id: 'credentials', name: 'Credentials', type: 'credentials', signinUrl: `${ORIGIN}/api/auth/signin/credentials`, callbackUrl: `${ORIGIN}/api/auth/callback/credentials` } } };
    }
    if (p === 'csrf') return { json: { csrfToken: this.csrf } };
    if (p === 'session') return { json: this.session() };
    if (p === '_log') return { json: {} };
    if (p === 'callback/credentials' && req.method === 'POST') {
      const form = new URLSearchParams(req.raw ?? '');
      if (form.get('csrfToken') !== this.csrf) return { json: { url: `${ORIGIN}/api/auth/signin?csrf=true` } };
      const u = this.users.get(form.get('email') ?? '');
      if (!u || u.password !== form.get('password')) return { status: 401, json: { url: `${ORIGIN}/api/auth/error?error=CredentialsSignin` } };
      this.signedIn = u;
      return { json: { url: form.get('callbackUrl') || `${ORIGIN}/` } };
    }
    if (p === 'signout' && req.method === 'POST') { this.signedIn = null; return { json: { url: `${ORIGIN}/` } }; }
    return { status: 404, json: {} };
  }
}
