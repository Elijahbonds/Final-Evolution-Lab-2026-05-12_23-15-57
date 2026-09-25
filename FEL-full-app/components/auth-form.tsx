'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Dumbbell, Gamepad2 } from 'lucide-react';
import { ModeCarousel } from '@/components/onboarding/mode-carousel';
import { MODE_INFO, canonicalModeKey } from '@/lib/game-data';
import {
  DEFAULT_FIRST_GAME, destinationFor, resolveFirstGame, type OnboardingPath,
} from '@/lib/onboarding/firstRun';
import { motion } from 'framer-motion';
import { Loader2, Check } from 'lucide-react';
import { CURRENT_POLICY_VERSION } from '@/lib/policies';
import { AUTH_SERVICE_UNAVAILABLE } from '@/lib/auth-errors';
import { toast } from 'sonner';

// M8.6 — landing hook: marquee sports so the pre-auth page actually shows what
// FEL is. Imagery lives in /public/venues. // TUNE(elijah)


export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [policyAccepted, setPolicyAccepted] = useState(false);
  // M8.6 — sport chosen before credential commitment (signup). Persisted so it can
  // greet the athlete after they land inside the lab. Cosmetic onboarding only.

  // Phase 5 — referral attribution. A ?ref=CODE from a shared link is captured
  // here (and persisted by EmailCapture) so it survives the hop to /signup.
  const [refCode, setRefCode] = useState<string | null>(null);
  // WHAT THEY CAME FOR, asked before they commit to anything. Some people arrive to play and some arrive to be
  // assessed; sending both to the same shelf loses one of them.
  const [path, setPath] = useState<OnboardingPath>('play');
  const [firstGame, setFirstGame] = useState<string>(DEFAULT_FIRST_GAME);
  // The creator whose card or QR brought them, resolved from ?ref by /api/onboarding/host.
  const [host, setHost] = useState<{ name: string; mode: string | null; accent: string | null } | null>(null);

  useEffect(() => {
    // The last game they picked, so somebody coming back is offered what they chose before rather than the default.
    try {
      // HOTFIX (2026-09-24): a pick saved under an old key ('musicAcademy', 'velocitykart') is read as its current key.
      const saved = canonicalModeKey(localStorage.getItem('fel:firstGame'));
      if (saved && MODE_INFO[saved]?.href) setFirstGame(saved);
    } catch { /* a blocked or empty store is not an error here */ }
    try {
      const url = new URL(window.location.href);
      const fromUrl = url.searchParams.get('ref');
      const stored = localStorage.getItem('fel:ref');
      const code = (fromUrl || stored || '').toUpperCase();
      if (code) {
        setRefCode(code);
        localStorage.setItem('fel:ref', code);
      }
    } catch { /* ignore */ }
  }, []);

  // WHOSE LINK THIS IS DECIDES THE FIRST GAME. A card scanned at a court already pays its owner shards
  // (lib/creator/share-link.ts); until now it had no say in what the person it recruited actually landed on.
  // Their signature mode is that say. Resolved server-side, because a referral code should not expose a lookup
  // of anybody's account from the client.
  useEffect(() => {
    if (!refCode) return;
    let live = true;
    fetch(`/api/onboarding/host?ref=${encodeURIComponent(refCode)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!live || !j?.host) return;
        setHost(j.host);
        if (j.host.mode) setFirstGame(j.host.mode);
      })
      .catch(() => {});
    return () => { live = false; };
  }, [refCode]);



  const rememberGame = (key: string) => {
    setFirstGame(key);
    try { localStorage.setItem('fel:firstGame', key); } catch { /* per-viewer convenience only */ }
  };

  const submit = async (e: React.FormEvent) => {
    e?.preventDefault?.();
    if (loading) return;
    setLoading(true);
    try {
      if (mode === 'signup') {
        if (!policyAccepted) {
          toast.error('Please accept the Terms of Service and Privacy Policy');
          setLoading(false);
          return;
        }
        const res = await fetch('/api/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, name, policyVersion: CURRENT_POLICY_VERSION, ...(refCode ? { ref: refCode } : {}) }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(j?.error ?? 'Signup failed');
          setLoading(false);
          return;
        }
      }
      const result = await signIn('credentials', { email, password, redirect: false });
      if (result?.error) {
        // Only claim the credentials are wrong when they actually are. A
        // backend that cannot reach its database also fails sign-in, and
        // telling the athlete to check their password sends them chasing a
        // problem they cannot fix.
        toast.error(
          result.error.includes(AUTH_SERVICE_UNAVAILABLE)
            ? "Sign-in is temporarily unavailable — the server can't reach its database. This is on our end, not your password."
            : 'Invalid email or password'
        );
        setLoading(false);
        return;
      }
      // Land them in the thing they said they came for, not on a menu about it.
      router.replace(destinationFor(path, resolveFirstGame({ creatorMode: host?.mode, chosen: firstGame })));
    } catch {
      toast.error('Something went wrong');
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#050505] px-3 py-6 sm:px-4">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-[#00E5FF]/10 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-[#A855F7]/10 blur-[120px]" />
      </div>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className={`fel-panel relative w-full rounded-2xl p-5 sm:p-8 ${mode === 'signup' ? 'max-w-2xl' : 'max-w-md'}`}
      >
        <div className="mb-5 text-center">
          {/* The owner's own crest, not a stock lightning bolt in a rounded square. The supplied file is black
              line art on opaque white, so it ships prepared as a white-on-transparent mark — see
              public/brand/README.md. */}
          <Image
            src="/brand/crest-light.png"
            alt=""
            width={132}
            height={140}
            priority
            className="mx-auto mb-2 h-[72px] w-auto opacity-90 sm:h-[92px]"
          />
          <h1 className="fel-heading text-[26px] font-bold leading-none sm:text-4xl">
            <span className="text-[#00E5FF] fel-glow-cyan">FINAL EVOLUTION</span> LAB
          </h1>
          <p className="mx-auto mt-2 max-w-xs text-[13px] text-white/55 sm:max-w-none sm:text-sm">
            {mode === 'login'
              ? 'Real sports, real training — your on-court reps become real stats.'
              : 'Pick your arena, then create your athlete profile.'}
          </p>
        </div>

        {/* WHO SENT THEM. A scanned card already pays its owner; now it also greets the person it recruited and
            decides what they open on. Their colour carries through the whole arrival. */}
        {host && (
          <div
            className="mb-5 flex items-center gap-3 rounded-2xl border px-4 py-3"
            style={{
              borderColor: `${host.accent ?? '#00E5FF'}40`,
              background: `${host.accent ?? '#00E5FF'}0D`,
            }}
          >
            <span
              aria-hidden
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full font-mono text-[13px] font-black text-black"
              style={{ background: host.accent ?? '#00E5FF' }}
            >
              {host.name.slice(0, 1).toUpperCase()}
            </span>
            <p className="min-w-0 text-[13px] leading-snug text-white/70">
              <span className="font-bold text-white">{host.name}</span> sent you
              {host.mode && MODE_INFO[host.mode] && (
                <> — you are starting in <span className="font-bold text-white">{MODE_INFO[host.mode].name}</span>.</>
              )}
            </p>
          </div>
        )}

        {/* THE TWO WAYS IN. This used to be six hardcoded sports that saved your answer to localStorage and then
            sent you to the home page regardless. Asking is only worth doing if the answer changes where you land,
            and now it does. */}
        {mode === 'signup' && (
          <div className="mb-5">
            <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
              What did you come for?
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              {([
                { id: 'play' as const, icon: Gamepad2, title: 'Play first', line: 'Drop into a game now.', accent: '#00E5FF' },
                { id: 'body' as const, icon: Dumbbell, title: 'Body first', line: 'Screen your movement, then train.', accent: '#00FF9D' },
              ]).map((o) => {
                const on = path === o.id;
                const Icon = o.icon;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setPath(o.id)}
                    aria-pressed={on}
                    className="rounded-2xl border p-3.5 text-left transition-all duration-200"
                    style={{
                      borderColor: on ? `${o.accent}66` : 'rgba(255,255,255,0.10)',
                      background: on ? `${o.accent}10` : 'rgba(255,255,255,0.02)',
                    }}
                  >
                    <Icon className="h-[18px] w-[18px]" style={{ color: on ? o.accent : 'rgba(255,255,255,0.35)' }} strokeWidth={2.2} />
                    <span className="fel-heading mt-2 block text-[14px] font-bold leading-none text-white">{o.title}</span>
                    <span className="mt-1.5 block text-[11.5px] leading-snug text-white/45">{o.line}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* The games, as a rail you swipe. The focused card preloads its mode so entry is instant. */}
        {mode === 'signup' && path === 'play' && (
          <div className="mb-6">
            <ModeCarousel lead={host?.mode ?? null} value={firstGame} onChange={rememberGame} accent={host?.accent} />
          </div>
        )}

        {mode === 'signup' && path === 'body' && (
          <div className="mb-6 rounded-2xl border border-[#00FF9D]/25 bg-[#00FF9D]/[0.04] p-4">
            <p className="fel-heading text-[14px] font-bold text-white">You will start in the Mirror</p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-white/50">
              A movement screen from your phone camera — prop it up, step back, and it scores what it sees. The
              games are still there when you want them.
            </p>
          </div>
        )}

        {/* SIGNING IN: the games, so the page shows the product rather than a lonely pair of fields. */}
        {mode === 'login' && (
          <div className="mb-6">
            <ModeCarousel value={firstGame} onChange={rememberGame} />
          </div>
        )}

        <form onSubmit={submit} className="mx-auto max-w-md space-y-4">
          {mode === 'signup' && (
            <input
              type="text"
              placeholder="Athlete name"
              value={name}
              onChange={(e) => setName(e?.target?.value ?? '')}
              className="w-full rounded-md border border-white/10 bg-[#16161A] px-4 py-3 text-sm text-white placeholder-white/30 outline-none transition-colors focus:border-[#00E5FF]/60"
            />
          )}
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e?.target?.value ?? '')}
            className="w-full rounded-md border border-white/10 bg-[#16161A] px-4 py-3 text-sm text-white placeholder-white/30 outline-none transition-colors focus:border-[#00E5FF]/60"
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="Password (6+ characters)"
            value={password}
            onChange={(e) => setPassword(e?.target?.value ?? '')}
            className="w-full rounded-md border border-white/10 bg-[#16161A] px-4 py-3 text-sm text-white placeholder-white/30 outline-none transition-colors focus:border-[#00E5FF]/60"
          />
          {mode === 'signup' && (
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <span
                onClick={() => setPolicyAccepted(!policyAccepted)}
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                  policyAccepted ? 'border-[#00E5FF] bg-[#00E5FF]/20' : 'border-white/20 bg-[#16161A]'
                }`}
              >
                {policyAccepted && <Check className="h-3.5 w-3.5 text-[#00E5FF]" />}
              </span>
              <span className="text-xs text-white/50 leading-relaxed">
                I agree to the{' '}
                <a href="/terms" target="_blank" className="text-[#00E5FF] hover:underline">Terms of Service</a>{' '}
                and{' '}
                <a href="/privacy" target="_blank" className="text-[#00E5FF] hover:underline">Privacy Policy</a>.
              </span>
            </label>
          )}
          <button
            type="submit"
            disabled={loading || (mode === 'signup' && !policyAccepted)}
            className="fel-heading flex w-full items-center justify-center gap-2 rounded-md bg-[#00E5FF] py-3 text-lg font-bold text-black transition-all hover:bg-[#00E5FF]/85 hover:shadow-[0_0_24px_rgba(0,229,255,0.45)] disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : mode === 'login' ? 'ENTER THE LAB' : 'BEGIN EVOLUTION'}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-white/50">
          {mode === 'login' ? (
            <>
              New athlete?{' '}
              <Link href="/signup" className="font-semibold text-[#00E5FF] hover:underline">
                Create account
              </Link>
            </>
          ) : (
            <>
              Already registered?{' '}
              <Link href="/login" className="font-semibold text-[#00E5FF] hover:underline">
                Sign in
              </Link>
            </>
          )}
        </p>
        {/* M12.7 — legal links reachable from the login view, mirroring signup. */}
        {mode === 'login' && (
          <p className="mt-4 text-center text-xs text-white/35">
            <a href="/terms" target="_blank" className="hover:text-[#00E5FF] hover:underline">Terms</a>
            <span className="mx-2">·</span>
            <a href="/privacy" target="_blank" className="hover:text-[#00E5FF] hover:underline">Privacy</a>
            <span className="mx-2">·</span>
            <a href="/support" target="_blank" className="hover:text-[#00E5FF] hover:underline">Support</a>
            {/* HOTFIX (2026-09-24): the licence notices sit with the other legal links, named so they do not read as
                the Lab Credits wallet. */}
            <span className="mx-2">·</span>
            <a href="/credits" target="_blank" className="hover:text-[#00E5FF] hover:underline">Credits &amp; licences</a>
          </p>
        )}
      </motion.div>
    </div>
  );
}
