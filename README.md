# mac-claude-always-on

Keep Claude Code running on your Mac — even with the lid closed. Control it from your phone.

> Your Mac sleeps when you close the lid. Your Claude Code sessions die. This tool keeps them alive and lets you manage everything from your phone's browser.

## What It Does

- **Prevents Mac sleep** — Keeps your Mac awake on battery with the lid closed (`caffeinate` + `pmset disablesleep`)
- **Multiple Claude Code sessions** — Run several Claude Code instances in different project directories simultaneously
- **Phone control** — Full terminal access from your phone's browser via WebSocket + xterm.js
- **Session persistence** — Close your phone, come back later, output history is still there
- **Auto mode** — Run Claude Code with `--dangerously-skip-permissions` for unattended overnight tasks
- **Desktop GUI** — Electron app with one-click start/stop, directory picker, password setup

## Architecture

```
┌──────────────┐       HTTP / WebSocket      ┌──────────────────────────┐
│  Phone       │ ◄─────────────────────────► │  Mac (lid closed, awake) │
│  Browser     │   LAN / Tailscale / Hotspot │                          │
│              │                             │  ┌─ Express HTTP server  │
│  xterm.js    │                             │  ├─ WebSocket (realtime) │
│  terminal    │                             │  ├─ node-pty (PTY)       │
│              │                             │  │                       │
│              │                             │  ├─ Session 1: claude    │
│              │                             │  ├─ Session 2: claude    │
│              │                             │  └─ Session N: claude    │
│              │                             │                          │
│              │                             │  caffeinate (anti-sleep) │
└──────────────┘                             └──────────────────────────┘
```

## Quick Start

### Prerequisites

- macOS
- Node.js >= 18
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed

### Install

```bash
git clone https://github.com/Dinnnng/mac-claude-always-on.git
cd mac-claude-always-on
npm install
```

### Option 1: Desktop App (Recommended)

```bash
npm run app
```

A small window appears:

1. Set a password (for phone access)
2. Click **Browse** to pick a default directory
3. Click **Start** — enters your Mac password once to enable sleep prevention
4. Open the displayed URL on your phone

### Option 2: CLI Mode

```bash
PASSWORD=yourpassword node server.js
```

Output:

```
=================================
  Claude Remote Control
=================================

  Password: yourpassword

  http://192.168.1.100:3200  (en0)

  Open this URL on your phone browser
=================================
```

### Sleep Prevention (CLI Mode)

```bash
# Keep Mac awake with lid closed
./start.sh    # starts server + caffeinate + pmset

# Stop and restore sleep
./stop.sh
```

## Phone Usage

1. Open your phone browser, go to `http://<mac-ip>:3200`
2. Enter the password
3. Tap **+ New** to create a Claude Code session
   - Pick a directory (browseable folder list)
   - Optionally enter an initial prompt
   - Toggle **Auto Mode** for unattended runs
4. Use the terminal — full input/output with special key buttons (arrows, Ctrl+C, Tab, Esc)
5. Switch between sessions via tabs
6. Delete sessions with the **x** button

## Connecting Your Phone to Mac

| Scenario | Method |
|----------|--------|
| Same WiFi | Direct — `http://<mac-lan-ip>:3200` |
| Phone hotspot (USB) | Direct — Mac gets IP from phone |
| Different networks | [Tailscale](https://tailscale.com) — free VPN, `http://100.x.x.x:3200` |

### Tailscale Setup (for remote access anywhere)

```bash
# Mac
brew install tailscale
# Open Tailscale app, sign in

# Phone
# Install Tailscale from Play Store / App Store, sign in with same account

# Get Mac's Tailscale IP
tailscale ip
# Use http://100.x.x.x:3200 from your phone
```

## API

All endpoints require Basic Auth (`user:<password>`).

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/sessions` | Create session `{ directory, autoMode }` |
| `GET` | `/api/sessions` | List all sessions |
| `DELETE` | `/api/sessions/:id` | Stop and remove session |
| `POST` | `/api/sessions/:id/resize` | Resize PTY `{ cols, rows }` |
| `GET` | `/api/directories?path=` | Browse directories |
| `POST` | `/api/caffeinate/start` | Start sleep prevention |
| `POST` | `/api/caffeinate/stop` | Stop sleep prevention |
| `GET` | `/api/status` | Server status, battery, IPs |

WebSocket endpoints:

| Path | Description |
|------|-------------|
| `/ws?session=<id>&token=<pass>` | Terminal I/O stream |
| `/ws/events?token=<pass>` | Global events (session created/stopped/deleted) |

## Tech Stack

| Component | Choice | Why |
|-----------|--------|-----|
| Backend | Node.js + Express | Lightweight, no extra runtime |
| Terminal | node-pty | Real PTY with color/cursor support |
| Realtime | WebSocket (ws) | Bidirectional terminal streaming |
| Frontend | xterm.js | Full terminal emulator in browser |
| Desktop | Electron | Native Mac window, system dialogs |
| Anti-sleep | caffeinate + pmset | macOS native, zero dependencies |
| Auth | Basic Auth | Simple, sufficient for LAN/VPN |

## Project Structure

```
mac-claude-always-on/
├── server.js        # HTTP + WebSocket server, session manager
├── main.js          # Electron main process
├── preload.js       # Electron preload (IPC bridge)
├── ui.html          # Desktop control panel
├── public/
│   └── index.html   # Mobile web UI
├── start.sh         # CLI launcher with sleep prevention
├── stop.sh          # CLI stop + restore sleep
├── package.json
└── LICENSE
```

## Security

- Password required for all access (HTTP Basic Auth + WebSocket token)
- Never expose port 3200 to the public internet — use Tailscale or LAN only
- `--dangerously-skip-permissions` gives Claude Code full access — only use in trusted project directories
- Tailscale provides end-to-end encryption automatically

## Known Limitations

- **Mac lid + WiFi**: macOS may disconnect WiFi when lid is closed. Use USB hotspot from phone or ensure `pmset disablesleep 1` is active
- **Battery drain**: Keeping Mac awake with lid closed uses battery. Plug in when possible
- **Session memory**: Sessions live in server memory. Quitting the Electron app (Cmd+Q) kills all sessions
- **Phone input**: Mobile keyboard works but desktop is more comfortable for long commands. Use the special key buttons for arrows/Ctrl+C

## Contributing

Issues and PRs welcome. This is a simple tool — keep it simple.

## License

MIT
