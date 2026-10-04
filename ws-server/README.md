# Toon Strike WebSocket Server

This directory is the self-contained authoritative Node.js WebSocket service. The static Vite client remains a separate root project published through GitHub Pages; this project never builds or serves frontend assets.

## Local development

Run these commands from the repository root:

```bash
npm ci --prefix ws-server
npm test --prefix ws-server
npm --prefix ws-server start
```

The standalone process listens on `127.0.0.1:8787` by default. Override it with `MYCF_WS_HOST` and `MYCF_WS_PORT` when required. It serves `/health` and `/ws`; it intentionally returns `404` for `/` because it owns no frontend assets.

Browser connections from the GitHub Pages origin, the service's own origin, and loopback development origins are accepted by default. Add any other trusted browser origins as a comma-separated `MYCF_ALLOWED_ORIGINS` value.

## Vercel

Create a dedicated Vercel project whose Root Directory is `ws-server` and whose Framework Preset is `Other`. Fluid compute must remain enabled. The root Vite project is not part of this deployment.

```bash
npx vercel --cwd ws-server
```

The service exposes `/health` and `/ws`. The Function duration is capped at 300 seconds, while every solo and online match has a 290-second time limit and may finish earlier at its score limit.

The 290-second match limit does not replace reconnection or shared state. Function duration begins when a WebSocket connection opens, so registration and lobby time consume the same 300-second budget. A reliable public deployment still requires resumable sessions, durable room and match state, and cross-instance coordination.
