# 泡泡战区 · Toon Strike

原创动画片 3D 风格 H5 第一人称射击游戏。项目使用 Canvas 射线渲染、代码绘制的卡通角色和坦克、Web Audio 分层音效，以及 Node WebSocket 权威多人战局。地图和美术均为原创，不包含其他游戏或动画作品的角色、地图、标志与素材。

## 功能

- 必须先选择单机版或网络版，再选择地图、规模和背包。
- 两张地图：泡泡港城与松果山谷。
- 三种规模：`4v4`、`8v8`、`16v16`。
- 三套背包：巴雷特套装、AK-47 套装、警用低后坐力机枪套装；枪械、手雷和坦克炮弹无限。
- M-77 坦克支持移动、独立炮塔瞄准和行驶中开炮。
- 单机版除玩家外均为 AI NPC。
- 网络版支持别名注册、在线玩家、创建房间、邀请/接受、房主提前开局、双方 AI 自动补位和赛后排名。

## 本地运行

```bash
cd /home/agent/mycf
npm install
npm start
```

另开终端运行静态站点：

```bash
cd /home/agent/mycf
python3 -m http.server 8080
```

打开 <http://localhost:8080>。单机版可直接运行；调试网络版时，在浏览器控制台执行 `window.MYCF_WS_URL = "ws://127.0.0.1:8787/ws"` 后再选择网络版。线上始终使用同域 `/ws`。

## 构建与容器

生产构建与 CI 使用相同命令：

```bash
npm ci
npm test
npm run build -- --base=/mycf/
```

构建产物位于 `dist/`。容器镜像同时包含静态游戏和 Node WebSocket 服务，统一监听 `8080`：

```bash
docker build --build-arg APP_BASE=/ -t mycf:local .
docker run --rm -p 8080:8080 mycf:local
```

## CI/CD

- `.github/workflows/ci.yml`：PR 指向 `main` 时执行 `npm ci`、测试和生产构建。
- `.github/workflows/release.yml`：合并进入 `main` 后计算语义版本，打包 `dist.tar.gz` 并发布 GitHub Release，然后并行发布 linux/amd64 GHCR 镜像与 GitHub Pages。
- 两套 workflow 的触发方式、权限、并发控制、版本策略、Job DAG 和 Action 版本均与 `jumprun` 项目一致。
- GitHub Pages 上的网络版自动连接正式服务 `wss://mycf.wl4g.com/ws`；其他部署默认连接当前域名的 `/ws`。

首次启用 Pages 时，在仓库 **Settings → Pages → Build and deployment → Source** 中选择 **GitHub Actions**。完整发布说明见 [`.github/workflows/README.md`](.github/workflows/README.md)。

## 操作

- `W/A/S/D`：移动或驾驶坦克
- 鼠标：转向、瞄准或控制炮塔
- 左键：射击或近战
- 右键：巴雷特 8 倍镜
- `1 / 2 / 3`：主武器、副武器、近战武器
- `G`：投掷手雷
- `B`：切换背包
- `F`：上下坦克
- `Esc`：暂停

触屏设备提供摇杆、滑动瞄准、开火、开镜、投雷、换包和坦克交互按钮。

## 线上部署约束

- Node 服务只监听 `127.0.0.1:8787`。
- `https://mycf.wl4g.com` 与 `wss://mycf.wl4g.com/ws` 共用域名。
- Nginx 只允许更新 `/etc/nginx/conf.d/mycf.conf`，模板为 `deploy/mycf.nginx.conf`；不得修改其他 Nginx 配置。
- 更新代理前运行 `sudo nginx -t`，成功后再 reload。
