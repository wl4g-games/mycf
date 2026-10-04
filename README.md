# Toon Strike

An original cartoon-style 3D H5 first-person shooter. The project combines a Canvas ray-casting renderer, code-drawn characters and tanks, layered Web Audio effects, and a server-authoritative Node.js WebSocket multiplayer mode. All maps and artwork are original.

## Features

- Choose solo or online play before selecting a map, team size, and loadout.
- Two maps: Bubble Harbor and Pinecone Valley.
- Three team sizes: `4v4`, `8v8`, and `16v16`.
- Three built-in loadouts with unlimited weapon, grenade, and tank ammunition.
- The M-77 tank supports independent turret aiming and firing while moving.
- Every non-player slot in solo mode is controlled by an AI NPC.
- Online mode includes callsign registration, presence, room creation, invitations, early owner start, automatic AI fill, and post-match rankings.
- The player UI supports English and Simplified Chinese. Chinese text is isolated in `src/locales/zh-CN.js`; technical code, CI output, logs, tests, and documentation remain English.

## Local development

```bash
cd /home/agent/mycf
npm install
npm start
```

Serve the frontend from another terminal:

```bash
cd /home/agent/mycf
python3 -m http.server 8080
```

Open <http://localhost:8080>. Solo mode works immediately. To test online mode locally, set `window.MYCF_WS_URL = "ws://127.0.0.1:8787/ws"` in the browser console before selecting online play. Production uses same-origin `/ws`.

## Build and container

The production build uses the same commands as CI:

```bash
npm ci
npm test
npm run build -- --base=/mycf/
```

Build output is written to `dist/`. The container image serves both the static game and the Node.js WebSocket service on port `8080`:

```bash
docker build --build-arg APP_BASE=/ -t mycf:local .
docker run --rm -p 8080:8080 mycf:local
```

## CI/CD

- `.github/workflows/ci.yml` maintains one live PR status comment and runs `npm ci`, tests, and the production build for pull requests targeting `main`.
- `.github/workflows/release.yml` calculates a semantic version after changes reach `main`, packages `dist.tar.gz`, publishes a GitHub Release, and then publishes an amd64 GHCR image and GitHub Pages in parallel.
- The release workflow follows `jumprun`; PR install, test, and build steps follow the same structure with additional sticky status jobs adapted from `mcpfather`.
- The GitHub Pages build connects online mode to `wss://mycf.wl4g.com/ws`; other deployments default to same-origin `/ws`.

GitHub Pages uses **GitHub Actions** as its deployment source. See [`.github/workflows/README.md`](.github/workflows/README.md) for the full pipeline description.

## Controls

- `W/A/S/D`: move or drive the tank
- Mouse: turn, aim, or control the turret
- Left click: fire or perform a melee attack
- Right click: use the Barrett 8× scope
- `1 / 2 / 3`: primary, secondary, and melee weapons
- `G`: throw a grenade
- `B`: switch loadout
- `F`: enter or leave the tank
- `Esc`: pause

Touch devices provide a movement stick, swipe aiming, fire, scope, grenade, loadout, and tank controls.

## Production deployment constraints

- The Node.js service listens only on `127.0.0.1:8787` in the host deployment.
- `https://mycf.wl4g.com` and `wss://mycf.wl4g.com/ws` share the same domain.
- Only `/etc/nginx/conf.d/mycf.conf` may be updated for Nginx. The tracked template is `deploy/mycf.nginx.conf`; no other Nginx configuration may be changed.
- Run `sudo nginx -t` successfully before reloading Nginx.
