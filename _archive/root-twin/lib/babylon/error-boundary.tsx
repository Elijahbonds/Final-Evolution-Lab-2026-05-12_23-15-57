'use client';

import React, { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Error Boundary for 3D rendering (Babylon.js, Three.js).
 * Prevents single asset failure from crashing entire app.
 */
export class ThreeDErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[3D-ERROR-BOUNDARY]', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center">
            <div className="rounded-xl border border-red-500/25 bg-red-500/5 p-6 max-w-md">
              <h1 className="text-xl font-bold text-red-400 mb-2">3D Scene Error</h1>
              <p className="text-sm text-white/70 mb-4">
                Failed to load 3D assets or render. This is often due to:
              </p>
              <ul className="text-xs text-white/60 space-y-1 mb-4 list-disc list-inside">
                <li>Missing model or texture files</li>
                <li>WebGL not supported in this browser</li>
                <li>Out of memory (try closing other tabs)</li>
                <li>Network timeout loading assets</li>
              </ul>
              {this.state.error && (
                <code className="block text-[10px] bg-black/50 p-2 rounded text-red-300 mb-4 overflow-auto max-h-24">
                  {this.state.error.message}
                </code>
              )}
              <button
                onClick={() => window.location.reload()}
                className="w-full rounded-lg bg-red-500/20 hover:bg-red-500/30 px-3 py-2 text-sm text-red-300 transition"
              >
                Reload Page
              </button>
            </div>
          </div>
        )
      );
    }

    return this.props.children;
  }
}

/**
 * Async asset loader with error recovery.
 * Retries failed asset loads and falls back to placeholder.
 */
export async function loadAssetWithFallback(
  url: string,
  fallbackUrl?: string,
  maxRetries = 3
): Promise<string> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      if (response.ok) return url;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1000 * attempt)); // Exponential backoff
      }
    }
  }

  if (fallbackUrl) {
    console.warn(
      `[ASSET-LOADER] Failed to load ${url} after ${maxRetries} attempts. Using fallback: ${fallbackUrl}`
    );
    return fallbackUrl;
  }

  throw lastError || new Error(`Failed to load asset: ${url}`);
}

/**
 * Safe Babylon.js engine creation with WebGL fallback detection.
 */
export function createBabylonEngineWithFallback(
  canvas: HTMLCanvasElement
): any | null {
  try {
    // Check WebGL2 support
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) {
      console.error('[BABYLON] WebGL not supported in this browser');
      return null;
    }

    // Lazy import to allow fallback
    const BABYLON = require('@babylonjs/core');
    return new BABYLON.Engine(canvas, true, {
      stencil: true,
      disableWebGL2Support: false,
      audioEngine: false, // disable audio to reduce memory footprint
    });
  } catch (e) {
    console.error('[BABYLON] Engine creation failed', e);
    return null;
  }
}
