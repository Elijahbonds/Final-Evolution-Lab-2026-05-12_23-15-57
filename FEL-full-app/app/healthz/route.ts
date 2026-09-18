// /healthz — the CONVENTIONAL liveness path (2026-09-13).
//
// The release pass added /api/health and it works. What stayed open was that the deployed edge answered 404
// on /healthz, and that is the path the things doing the asking actually use: Cloud Run's startup and
// liveness probes, GKE/Kubernetes probes, and most uptime monitors all default to /healthz. A liveness
// endpoint nothing probes is a liveness endpoint that does not exist.
//
// It DELEGATES rather than duplicating: two handlers that could disagree about whether the service is up is
// worse than one, and the failure mode would be the confusing kind — a monitor saying healthy while the real
// check says otherwise.
export { GET, dynamic, runtime } from '../api/health/route';
