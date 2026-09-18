// GenerationService — THE SEAM ONLY. Wave 2 permits exactly this and no
// more: "build the seam now; own the engine later."
//
// One interface, many vendors behind it. The app calls GenerationService and
// never learns which vendor served the request. The day owning a model is
// cheaper than renting one, you replace an adapter's insides and nothing
// else in the codebase changes — escaping the credit trap becomes a one-file
// change instead of a rewrite. That is the entire value of building this
// now, and it is why building it now does NOT violate the firewall: it adds
// an interface, not a capability.
//
// WHAT THIS FILE DELIBERATELY DOES NOT DO
//   · It ships no vendor API keys, no endpoints, and no request bodies for
//     Meshy/DeepMotion/Luma/Higgsfield. I have no credentials for any of
//     them and inventing a payload produces code that fails on first call.
//   · The included adapter is `UnavailableProvider`, which reports exactly
//     what is missing. Real adapters are ~30 lines each and go in beside it
//     once you have keys.
//   · Nothing here generates anything. This is plumbing.

export type GenerationKind =
  | 'textTo3D' | 'imageTo3D' | 'videoToMocap' | 'photoToEnvironment' | 'textToVideo';

export interface GenerationRequest {
  kind: GenerationKind;
  prompt?: string;
  /** Source media for image/video/photo inputs. */
  input?: Blob | string;
  /** Free-form vendor options; adapters read what they understand. */
  options?: Record<string, unknown>;
}

export interface GenerationResult {
  kind: GenerationKind;
  /** Where the artifact landed. Everything downstream expects a URL the
   *  asset pipeline can ingest (probe → conform → validate → ready). */
  url: string;
  provider: string;
  /** Vendor cost signal when known — feeds the rent-vs-own decision. */
  costUnits?: number;
  meta?: Record<string, unknown>;
}

export interface GenerationProvider {
  readonly name: string;
  supports(kind: GenerationKind): boolean;
  /** Reject early with a clear reason rather than failing mid-flight. */
  available(): { ok: boolean; missing?: string };
  generate(req: GenerationRequest): Promise<GenerationResult>;
}

/** The honest default: reports what a real provider would need. */
export class UnavailableProvider implements GenerationProvider {
  constructor(
    public readonly name: string,
    private kinds: GenerationKind[],
    private requirement: string,
  ) {}
  supports(kind: GenerationKind): boolean { return this.kinds.includes(kind); }
  available(): { ok: boolean; missing?: string } { return { ok: false, missing: this.requirement }; }
  async generate(): Promise<GenerationResult> {
    throw new Error(`[FEL-GEN] ${this.name} is not wired: ${this.requirement}`);
  }
}

/** The vendors the roadmap names, each declaring what it needs to work.
 *  Replace an entry with a real adapter when its credential exists. */
export const PLANNED_PROVIDERS: GenerationProvider[] = [
  new UnavailableProvider('meshy', ['textTo3D', 'imageTo3D'],
    'a Meshy PAID-tier API key (free tier output is CC BY and not commercially shippable)'),
  new UnavailableProvider('deepmotion', ['videoToMocap'],
    'a DeepMotion/SayMotion API key, configured to export Mixamo-standard humanoid'),
  new UnavailableProvider('luma', ['photoToEnvironment', 'imageTo3D'],
    'a Luma API key'),
  new UnavailableProvider('higgsfield', ['textToVideo'],
    'a Higgsfield subscription + API key'),
];

export class GenerationRegistry {
  private providers: GenerationProvider[] = [];

  constructor(providers: GenerationProvider[] = PLANNED_PROVIDERS) {
    this.providers = [...providers];
  }

  /** Register a real adapter; it takes precedence over any planned stub of
   *  the same name. This is the one-file swap the whole seam exists for. */
  register(provider: GenerationProvider): void {
    this.providers = [provider, ...this.providers.filter((p) => p.name !== provider.name)];
  }

  /** First registered provider that supports the kind AND is actually wired. */
  private pick(kind: GenerationKind): GenerationProvider | null {
    return this.providers.find((p) => p.supports(kind) && p.available().ok) ?? null;
  }

  /** What is missing for a capability — surfaces the requirement to the UI
   *  instead of failing silently or pretending the feature works. */
  status(kind: GenerationKind): { ready: boolean; provider?: string; missing?: string } {
    const ready = this.pick(kind);
    if (ready) return { ready: true, provider: ready.name };
    const candidate = this.providers.find((p) => p.supports(kind));
    return { ready: false, missing: candidate?.available().missing ?? `no provider supports ${kind}` };
  }

  async generate(req: GenerationRequest): Promise<GenerationResult> {
    const provider = this.pick(req.kind);
    if (!provider) {
      const { missing } = this.status(req.kind);
      throw new Error(`[FEL-GEN] cannot ${req.kind}: ${missing}`);
    }
    const result = await provider.generate(req);
    // Generated assets are UNTRUSTED until they pass the gate. Never load a
    // vendor artifact straight into the game.
    console.info(`[FEL-GEN] ${provider.name} produced ${result.url} — route it through `
      + 'the asset pipeline (probe → conform → validate) before use.');
    return result;
  }
}
