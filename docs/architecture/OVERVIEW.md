# MyCF Architecture Overview

This document describes the architecture implemented in the repository. It is
intended to be read together with [the Chinese overview](OVERVIEW_CN.md) and
[the coding-agent handover](../development/HARDCOVER.md).

## 1. System scope

MyCF, presented to players as Toon Strike, is a static H5 first-person shooter
with three execution modes:

1. **Solo** runs simulation, AI, rendering, and audio in one browser.
2. **Online** uses a separately deployed Node.js WebSocket service as the
   authoritative lobby and match simulator.
3. **LAN** performs server-free QR signaling and uses a host browser as the
   authoritative simulator for WebRTC DataChannel peers.

The root project is a Vite static frontend. `ws-server/` is an independent
Node.js project and container deployment unit. GitHub Pages never executes the
WebSocket server, and the WebSocket server never builds or serves the frontend.

## 2. Context diagram

```text
                         GitHub Pages
                    static HTML/CSS/JS/assets
                              |
                    +---------+---------+
                    |                   |
              Solo browser        Player browser
              GameState                 |
                    |          +--------+--------+
                    |          |                 |
                    |      Online mode        LAN mode
                    |          |                 |
                    |       WSS /ws       WebRTC DataChannels
                    |          |                 |
                    |    ws-server          Host browser
                    |    LobbyService       LanHost
                    |          |                 |
                    +---- simulation domain -----+
                               |
                     AuthoritativeMatch / rules
                               |
                    MemoryCache or RedisCache
                    checkpoints and result data
```

The browser-side `NetworkGameState` is deliberately transport-neutral. It can
consume snapshots and reliable events from either `NetworkClient` or a LAN
session object. This keeps online and LAN presentation behavior aligned.

The cache branch in the diagram applies only to the online service. LAN rooms
and matches live only in the host browser and are lost when that host closes.

## 3. Deployment topology

```text
Pull request
  -> install root and ws-server dependencies
  -> frontend tests + server tests + syntax/type checks
  -> Vite frontend static-build validation

Merge to main
  -> Vite dist archive -> GitHub Release
  -> the same dist -> GitHub Pages
  -> validate ws-server
  -> Dockerfile.vercel -> linux/amd64 -> GHCR
  -> optional staged Vercel container deployment
       -> /health and cross-origin /ws smoke tests
       -> promote only after validation
```

The Pages build receives `VITE_MYCF_WS_URL`. `resolveWebSocketUrl()` converts an
HTTPS endpoint to WSS and appends `/ws` when the configured path is `/`.

The Vercel project root is `ws-server`, its framework is `container`, and Fluid
compute is enabled. `ws-server/Dockerfile.vercel` is also the single container
definition used for the GHCR image. Vercel independently builds that
definition; it does not pull the GHCR image.

An optional long-running deployment uses `deploy/mycf-ws.service` on loopback
and `deploy/mycf.nginx.conf` for `/ws` upgrade proxying. The tracked Nginx
template also serves the static frontend, but production edits are constrained
to `/etc/nginx/conf.d/mycf.conf`.

## 4. Runtime layers

### 4.1 Application and UI orchestration

`index.html` contains the setup screen, online and LAN lobby panels, battle
HUD, modal dialogs, parental-control UI, ranking, and podium markup.
`styles.css` owns responsive layout and presentation. `src/main.js` wires DOM
events, mode selection, repositories, transports, game state, render frames,
audio events, pause/fullscreen behavior, and match-end views.

`src/main.js` is an orchestration layer rather than a domain source of truth.
New simulation rules should not be added there.

### 4.2 Input and frame loop

`InputController` normalizes keyboard, mouse, pointer lock, touch movement,
touch fire-drag aiming, and cancellation into a frame input:

```js
{
  movement: { x, y },
  yaw,
  pitch,
  fireHeld,
  items: [[action, optionalValue]]
}
```

The animation frame in `main.js` chooses the active game state, consumes input,
advances the active transport and simulation, updates parental-control time,
renders the world, and refreshes the HUD. Simulation deltas are bounded for
stability; authoritative online match time uses an absolute deadline.

### 4.3 Simulation domain

There are two main simulation classes:

- `src/game.js` exports `GameState` for single-browser solo play. It owns the
  local player, AI, weapons, projectiles, vehicles, score, respawns, and match
  completion, and directly invokes local audio feedback.
- `ws-server/src/match.js` exports `AuthoritativeMatch` for online and LAN
  authoritative play. It validates human inputs, creates AI replacements,
  advances world state, emits semantic combat events, produces per-player
  snapshots, and can export a versioned checkpoint.

Both consume canonical configuration from `ws-server/src/game-config.js` and
shared helpers from `shot-geometry.js`, `vehicle-system.js`,
`match-rules.js`, and `match-results.js`. The root `src/config.js`,
`src/shot-geometry.js`, and `src/vehicle-system.js` are browser-facing
re-exports of those canonical modules.

Only browser-safe code may be introduced into modules imported by the root
frontend. `AuthoritativeMatch` is also bundled into the browser for a LAN host,
so it must remain free of Node-only APIs.

### 4.4 Rendering and presentation

`Renderer` is a Canvas ray-casting renderer. It draws map walls, animated
cartoon actors, vehicles, projectiles, effects, tracers, cockpit overlays,
radar, and the current weapon viewmodel. Supporting modules separate specific
presentation concerns:

| Module | Responsibility |
| --- | --- |
| `camera.js` | Camera-pitch clamping and horizon calculation |
| `render-animation.js` | Movement-derived gait and motion tracking |
| `weapon-viewmodel.js` | First-person weapon geometry, recoil, muzzle effects, melee and bow motion |
| `combat-tracer.js` | Bounded firearm, bow, and incoming-hit trajectory effects |
| `renderer.js` | World projection, draw order, sprites, vehicles, effects, radar, and HUD-facing samples |

Photoreal character atlases are used only by setup and podium CSS. Combat
characters remain code-drawn cartoon figures.

### 4.5 Audio

`GameAudio` builds original layered Web Audio plans for weapons, explosions,
melee, bow release, footsteps, hits, and vehicle fire. `audio-spatial.js`
calculates attenuation, left/right panning, stride events, and grenade threat
relationships. `audio-callout.js` preloads and plays packaged English and
Chinese grenade warnings, with browser speech synthesis as a fallback.

Audio is driven by accepted simulation or authoritative combat events, not raw
input, so rejected cooldown actions do not create false effects.

## 5. Execution modes

### 5.1 Solo mode

```text
InputController
  -> GameState.update()
       -> local movement and collision
       -> AI decisions
       -> weapon and grenade acceptance
       -> damage, death, respawn, score
       -> semantic presentation events
  -> Renderer + GameAudio
```

The browser owns all state. Empty team positions are always AI controlled.
Solo state is not persisted across reloads; only setup preferences and optional
parental-control state are stored locally.

### 5.2 Online WebSocket mode

```text
Browser NetworkClient
  -> register / presence / room / invitation protocol
  -> match_input at approximately 20 Hz

ws-server Runtime
  -> origin, connection, payload, registration, and rate checks
  -> LobbyService room lifecycle
  -> AuthoritativeMatch at a 20 Hz server tick
  -> per-player snapshots at approximately 15 Hz
  -> reliable combat and match lifecycle events

Browser NetworkGameState
  -> lightweight local movement prediction
  -> snapshot reconciliation and interpolation
  -> presentation events, HUD, audio, and rendering
```

The online server accepts JSON envelopes shaped as `{ type, payload }`.
Principal client messages are `register`, `update_profile`, `create_room`,
`invite`, `respond_invite`, `leave_room`, `start_room`, `match_input`, and
`ping`. Principal server messages are `hello`, `registered`, `presence`,
`room_state`, `invite`, `notice`, `match_start`, `snapshot`, `combat_event`,
`match_end`, `room_left`, `pong`, and `error`.

The current client does not reconnect or resume a match after socket loss. A
disconnect clears the in-memory room projection, and the server replaces a
departed human actor with AI.

### 5.3 Server-free LAN mode

LAN signaling is manual and server-free:

1. The host creates an `RTCPeerConnection` with `iceServers: []` and two data
   channels.
2. The host waits for complete ICE gathering, compresses the complete Offer
   SDP with zlib, and renders one QR code.
3. A client scans the Offer, creates a complete Answer SDP, and displays an
   Answer QR code.
4. The host scans that Answer. Each additional client repeats the process with
   an independent host-to-client peer connection.

The channels are:

| Channel | Settings | Data |
| --- | --- | --- |
| `state` | unordered, `maxRetransmits: 0` | sequenced input and 20 Hz snapshots |
| `reliable` | ordered | join/leave, room state, combat events, vitals, match lifecycle, errors, ping/pong |

`LanHost` reuses `AuthoritativeMatch`, making the host browser authoritative.
`LanClient` sends only sequenced input and interpolates remote snapshot state.
Room capacity is `teamSize * 2`, from 2 people for 1v1 to 32 for 16v16. The
host can start after one client joins, and AI fills every vacant actor slot.

This mode intentionally has no public signaling, WebSocket, STUN, TURN,
matchmaking, account, reconnect, or host migration. It is limited to peers that
can exchange host candidates on the same reachable LAN. Closing the host ends
the room.

## 6. State ownership

| State | Owner | Persistence |
| --- | --- | --- |
| Setup selection and callsign preference | Browser `LocalGameSetupRepository` | `localStorage` with validated normalization |
| Parent-control configuration and active cycle | Browser `LocalParentalControlRepository` | `localStorage`, monotonic same-cycle merge and cycle CAS |
| Online room projection | Browser `LocalRoomStateRepository` | Memory only; authoritative state remains on the server |
| Solo match | Browser `GameState` | None |
| LAN room and match | Host browser `LanHost` and `AuthoritativeMatch` | None |
| Online live lobby and simulation | One `LobbyService` process | Process memory |
| Online room checkpoints and results | `GameStateStore` | Selected `ICache` backend |
| Rendering, audio, interpolation, and transient FX | Browser presentation modules | None |

Browser repositories are synchronous by design. A future API-backed repository
must hydrate a local snapshot before application use and replicate changes
asynchronously; making the render loop await network storage would violate the
current contract.

## 7. Online persistence and cache

`ICache` defines JSON get/set/delete/scan, TTL, atomic set-if-absent,
compare-and-delete, and pub/sub. Implementations are:

- `MemoryCache`: process-local development and fallback backend.
- `RedisCache`: namespaced Redis storage with a dedicated duplicate client for
  subscription.

`createCache()` selects Redis when `MYCF_REDIS_URL`, explicit
`MYCF_REDIS_HOST` plus `MYCF_REDIS_PORT`, or the Vercel Marketplace
`REDIS_URL` is configured. Invalid or unreachable Redis configuration fails
startup rather than silently falling back to memory.

`GameStateStore` persists:

- live room and match checkpoints with a 24-hour TTL;
- recovery archives with a 1-hour TTL;
- completed results and latest-room results with a 7-day TTL.

`PersistenceQueue` orders writes per logical key, prevents an older failed save
from superseding a newer delete, retries transient failures, and keeps health
unready while terminal errors remain.

The persistence path is currently **write-side recovery infrastructure only**.
The runtime does not load a room or recovery archive on startup, does not issue
resume tokens, does not route commands between instances, and does not elect a
single match owner. Redis therefore protects snapshots but does not yet provide
automatic failover or horizontally correct multiplayer.

## 8. Parent control and client repositories

Parent control is opt-in and browser-local. It counts active, unpaused gameplay
only, persists countdown progress, and blocks continuation with a learning quiz
at zero. The configured durations are 1, 3, 5, 10, or 20 minutes, and the
required correct-answer counts are 1, 3, 5, or 10.

The question bank matches the neighboring Jumprun project: 100 bilingual
questions across eight weighted subjects, deterministic answer rotation, full
bank exhaustion before refill, and an eight-question recent-repeat guard.

The repository boundaries are:

- `IGameSetupRepository` / `LocalGameSetupRepository`
- `IRoomStateRepository` / `LocalRoomStateRepository`
- `IParentalControlRepository` / `LocalParentalControlRepository`

There is no parent PIN, remote policy service, or account-level enforcement.
Clearing site data clears the local configuration and countdown.

## 9. Security and failure boundaries

Implemented online safeguards include:

- explicit browser-origin policy with configured-origin extension;
- a 16 KiB WebSocket payload limit and disabled per-message compression;
- global and per-IP connection caps;
- a registration deadline;
- per-connection message rate limiting;
- ping/pong liveness checks;
- alias, room, mode, map, character, and equipment normalization;
- fail-closed health and upgrade behavior when cache or persistence is unready;
- bounded graceful shutdown with a pre-mutation recovery archive.

The online protocol has no account authentication or cryptographic player
identity. A connection ID is the session identity. LAN QR envelopes have a
protocol version and ten-minute expiry but no application-level signature or
PIN; WebRTC still provides its normal encrypted transport after pairing.

## 10. Source directory map

```text
.
├── index.html                 Setup, lobby, HUD, modal, parental, podium markup
├── styles.css                Responsive UI, portraits, HUD, modal presentation
├── assets/                   Maps, character atlases, packaged callout audio
├── src/
│   ├── main.js               Application composition and frame orchestration
│   ├── game.js               Solo simulation and AI
│   ├── network.js            WebSocket endpoint resolution and room protocol
│   ├── network-game.js       Remote snapshot adapter/prediction/interpolation
│   ├── renderer.js           Canvas ray-casting world renderer
│   ├── input.js              Keyboard, mouse, pointer-lock, and touch input
│   ├── audio*.js             Web Audio recipes, spatial cues, callout assets
│   ├── camera.js             Camera pitch and horizon
│   ├── combat-tracer.js      Firearm, bow, and injury trajectories
│   ├── render-animation.js   Actor gait and motion state
│   ├── weapon-viewmodel.js   First-person weapon presentation
│   ├── config.js             Browser re-export of canonical game config
│   ├── shot-geometry.js      Browser re-export of canonical shot geometry
│   ├── vehicle-system.js     Browser re-export of canonical vehicle rules
│   ├── lan/
│   │   ├── protocol.ts       Typed LAN messages, snapshots, and constants
│   │   ├── peer.ts           PeerConnection and DataChannel primitives
│   │   ├── qr-signaling.ts   Compressed complete-SDP QR signaling
│   │   ├── host.ts           Host authority, peers, snapshots, and RTT
│   │   └── client.ts         Client pairing, input, events, and debug state
│   ├── parental/
│   │   ├── parental-control.js  Countdown and unlock-cycle domain service
│   │   ├── view.js              Settings and quiz modal controller
│   │   ├── question-bank.js     100-question curriculum structure
│   │   ├── quiz-session.js      Weighted picker and answer session
│   │   ├── settings.js          Supported parent-control choices
│   │   └── state.js             Versioned state normalization
│   ├── repositories/         Synchronous browser repository contracts/adapters
│   └── locales/              English and Simplified Chinese UI catalogs
├── test/                     Frontend/domain/unit/contract tests
├── ws-server/
│   ├── Dockerfile.vercel     Only production server container definition
│   ├── vercel.json           Vercel container + Fluid compute declaration
│   ├── scripts/              Deployment smoke test
│   ├── src/
│   │   ├── standalone.js     Process startup, cache selection, shutdown
│   │   ├── runtime.js        HTTP health, WS upgrade, limits, loops
│   │   ├── lobby.js          Registration, presence, invitations, rooms
│   │   ├── match.js          Authoritative match simulation and checkpointing
│   │   ├── game-config.js    Canonical maps, modes, actors, weapons, loadouts
│   │   ├── match-rules.js    Kill/time conditions
│   │   ├── match-results.js  Rankings, summaries, podium selection
│   │   ├── shot-geometry.js  Authoritative shot paths and events
│   │   ├── vehicle-system.js Shared vehicle physics and interactions
│   │   ├── game-state-store.js Versioned room/recovery/result documents
│   │   ├── persistence-queue.js Ordered persistence and retry behavior
│   │   ├── access-policy.js  Origin and trusted-proxy IP policy
│   │   └── cache/            ICache, MemoryCache, RedisCache, selection factory
│   └── test/                 Server, cache, persistence, and runtime tests
├── deploy/                   Optional systemd and Nginx host templates
└── .github/workflows/        Pull-request CI and main release/deployment DAG
```

## 11. Test strategy

The root test suite uses Node's built-in test runner for simulation, audio
semantics, renderer math, input, repositories, parent control, LAN protocol,
localization parity, deployment boundaries, and technical-language policy.
TypeScript is used for strict checking of the LAN modules. The server has an
independent Node test suite for lobby, match, geometry, cache, persistence,
access policy, and real WebSocket runtime behavior.

The PR workflow builds only the root Vite frontend artifact. It installs,
tests, and syntax-checks `ws-server`, but a production server container is
built only after a merge to `main`. There is currently no Playwright/WebKit
suite or automated multi-device LAN test; mobile Safari/Chrome, camera QR, and
real WebRTC pairing still require manual device validation.

Primary validation commands are:

```bash
npm ci
npm ci --prefix ws-server
npm test
npm test --prefix ws-server
npm run check
VITE_MYCF_WS_URL=https://example.invalid npm run build -- --base=/mycf/
git diff --check
```

## 12. Deliberate limitations

- Online reconnect, resume, cross-instance routing, and automatic Redis restore
  are not implemented.
- LAN has no NAT traversal, host migration, or reconnect; 16v16 is a protocol
  capacity, not a guarantee that every mobile host can sustain 31 peers.
- Account login, matchmaking, spectators, replay, voice chat, and persistent
  player progression are not implemented.
- Browser automation and multi-device mobile/LAN E2E are not implemented; the
  current suites are unit, domain, protocol, build-boundary, and Node runtime
  tests.
- Aiming pitch changes presentation, but authoritative hit selection remains a
  2D yaw/range/line-of-sight calculation.
- Solo and authoritative match implementations still duplicate parts of AI,
  combat, projectile, and respawn logic.
- `main.js` remains a large composition controller and is a candidate for
  mode-specific UI-controller extraction.

See the handover document for a prioritized extension plan and safe change
boundaries.
