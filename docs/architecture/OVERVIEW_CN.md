# MyCF 架构总览

本文描述仓库当前已经实现的架构。建议同时阅读[英文架构总览](OVERVIEW.md)与
[Coding Agent 交接文档](../development/HARDCOVER.md)。

## 1. 系统边界

MyCF 面向玩家的名称是“泡泡战区”，是一款纯 H5 第一人称射击游戏，支持三种运行模式：

1. **单机版**：模拟、AI、渲染与音频全部运行在同一个浏览器中。
2. **网络版**：独立部署的 Node.js WebSocket 服务负责大厅和比赛权威模拟。
3. **局域网版**：使用二维码完成无中心信令，由房主浏览器作为 WebRTC DataChannel
   对等端的权威模拟器。

根项目是 Vite 静态前端；`ws-server/` 是独立的 Node.js 子项目和容器部署单元。
GitHub Pages 不运行 WebSocket 服务，WebSocket 服务也不构建或托管前端。

## 2. 系统上下文

```text
                         GitHub Pages
                    静态 HTML/CSS/JS/资源
                              |
                    +---------+---------+
                    |                   |
               单机浏览器            玩家浏览器
               GameState                  |
                    |          +----------+----------+
                    |          |                     |
                    |       网络模式               局域网模式
                    |          |                     |
                    |       WSS /ws          WebRTC DataChannel
                    |          |                     |
                    |     ws-server               房主浏览器
                    |     LobbyService            LanHost
                    |          |                     |
                    +------ 共享模拟领域规则 --------+
                               |
                     AuthoritativeMatch / 规则
                               |
                    MemoryCache 或 RedisCache
                       检查点与比赛结果数据
```

浏览器端 `NetworkGameState` 刻意保持传输无关：它既可以消费 `NetworkClient`
发来的网络快照，也可以消费局域网会话发来的快照和可靠事件，从而保持网络版与局域网版
的表现层一致。

图中的缓存分支只属于网络版服务。局域网房间和对局仅存在于房主浏览器内；房主关闭后，
这些状态不会被持久化，并会随房间一起结束。

## 3. 部署拓扑

```text
Pull Request
  -> 安装根项目和 ws-server 依赖
  -> 前端测试 + 服务端测试 + 语法/类型检查
  -> 校验 Vite 前端静态构建

合并到 main
  -> Vite dist 压缩包 -> GitHub Release
  -> 同一份 dist -> GitHub Pages
  -> 校验 ws-server
  -> Dockerfile.vercel -> linux/amd64 -> GHCR
  -> 可选的 Vercel 容器暂存部署
       -> /health 与跨域 /ws 冒烟测试
       -> 验证通过后才提升为生产版本
```

Pages 构建接收 `VITE_MYCF_WS_URL`。`resolveWebSocketUrl()` 会把 HTTPS 地址转换为
WSS；当配置路径为 `/` 时会自动补成 `/ws`。

Vercel 项目的 Root Directory 是 `ws-server`，Framework 是 `container`，并启用
Fluid compute。`ws-server/Dockerfile.vercel` 同时也是 GHCR 镜像唯一的容器定义。
Vercel 会独立构建该文件，而不是直接拉取 GHCR 镜像。

可选的传统宿主机部署使用 `deploy/mycf-ws.service` 在 loopback 上启动服务，并使用
`deploy/mycf.nginx.conf` 代理 `/ws` 升级。仓库中的 Nginx 模板也能托管静态前端，
但线上只允许修改 `/etc/nginx/conf.d/mycf.conf`。

## 4. 运行时分层

### 4.1 应用与界面编排

`index.html` 包含部署选择、网络与局域网大厅、战斗 HUD、弹窗、家长控制、排名和
领奖台结构；`styles.css` 负责响应式布局与视觉样式；`src/main.js` 负责连接 DOM
事件、模式选择、Repository、传输层、游戏状态、渲染帧、音频事件、暂停/全屏和赛后界面。

`src/main.js` 是编排层，不应成为新的游戏规则源。

### 4.2 输入与帧循环

`InputController` 把键盘、鼠标、指针锁、触屏移动、按住开火拖动瞄准及系统取消事件
归一化为统一帧输入：

```js
{
  movement: { x, y },
  yaw,
  pitch,
  fireHeld,
  items: [[action, optionalValue]]
}
```

`main.js` 中的动画帧会选择当前游戏状态、消费输入、推进活动传输与模拟、更新家长控制
时间、绘制场景并刷新 HUD。为了稳定性，物理模拟的时间增量会被限制；网络权威比赛的
剩余时间则使用绝对截止时间计算。

### 4.3 模拟领域

系统有两个主要模拟类：

- `src/game.js` 的 `GameState` 用于浏览器单机模式，拥有玩家、AI、武器、投射物、
  载具、比分、复活与比赛结束状态，并直接触发本地音频反馈。
- `ws-server/src/match.js` 的 `AuthoritativeMatch` 用于网络版和局域网权威模拟，
  负责校验真人输入、创建 AI 补位、推进世界、发送语义化战斗事件、生成逐玩家快照，
  并可导出带版本的检查点。

两者都使用 `ws-server/src/game-config.js` 中的标准配置，以及 `shot-geometry.js`、
`vehicle-system.js`、`match-rules.js`、`match-results.js` 中的共享逻辑。根目录的
`src/config.js`、`src/shot-geometry.js` 和 `src/vehicle-system.js` 只是这些标准模块
面向浏览器的再导出入口。

所有会被根前端导入的共享模块都必须保持浏览器安全。局域网房主也会把
`AuthoritativeMatch` 打包进浏览器，因此该类不能引入 Node.js 专用 API。

### 4.4 渲染与表现

`Renderer` 是 Canvas 射线投射渲染器，负责地图墙体、动画角色、载具、投射物、特效、
弹道、驾驶舱覆盖、雷达和当前第一视角武器。相关职责拆分如下：

| 模块 | 主要职责 |
| --- | --- |
| `camera.js` | 限制相机俯仰并计算地平线 |
| `render-animation.js` | 根据真实位移生成步态与动作状态 |
| `weapon-viewmodel.js` | 第一视角武器形状、后坐、枪口效果、近战与弓箭动作 |
| `combat-tracer.js` | 有上限的枪械、箭矢与受击弹道效果 |
| `renderer.js` | 世界投影、绘制顺序、角色、载具、特效、雷达与 HUD 采样 |

真人角色图集只用于部署选择页和领奖台；正式战斗中的人物始终是代码绘制的动画角色。

### 4.5 音频

`GameAudio` 使用 Web Audio 构建原创的多层武器、爆炸、近战、弓箭、脚步、命中与载具
音效。`audio-spatial.js` 计算距离衰减、左右声道、步态事件与手雷威胁关系；
`audio-callout.js` 预加载并播放中英文内置手雷语音，浏览器系统朗读仅作为后备。

音频由模拟真正接受的动作或权威战斗事件驱动，而不是直接由按键驱动，因此冷却中被
拒绝的开火不会产生假音效。

## 5. 三种运行模式

### 5.1 单机版

```text
InputController
  -> GameState.update()
       -> 本地移动与碰撞
       -> AI 决策
       -> 武器与手雷动作校验
       -> 伤害、死亡、复活、比分
       -> 语义化表现事件
  -> Renderer + GameAudio
```

浏览器拥有全部状态，所有其他席位均由 AI 控制。单机比赛不会跨刷新保存；只有部署选项
偏好和可选的家长控制状态会保存在浏览器中。

### 5.2 WebSocket 网络版

```text
浏览器 NetworkClient
  -> 注册 / 在线列表 / 房间 / 邀请协议
  -> 约 20 Hz 发送 match_input

ws-server Runtime
  -> 来源、连接数、消息大小、注册和频率检查
  -> LobbyService 房间生命周期
  -> 20 Hz AuthoritativeMatch 权威模拟
  -> 约 15 Hz 逐玩家快照
  -> 可靠的战斗与比赛生命周期事件

浏览器 NetworkGameState
  -> 轻量本地移动预测
  -> 快照校正和插值
  -> 表现事件、HUD、音频与渲染
```

网络协议使用 `{ type, payload }` JSON 信封。主要客户端消息包括 `register`、
`update_profile`、`create_room`、`invite`、`respond_invite`、`leave_room`、
`start_room`、`match_input` 与 `ping`；主要服务端消息包括 `hello`、`registered`、
`presence`、`room_state`、`invite`、`notice`、`match_start`、`snapshot`、
`combat_event`、`match_end`、`room_left`、`pong` 与 `error`。

当前客户端在 Socket 断开后不会自动重连或恢复比赛。断开会清除浏览器内存中的房间投影，
服务端则会把离开的真人角色转换为 AI。

### 5.3 无中心服务的局域网版

局域网信令完全手动且不依赖服务器：

1. 房主创建 `iceServers: []` 的 `RTCPeerConnection` 和两个 DataChannel。
2. 房主等待 ICE 收集完成，用 zlib 压缩包含完整 SDP 的 Offer，再渲染为单个二维码。
3. 客户端扫描 Offer，生成包含完整 SDP 的 Answer，并显示 Answer 二维码。
4. 房主扫描 Answer。每新增一名客户端都单独重复一次房主到客户端的配对。

两个通道分别是：

| 通道 | 设置 | 数据 |
| --- | --- | --- |
| `state` | 无序，`maxRetransmits: 0` | 带序号输入与 20 Hz 快照 |
| `reliable` | 有序 | 加入/离开、房间、战斗事件、生命状态、比赛生命周期、错误、ping/pong |

`LanHost` 复用 `AuthoritativeMatch`，因此房主浏览器是权威端。`LanClient` 只发送带
序号输入，并对远端快照做插值。房间容量为 `teamSize * 2`，从 1v1 的 2 人到 16v16
的 32 人。连接一名客户端后即可提前开局，其余角色由 AI 补齐。

该模式刻意不提供公网信令、WebSocket、STUN、TURN、匹配、账号、重连或房主迁移，
仅适用于能通过 host candidate 互通的同一可达局域网。房主关闭页面即结束房间。

## 6. 状态所有权

| 状态 | 所有者 | 持久化方式 |
| --- | --- | --- |
| 部署选项与别名偏好 | 浏览器 `LocalGameSetupRepository` | 经校验后写入 `localStorage` |
| 家长控制配置与当前周期 | 浏览器 `LocalParentalControlRepository` | `localStorage`，同周期单调合并和周期 CAS |
| 在线房间投影 | 浏览器 `LocalRoomStateRepository` | 只存内存；服务端仍是权威状态 |
| 单机比赛 | 浏览器 `GameState` | 不持久化 |
| 局域网房间与比赛 | 房主浏览器的 `LanHost` 和 `AuthoritativeMatch` | 不持久化 |
| 在线大厅与活动模拟 | 单个 `LobbyService` 进程 | 进程内存 |
| 在线房间检查点与结果 | `GameStateStore` | 当前选择的 `ICache` 实现 |
| 渲染、音频、插值与临时特效 | 浏览器表现模块 | 不持久化 |

浏览器 Repository 契约刻意保持同步。未来的 API Repository 应在应用使用前先水合本地
快照，再异步同步数据；不能让每帧渲染循环等待远端存储。

## 7. 网络版持久化与缓存

`ICache` 定义 JSON 获取/设置/删除/扫描、TTL、原子 set-if-absent、compare-and-delete
以及发布订阅。当前实现包括：

- `MemoryCache`：进程内开发与后备实现。
- `RedisCache`：带命名空间的 Redis 存储，并使用独立 duplicate 客户端订阅。

配置 `MYCF_REDIS_URL`、显式的 `MYCF_REDIS_HOST` 与 `MYCF_REDIS_PORT`，或 Vercel
Marketplace 的 `REDIS_URL` 时，`createCache()` 会选择 Redis。无效或不可连接的 Redis
配置会让启动失败，不会静默回退到彼此隔离的内存状态。

`GameStateStore` 当前保存：

- TTL 为 24 小时的活动房间与比赛检查点；
- TTL 为 1 小时的恢复归档；
- TTL 为 7 天的比赛结果与房间最新结果。

`PersistenceQueue` 按逻辑键排序写入，防止旧的失败保存覆盖新的删除，重试瞬时失败，
并在仍有终止性错误时让健康检查保持不可用。

当前持久化链路只是**恢复能力的写入侧基础设施**。运行时不会在启动时加载房间或恢复归档，
也没有恢复令牌、跨实例命令路由或单比赛所有者选举。因此 Redis 可以保护快照，但尚不能
自动故障转移，也不能保证水平扩容后的多人状态正确。

## 8. 家长控制与客户端 Repository

家长控制默认关闭且仅保存在浏览器本地。它只统计实际、未暂停的游戏时间，保存倒计时，
并在归零时通过学习答题阻止继续游戏。可选时间为 1、3、5、10、20 分钟，需要答对的
题数为 1、3、5、10。

题库严格对齐隔壁 Jumprun：共 100 道中英双语题，覆盖八个带权重科目，答案位置按题目
确定性轮转，整套题库轮完后才重新填充，并避免最近 8 题重复。

Repository 边界包括：

- `IGameSetupRepository` / `LocalGameSetupRepository`
- `IRoomStateRepository` / `LocalRoomStateRepository`
- `IParentalControlRepository` / `LocalParentalControlRepository`

当前没有家长 PIN、远端策略服务或账户级强制能力；清除站点数据会同时清除本地配置与倒计时。

## 9. 安全与故障边界

网络服务已经实现：

- 明确的浏览器 Origin 策略，并允许额外配置可信来源；
- 16 KiB WebSocket 消息上限，关闭 per-message compression；
- 全局和单 IP 连接数限制；
- 注册超时；
- 单连接消息频率限制；
- ping/pong 存活检测；
- 别名、房间、地图、模式、角色与装备归一化；
- 缓存或持久化不可用时，健康检查与新升级连接 fail closed；
- 带超时的优雅停机，并在修改成员关系前保存恢复归档。

网络协议没有账户认证或加密的玩家身份，连接 ID 就是当前会话身份。局域网二维码信封包含
协议版本和十分钟有效期，但没有应用层签名或 PIN；配对完成后的数据仍受 WebRTC 标准加密保护。

## 10. 源码目录与主要逻辑

```text
.
├── index.html                 部署、房间、HUD、弹窗、家长控制、领奖台结构
├── styles.css                响应式界面、角色图、HUD 与弹窗样式
├── assets/                   地图、角色图集和内置提示音
├── src/
│   ├── main.js               应用装配和帧循环编排
│   ├── game.js               单机模拟与 AI
│   ├── network.js            WebSocket 地址解析和房间协议
│   ├── network-game.js       远端快照适配、预测与插值
│   ├── renderer.js           Canvas 射线世界渲染器
│   ├── input.js              键鼠、指针锁和多点触控输入
│   ├── audio*.js             Web Audio、空间音频与内置提示音
│   ├── camera.js             相机俯仰和地平线
│   ├── combat-tracer.js      枪械、弓箭与受击弹道
│   ├── render-animation.js   角色步态和动作状态
│   ├── weapon-viewmodel.js   第一视角武器表现
│   ├── config.js             标准游戏配置的浏览器再导出
│   ├── shot-geometry.js      标准射击几何的浏览器再导出
│   ├── vehicle-system.js     标准载具规则的浏览器再导出
│   ├── lan/
│   │   ├── protocol.ts       局域网消息、快照与常量类型
│   │   ├── peer.ts           PeerConnection 与 DataChannel 基础逻辑
│   │   ├── qr-signaling.ts   压缩后的完整 SDP 二维码信令
│   │   ├── host.ts           房主权威模拟、对等端、快照和 RTT
│   │   └── client.ts         客户端配对、输入、事件和调试状态
│   ├── parental/
│   │   ├── parental-control.js  倒计时与解锁周期领域服务
│   │   ├── view.js              设置与答题弹窗控制器
│   │   ├── question-bank.js     100 题课程结构
│   │   ├── quiz-session.js      带权重选题和答题会话
│   │   ├── settings.js          家长控制可选配置
│   │   └── state.js             带版本的状态归一化
│   ├── repositories/         同步浏览器 Repository 接口与本地实现
│   └── locales/              英文与简体中文界面语言包
├── test/                     前端、领域、协议与部署契约测试
├── ws-server/
│   ├── Dockerfile.vercel     唯一生产服务端容器定义
│   ├── vercel.json           Vercel Container 与 Fluid compute 配置
│   ├── scripts/              部署冒烟测试
│   ├── src/
│   │   ├── standalone.js     进程启动、缓存选择与停机
│   │   ├── runtime.js        HTTP 健康检查、WS 升级、限制与循环
│   │   ├── lobby.js          注册、在线列表、邀请与房间
│   │   ├── match.js          权威比赛模拟和检查点导出
│   │   ├── game-config.js    标准地图、模式、角色、武器与背包
│   │   ├── match-rules.js    击杀数与时间规则
│   │   ├── match-results.js  排名、统计和领奖台选择
│   │   ├── shot-geometry.js  权威射击路径与事件
│   │   ├── vehicle-system.js 共享载具物理与交互
│   │   ├── game-state-store.js 带版本的房间/恢复/结果文档
│   │   ├── persistence-queue.js 按序持久化与重试
│   │   ├── access-policy.js  Origin 与可信代理 IP 策略
│   │   └── cache/            ICache、MemoryCache、RedisCache 与工厂
│   └── test/                 服务端、缓存、持久化和运行时测试
├── deploy/                   可选的 systemd 与 Nginx 宿主机模板
└── .github/workflows/        PR CI 与 main 发布部署 DAG
```

## 11. 测试策略

根测试使用 Node 内置测试运行器，覆盖模拟、音频语义、渲染数学、输入、Repository、
家长控制、局域网协议、多语言一致性、部署边界和技术语言规范；局域网 TypeScript 模块还会
进行严格类型检查。服务端有独立的 Node 测试，覆盖大厅、比赛、几何、缓存、持久化、
访问策略以及真实 WebSocket 运行时行为。

PR workflow 只构建根目录的 Vite 前端产物。它会安装、测试并语法检查 `ws-server`，
但生产服务端容器只会在合并到 `main` 后构建。目前没有 Playwright/WebKit 测试套件，
也没有自动化多设备局域网测试；移动 Safari/Chrome、相机扫码和真实 WebRTC 配对仍需要
真机手工验证。

主要验证命令如下：

```bash
npm ci
npm ci --prefix ws-server
npm test
npm test --prefix ws-server
npm run check
VITE_MYCF_WS_URL=https://example.invalid npm run build -- --base=/mycf/
git diff --check
```

## 12. 明确保留的限制

- 网络版尚未实现重连、续局、跨实例路由和 Redis 自动恢复。
- 局域网版没有 NAT 穿透、房主迁移和重连；16v16 是协议容量，不代表每台手机都能稳定
  维持 31 条对等连接。
- 尚未实现账户登录、自动匹配、观战、回放、语音聊天和永久玩家成长。
- 尚未实现浏览器自动化和多设备移动端/局域网 E2E；当前测试主要是单元、领域、协议、
  构建边界和 Node 运行时测试。
- 俯仰会改变视觉方向，但权威命中选择仍是二维的水平角度、距离与视线计算。
- 单机与权威模拟仍重复部分 AI、战斗、投射物和复活逻辑。
- `main.js` 仍是较大的组合控制器，后续可拆分为不同模式的 UI Controller。

扩展功能优先级与安全修改边界见 Coding Agent 交接文档。
