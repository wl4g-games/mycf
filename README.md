<div align="center">

# Toon Strike · 泡泡战区

**Cartoon squads, two battlefields, and tank combat in your browser.**<br>
**卡通小队、双重战场与坦克交火，打开浏览器即可开战。**

<p>
  <a href="https://wl4g-games.github.io/mycf/"><img src="https://img.shields.io/badge/%E2%96%B6%20PLAY%20NOW-%E7%AB%8B%E5%8D%B3%E5%BC%80%E7%8E%A9-2eb9f0?style=for-the-badge" alt="Play Toon Strike · 立即开玩" height="42"></a>
  <a href="https://github.com/wl4g-games/mycf/actions/workflows/ci.yml"><img src="https://github.com/wl4g-games/mycf/actions/workflows/ci.yml/badge.svg?event=pull_request" alt="Pull request CI status" height="28"></a>
  <a href="https://github.com/wl4g-games/mycf/actions/workflows/release.yml"><img src="https://github.com/wl4g-games/mycf/actions/workflows/release.yml/badge.svg?branch=main&event=push" alt="Release and deployment status" height="28"></a>
</p>

Play in your browser · 打开即玩 · Solo and online · 单机与联机<br>
Two maps · 两张地图 · Four battle sizes · 四种规模 · Three loadouts · 三套背包 · Up to 16v16 · 最高 16v16

**Unlimited firearm ammunition, grenades, and tank shells.**<br>
**枪械弹药、手雷与坦克炮弹全部无限。**

</div>

## About · 游戏简介

Toon Strike is an original cartoon-style 3D H5 first-person shooter powered by a Canvas ray-casting renderer, code-drawn combatants and vehicles, layered Web Audio effects, and a server-authoritative Node.js WebSocket multiplayer service. Its maps and visual assets were created specifically for this project and do not reuse recognizable third-party game maps, characters, logos, or artwork.

《泡泡战区》是一款原创动画片风格 3D H5 第一人称射击游戏，采用 Canvas 射线渲染、代码绘制的战斗角色与载具、Web Audio 分层音效，以及服务器权威的 Node.js WebSocket 多人服务。地图与视觉素材均为本项目专门创作，不复用可识别的第三方游戏地图、角色、标志或美术资源。

## Features · 核心功能

- **Solo and online · 单机与联机：** Choose the game type before selecting a map, team size, and loadout.<br>
  进入部署界面后，先选择单机版或网络版，再选择地图、队伍规模与作战背包。
- **AI replacement · AI 补位：** Every other slot in solo mode is controlled by an AI NPC; online room owners may start before all human slots are filled, and AI automatically fills every vacancy on both teams.<br>
  单机版除玩家外全部由 AI NPC 控制；网络房主无需等真人满员即可开局，双方空缺席位会自动由 AI 补齐。
- **Four battle sizes · 四种规模：** Play `1v1`, `4v4`, `8v8`, or `16v16`, with balanced teams in every mode. The default remains `4v4`.<br>
  支持 `1v1`、`4v4`、`8v8` 与 `16v16`，每种模式都会保持双方人数平衡，默认仍为 `4v4`。
- **Two maps · 两张地图：** Fight across the coastal city of Bubble Harbor or the wilderness of Pinecone Valley.<br>
  可在海港都市“泡泡港城”或野外区域“松果山谷”展开战斗。
- **Three loadouts · 三套背包：** Switch among a Barrett sniper kit, an AK-47 assault kit, and a low-recoil police machine-gun kit.<br>
  可切换巴雷特狙击套装、AK-47 突击套装与警用低后坐力机枪套装。
- **Mobile tank combat · 可移动坦克战：** Drive the M-77 tank while aiming its turret independently of the hull and firing on the move.<br>
  可驾驶 M-77 坦克行进，并让炮塔独立于车体瞄准，在移动中持续开炮。
- **Multiplayer rooms · 多人房间：** Register a unique callsign, see available online players, create a room, send invitations, accept or decline invitations, and view post-match rankings.<br>
  可注册唯一作战别名、查看可邀请的在线玩家、创建房间、发送邀请、接受或拒绝邀请，并在赛后查看排名。
- **Weapon-specific audio · 武器专属音效：** Barrett shots, automatic weapons, pistols, melee attacks, grenades, and tank shells use distinct layered sound profiles.<br>
  巴雷特、自动武器、手枪、近战攻击、手雷与坦克炮均使用彼此不同的分层声音特征。
- **Classic FPS presentation · 经典第一视角表现：** Every weapon family has its own two-handed viewmodel, movement bob, accepted-shot recoil, muzzle flash, and crosshair flame; scoped Barrett aiming hides the viewmodel.<br>
  每类武器都有独立的双手第一视角模型、移动起伏、有效开火后坐、枪口焰与准星火焰；巴雷特开镜时会隐藏持枪模型。
- **Independent touch controls · 双手独立触控：** The left thumb moves while the right thumb can hold FIRE and drag to aim in the same gesture, with cancellation-safe multi-touch tracking.<br>
  左手拇指负责移动，右手拇指可在按住开火的同时拖动瞄准，并通过安全的多触点跟踪处理系统中断。
- **Animated combatants · 动态战斗角色：** Teammates and enemies use movement-derived alternating leg strides instead of sliding across the map.<br>
  队友与敌人会根据实际位移交替迈腿，不再以固定站姿在地图上滑行。
- **Bilingual player UI · 双语玩家界面：** The interface supports English and Simplified Chinese, follows the browser language by default, and remembers manual language changes.<br>
  玩家界面支持英文与简体中文，默认跟随浏览器语言，并会记住手动切换的语言。

## Maps and loadouts · 地图与作战背包

| Category · 类别 | Option · 选项 | Equipment or setting · 装备或说明 |
|---|---|---|
| Map · 地图 | Bubble Harbor · 泡泡港城 | Playful coastal city · 欢乐海港都市战区 |
| Map · 地图 | Pinecone Valley · 松果山谷 | Cartoon wilderness · 卡通野外行动区 |
| Loadout 01 · 背包 01 | Long-range Hunter · 远程猎手 | Barrett M82A1 · White Pistol · Swiss Knife · Smoke Grenade<br>巴雷特 M82A1 · 白壳手枪 · 瑞士军刀 · 烟雾弹 |
| Loadout 02 · 背包 02 | Breach Raider · 突击破阵 | AK-47 · Baike Pistol · Battle Axe · Firework Grenade<br>AK-47 · 白克手枪 · 战斧 · 烟花手雷 |
| Loadout 03 · 背包 03 | Police Firepower · 警用火力 | Police M7 · Dual Pistols · Swiss Knife · Skull Grenade<br>警用 M7 机枪 · 双持小手枪 · 瑞士军刀 · 骷髅手雷 |

All firearms, grenades, and tank shells have unlimited ammunition; the loadouts differ by damage, fire rate, range, recoil profile, and combat role.

所有枪械、手雷与坦克炮弹均为无限备弹；不同背包通过伤害、射速、射程、后坐力特征与战斗定位形成差异。

## How to play · 操作方式

| Action · 操作 | Keyboard and mouse · 键盘与鼠标 | Touch device · 触屏设备 |
|---|---|---|
| Move or drive · 移动或驾驶 | `W / A / S / D` | Movement stick · 移动摇杆 |
| Aim or turn turret · 瞄准或转动炮塔 | Mouse · 鼠标 | Swipe the view · 滑动画面 |
| Fire or melee · 射击或近战 | Left click · 鼠标左键 | Fire button · 开火按钮 |
| Barrett scope · 巴雷特开镜 | Right click · 鼠标右键 | Scope button · 开镜按钮 |
| Select weapon · 选择武器 | `1 / 2 / 3` | Keyboard only · 仅键盘支持 |
| Throw grenade · 投掷手雷 | `G` | Grenade button · 手雷按钮 |
| Switch loadout · 切换背包 | `B` | Loadout button · 背包按钮 |
| Enter or leave tank · 进入或离开坦克 | `F` | `F` button · `F` 按钮 |
| Pause · 暂停 | `Esc` | Not available · 暂不支持 |

The Barrett supports an 8× scope, the tank can move and fire simultaneously, and the active loadout can be changed during a match while the player is on foot.

巴雷特支持 8 倍瞄准镜，坦克能够边移动边开火，并且玩家步行作战时可在比赛中切换当前作战背包。

## Online flow · 网络对战流程

```text
Choose ONLINE / 选择网络版
  → Enter a callsign / 输入作战别名
  → Connect to /ws / 连接 /ws
  → Create or join a room / 创建或加入房间
  → Invite available players / 邀请空闲玩家
  → Start at any occupancy / 无需满员即可开始
  → Fill vacancies with AI / AI 自动补位
  → Show match ranking / 展示赛后排名
```

The browser connects to the same-origin `/ws` endpoint by default. GitHub Pages can host the static game but cannot run a WebSocket server; its online mode therefore requires `VITE_MYCF_WS_URL` to point at the separately deployed Vercel endpoint.

浏览器默认连接当前域名下的 `/ws`。GitHub Pages 可以托管静态游戏但无法运行 WebSocket 服务，因此 Pages 的网络模式需要通过 `VITE_MYCF_WS_URL` 指向单独部署的 Vercel 端点。

## Language policy · 语言规范

Player-facing Chinese text is centralized in `src/locales/zh-CN.js`, while stable message keys, protocol codes, source code, configuration, CI output, logs, and tests remain English. The root README is intentionally bilingual for users and contributors; the rest of the technical documentation remains English.

面向玩家的中文文案集中保存在 `src/locales/zh-CN.js`，稳定消息键、协议码、源代码、配置、CI 输出、日志与测试均保持英文。根目录 README 为方便用户与贡献者而特意采用中英双语，其余技术文档仍保持英文。

Automated tests require the English and Simplified Chinese catalogs to expose identical non-empty keys and matching placeholders. Another source-text guard rejects Chinese characters outside the Simplified Chinese UI catalog and this bilingual README.

自动测试要求英文与简体中文语言目录具有完全一致的非空键和占位符。另一项源码文本守卫会拒绝出现在简体中文 UI 语言文件与本双语 README 之外的中文字符。

## Run locally · 本地运行

The static frontend requires Node.js `^20.19.0` or `>=22.12.0`; the independent WebSocket service pins Node.js `22.x`.<br>
静态前端需要 Node.js `^20.19.0` 或 `>=22.12.0`；独立 WebSocket 服务固定使用 Node.js `22.x`。

Install the frontend and WebSocket service dependencies independently:<br>
分别安装前端与 WebSocket 服务依赖：

```bash
npm ci
npm ci --prefix ws-server
```

Run the two projects in separate terminals. The Vite environment variable points the static client at the local WebSocket service:<br>
在两个终端中分别运行两个项目；Vite 环境变量会让静态客户端连接本地 WebSocket 服务：

```bash
# Terminal 1: independent Node.js WebSocket service
npm --prefix ws-server start

# Terminal 2: static Vite frontend
VITE_MYCF_WS_URL=http://127.0.0.1:8787/ws npm run dev
```

Open the URL printed by Vite. Solo mode runs entirely in the browser, while online mode connects to `127.0.0.1:8787`; the server readiness endpoint is <http://127.0.0.1:8787/health>.

打开 Vite 输出的地址即可。单机版完全在浏览器中运行，网络版连接 `127.0.0.1:8787`；服务就绪探针为 <http://127.0.0.1:8787/health>。

## Test and build · 测试与构建

Run the same validation used by pull request CI, including explicit source syntax checks for both projects:<br>
运行与 Pull Request CI 相同的验证，其中包含两个项目的显式源码语法检查：

```bash
npm ci
npm ci --prefix ws-server
npm test
npm test --prefix ws-server
npm run check
npm run build -- --base=/mycf/
```

The frontend production bundle is written to `dist/`; the WebSocket service remains a separate Node.js project and is never copied into the Pages artifact.<br>
前端生产构建产物会写入 `dist/`；WebSocket 服务始终是独立 Node.js 项目，绝不会被复制到 Pages 制品中。

## Container image · 容器镜像

The production image contains only the independent Node.js WebSocket service on port `8080`. GitHub Pages continues to host the static game separately.<br>
生产镜像仅包含独立 Node.js WebSocket 服务并监听 `8080` 端口；静态游戏仍由 GitHub Pages 单独托管。

```bash
docker build -t toon-strike-ws:local .
docker run --rm --name toon-strike-ws -p 8080:8080 toon-strike-ws:local
```

After the container becomes healthy, use <http://127.0.0.1:8080/health> for readiness and `ws://127.0.0.1:8080/ws` for multiplayer traffic.<br>
容器进入健康状态后，使用 <http://127.0.0.1:8080/health> 检查就绪状态，并通过 `ws://127.0.0.1:8080/ws` 传输多人对战流量。

## Vercel deployment · Vercel 部署

[`ws-server/`](ws-server) is a self-contained standard Node.js project and is the only part intended for Vercel. Its [`vercel.json`](ws-server/vercel.json) enables Fluid compute and maps `/ws` and `/health` to small Function adapters; it does not build, copy, or serve the root Vite frontend.<br>
[`ws-server/`](ws-server) 是自包含的标准 Node.js 项目，也是唯一用于 Vercel 的部分。其 [`vercel.json`](ws-server/vercel.json) 会启用 Fluid compute，并把 `/ws` 与 `/health` 映射到轻量 Function 适配器；它不会构建、复制或托管根目录 Vite 前端。

For a Git-connected Vercel project, set **Root Directory** to `ws-server` and **Framework Preset** to **Other**. For a CLI Preview, run these commands from the repository root:<br>
通过 Git 连接 Vercel 项目时，请将 **Root Directory** 设为 `ws-server`，并将 **Framework Preset** 设为 **Other**。如需通过 CLI 创建 Preview，请在仓库根目录执行：

```bash
npx vercel login
npx vercel ws-server
```

The Preview command deploys only the child Node.js project and creates an endpoint for manually validating `/health`, the `/ws` rewrite, and the WebSocket handshake. Vercel never replaces the GitHub Pages frontend deployment.<br>
上方 Preview 命令只部署 Node.js 子项目，并创建一个可手动验证 `/health`、`/ws` 重写与 WebSocket 握手的端点；Vercel 永远不会取代 GitHub Pages 前端部署。

Vercel can place WebSocket clients on different Function instances and can recycle an instance at its duration limit. A public deployment therefore needs durable room and match coordination through Redis plus client reconnection. The current in-memory runtime is suitable only for local single-process development; even a Vercel Preview deployment does not guarantee correct multiplayer routing or recovery.<br>
Vercel 可能把 WebSocket 客户端分配到不同的 Function 实例，也可能在运行时限到达后回收实例。因此公开部署需要使用 Redis 持久协调房间与比赛状态，并在客户端实现断线重连。当前纯内存运行时仅适合本地单进程开发；即使是 Vercel Preview 部署，也无法保证多人路由与恢复行为正确。

Each match has a 290-second time limit and may end earlier when a team reaches the score limit; the WebSocket Function is capped at 300 seconds. Vercel measures that cap from the initial socket connection, not from match start, so time spent registering, inviting, or waiting in a room consumes the same limit; the 10-second numerical margin alone cannot guarantee a complete match.<br>
每局比赛时限为 290 秒，并可在一方达到得分上限时提前结束；WebSocket Function 上限为 300 秒。Vercel 从首次建立连接时开始计算时限，而不是从比赛开始时计算，因此注册、邀请与房间等待都会消耗同一时限；仅有数值上的 10 秒余量无法保证完成整局比赛。

Run a production deployment only after Redis-backed coordination, reconnect and resume support, abuse controls, and a real two-client Preview smoke test are complete.<br>
只有在完成 Redis 协调、断线重连与恢复、防滥用控制，以及真实 Preview 双客户端冒烟测试之后，才应执行生产部署。

After a managed endpoint is ready, set the repository variable below. Pull request and release builds pass it to Vite, allowing the GitHub Pages frontend to connect without hard-coding a deployment domain.<br>
托管端点准备就绪后，请设置下方仓库变量。Pull Request 与发布构建会把它传给 Vite，使 GitHub Pages 前端无需硬编码部署域名即可连接。

```bash
gh variable set MYCF_WS_URL --body "https://<project>.vercel.app"
```

## CI, release and deployment · 持续集成、发布与部署

[Pull Request CI](.github/workflows/ci.yml) maintains one live English status comment, installs dependencies, runs every test, and validates the production build. Each comment is updated from the started state to the final result, and stale runs cannot overwrite a newer run.

[Pull Request CI](.github/workflows/ci.yml) 会维护一条实时英文状态评论、安装依赖、运行全部测试并验证生产构建。评论会从开始状态原地更新为最终结果，并且旧运行无法覆盖较新的运行。

After code reaches `main`, the [release workflow](.github/workflows/release.yml) calculates the next semantic version, creates the static `mycf-vX.Y.Z-dist.tar.gz`, publishes a GitHub Release, and then publishes the WebSocket-server amd64 GHCR image and GitHub Pages frontend in parallel.

代码进入 `main` 后，[release workflow](.github/workflows/release.yml) 会计算下一个语义版本、生成静态 `mycf-vX.Y.Z-dist.tar.gz`、发布 GitHub Release，然后并行发布 WebSocket 服务 amd64 GHCR 镜像与 GitHub Pages 前端。

```text
main updated / main 更新
  ├→ semantic version + frontend npm ci + Vite build / 语义版本 + 安装前端依赖 + Vite 构建
  │    → mycf-vX.Y.Z-dist.tar.gz + GitHub Release / 发布归档与 Release
  │         └→ static dist / 静态 dist → GitHub Pages deploy / GitHub Pages 部署
  └→ ws-server install + tests + checks / WS 服务安装 + 测试 + 检查
       → WebSocket server image / WebSocket 服务镜像 → ghcr.io/wl4g-games/mycf
```

The detailed versioning and pipeline rules are documented in [CI/CD Architecture](.github/workflows/README.md). GitHub Pages must use **GitHub Actions** as its deployment source.

详细的版本计算与流水线规则见 [CI/CD Architecture](.github/workflows/README.md)。GitHub Pages 必须使用 **GitHub Actions** 作为部署源。

## Deployment constraints · 部署约束

- **Static frontend · 静态前端：** GitHub Pages remains the top-of-document experience link and is the only CI-deployed frontend; it uses `VITE_MYCF_WS_URL` when a managed multiplayer endpoint is configured.<br>
  GitHub Pages 继续作为文档顶部的体验链接，也是 CI 唯一部署的前端；配置托管多人端点后，它会通过 `VITE_MYCF_WS_URL` 使用网络模式。
- **Independent Vercel service · 独立 Vercel 服务：** Vercel receives only the `ws-server` Node.js child project, never the Vite frontend or `dist/` artifact; Fluid compute must remain enabled.<br>
  Vercel 只接收 `ws-server` Node.js 子项目，绝不接收 Vite 前端或 `dist/` 制品；Fluid compute 必须保持启用。
- **Bounded match · 有限局时：** The authoritative server and both solo and online clients use the same 290-second maximum match time, with score-limit victories allowed earlier.<br>
  权威服务端、单机客户端与网络客户端统一使用 290 秒最大比赛时限，并允许达到得分上限时提前获胜。
- **Durable multiplayer state · 持久多人状态：** Public scale-out must not rely on Function memory for aliases, presence, invitations, rooms, or authoritative matches.<br>
  公开扩容时，别名、在线状态、邀请、房间与服务器权威比赛均不得只依赖 Function 内存。
- **Browser origins · 浏览器来源：** The server accepts the GitHub Pages origin, same-origin deployments, and local development by default; additional trusted origins use `MYCF_ALLOWED_ORIGINS`.<br>
  服务端默认接受 GitHub Pages 来源、同源部署与本地开发；其他可信来源通过 `MYCF_ALLOWED_ORIGINS` 配置。
- **Legacy host binding · 传统宿主机监听：** The tracked systemd unit binds the optional host deployment to `127.0.0.1:8787`; the container uses its isolated `0.0.0.0:8080` listener.<br>
  仓库内 systemd 单元会让可选宿主机部署绑定 `127.0.0.1:8787`；容器则在隔离环境中监听 `0.0.0.0:8080`。
- **WebSocket routing · WebSocket 路由：** Host deployments expose WebSocket upgrades at `/ws` through their public reverse proxy.<br>
  宿主机部署通过公网反向代理在 `/ws` 路径提供 WebSocket 升级。
- **Nginx scope · Nginx 范围：** Only `/etc/nginx/conf.d/mycf.conf` may be changed; every other Nginx configuration file is out of scope.<br>
  只允许修改 `/etc/nginx/conf.d/mycf.conf`，禁止修改任何其他 Nginx 配置文件。
- **Tracked template · 仓库模板：** The repository template is `deploy/mycf.nginx.conf`.<br>
  仓库内对应模板为 `deploy/mycf.nginx.conf`。
- **Validation first · 先行校验：** Run `sudo nginx -t` successfully before reloading Nginx.<br>
  重新加载 Nginx 之前，必须先成功执行 `sudo nginx -t`。
