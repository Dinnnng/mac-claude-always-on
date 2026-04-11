const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const pty = require('node-pty');
const path = require('path');
const os = require('os');
const { execSync, spawn } = require('child_process');
const crypto = require('crypto');

// --- Config ---
let PORT = process.env.PORT || 3200;
let PASSWORD = process.env.PASSWORD || crypto.randomBytes(4).toString('hex');
const BUFFER_SIZE = 100 * 1024; // 100KB scrollback per session

// --- Auth ---
function checkAuth(req, res) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Claude Remote"');
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  const decoded = Buffer.from(auth.split(' ')[1], 'base64').toString();
  const [, pass] = decoded.split(':');
  if (pass !== PASSWORD) {
    res.status(401).json({ error: 'Wrong password' });
    return false;
  }
  return true;
}

function checkWsAuth(req) {
  const url = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token');
  if (token === PASSWORD) return true;
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Basic ')) return false;
  const decoded = Buffer.from(auth.split(' ')[1], 'base64').toString();
  const [, pass] = decoded.split(':');
  return pass === PASSWORD;
}

// --- Session Manager ---
const sessions = new Map();
let sessionCounter = 0;

function createSession(directory, autoMode = false, resumeId = null) {
  const id = String(++sessionCounter);
  let dir = directory || os.homedir();
  if (dir.startsWith('~')) dir = dir.replace('~', os.homedir());

  const args = [];
  if (autoMode) args.push('--dangerously-skip-permissions');
  if (resumeId) args.push('--resume', resumeId);

  const ptyProcess = pty.spawn('claude', args, {
    name: 'xterm-256color',
    cols: 120,
    rows: 40,
    cwd: dir,
    env: { ...process.env, TERM: 'xterm-256color', CLAUDE_CODE_TELEMETRY_DISABLE: '1' },
  });

  const session = {
    id,
    directory: dir,
    autoMode,
    resumeId: resumeId || null,
    createdAt: new Date().toISOString(),
    status: 'running',
    ptyProcess,
    buffer: Buffer.alloc(0),
    subscribers: new Set(),
  };

  ptyProcess.onData((data) => {
    // Append to buffer (ring buffer)
    const chunk = Buffer.from(data);
    session.buffer = Buffer.concat([session.buffer, chunk]);
    if (session.buffer.length > BUFFER_SIZE) {
      session.buffer = session.buffer.slice(session.buffer.length - BUFFER_SIZE);
    }
    // Push to all subscribers
    for (const ws of session.subscribers) {
      if (ws.readyState === 1) {
        ws.send(data);
      }
    }
  });

  ptyProcess.onExit(({ exitCode }) => {
    session.status = 'stopped';
    session.exitCode = exitCode;
    // Notify event subscribers
    broadcastEvent({ type: 'session_stopped', sessionId: id, exitCode });
  });

  sessions.set(id, session);
  broadcastEvent({ type: 'session_created', sessionId: id, directory: dir });
  return session;
}

function sessionToJSON(s) {
  return {
    id: s.id,
    directory: s.directory,
    autoMode: s.autoMode,
    resumeId: s.resumeId || null,
    status: s.status,
    createdAt: s.createdAt,
    exitCode: s.exitCode,
    subscribers: s.subscribers.size,
  };
}

// --- Event subscribers (global) ---
const eventSubscribers = new Set();

function broadcastEvent(event) {
  const msg = JSON.stringify(event);
  for (const ws of eventSubscribers) {
    if (ws.readyState === 1) ws.send(msg);
  }
}

// --- Caffeinate ---
let caffeinateProcess = null;

function startCaffeinate() {
  if (caffeinateProcess) return { status: 'already_running', pid: caffeinateProcess.pid };
  caffeinateProcess = spawn('caffeinate', ['-s'], { detached: true, stdio: 'ignore' });
  caffeinateProcess.unref();
  caffeinateProcess.on('exit', () => { caffeinateProcess = null; });
  return { status: 'started', pid: caffeinateProcess.pid };
}

function stopCaffeinate() {
  if (!caffeinateProcess) return { status: 'not_running' };
  caffeinateProcess.kill();
  caffeinateProcess = null;
  return { status: 'stopped' };
}

// --- Express app ---
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Auth middleware for API
app.use('/api', (req, res, next) => {
  if (checkAuth(req, res)) next();
});

// Sessions API
app.post('/api/sessions', (req, res) => {
  const { directory, autoMode, resumeId } = req.body;
  try {
    const session = createSession(directory, autoMode, resumeId);
    res.json(sessionToJSON(session));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/sessions', (req, res) => {
  const list = [];
  for (const s of sessions.values()) list.push(sessionToJSON(s));
  res.json(list);
});

app.get('/api/sessions/:id', (req, res) => {
  const s = sessions.get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Not found' });
  res.json(sessionToJSON(s));
});

app.delete('/api/sessions/:id', (req, res) => {
  const s = sessions.get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Not found' });
  if (s.status === 'running') {
    s.ptyProcess.kill();
    s.status = 'stopped';
  }
  sessions.delete(req.params.id);
  broadcastEvent({ type: 'session_deleted', sessionId: req.params.id });
  res.json({ status: 'deleted' });
});

app.post('/api/sessions/:id/resize', (req, res) => {
  const s = sessions.get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Not found' });
  const { cols, rows } = req.body;
  if (cols && rows) s.ptyProcess.resize(cols, rows);
  res.json({ status: 'ok' });
});

// Caffeinate API
app.post('/api/caffeinate/start', (req, res) => {
  res.json(startCaffeinate());
});

app.post('/api/caffeinate/stop', (req, res) => {
  res.json(stopCaffeinate());
});

// Directories API
app.get('/api/directories', (req, res) => {
  const base = req.query.path ? req.query.path.replace('~', os.homedir()) : os.homedir();
  try {
    const fs = require('fs');
    const entries = fs.readdirSync(base, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => ({ name: e.name, path: path.join(base, e.name) }))
      .slice(0, 30);
    res.json({ base, entries });
  } catch {
    res.json({ base, entries: [] });
  }
});

app.get('/api/status', (req, res) => {
  let battery = 'unknown';
  try {
    battery = execSync('pmset -g batt', { encoding: 'utf-8' }).trim();
  } catch {}

  const ips = [];
  const ifaces = os.networkInterfaces();
  for (const [name, addrs] of Object.entries(ifaces)) {
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        ips.push({ interface: name, address: addr.address });
      }
    }
  }

  res.json({
    caffeinate: caffeinateProcess ? 'running' : 'stopped',
    sessions: sessions.size,
    runningSessions: [...sessions.values()].filter(s => s.status === 'running').length,
    battery,
    ips,
    uptime: process.uptime(),
  });
});

// --- HTTP + WebSocket server ---
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  if (!checkWsAuth(req)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;

  if (pathname === '/ws/events') {
    // Global event stream
    eventSubscribers.add(ws);
    ws.on('close', () => eventSubscribers.delete(ws));
    return;
  }

  // Terminal session: /ws?session=<id>
  const sessionId = url.searchParams.get('session');
  const session = sessions.get(sessionId);
  if (!session) {
    ws.send(JSON.stringify({ error: 'Session not found' }));
    ws.close();
    return;
  }

  // Send buffered output
  if (session.buffer.length > 0) {
    ws.send(session.buffer.toString());
  }

  session.subscribers.add(ws);

  ws.on('message', (data) => {
    if (session.status === 'running') {
      session.ptyProcess.write(data.toString());
    }
  });

  ws.on('close', () => {
    session.subscribers.delete(ws);
  });
});

// --- Export for Electron / require() ---
function getIPs() {
  const ips = [];
  const ifaces = os.networkInterfaces();
  for (const [name, addrs] of Object.entries(ifaces)) {
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        ips.push({ interface: name, address: addr.address });
      }
    }
  }
  return ips;
}

module.exports = {
  start(port, password) {
    return new Promise((resolve, reject) => {
      PORT = port || PORT;
      PASSWORD = password || PASSWORD;
      server.listen(PORT, '0.0.0.0', () => {
        resolve({ port: PORT, password: PASSWORD, ips: getIPs() });
      });
      server.on('error', reject);
    });
  },
  stop() {
    return new Promise((resolve) => {
      stopCaffeinate();
      server.close(() => resolve());
    });
  },
  killAllSessions() {
    for (const s of sessions.values()) {
      if (s.status === 'running') {
        try { s.ptyProcess.kill(); } catch {}
      }
    }
    sessions.clear();
  },
  startCaffeinate,
  stopCaffeinate,
  getIPs,
  getPassword() { return PASSWORD; },
};

// --- Direct run: node server.js ---
if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('=================================');
    console.log('  Claude Remote Control');
    console.log('=================================');
    console.log('');
    console.log(`  Password: ${PASSWORD}`);
    console.log('');
    for (const ip of getIPs()) {
      console.log(`  http://${ip.address}:${PORT}  (${ip.interface})`);
    }
    console.log('');
    console.log('  Open this URL on your phone browser');
    console.log('=================================');
    console.log('');
  });
}
