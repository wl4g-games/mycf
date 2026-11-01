# MyCF Coding Agent Handover

This document is the implementation handover for future coding agents. It
records what is complete, what is only foundational, which boundaries must not
be crossed, and how to extend the project without regressing its release
architecture. Read [the architecture overview](../architecture/OVERVIEW.md)
before making structural changes.

## 1. Baseline and source of truth

This document was re-audited on **2026-11-01, Asia/Shanghai** against
`origin/main` release `v1.10.1` (`6f528b4`) and the open documentation branch
`docs/architecture-handover`. The audit found no architectural code violation
that justified a runtime change; the alignment corrections were documentation
only. Treat current source and tests as authoritative if a later release
differs, and update this document in the same change that alters an
architectural boundary.

The repository contains two installable projects:

- root: Vite static H5 client;
- `ws-server/`: standalone authoritative Node.js WebSocket service.

The root frontend intentionally imports browser-safe canonical rules from
`ws-server/src/`. Do not make `game-config.js`, `match.js`,
`match-results.js`, `match-rules.js`, `shot-geometry.js`, or
`vehicle-system.js` depend on Node-only modules without first separating their
shared browser domain.

### 1.1 Current production access and deployment ledger

This section is an operational snapshot, not immutable design. The next agent
must refresh the verification time, revision, endpoints, cache backend, and
deployment owner whenever production topology changes.

Last verified: **2026-11-01, Asia/Shanghai**.

| Purpose | Current address or identifier | Verified behavior |
| --- | --- | --- |
| Player frontend | `https://wl4g-games.github.io/mycf/` | HTTP 200; GitHub Pages workflow deployment |
| Online service base | `https://mycf.wl4g.com` | Server-only custom Vercel domain; `/` intentionally returns 404 |
| Online health | `https://mycf.wl4g.com/health` | HTTP 200 with `ok: true` |
| Online WebSocket | `wss://mycf.wl4g.com/ws` | Endpoint embedded by the production Pages bundle |
| Vercel provider alias | `https://mycf-wl4g-games.vercel.app` | Server-only fallback/diagnostic alias; `/health` returns 200 |
| Source repository | `https://github.com/wl4g-games/mycf` | Canonical Git repository |
| Current release | `https://github.com/wl4g-games/mycf/releases/tag/v1.10.1` | Production revision `6f528b4bb3f360fa47168c3c4530f53f8a9d8255` |
| Release workflow run | `https://github.com/wl4g-games/mycf/actions/runs/37769919144` | Release, Pages, server validation, and GHCR image succeeded |
| Container image | `ghcr.io/wl4g-games/mycf:v1.10.1` and `ghcr.io/wl4g-games/mycf:latest` | Published by the successful release workflow |

Current configuration and ownership observations:

- repository variable `MYCF_WS_URL` is `https://mycf.wl4g.com`;
- the live Pages JavaScript bundle contains that custom endpoint and not the
  provider alias;
- both health endpoints report `cache.backend: "memory"`, so Redis is **not**
  enabled in the current production service;
- the production Vercel deployment for the current revision was created by
  Vercel's Git integration;
- the release workflow's `Deploy WebSocket server to Vercel` job was skipped
  because `VERCEL_DEPLOY_ENABLED` was not configured;
- do not enable Actions-owned Vercel deployment while automatic Vercel Git
  production deployment is active, or one merge can deploy twice.

The custom domain's DNS and Vercel domain binding are external configuration,
not repository state. The custom domain should remain the client-facing value;
the provider alias is useful only for diagnosis or emergency fallback. Do not
publish `/` as a game URL for either server hostname because the service owns
only `/health` and `/ws`.

Local development addresses are:

| Purpose | Default address |
| --- | --- |
| Vite frontend | `http://127.0.0.1:5173/` |
| Standalone server health | `http://127.0.0.1:8787/health` |
| Standalone WebSocket | `ws://127.0.0.1:8787/ws` |

Refresh this ledger with read-only checks before relying on it:

```bash
curl -fsSI https://wl4g-games.github.io/mycf/
curl -fsS https://mycf.wl4g.com/health
node ws-server/scripts/smoke-deployment.mjs \
  https://mycf.wl4g.com https://wl4g-games.github.io
gh api repos/wl4g-games/mycf/pages
gh variable get MYCF_WS_URL
gh run list --workflow release.yml --limit 3
gh release view
```

Use `HTTPS_PROXY=http://127.0.0.1:8800` for HTTP checks when direct access is
affected by GFW. The smoke script itself does not currently implement proxy
transport, so use a browser/proxy-aware WebSocket probe when direct Node.js
network access is blocked. Never print Vercel tokens, Redis credentials, or
other secret values into this document or CI logs.

### 1.2 New-machine migration checklist

At the last audit, architecture documentation is still carried by open
[PR #15](https://github.com/wl4g-games/mycf/pull/15):

| Field | Audited value |
| --- | --- |
| Base | `main` at `6f528b4` / `v1.10.1` |
| Head | `docs/architecture-handover` |
| PR state | Open, mergeable, review required |
| Automated checks | Successful at the audit time |

Refresh the PR before acting because review and merge state can change. On a
fresh machine, use one of these two paths:

```bash
git clone git@github.com:wl4g-games/mycf.git
cd mycf
gh pr view 15

# Continue the unmerged handover branch:
git fetch origin
git switch --create docs/architecture-handover \
  --track origin/docs/architecture-handover

# Or, after PR #15 is merged, use the released integration branch:
git switch main
git pull --ff-only origin main
```

Install reproducibly from both lockfiles and establish a clean baseline:

```bash
HTTPS_PROXY=http://127.0.0.1:8800 npm ci
HTTPS_PROXY=http://127.0.0.1:8800 npm ci --prefix ws-server
npm test
npm test --prefix ws-server
npm run check
VITE_MYCF_WS_URL=https://mycf.wl4g.com npm run build -- --base=/mycf/
git status --short --branch
```

Use Node.js 22; the frontend manifest also supports Node `20.19+`, but the
server manifest and CI standardize on Node 22. Do not migrate `node_modules/`,
`dist/`, `.vercel/`, `.env*`, tokens, or Redis credentials between machines.
They are generated output or machine-local secrets. The tracked source, two
lockfiles, Git history, and this handover are sufficient to reconstruct the
workspace.

External state is not reconstructed by Git. Recheck the GitHub
`MYCF_WS_URL` variable, Pages source, Vercel project root (`ws-server`), custom
domain binding, deployment owner, Redis environment, and live `/health`
response after migration. The current production service reports the
`memory` cache backend, so do not assume Redis is enabled.

### 1.3 Architecture-to-source audit result

| Area | Source of truth | Result |
| --- | --- | --- |
| Mode authority | `GameState`, `AuthoritativeMatch`, `LanHost` | Solo, online, and LAN ownership matches both architecture overviews |
| Shared rules | root re-exports from `ws-server/src/` | Browser-safe config, match rules/results, shot geometry, and vehicle rules are canonical |
| Client storage | `src/repositories/` | Setup and parent state use validated local storage; room projection is deliberately memory-only |
| Online persistence | `GameStateStore` and `PersistenceQueue` | Write-side checkpoints exist; startup restore, resume, and multi-instance authority do not |
| LAN transport | `src/lan/` | Complete host-only ICE QR signaling, two channels, host authority, AI fill, and 20 Hz snapshots match the design |
| Delivery | `.github/workflows/` | PR validates both projects and builds only the frontend; `main` builds release, Pages, and GHCR, with optional Vercel deploy |

No runtime source was changed by this audit. Documentation now explicitly
separates online cache persistence from non-persistent LAN state, distinguishes
server validation from a PR container build, and records the missing browser
and multi-device automated E2E coverage.

## 2. Non-negotiable invariants

1. **Pages is static only.** Release CI uploads only root `dist/` to GitHub
   Pages. It must never include or launch the WebSocket server.
2. **The server is an independent child project.** Vercel and GHCR build only
   `ws-server/Dockerfile.vercel` with `ws-server` as context.
3. **Simulation authority is mode-specific.** Solo trusts `GameState`; online
   trusts the Node server; LAN trusts `LanHost` in the host browser.
4. **Clients send intent, not outcomes.** Remote clients never choose their own
   hit, damage, kill, score, health, or respawn result.
5. **Canonical game identifiers remain stable.** Map, mode, condition,
   loadout, weapon, throwable, vehicle, team, and character IDs cross storage
   and protocol boundaries.
6. **Online room state remains server-authoritative.** Do not persist browser
   room ownership or invitation state across reloads.
7. **Parent-control timer writes are monotonic within a cycle.** A stale tab
   must not restore time or unlock a newer cycle.
8. **Player-facing Chinese belongs only in approved locale or documentation
   files.** Protocols, code, logs, tests, and CI output remain English.
9. **Use semantic combat events for presentation.** Do not trigger recoil,
   muzzle flash, tracer, hit sound, grenade callout, or explosion directly from
   an unaccepted input.
10. **Keep online and LAN presentation compatible.** Both transports feed
    `NetworkGameState`; changes to one session contract must be checked against
    the other.
11. **Never silently downgrade configured Redis to memory.** Invalid or
    unreachable explicit Redis settings must fail startup.
12. **Bump the explicit static cache token consistently** when source files
    imported through query strings change. Vite hashes release assets, but the
    token also protects raw/static host deployments.

## 3. Implemented feature inventory

### 3.1 Game setup and content

- Three game types: solo, online WebSocket, and server-free LAN WebRTC.
- Two original maps: city and wilderness.
- Four team sizes: 1v1, 4v4, 8v8, and 16v16.
- Four paired match conditions: 10/3m, 20/5m, 30/8m, 50/12m.
- Four loadouts covering Barrett, AK-47, police machine gun, and power bow.
- Firearms, bow, pistols, melee weapons, smoke/firework/skull grenades.
- M-77 tank and A-12 armored car, both drivable and able to fire while moving.
- Two male and five adult female selectable setup/podium profiles.
- Photoreal setup and podium atlases; cartoon-only live combat actors.

### 3.2 Combat and presentation

- Canvas ray-casting world renderer and radar.
- First-person viewmodels per weapon family.
- Recoil, muzzle flash, reticle flame, melee swing, bow release, and movement
  bob.
- Visible firearm tracers, bow trails, and red confirmed-injury trajectories.
- Alternating actor gait derived from movement.
- Mouse and independent multi-touch movement/fire-drag aiming.
- Local and spatial teammate/enemy footsteps.
- Layered original weapon, explosion, vehicle, bow, melee, and hit audio.
- Packaged bilingual grenade warning with speech fallback.
- Team and personal K/D HUD, kill feed, allied top-three podium, and full
  ranking modal.
- Fullscreen plus confirmed solo restart or online/LAN room-exit controls.

### 3.3 Solo mode

- Complete local match lifecycle.
- AI movement, route following, targeting, firing, grenade use, death, and
  respawn.
- Local vehicles, collision, projectiles, smoke visibility blocking, scoring,
  and result creation.

### 3.4 Online mode

- Callsign registration and presence.
- Room creation, invitation, accept/decline, early start, leave, and owner
  transfer.
- AI fill for every empty team slot.
- Server-authoritative movement, weapon actions, grenade actions, vehicles,
  hits, health, death, respawn, score, timing, and ranking.
- Client movement prediction, remote interpolation, reliable combat events,
  and input neutralization on pause/blur.
- Origin allowlist, connection limits, registration timeout, payload limit,
  rate limiting, heartbeat, and graceful shutdown.
- `/health` readiness and `/ws` transport endpoints.

### 3.5 LAN mode

- No WebSocket or public signaling dependency.
- Complete non-trickle Offer/Answer SDP with host candidates.
- Zlib-compressed, versioned, expiring QR payloads.
- Camera scan, image scan, and manual copy/paste fallback.
- One star-topology peer connection per client.
- Unreliable state channel and ordered reliable channel.
- Browser-hosted `AuthoritativeMatch`, 20 Hz snapshots, sequenced input,
  reliable vitals/events, RTT, and connection debug UI.
- Capacity derived from selected `NvN`; early start with AI fill.
- Remote snapshot interpolation and AI takeover when a client leaves.

### 3.6 Parent control and repositories

- Optional 1/3/5/10/20-minute active-play countdown.
- 1/3/5/10 correct-answer unlock requirements.
- Cross-refresh and cross-tab local state synchronization.
- Same-cycle monotonic timer merging and compare-and-set cycle advance.
- Jumprun-aligned 100-question bilingual, weighted curriculum.
- Setup, parent-control, and room-projection repository interfaces with local
  implementations.

### 3.7 Server cache and persistence foundation

- `ICache` with memory and Redis implementations.
- Automatic backend selection using explicit `MYCF_` Redis configuration or
  Vercel Marketplace `REDIS_URL`.
- TTL, scan, atomic acquire/release, and pub/sub primitives.
- Versioned room/match checkpoints, disconnect/shutdown recovery archives,
  and retained results.
- Per-key ordered persistence, retry, stale-operation suppression, and
  fail-closed health.

### 3.8 Delivery

- PR CI installs and tests both projects, runs strict LAN type checks and
  JavaScript syntax checks, builds the root Vite frontend, and maintains one
  sticky English status comment. It does not build a server container.
- Main release computes semantic version, publishes a deterministic frontend
  archive and GitHub Release, deploys Pages, validates the server, and pushes
  an amd64 GHCR image.
- Credential-gated Vercel staging, health/WS smoke tests, and promotion.
- Optional Nginx/systemd host templates.

## 4. Partial implementations that must not be overclaimed

### 4.1 Redis is not multiplayer failover

The server writes complete checkpoints and recovery archives, but production
startup does not read them. `LobbyService` users, rooms, socket routing, and
live match ownership are still process-local. Pub/sub and lease primitives
exist but are not integrated into lobby or match routing.

Consequences:

- two Vercel instances can have isolated presence and room maps;
- reconnecting clients can land on an instance that does not know their room;
- instance recycle ends the socket and active match from the player's view;
- a saved checkpoint is inspectable but is not automatically resumed.

### 4.2 WebSocket client recovery is absent

`NetworkClient` makes one connection attempt, has no stable session credential,
and clears its projection on close. The protocol has no resume command,
connection epoch, command sequence, replay cursor, or idempotent discrete
action ID.

### 4.3 Vercel duration still bounds sockets

Match timers are 180/300/480/720 seconds and can finish earlier at the kill
target. Vercel measures duration from connection establishment, so lobby time
also consumes the invocation lifetime. Redis checkpoint writes alone do not
solve the closure. The tracked `ws-server/vercel.json` enables Fluid compute
but does not set `maxDuration`, so the project/dashboard default applies. At
the current Hobby default of 300 seconds, the 5/8/12-minute presets cannot be
assumed to complete on one connection, especially after lobby time. Recheck
the current plan and
[official Vercel duration limits](https://vercel.com/docs/functions/configuring-functions/duration)
before changing this constraint.

### 4.4 LAN capacity is not a performance guarantee

The protocol supports up to 32 humans because capacity follows 16v16. The host
still owns one peer connection, two channels, per-client snapshots, and the
entire simulation for every client. Real-device capacity depends on CPU,
thermal limits, browser implementation, and Wi-Fi airtime. Current design is a
star, not an SFU or mesh of all clients.

### 4.5 Vertical aiming is presentation-only for hit selection

The camera and local pitch move vertically, but `findTargetInArc()` uses yaw,
range, and 2D line of sight. Do not describe the current combat model as full
3D ballistics.

### 4.6 Parent control is a family aid, not an access-control system

There is no parent PIN, server policy, account binding, or tamper resistance.
Clearing browser data resets it.

### 4.7 Automated browser and device E2E is absent

The suites cover domain behavior, UI/source contracts, strict LAN TypeScript,
build boundaries, and a real Node WebSocket runtime. They do not launch
Chromium/WebKit, drive the rendered game, scan with a real phone camera, or
pair multiple real browsers over WebRTC. iOS Chrome/Safari startup, touch,
audio-unlock, QR camera permissions, full-screen behavior, and realistic LAN
capacity therefore remain manual release checks.

### 4.8 Identity and LAN pairing are intentionally weak

Online identity is a per-socket connection ID plus a unique in-memory alias;
there is no account authentication, durable identity, or resume credential.
LAN QR payloads are versioned and expire after ten minutes, but have no PIN or
application signature. Do not expose either mode as authenticated or
tamper-resistant multiplayer.

### 4.9 Development dependency audit finding

On 2026-11-01, `npm audit --omit=dev` was clean for both projects. A full root
audit reported one high aggregate advisory against the pinned development-only
Vite `7.3.6`; npm identified `7.3.7` as the non-major fix. The deployed static
bundle and production dependencies are not affected, but the next dependency
maintenance change should update Vite and its lockfile, rerun the full suite,
and verify the Pages build. Do not hide the finding with an audit exception.

## 5. Prioritized enhancement roadmap

### P0: complete online resume and multi-instance authority

Deliver this as staged, testable slices rather than embedding Redis calls
directly throughout `LobbyService`.

1. Introduce a stable session ID separate from socket/connection IDs.
2. Issue a random bearer resume token; store only its hash. Rotate it with a
   short previous-token overlap so a lost response cannot strand the session.
3. Add client reconnect with exponential backoff, jitter, visibility/network
   wakeups, frozen input, and a clear `RECONNECTING` state.
4. Persist session, alias claim, presence, room membership, invitations, and
   connection route with TTL and atomic operations.
5. Add a single match-owner lease with monotonic fencing epoch. Every state
   write and final result must verify the current fence.
6. Use a durable stream for discrete actions and pub/sub only for disposable
   live snapshots/events. Continuous movement may be latest-value state.
7. Hydrate `AuthoritativeMatch` from the canonical checkpoint, reset held
   inputs, preserve absolute `endsAt`, and resume from a higher epoch.
8. Return a full canonical snapshot on resume; cosmetic missed events need not
   be replayed.
9. Proactively rotate long-lived sockets before platform duration, while still
   handling abrupt closure.

Minimum acceptance test: two runtime instances share Redis; a 1v1 begins on
one instance; that instance is stopped; both clients reconnect to the other;
room identity, actor assignment, K/D, vehicles, score, and deadline survive;
stale fenced writes are rejected; the match finishes exactly once.

### P1: extract a shared simulation core

`GameState` and `AuthoritativeMatch` duplicate AI, movement, collision,
weapons, grenades, damage, respawn, and vehicles. Extract pure domain services
incrementally:

- world construction and actor spawning;
- input application and movement;
- AI policy;
- combat/projectile resolution;
- respawn and match completion;
- event production.

Keep clocks, random sources, local audio, persistence, and transport as injected
adapters. Preserve current semantic events and snapshot contracts before
deleting either implementation path.

### P1: decompose application orchestration

`src/main.js` is large. Extract cohesive controllers without creating a deep
framework:

- `SetupController`
- `OnlineLobbyController`
- `LanLobbyController`
- `BattleController`
- `MatchResultView`
- `BattleControlsView`

Keep shared state ownership explicit; do not create a global event bus that
obscures mode transitions.

### P1: harden protocols

- Add explicit online protocol version negotiation.
- Validate message payloads deeply on both online and LAN boundaries.
- Bound arrays, strings, action counts, numeric ranges, and snapshot sizes.
- Add client input sequence and idempotent action IDs online.
- Reject stale match ID/epoch/sequence messages.
- Generate protocol contract tests from shared fixtures.

### P1: validate and optimize LAN scale

- Add 2/8/16/32-browser synthetic load measurements.
- Measure host CPU, outbound bitrate, buffered amounts, packet loss, and mobile
  thermal degradation.
- Add snapshot delta compression or quantization before increasing frequency.
- Add adaptive snapshot rate and backpressure telemetry.
- Improve QR overflow handling with a multi-part or file/share fallback while
  preserving the no-signaling-server requirement.
- Add same-tab reconnect only if identity and authority semantics are clearly
  defined; host migration remains a separate feature.

### P1: make pitch authoritative

Add vertical angle to authoritative inputs and validate vertical angular error
against actor height. Derive tracer and projectile height from pitch. Preserve
2D map collision unless the renderer and world model are deliberately upgraded
to multi-level geometry.

### P2: implement cache-backed API repositories

The current browser repository contract is synchronous. A future
`ApiGameSetupRepository` or `ApiParentalControlRepository` should expose a
local synchronous snapshot and perform explicit asynchronous `hydrate()` and
`sync()` phases. Do not replace synchronous `load()` with an unannounced
Promise; `main.js` and `ParentalControl` depend on immediate state.

Do not create an API room repository that revives cached `connected: true`
without an open transport. Transport connectivity is ephemeral and must be
verified independently from hydrated room metadata.

### P2: account and social features

Only after identity and resume exist, consider:

- account authentication and display-name ownership;
- matchmaking and public room discovery;
- friends/party flow;
- durable player statistics and progression;
- moderation and abuse controls;
- spectators and replay.

### P2: observability and operations

- structured logs without tokens, credentials, or full SDP;
- metrics for connections, room count, tick duration, snapshot bytes, cache
  errors, reconnect outcomes, and lease handoff;
- readiness/liveness separation;
- deployment revision in health output;
- alerting for persistence errors and event-loop delay.

## 6. Change routing guide

| Change | Start here | Also inspect |
| --- | --- | --- |
| Map, mode, weapon, loadout, actor, vehicle stats | `ws-server/src/game-config.js` | locales, config tests, renderer/audio/viewmodel |
| Kill/time conditions | `ws-server/src/match-rules.js` | setup UI, locale text, lobby, LAN protocol/tests |
| Shared shot event or geometry | `ws-server/src/shot-geometry.js` | root re-export, tracer, audio, solo and server tests |
| Vehicle movement/entry | `ws-server/src/vehicle-system.js` | solo, authoritative match, renderer, network adapter |
| Solo mechanics | `src/game.js` | authoritative parity, semantic presentation events |
| Online authority | `ws-server/src/match.js` | checkpoint schema, LAN host compatibility |
| Room/invitation lifecycle | `ws-server/src/lobby.js` | `src/network.js`, UI, persistence documents |
| WebSocket transport/security | `ws-server/src/runtime.js` and `access-policy.js` | smoke test, Nginx, Vercel config |
| LAN messages or pairing | `src/lan/protocol.ts` and `peer.ts` | host, client, QR, UI, TypeScript tests |
| Browser online/LAN presentation | `src/network-game.js` | both transport implementations |
| Rendering | `src/renderer.js` | camera, animation, viewmodel, tracer tests |
| Audio | `src/audio.js` | spatial/callout modules and semantic event producers |
| Parent-control rules | `src/parental/parental-control.js` | state, repository CAS, view, cross-tab tests |
| Curriculum | `src/parental/question-bank.js` and locale files | snapshot hashes, parity and quality tests |
| Browser persistence | `src/repositories/` | synchronous consumers and normalization tests |
| Redis/cache | `ws-server/src/cache/` | state store, health, shutdown and retry tests |
| Release topology | `.github/workflows/` | deployment-boundary tests and workflow README |

## 7. Protocol and data compatibility checklist

Before changing a cross-boundary shape, identify every producer and consumer.

### Online

- producer: `NetworkClient.send()` or `LobbyService.send()`;
- consumer: `LobbyService.receive()` or `NetworkClient` message listener;
- presentation: `NetworkGameState` and `main.js` event handlers;
- persistence: `GameStateStore.roomDocument()` and
  `AuthoritativeMatch.exportState()`.

### LAN

- types: `src/lan/protocol.ts`;
- encoder/decoder: `encodeWireMessage()` and `decodeWireMessage()`;
- producers/consumers: `LanHost` and `LanClient`;
- game adapter: `NetworkGameState`;
- signaling compatibility: protocol version, room ID, slot ID, expiry, and
  complete SDP.

### Stored state

- browser storage keys are versioned and normalized;
- server documents have `schemaVersion`;
- stable IDs must not be renamed without migration or aliasing;
- checkpointed projectiles store `ownerActorId`, not an object reference;
- pending actions and held fire are cleared when restoring serialized input.

## 8. Required validation

Run at least the following before handoff:

```bash
npm ci
npm ci --prefix ws-server
npm test
npm test --prefix ws-server
npm run check
VITE_MYCF_WS_URL=https://mycf.wl4g.com npm run build -- --base=/mycf/
npm audit --omit=dev
npm audit --omit=dev --prefix ws-server
git diff --check
```

Use `HTTPS_PROXY=http://127.0.0.1:8800` if dependency or build-related network
access is blocked by GFW. Do not read or print secret values. Source an approved
secret environment only when an authorized E2E test actually needs it.

For changes with user interaction, add browser coverage for relevant desktop
and mobile paths. LAN changes should prove that no business WebSocket is opened
and should exercise at least one real Offer/Answer pairing. Online deployment
changes should smoke-test `/health` and an actual `/ws` upgrade using the Pages
Origin.

For Redis failover work, tests must run at least two server runtimes against one
shared backend and kill the current owner mid-match. A unit test that calls
`exportState()` and `fromState()` in one process is not sufficient.

## 9. Release and Git workflow

1. Start from an updated `origin/main` in a focused branch.
2. Preserve unrelated worktree changes; never reset or delete user changes.
3. Use Conventional Commit prefixes because release versioning scans commit
   messages: `feat:` is minor, ordinary fixes are patch, and `refactor:` is
   currently treated as major.
4. Do not add `Co-Authored-By` trailers.
5. Open a PR and wait for the `Build and test` plus reporting checks.
6. A merge to `main` owns release, Pages, GHCR, and optional Vercel deployment.
7. If GitHub Actions deploys Vercel, disable Vercel automatic Git production
   deployment to prevent duplicate releases.

Do not deploy a dirty worktree snapshot as production. Do not claim that a PR
preview or successful image build means the Redis environment or stable domain
is configured; verify operational state separately.

## 10. Common pitfalls

- **Cache token drift:** a changed leaf module can remain cached when its parent
  import still uses an old query token. Replace the active token consistently.
- **LAN/online contract drift:** `NetworkGameState` expects both transports to
  expose compatible `self`, `sendInput`, and event semantics.
- **Browser-incompatible shared code:** LAN imports `AuthoritativeMatch` into
  the Vite graph.
- **False audio/visual feedback:** raw input is not proof that a shot or grenade
  passed cooldown and authority checks.
- **Stale room resurrection:** a browser repository must not persist online
  ownership; an older persistence write must not supersede a newer delete.
- **Socket lifetime confusion:** match duration starts after lobby, but platform
  function duration starts when the WebSocket invocation begins.
- **Pub/sub overuse:** Redis pub/sub is lossy. Canonical state and discrete
  commands needed for recovery require durable keys or streams.
- **Token rotation loss:** never invalidate a resume token before the client can
  safely receive its replacement; use overlap or acknowledgment.
- **Vercel instance assumptions:** two browser connections are not guaranteed to
  land on the same instance.
- **QR assumptions:** complete ICE is mandatory; trickle candidates cannot
  arrive after a printed QR. Avoid logging SDP because it exposes local network
  candidates.
- **iOS media policy:** audio and camera operations require a user gesture and
  secure context. Keep graceful manual signaling and audio fallback paths.
- **Parent-control cross-tab races:** always merge against freshly loaded state
  and require expected cycle proof for unlock.
- **Technical-language guard:** a new Chinese document or catalog requires an
  explicit narrow allowlist entry, not a blanket Markdown exemption.

## 11. Definition of done by subsystem

### Gameplay

- identical accepted-action semantics in the affected modes;
- collision, damage, score, death, respawn, and result tests;
- semantic presentation events emitted once;
- no frame-rate-dependent timer or cooldown regression.

### Online

- invalid/stale messages rejected;
- authoritative state cannot be chosen by the client;
- disconnect and pause clear continuous input;
- snapshot/event ordering documented and tested;
- health and shutdown behavior remain fail closed.

### LAN

- full ICE gathering and QR round trip pass;
- both channels reach open state;
- stale input sequence is ignored;
- host departure ends clients cleanly;
- capacity follows selected `NvN`;
- backpressure prevents unbounded `bufferedAmount` growth.

### Persistence

- schema and TTL are explicit;
- write ordering and retry are tested;
- shutdown flush does not write after cache close;
- credentials/endpoints never appear in health, logs, or protocol output;
- a recovery claim includes an actual cross-process takeover test.

### UI and localization

- English and Simplified Chinese keys and placeholders remain identical;
- keyboard, touch, focus, safe-area, and narrow viewport paths are checked;
- player-facing text is localized rather than embedded in business logic;
- setup, battle, and result state all rerender after locale change.

### Delivery

- PR workflow remains validation-only;
- release workflow uploads exactly `dist/` to Pages;
- server image context remains exactly `ws-server`;
- Vercel promotion occurs only after health and WS smoke tests;
- root and server dependency locks match their manifests.

## 12. Recommended first tasks for the next coding agent

If no new product requirement takes precedence, the highest-value sequence is:

1. design and test protocol-v2 stable sessions and resume tokens in memory;
2. add client reconnect/resume without claiming cross-instance recovery;
3. externalize session/presence/room state behind cohesive store and bus
   interfaces;
4. add fenced match ownership and durable command routing;
5. consume existing checkpoints during takeover and run a two-runtime chaos
   test;
6. only then advertise Vercel recycle survival or horizontal multiplayer.

For lower-risk maintenance, extract one UI controller from `main.js` or one
pure simulation subsystem at a time, preserve existing contracts, and let tests
prove parity before deleting duplicated code.
