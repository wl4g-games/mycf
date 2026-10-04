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

## Shared container definition

`Dockerfile.vercel` is the only production container definition. Build it locally from the repository root with:

```bash
docker build -f ws-server/Dockerfile.vercel -t toon-strike-ws:local ws-server
docker run --rm -p 8080:8080 toon-strike-ws:local
```

The merge workflow uses this file to publish `linux/amd64` tags to GHCR. Vercel also detects the same file, but independently builds it into Vercel Container Registry; a GHCR image is not directly deployed as a Vercel Function.

## Vercel container function

Create a dedicated Vercel project whose Root Directory is `ws-server` and whose Framework Preset is `Container`. Fluid compute must remain enabled because the service accepts WebSocket upgrades. Set the project's non-secret `PORT` environment variable to `8080`; the root Vite project remains outside this deployment.

If GitHub Actions owns production deployment, disable the project's automatic Vercel Git deployment to avoid deploying the same merge twice.

```bash
npx vercel --cwd ws-server --env PORT=8080
```

The service exposes `/health` and `/ws`. Vercel container Functions remain stateless and a connection is pinned only for its lifetime. New or reconnected clients can reach different instances, so reliable public multiplayer still requires resumable sessions plus external durable room, match, presence, and pub/sub state.

Each match has a 290-second time limit and may finish earlier at its score limit. A WebSocket closes when its Vercel Function reaches the plan's maximum duration; registration and lobby time occur before match start and consume connection lifetime too.

## Merge deployment controls

The merge workflow deploys this directory to Vercel only when the repository variable `VERCEL_DEPLOY_ENABLED` equals `true`. The `vercel-production` GitHub environment or repository must provide `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` secrets. CI stages the production container without assigning its domains, smoke-tests `/health` and `/ws` with the GitHub Pages browser origin, and promotes the verified deployment only after both checks pass.

Set the repository variable `MYCF_WS_URL` to the stable HTTPS production domain assigned to this Vercel project. Vite converts that HTTPS endpoint to WSS when building the Pages frontend.
