# Toon Strike WebSocket Server

This directory is the self-contained authoritative Node.js WebSocket service. The static Vite client remains a separate root project published through GitHub Pages; this project never builds or serves frontend assets.

## Local development

Run these commands from the repository root:

```bash
npm ci --prefix ws-server
npm test --prefix ws-server
npm --prefix ws-server start
```

The standalone process listens on `127.0.0.1:8787` by default. Override it with `PORT`, or with `MYCF_WS_HOST` and `MYCF_WS_PORT` for a non-container host deployment. It serves `/health` and `/ws`; it intentionally returns `404` for `/` because it owns no frontend assets.

Browser connections from the GitHub Pages origin, the service's own origin, and loopback development origins are accepted by default. Add any other trusted browser origins as a comma-separated `MYCF_ALLOWED_ORIGINS` value.

## Cache and persisted game state

The service uses an `ICache` backend selected at startup. With no Redis endpoint it uses the process-local memory implementation. Explicit `MYCF_REDIS_URL` or `MYCF_REDIS_HOST` plus `MYCF_REDIS_PORT` configuration takes priority; otherwise a Vercel Marketplace `REDIS_URL` is detected automatically. Partial, invalid, or unreachable Redis configuration fails startup instead of silently falling back to isolated memory state.

| Variable | Purpose |
| --- | --- |
| `MYCF_REDIS_HOST` / `MYCF_REDIS_PORT` | Enable the Redis backend with an explicit single-instance endpoint; both values are required together |
| `MYCF_REDIS_URL` | Alternative `redis://` or `rediss://` endpoint |
| `REDIS_URL` | Vercel Marketplace fallback used only when no explicit `MYCF_` endpoint is configured |
| `MYCF_REDIS_TLS` | Explicitly enable or disable TLS when host and port are used |
| `MYCF_REDIS_USERNAME` / `MYCF_REDIS_PASSWORD` | Optional Redis ACL credentials |
| `MYCF_REDIS_DATABASE` | Optional numeric Redis database |
| `MYCF_REDIS_PREFIX` | Key and channel namespace; defaults to `mycf:` |

The host systemd template reads an optional `/etc/mycf/ws-server.env` file. Store Redis credentials there with restrictive permissions when running outside Vercel; never add that file to the repository.

Room documents use a versioned schema and include configuration, members, invitations, match identity, score, K/D, damage, actors, vehicles, projectiles, effects, and an absolute match deadline. Active matches are checkpointed every second and immediately after authoritative kills. Completed ranking results are retained for seven days; live room checkpoints use a 24-hour TTL. An unexpected disconnect or graceful shutdown also captures a one-hour recovery archive before local membership is mutated. Pending one-shot actions are deliberately cleared during serialization so a future restore cannot replay a shot or grenade.

The health response exposes only the backend name and readiness, never endpoint or credential data. It returns `503`, and new WebSocket upgrades fail closed, whenever the selected backend or persistence pipeline is unavailable.

This persistence layer is the recovery foundation, not complete serverless failover. The current runtime writes but does not yet consume recovery archives, sockets and live simulation ownership remain process-local, and the browser does not yet carry a resume token. Surviving a Vercel recycle still requires stable sessions, client reconnect/resume, a fenced single match-owner lease, and cross-instance command/event routing. The cache already provides TTL, atomic acquire/release, and pub/sub primitives for those follow-up stages.

## Shared container definition

`Dockerfile.vercel` is the only production container definition. Build it locally from the repository root with:

```bash
docker build -f ws-server/Dockerfile.vercel -t toon-strike-ws:local ws-server
docker run --rm -p 8080:8080 toon-strike-ws:local
```

The merge workflow uses this file to publish `linux/amd64` tags to GHCR. Vercel also detects the same file, but independently builds it into Vercel Container Registry; a GHCR image is not directly deployed as a Vercel Function.

## Vercel container function

Create a dedicated Vercel project whose Root Directory is `ws-server` and whose Framework Preset is `Container`. Fluid compute must remain enabled because the service accepts WebSocket upgrades. Set the project's non-secret `PORT` environment variable to `8080`; the root Vite project remains outside this deployment.

For durable checkpoints, configure the Redis variables in the Vercel Production environment before deploying. Keep Redis in the same region as the service and use a production-specific `MYCF_REDIS_PREFIX`; do not share that prefix with Preview deployments. Credentials belong in Vercel secrets, not in this repository.

If GitHub Actions owns production deployment, disable the project's automatic Vercel Git deployment to avoid deploying the same merge twice.

```bash
npx vercel --cwd ws-server --env PORT=8080
```

The service exposes `/health` and `/ws`. Vercel container Functions remain stateless and a connection is pinned only for its lifetime. New or reconnected clients can reach different instances, so reliable public multiplayer still requires resumable sessions plus external durable room, match, presence, and pub/sub state.

Match conditions pair `10/20/30/50` kills with `180/300/480/720` seconds and may finish earlier at the kill target. A WebSocket closes when its Vercel Function reaches the plan's maximum duration; registration and lobby time occur before match start and consume connection lifetime too. Fluid compute defaults to 300 seconds, Hobby cannot exceed 300 seconds, and paid deployments must explicitly allow at least 800 seconds for the longer presets. Durable shared state and resumable clients remain necessary even with a longer limit.

## Merge deployment controls

The merge workflow deploys this directory to Vercel only when the repository variable `VERCEL_DEPLOY_ENABLED` equals `true`. The `vercel-production` GitHub environment or repository must provide `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` secrets. CI stages the production container without assigning its domains, smoke-tests `/health` and `/ws` with the GitHub Pages browser origin, and promotes the verified deployment only after both checks pass.

Set the repository variable `MYCF_WS_URL` to the stable HTTPS production domain assigned to this Vercel project. Vite converts that HTTPS endpoint to WSS when building the Pages frontend.
