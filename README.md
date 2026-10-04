<div align="center">

# Toon Strike · 泡泡战区

**Cartoon squads, two battlefields, and tank combat in your browser.**<br>
**卡通小队、双重战场与坦克交火，打开浏览器即可开战。**

<p>
  <a href="https://mycf.wl4g.com/"><img src="https://img.shields.io/badge/%E2%96%B6%20PLAY%20NOW-%E7%AB%8B%E5%8D%B3%E5%BC%80%E7%8E%A9-2eb9f0?style=for-the-badge" alt="Play Toon Strike · 立即开玩" height="42"></a>
  <a href="https://github.com/wl4g-games/mycf/actions/workflows/ci.yml"><img src="https://github.com/wl4g-games/mycf/actions/workflows/ci.yml/badge.svg?event=pull_request" alt="Pull request CI status" height="28"></a>
  <a href="https://github.com/wl4g-games/mycf/actions/workflows/release.yml"><img src="https://github.com/wl4g-games/mycf/actions/workflows/release.yml/badge.svg?branch=main&event=push" alt="Release and deployment status" height="28"></a>
</p>

Play in your browser · 打开即玩 · Solo and online · 单机与联机<br>
Two maps · 两张地图 · Three loadouts · 三套背包 · Up to 16v16 · 最高 16v16

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
- **Three battle sizes · 三种规模：** Play `4v4`, `8v8`, or `16v16`, with balanced teams in every mode.<br>
  支持 `4v4`、`8v8` 与 `16v16`，每种模式都会保持双方人数平衡。
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

The Barrett supports an 8× scope, the tank can move and fire simultaneously, and every loadout can be changed during a match.

巴雷特支持 8 倍瞄准镜，坦克能够边移动边开火，并且比赛过程中可以切换全部作战背包。

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

The browser connects to the same-origin `/ws` endpoint by default. GitHub Pages connects to `wss://mycf.wl4g.com/ws` because the static site and multiplayer backend use different origins there.

浏览器默认连接当前域名下的 `/ws`。由于 GitHub Pages 静态站点与多人后端使用不同域名，Pages 版本会连接 `wss://mycf.wl4g.com/ws`。

## Language policy · 语言规范

Player-facing Chinese text is centralized in `src/locales/zh-CN.js`, while stable message keys, protocol codes, source code, configuration, CI output, logs, and tests remain English. The root README is intentionally bilingual for users and contributors; the rest of the technical documentation remains English.

面向玩家的中文文案集中保存在 `src/locales/zh-CN.js`，稳定消息键、协议码、源代码、配置、CI 输出、日志与测试均保持英文。根目录 README 为方便用户与贡献者而特意采用中英双语，其余技术文档仍保持英文。

Automated tests require the English and Simplified Chinese catalogs to expose identical non-empty keys and matching placeholders. Another source-text guard rejects Chinese characters outside the Simplified Chinese UI catalog and this bilingual README.

自动测试要求英文与简体中文语言目录具有完全一致的非空键和占位符。另一项源码文本守卫会拒绝出现在简体中文 UI 语言文件与本双语 README 之外的中文字符。

## Run locally · 本地运行

Node.js `^20.19.0` or `>=22.12.0` is required.<br>
需要 Node.js `^20.19.0` 或 `>=22.12.0`。

Install dependencies, build the game, and start the integrated static and WebSocket server:<br>
安装依赖、构建游戏，并启动集成静态站点与 WebSocket 服务：

```bash
npm ci
npm run build
MYCF_STATIC_ROOT=dist npm start
```

Open <http://127.0.0.1:8787/>; both solo and online modes use the same local server.<br>
打开 <http://127.0.0.1:8787/>，单机版与网络版均使用同一个本地服务。

For frontend development with hot reload, run the backend and Vite in separate terminals:<br>
如需前端热更新，请在两个终端中分别运行后端与 Vite：

```bash
# Terminal 1
npm start

# Terminal 2
npm run dev
```

Solo mode works immediately at the Vite URL. Before choosing online mode, set `window.MYCF_WS_URL = "ws://127.0.0.1:8787/ws"` in the browser console so the development page connects to the local backend.

通过 Vite 地址打开后可直接使用单机版。选择网络版之前，请在浏览器控制台设置 `window.MYCF_WS_URL = "ws://127.0.0.1:8787/ws"`，让开发页面连接本地后端。

## Test and build · 测试与构建

Run the recommended local validation, which adds explicit source syntax checks to the pull request CI sequence:<br>
运行推荐的本地验证；它在 Pull Request CI 流程之外增加了显式源码语法检查：

```bash
npm ci
npm test
npm run check
npm run build -- --base=/mycf/
```

The production bundle is written to `dist/`.<br>
生产构建产物会写入 `dist/`。

## Container image · 容器镜像

The production image serves the static game and Node.js WebSocket service together on port `8080`.<br>
生产镜像会在 `8080` 端口同时提供静态游戏与 Node.js WebSocket 服务。

```bash
docker build --build-arg APP_BASE=/ -t mycf:local .
docker run --rm --name mycf -p 8080:8080 mycf:local
```

Open <http://127.0.0.1:8080/> after the container becomes healthy.<br>
容器进入健康状态后，打开 <http://127.0.0.1:8080/>。

## CI, release and deployment · 持续集成、发布与部署

[Pull Request CI](.github/workflows/ci.yml) maintains one live English status comment, installs dependencies, runs every test, and validates the production build. Each comment is updated from the started state to the final result, and stale runs cannot overwrite a newer run.

[Pull Request CI](.github/workflows/ci.yml) 会维护一条实时英文状态评论、安装依赖、运行全部测试并验证生产构建。评论会从开始状态原地更新为最终结果，并且旧运行无法覆盖较新的运行。

After code reaches `main`, the [release workflow](.github/workflows/release.yml) calculates the next semantic version, creates `mycf-vX.Y.Z-dist.tar.gz`, publishes a GitHub Release, and then publishes the amd64 GHCR image and GitHub Pages deployment in parallel.

代码进入 `main` 后，[release workflow](.github/workflows/release.yml) 会计算下一个语义版本、生成 `mycf-vX.Y.Z-dist.tar.gz`、发布 GitHub Release，然后并行发布 amd64 GHCR 镜像与 GitHub Pages。

```text
main updated / main 更新
  → semantic version + npm ci + Vite build / 语义版本 + 安装依赖 + 构建
  → mycf-vX.Y.Z-dist.tar.gz + GitHub Release / 发布归档与 Release
       ├→ linux/amd64 image / linux/amd64 镜像 → ghcr.io/wl4g-games/mycf
       └→ GitHub Pages deploy / GitHub Pages 部署
```

The detailed versioning and pipeline rules are documented in [CI/CD Architecture](.github/workflows/README.md). GitHub Pages must use **GitHub Actions** as its deployment source.

详细的版本计算与流水线规则见 [CI/CD Architecture](.github/workflows/README.md)。GitHub Pages 必须使用 **GitHub Actions** 作为部署源。

## Production constraints · 线上部署约束

- **Backend binding · 后端监听：** The host deployment binds the Node.js service only to `127.0.0.1:8787`.<br>
  宿主机部署只允许 Node.js 服务监听 `127.0.0.1:8787`。
- **Shared domain · 共用域名：** The public game uses `https://mycf.wl4g.com`, and multiplayer WebSocket traffic uses `wss://mycf.wl4g.com/ws`.<br>
  公网游戏使用 `https://mycf.wl4g.com`，多人 WebSocket 流量使用 `wss://mycf.wl4g.com/ws`。
- **Nginx scope · Nginx 范围：** Only `/etc/nginx/conf.d/mycf.conf` may be changed; every other Nginx configuration file is out of scope.<br>
  只允许修改 `/etc/nginx/conf.d/mycf.conf`，禁止修改任何其他 Nginx 配置文件。
- **Tracked template · 仓库模板：** The repository template is `deploy/mycf.nginx.conf`.<br>
  仓库内对应模板为 `deploy/mycf.nginx.conf`。
- **Validation first · 先行校验：** Run `sudo nginx -t` successfully before reloading Nginx.<br>
  重新加载 Nginx 之前，必须先成功执行 `sudo nginx -t`。
