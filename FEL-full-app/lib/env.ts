/**
 * Environment Configuration Validator
 * Runs on server startup. Ensures all required env vars are present and valid.
 * Fail-fast: missing config prevents server from starting.
 */

export interface EnvConfig {
  // ─── Database ───────────────────────────────────────────────────────
  DATABASE_URL: string;

  // ─── Authentication ─────────────────────────────────────────────────
  NEXTAUTH_SECRET: string;
  NEXTAUTH_URL: string;

  // ─── Third-party APIs ───────────────────────────────────────────────
  STRIPE_SECRET_KEY: string;
  STRIPE_PUBLIC_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;

  // ─── Cloud Storage ──────────────────────────────────────────────────
  AWS_REGION: string;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_S3_BUCKET: string;

  // ─── API Keys (optional, for coach system) ──────────────────────────
  ABACUSAI_API_KEY?: string;

  // ─── Server ─────────────────────────────────────────────────────────
  NODE_ENV: 'development' | 'production' | 'test';
  PORT?: string;
}

const REQUIRED_VARS: (keyof EnvConfig)[] = [
  'DATABASE_URL',
  'NEXTAUTH_SECRET',
  'NEXTAUTH_URL',
  'STRIPE_SECRET_KEY',
  'STRIPE_PUBLIC_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'AWS_REGION',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_S3_BUCKET',
];

const OPTIONAL_VARS: (keyof EnvConfig)[] = ['ABACUSAI_API_KEY', 'PORT'];

/**
 * Load and validate environment config.
 * Throws on missing required vars; logs warnings for missing optional vars.
 */
export function loadEnvConfig(): EnvConfig {
  const missing: string[] = [];
  const warnings: string[] = [];

  // Check required variables
  for (const key of REQUIRED_VARS) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  // Check optional variables
  for (const key of OPTIONAL_VARS) {
    if (!process.env[key]) {
      warnings.push(key);
    }
  }

  // Fail if any required var is missing
  if (missing.length > 0) {
    const msg = `Missing required environment variables:\n${missing.map((k) => `  - ${k}`).join('\n')}`;
    console.error(`[ENV-VALIDATOR] ${msg}`);
    throw new Error(msg);
  }

  // Warn if any optional var is missing
  if (warnings.length > 0) {
    console.warn(
      `[ENV-VALIDATOR] Missing optional environment variables:\n${warnings.map((k) => `  - ${k}`).join('\n')}`
    );
  }

  // Validate URL format
  try {
    new URL(process.env.NEXTAUTH_URL!);
  } catch (e) {
    throw new Error(`NEXTAUTH_URL is not a valid URL: ${process.env.NEXTAUTH_URL}`);
  }

  // Validate NODE_ENV
  const nodeEnv = process.env.NODE_ENV as any;
  if (!['development', 'production', 'test'].includes(nodeEnv)) {
    throw new Error(
      `NODE_ENV must be "development", "production", or "test", got: ${nodeEnv}`
    );
  }

  return {
    DATABASE_URL: process.env.DATABASE_URL!,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET!,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL!,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY!,
    STRIPE_PUBLIC_KEY: process.env.STRIPE_PUBLIC_KEY!,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET!,
    AWS_REGION: process.env.AWS_REGION!,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID!,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY!,
    AWS_S3_BUCKET: process.env.AWS_S3_BUCKET!,
    ABACUSAI_API_KEY: process.env.ABACUSAI_API_KEY,
    NODE_ENV: nodeEnv,
    PORT: process.env.PORT,
  };
}

// Run validator on module load (server startup)
if (typeof window === 'undefined') {
  // Server-side only
  try {
    loadEnvConfig();
    console.log('[ENV-VALIDATOR] ✓ All required environment variables are set');
  } catch (e) {
    console.error('[ENV-VALIDATOR] FATAL:', e);
    process.exit(1);
  }
}
