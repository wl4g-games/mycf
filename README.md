<div align="center">

# Toon Strike · 泡泡战区

**Cartoon squads, two battlefields, and vehicle combat in your browser.**<br>
**卡通小队、双重战场与载具交火，打开浏览器即可开战。**

<p>
  <a href="https://wl4g-games.github.io/mycf/"><img src="https://img.shields.io/badge/%E2%96%B6%20PLAY%20NOW-%E7%AB%8B%E5%8D%B3%E5%BC%80%E7%8E%A9-2eb9f0?style=for-the-badge" alt="Play Toon Strike · 立即开玩" height="42"></a>
  <a href="https://github.com/wl4g-games/mycf/actions/workflows/ci.yml"><img src="https://github.com/wl4g-games/mycf/actions/workflows/ci.yml/badge.svg?event=pull_request" alt="Pull request CI status" height="28"></a>
  <a href="https://github.com/wl4g-games/mycf/actions/workflows/release.yml"><img src="https://github.com/wl4g-games/mycf/actions/workflows/release.yml/badge.svg?branch=main&event=push" alt="Release and deployment status" height="28"></a>
</p>

Play in your browser · 打开即玩 · Solo and online · 单机与联机<br>
Two maps · 两张地图 · Four battle sizes · 四种规模 · Four loadouts · 四套背包 · Up to 16v16 · 最高 16v16

**Unlimited firearm ammunition, arrows, grenades, and vehicle rounds.**<br>
**枪械弹药、箭矢、手雷与载具弹药全部无限。**

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
- **Four loadouts · 四套背包：** Switch among Barrett, AK-47, police machine-gun, and power-bow kits; the archer carries a Desert Eagle, dual blades, and smoke grenades.<br>
  可切换巴雷特、AK-47、警用机枪与大力弓箭套装；弓箭背包还包含沙漠之鹰、双刀与烟雾弹。
- **Two drivable vehicles · 两种可驾驶载具：** Drive the M-77 tank or faster A-12 armored car, aim their turrets independently of the hull, and fire while moving.<br>
  可驾驶 M-77 坦克或速度更快的 A-12 装甲车，独立控制炮塔，并在移动中开火。
- **Selectable match conditions · 可选胜利条件：** Choose `10 kills / 3 minutes`, `20 / 5`, `30 / 8`, or `50 / 12`; reaching the kill target or exhausting the paired timer ends the match.<br>
  可选择 `10 击杀 / 3 分钟`、`20 / 5`、`30 / 8` 或 `50 / 12`；达到击杀目标或用完对应时限都会结束比赛。
- **Character selection and podium · 角色选择与领奖台：** Choose from two male and five adult female profiles before play. Each photoreal portrait carries an illustrative low-ready weapon, while the black-stocking variants show laddered runs and small fabric tears. Portraits appear only in setup and on the breathing podium for the three allied players with the most kills; actual loadouts remain independently selectable, and every live combatant remains a code-drawn cartoon character.<br>
  开局前可从两名男性与五名成年女性角色中选择。每张真人角色图都手持低姿待命武器，黑丝袜角色还具有勾丝、梯形脱线与小破洞细节；真人图像只出现在选择页与带呼吸动效的我方击杀前三领奖台，实际作战背包仍可独立选择，正式战斗中的所有角色仍为代码绘制的动画风格。
- **Multiplayer rooms · 多人房间：** Register a unique callsign, see available online players, create a room, send invitations, accept or decline invitations, and view post-match rankings.<br>
  可注册唯一作战别名、查看可邀请的在线玩家、创建房间、发送邀请、接受或拒绝邀请，并在赛后查看排名。
- **Spatial battlefield audio · 立体战场音效：** Distinct layered weapon reports include mechanical and recoil-body tails; nearby footsteps pan left or right, while semantic voice cues warn about incoming and outgoing grenades.<br>
  不同武器的分层声音包含机械作动与后坐尾音；附近脚步会按方向切换左右声道，系统语音则会提示敌方来雷与我方投雷。
- **Combat feedback · 战斗反馈：** Every accepted firearm shot produces a visible trajectory beam, while bow shots use a distinct arrow trail; confirmed incoming hits use a red beam and damage flash. The top HUD shows both teams' total kills/deaths and the local player's kills/deaths.<br>
  每次有效枪械开火都会生成可见弹道光束，弓箭射击则使用独立箭矢轨迹；真正受伤时使用红色光束与受击闪光。屏幕顶部同时展示两队总击杀/阵亡和个人击杀/阵亡。
- **Classic FPS presentation · 经典第一视角表现：** Every weapon family has its own two-handed viewmodel and movement animation. Firearms add accepted-shot recoil, muzzle flash, and crosshair flame, while bows and melee weapons use dedicated release or swing motion; scoped Barrett aiming hides the viewmodel.<br>
  每类武器都有独立的双手第一视角模型与移动动画。枪械具备有效开火后坐、枪口焰与准星火焰，弓箭和近战武器则使用独立的释放或挥击动作；巴雷特开镜时会隐藏持枪模型。
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
| Loadout 04 · 背包 04 | Power Archer · 强弓游侠 | Power Bow · Desert Eagle · Dual Blades · Smoke Grenade<br>大力弓箭 · 沙漠之鹰 · 双刀 · 烟雾弹 |

All firearms, arrows, grenades, and vehicle rounds have unlimited ammunition; the loadouts differ by damage, fire rate, range, recoil profile, and combat role.

所有枪械、箭矢、手雷与载具弹药均为无限备弹；不同背包通过伤害、射速、射程、后坐力特征与战斗定位形成差异。

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
| Enter or leave vehicle · 进入或离开载具 | `F` | `F` button · `F` 按钮 |
| Pause · 暂停 | `Esc` | Not available · 暂不支持 |
| Fullscreen · 全屏 | `X` or top-right button · `X` 或右上角按钮 | Top-right button · 右上角按钮 |
| Force restart or exit · 强制重开或退出 | `R` or top-right button · `R` 或右上角按钮 | Top-right button · 右上角按钮 |

The Barrett supports an 8× scope, both vehicles can move and fire simultaneously, and the active loadout can be changed during a match while the player is on foot.

巴雷特支持 8 倍瞄准镜，两种载具都能够边移动边开火，并且玩家步行作战时可在比赛中切换当前作战背包。

The fullscreen control disables itself when the browser does not expose element fullscreen, including unsupported iOS browser modes. The force action always asks for confirmation: solo restarts the current configuration, while online play leaves the room and allows an AI replacement to take over.

当浏览器不提供元素全屏能力（包括不支持该能力的 iOS 浏览器模式）时，全屏按钮会自动禁用。强制操作始终需要二次确认：单机版会按当前配置重新开局，网络版则离开房间并由 AI 自动补位。

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
docker build -f ws-server/Dockerfile.vercel -t toon-strike-ws:local ws-server
docker run --rm --name toon-strike-ws -p 8080:8080 toon-strike-ws:local
```

After the container becomes healthy, use <http://127.0.0.1:8080/health> for readiness and `ws://127.0.0.1:8080/ws` for multiplayer traffic.<br>
容器进入健康状态后，使用 <http://127.0.0.1:8080/health> 检查就绪状态，并通过 `ws://127.0.0.1:8080/ws` 传输多人对战流量。

## Vercel deployment · Vercel 部署

[`ws-server/`](ws-server) is a self-contained standard Node.js project and is the only part intended for Vercel. Its [`Dockerfile.vercel`](ws-server/Dockerfile.vercel) is the shared production container definition, while [`vercel.json`](ws-server/vercel.json) selects the Container framework and enables Fluid compute; neither file builds, copies, or serves the root Vite frontend.<br>
[`ws-server/`](ws-server) 是自包含的标准 Node.js 项目，也是唯一用于 Vercel 的部分。其 [`Dockerfile.vercel`](ws-server/Dockerfile.vercel) 是共用的生产容器定义，[`vercel.json`](ws-server/vercel.json) 则选择 Container 框架并启用 Fluid compute；两者都不会构建、复制或托管根目录 Vite 前端。

For a Git-connected Vercel project, set **Root Directory** to `ws-server`, **Framework Preset** to **Container**, and the non-secret `PORT` environment variable to `8080`. For a CLI Preview, run these commands from the repository root:<br>
通过 Git 连接 Vercel 项目时，请将 **Root Directory** 设为 `ws-server`、将 **Framework Preset** 设为 **Container**，并把非机密环境变量 `PORT` 设为 `8080`。如需通过 CLI 创建 Preview，请在仓库根目录执行：

```bash
npx vercel login
npx vercel --cwd ws-server --env PORT=8080
```

When GitHub Actions owns production deployment, disable the Vercel project's automatic Git deployment so one merge cannot create two production deployments.<br>
当 GitHub Actions 负责生产部署时，请关闭该 Vercel 项目的自动 Git 部署，以免一次合并产生两次生产部署。

The Preview command deploys only the child Node.js container and creates an endpoint for manually validating `/health` and the `/ws` WebSocket handshake. Vercel never replaces the GitHub Pages frontend deployment.<br>
上方 Preview 命令只部署 Node.js 子容器，并创建一个可手动验证 `/health` 与 `/ws` WebSocket 握手的端点；Vercel 永远不会取代 GitHub Pages 前端部署。

Vercel builds `Dockerfile.vercel` into its own Vercel Container Registry and runs it as a stateless container Function. The release workflow separately builds the same file for GHCR; Vercel does not pull or deploy that GHCR image.<br>
Vercel 会把 `Dockerfile.vercel` 构建到其自有的 Vercel Container Registry，并作为无状态容器 Function 运行。发布流水线会另行使用同一文件构建 GHCR 镜像；Vercel 不会拉取或部署该 GHCR 镜像。

Vercel can place WebSocket clients on different Function instances and can recycle an instance at its duration limit. A public deployment therefore needs durable room and match coordination through Redis plus client reconnection. The current in-memory runtime is suitable only for local single-process development; even a Vercel Preview deployment does not guarantee correct multiplayer routing or recovery.<br>
Vercel 可能把 WebSocket 客户端分配到不同的 Function 实例，也可能在运行时限到达后回收实例。因此公开部署需要使用 Redis 持久协调房间与比赛状态，并在客户端实现断线重连。当前纯内存运行时仅适合本地单进程开发；即使是 Vercel Preview 部署，也无法保证多人路由与恢复行为正确。

The four match presets cap active play at 180, 300, 480, or 720 seconds and may end earlier at their paired kill target. Vercel measures a Function's duration from the initial socket connection, so registration and lobby time consume the same allowance. Fluid compute defaults to 300 seconds; Hobby cannot exceed 300, while paid plans must explicitly allow at least 800 seconds for the longer presets. Reconnection and durable shared state are still required for reliable public matches.<br>
四种比赛预设的有效作战上限分别为 180、300、480 与 720 秒，并可在达到对应击杀目标时提前结束。Vercel 从首次建立 Socket 时开始计算 Function 时限，因此注册与大厅等待也会占用同一限额。Fluid compute 默认为 300 秒；Hobby 无法超过 300 秒，付费计划需为长时限预设显式配置至少 800 秒。可靠的公开比赛仍需断线恢复与持久化共享状态。

After a stable production endpoint is ready, set the repository variable below. Pull request and release builds pass it to Vite, allowing the GitHub Pages frontend to open a cross-origin WSS connection without hard-coding a deployment domain.<br>
稳定的生产端点准备就绪后，请设置下方仓库变量。Pull Request 与发布构建会把它传给 Vite，使 GitHub Pages 前端无需硬编码部署域名即可建立跨域 WSS 连接。

```bash
gh variable set MYCF_WS_URL --body "https://<project>.vercel.app"
```

To let the merge workflow deploy the container Function, add `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` secrets to the `vercel-production` GitHub environment or repository, then enable the credential-gated job:<br>
如需让合并流水线部署容器 Function，请先在 `vercel-production` GitHub 环境或仓库中添加 `VERCEL_TOKEN`、`VERCEL_ORG_ID` 与 `VERCEL_PROJECT_ID` 密钥，再启用受凭据保护的任务：

```bash
gh variable set VERCEL_DEPLOY_ENABLED --body "true"
```

Until that variable is enabled, Vercel deployment is skipped while GitHub Release, GHCR, and Pages continue normally. Once enabled, CI stages only `ws-server`, verifies `/health` and `/ws` with the GitHub Pages browser origin, and promotes the deployment only after both checks pass.<br>
在该变量启用之前，流水线会跳过 Vercel 部署，而 GitHub Release、GHCR 与 Pages 仍会正常执行。启用后，CI 只暂存部署 `ws-server`，使用 GitHub Pages 浏览器来源验证 `/health` 与 `/ws`，并仅在两项检查均通过后提升为生产版本。

## CI, release and deployment · 持续集成、发布与部署

[Pull Request CI](.github/workflows/ci.yml) maintains one live English status comment, installs dependencies, runs every test, and validates the production build. Each comment is updated from the started state to the final result, and stale runs cannot overwrite a newer run.

[Pull Request CI](.github/workflows/ci.yml) 会维护一条实时英文状态评论、安装依赖、运行全部测试并验证生产构建。评论会从开始状态原地更新为最终结果，并且旧运行无法覆盖较新的运行。

After code reaches `main`, the [release workflow](.github/workflows/release.yml) calculates the next semantic version, creates the static `mycf-vX.Y.Z-dist.tar.gz`, publishes a GitHub Release, publishes the WebSocket-server amd64 GHCR image, optionally deploys the same container definition to Vercel, and deploys the GitHub Pages frontend.

代码进入 `main` 后，[release workflow](.github/workflows/release.yml) 会计算下一个语义版本、生成静态 `mycf-vX.Y.Z-dist.tar.gz`、发布 GitHub Release、发布 WebSocket 服务 amd64 GHCR 镜像、按配置把同一容器定义部署到 Vercel，并部署 GitHub Pages 前端。

```text
main updated / main 更新
  ├→ semantic version + frontend npm ci + Vite build / 语义版本 + 安装前端依赖 + Vite 构建
  │    → mycf-vX.Y.Z-dist.tar.gz + GitHub Release / 发布归档与 Release
  │         └→ static dist / 静态 dist → GitHub Pages deploy / GitHub Pages 部署
  └→ ws-server install + tests + checks / WS 服务安装 + 测试 + 检查
       ├→ Dockerfile.vercel → WebSocket server image / WebSocket 服务镜像 → ghcr.io/wl4g-games/mycf
       └→ Dockerfile.vercel → Vercel Container Registry → Vercel container Function / Vercel 容器 Function
```

The detailed versioning and pipeline rules are documented in [CI/CD Architecture](.github/workflows/README.md). GitHub Pages must use **GitHub Actions** as its deployment source.

详细的版本计算与流水线规则见 [CI/CD Architecture](.github/workflows/README.md)。GitHub Pages 必须使用 **GitHub Actions** 作为部署源。

## Deployment constraints · 部署约束

- **Static frontend · 静态前端：** GitHub Pages remains the top-of-document experience link and is the only CI-deployed frontend; it uses `VITE_MYCF_WS_URL` when a managed multiplayer endpoint is configured.<br>
  GitHub Pages 继续作为文档顶部的体验链接，也是 CI 唯一部署的前端；配置托管多人端点后，它会通过 `VITE_MYCF_WS_URL` 使用网络模式。
- **Independent Vercel service · 独立 Vercel 服务：** Vercel receives only the `ws-server` container project, builds `Dockerfile.vercel` into VCR, and never receives the Vite frontend or `dist/` artifact; Fluid compute must remain enabled.<br>
  Vercel 只接收 `ws-server` 容器项目，把 `Dockerfile.vercel` 构建到 VCR，绝不接收 Vite 前端或 `dist/` 制品；Fluid compute 必须保持启用。
- **Bounded match · 有限局时：** The authoritative server and both solo and online clients share the same four kill-target/time-limit presets: `10/3m`, `20/5m`, `30/8m`, and `50/12m`.<br>
  权威服务端、单机客户端与网络客户端共用四组击杀目标/时限预设：`10/3 分钟`、`20/5 分钟`、`30/8 分钟` 与 `50/12 分钟`。
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
