'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { motion } from 'framer-motion';
import { Zap, Loader2, Check } from 'lucide-react';
import { CURRENT_POLICY_VERSION } from '@/lib/policies';
import { toast } from 'sonner';

// M8.6 — landing hook: marquee sports so the pre-auth page actually shows what
// FEL is. Imagery lives in /public/venues. // TUNE(elijah)
const SPORT_PICKS: { label: string; sub: string; img: string; href: string }[] = [
  { label: 'Streetball', sub: 'Dunk · 1v1 · 3v3', img: '/venues/venicebeach.jpg', href: '/play/dunk' },
  { label: 'Karate', sub: 'Endless · Versus', img: '/venues/dojo-card.jpg', href: '/play/karate' },
  { label: 'Skate', sub: 'Venice Skatepark', img: '/venues/skatepark.jpg', href: '/play/skateboard' },
  { label: 'Surf', sub: 'Surf Break', img: '/venues/surfbreak.jpg', href: '/play/surf' },
  { label: 'Snowboard', sub: 'Slalom · Big Air', img: '/venues/mountainslope.jpg', href: '/play/snowboard' },
  { label: 'Tennis', sub: 'Match · Tiebreak', img: '/venues/tenniscourt.jpg', href: '/play/tennis' },
];

export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [policyAccepted, setPolicyAccepted] = useState(false);
  // M8.6 — sport chosen before credential commitment (signup). Persisted so it can
  // greet the athlete after they land inside the lab. Cosmetic onboarding only.
  const [selectedSport, setSelectedSport] = useState<string | null>(null);

  // Phase 5 — referral attribution. A ?ref=CODE from a shared link is captured
  // here (and persisted by EmailCapture) so it survives the hop to /signup.
  const [refCode, setRefCode] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('fel:preferredSport');
      if (saved) setSelectedSport(saved);
    } catch { /* ignore */ }
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

  const pickSport = (label: string) => {
    setSelectedSport(label);
    try { localStorage.setItem('fel:preferredSport', label); } catch { /* ignore */ }
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
        toast.error('Invalid email or password');
        setLoading(false);
        return;
      }
      router.replace('/');
    } catch {
      toast.error('Something went wrong');
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#050505] px-4">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-[#00E5FF]/10 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-[#A855F7]/10 blur-[120px]" />
      </div>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className={`fel-panel relative w-full rounded-xl p-8 ${mode === 'signup' ? 'max-w-2xl' : 'max-w-md'}`}
      >
        <div className="mb-6 text-center">
          <div className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-xl border border-[#00E5FF]/40 bg-[#00E5FF]/10">
            <Zap className="h-7 w-7 text-[#00E5FF]" />
          </div>
          <h1 className="fel-heading text-4xl font-bold">
            <span className="text-[#00E5FF] fel-glow-cyan">FINAL EVOLUTION</span> LAB
          </h1>
          <p className="mt-2 text-sm text-white/60">
            {mode === 'login'
              ? 'Real sports, real training — your on-court reps become real stats.'
              : 'Pick your arena, then create your athlete profile.'}
          </p>
        </div>

        {/* M8.6 — LOGIN: venue preview strip so the landing page shows the game // TUNE(elijah) */}
        {mode === 'login' && (
          <div className="mb-7">
            <div className="grid grid-cols-4 gap-2">
              {SPORT_PICKS.slice(0, 4).map((s) => (
                <div key={s.label} className="relative aspect-[3/4] overflow-hidden rounded-lg border border-white/10 bg-[#16161A]">
                  <Image src={s.img} alt={`${s.label} arena in Final Evolution Lab`} fill sizes="120px" className="object-cover opacity-90" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
                  <span className="fel-heading absolute bottom-1.5 left-0 right-0 text-center text-[11px] font-bold uppercase tracking-wide text-white" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>{s.label}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-center text-[11px] text-white/45">Streetball · Karate · Skate · Surf · Snowboard · Tennis — and more inside.</p>
          </div>
        )}

        {/* M8.6 — SIGNUP: sport/mode picker BEFORE credential commitment // TUNE(elijah) */}
        {mode === 'signup' && (
          <div className="mb-7">
            <p className="mb-2 fel-heading text-xs font-bold uppercase tracking-widest text-white/50">Choose your arena</p>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {SPORT_PICKS.map((s) => {
                const active = selectedSport === s.label;
                return (
                  <button
                    type="button"
                    key={s.label}
                    onClick={() => pickSport(s.label)}
                    className={`relative aspect-[4/3] overflow-hidden rounded-lg border text-left transition-all ${active ? 'border-[#00E5FF] shadow-[0_0_18px_rgba(0,229,255,0.4)]' : 'border-white/10 hover:border-white/30'}`}
                  >
                    <Image src={s.img} alt={`${s.label} arena`} fill sizes="180px" className={`object-cover transition-opacity ${active ? 'opacity-100' : 'opacity-70'}`} />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                    {active && (
                      <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#00E5FF]">
                        <Check className="h-3 w-3 text-black" />
                      </span>
                    )}
                    <div className="absolute bottom-1.5 left-2 right-2">
                      <div className="fel-heading text-sm font-bold uppercase leading-none text-white" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>{s.label}</div>
                      <div className="mt-0.5 text-[10px] text-white/70" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.9)' }}>{s.sub}</div>
                    </div>
                  </button>
                );
              })}
            </div>
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
          </p>
        )}
      </motion.div>
    </div>
  );
}
