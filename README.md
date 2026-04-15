# mac-claude-always-on

合上 MacBook 盖子也让 Claude Code 继续跑，用手机浏览器随时查看和操作。

## 它做什么

- **不睡眠**：合盖 + 电池模式下保持 Mac 唤醒（`caffeinate` + `pmset`）
- **多会话**：在不同目录同时开多个 Claude Code
- **手机控制**：浏览器打开即用，支持完整终端（xterm.js + WebSocket）
- **断线续看**：手机关掉再打开，历史输出还在
- **无人值守**：可选 `--dangerously-skip-permissions` 跑通宵任务

## 三步上手

### 1. 安装

需要 macOS、Node.js ≥ 18、[Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)。

```bash
git clone https://github.com/Dinnnng/mac-claude-always-on.git
cd mac-claude-always-on
npm install
```

### 2. 启动桌面 App（推荐）

```bash
npm run app
```

在弹出的窗口里：
1. 设个密码（手机访问用）
2. **Browse** 选默认工作目录
3. 点 **Start**，输入一次 Mac 密码以启用防睡眠
4. 记下屏幕上显示的 URL

> 纯命令行：`PASSWORD=你的密码 ./start.sh`（同时启用防睡眠），停止用 `./stop.sh`。

### 3. 手机打开

- **同一 WiFi**：直接 `http://<mac-ip>:3200`
- **想在外网用**：装 [Tailscale](https://tailscale.com)（Mac 和手机都登同账号），用 `http://100.x.x.x:3200`

输入密码后：**+ New** 建会话 → 选目录 → （可选）填初始 prompt → 开跑。多个会话用上方 tab 切换。

## 安全提醒

- **不要把 3200 端口暴露到公网**。只走局域网或 Tailscale。
- `--dangerously-skip-permissions` 会让 Claude 有完全文件访问权限，只在信任的目录开。
- 认证是 HTTP Basic Auth + WebSocket token，够用于局域网/VPN，不够用于公网。

## 常见问题

- **合盖后 WiFi 断了**：macOS 可能在合盖时关 WiFi。确认 `pmset disablesleep 1` 已生效，或用手机 USB 热点。
- **电池掉得快**：合盖保持唤醒一直耗电，有条件就插电。
- **Cmd+Q 后会话全没**：会话只在内存里，退出 App 就清空了。

## API（仅供脚本/集成参考）

所有接口需要 Basic Auth（`user:<password>`）。

| Method | Endpoint | 说明 |
|---|---|---|
| `POST` | `/api/sessions` | 建会话 `{ directory, autoMode }` |
| `GET` | `/api/sessions` | 列出会话 |
| `DELETE` | `/api/sessions/:id` | 停止并删除 |
| `POST` | `/api/sessions/:id/resize` | 改终端尺寸 `{ cols, rows }` |
| `GET` | `/api/directories?path=` | 浏览目录 |
| `POST` | `/api/caffeinate/start` \| `/stop` | 开关防睡眠 |
| `GET` | `/api/status` | 状态、电量、IP |

WebSocket：`/ws?session=<id>&token=<pass>`（终端 I/O），`/ws/events?token=<pass>`（会话事件）。

## 项目结构

```
server.js        HTTP + WebSocket + 会话管理
main.js          Electron 主进程
preload.js       Electron IPC 桥
ui.html          桌面控制面板
public/index.html  手机 Web UI
start.sh / stop.sh  CLI 启动 / 停止（含防睡眠）
```

## License

MIT
