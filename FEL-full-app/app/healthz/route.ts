// /healthz — the CONVENTIONAL liveness path (2026-09-13).
//
// The release pass added /api/health and it works. What stayed open was that the deployed edge answered 404
// on /healthz, and that is the path the things doing the asking actually use: Cloud Run's startup and
// liveness probes, GKE/Kubernetes probes, and most uptime monitors all default to /healthz. A liveness
// endpoint nothing probes is a liveness endpoint that does not exist.
//
// It DELEGATES rather than duplicating the handler, but keeps the route segment
// config local. Next only recognizes these exports when they are string literals.
export { GET } from '../api/health/route';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
