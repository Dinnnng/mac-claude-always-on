const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow = null;
let server = null;
let serverInfo = null;
let caffeinateProc = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 380,
    height: 520,
    resizable: true,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('ui.html');

  mainWindow.on('close', (e) => {
    if (serverInfo) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

app.on('activate', () => {
  if (mainWindow) mainWindow.show();
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (!serverInfo) app.quit();
});

app.on('before-quit', () => {
  if (server) {
    try { server.killAllSessions(); } catch {}
    try { server.stop(); } catch {}
  }
  stopSleepPrevention();
});

// --- IPC Handlers ---

ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select working directory',
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle('start-server', async (_, { port, password }) => {
  if (serverInfo) return { error: 'Already running' };

  try {
    server = require('./server');
    const info = await server.start(port, password);
    serverInfo = info;

    startSleepPrevention();

    return { success: true, ...info };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('stop-server', async () => {
  if (!server || !serverInfo) return { error: 'Not running' };

  try {
    await server.stop();
    serverInfo = null;

    // Re-require for fresh state next start
    delete require.cache[require.resolve('./server')];
    server = null;

    await stopSleepPrevention();

    return { success: true };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('get-status', () => {
  return {
    running: !!serverInfo,
    info: serverInfo,
    caffeinate: !!caffeinateProc,
  };
});

// --- Sleep Prevention ---

function sudoExec(command) {
  return new Promise((resolve) => {
    const { execSync } = require('child_process');
    try {
      // First try without password (in case NOPASSWD is set)
      execSync(`sudo -n ${command} 2>/dev/null`);
      resolve(true);
    } catch {
      try {
        // Use osascript to prompt for password via system dialog
        execSync(
          `osascript -e 'do shell script "${command}" with administrator privileges'`,
          { timeout: 30000 }
        );
        resolve(true);
      } catch {
        resolve(false);
      }
    }
  });
}

async function startSleepPrevention() {
  if (caffeinateProc) return;
  caffeinateProc = spawn('caffeinate', ['-s'], { detached: true, stdio: 'ignore' });
  caffeinateProc.unref();
  caffeinateProc.on('exit', () => { caffeinateProc = null; });

  await sudoExec('pmset -a disablesleep 1');
}

async function stopSleepPrevention() {
  if (caffeinateProc) {
    caffeinateProc.kill();
    caffeinateProc = null;
  }
  await sudoExec('pmset -a disablesleep 0');
}
