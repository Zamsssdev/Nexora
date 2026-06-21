let app, BrowserWindow, ipcMain, shell, dialog;
try {
  const electron = require('electron');
  app = electron.app || (electron.remote && electron.remote.app);
  BrowserWindow = electron.BrowserWindow || (electron.remote && electron.remote.BrowserWindow);
  ipcMain = electron.ipcMain || (electron.remote && electron.remote.ipcMain);
  shell = electron.shell || (electron.remote && electron.remote.shell);
  dialog = electron.dialog || (electron.remote && electron.remote.dialog);
  if (!app) throw new Error('`app` is undefined');
} catch (err) {
  console.error('This script must be started with Electron, not plain Node.');
  console.error('Start it with: npx electron . or npm run start (which should call electron).');
  console.error('Error while loading Electron:', err && err.message ? err.message : err);
  process.exit(1);
}
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { execSync, spawn } = require('child_process');
const net = require('net');
const { autoUpdater } = require('electron-updater');


let mainWindow;
let viteProcess = null;
let oauthServer = null;

// Start a minimal HTTP server on port 5175 to catch OAuth redirects in packaged mode.
// Discord/Supabase redirects to http://localhost:5175#access_token=...
// This server serves an HTML page that reads the token from the URL hash
// and redirects the browser to the toolsteam:// custom protocol.
function startOAuthRedirectServer() {
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Nexora – Authenticating...</title>
  <style>
    body { background:#0a0a0d; color:#fff; font-family:sans-serif;
           display:flex; align-items:center; justify-content:center;
           height:100vh; margin:0; flex-direction:column; gap:16px; }
    .spinner { width:32px; height:32px; border:3px solid rgba(255,255,255,0.1);
               border-top-color:#e03080; border-radius:50%; animation:spin 0.8s linear infinite; }
    @keyframes spin { to { transform:rotate(360deg); } }
    p { opacity:0.6; font-size:14px; }
  </style>
</head>
<body>
  <div class="spinner"></div>
  <p>Verifying credentials, please wait...</p>
  <script>
    (function() {
      // Supabase puts tokens in the URL hash after OAuth
      const raw = window.location.hash || window.location.search;
      if (!raw) return;
      const clean = raw.startsWith('#') ? raw.slice(1) : raw.startsWith('?') ? raw.slice(1) : raw;
      if (clean.includes('access_token')) {
        // Redirect to the Electron custom protocol so Electron can grab the tokens
        window.location.href = 'toolsteam://auth?' + clean;
      }
    })();
  <\/script>
</body>
</html>`;

  oauthServer = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });

  oauthServer.listen(5175, '127.0.0.1', () => {
    console.log('[Electron] OAuth redirect server listening on http://localhost:5175');
  });

  oauthServer.on('error', (err) => {
    // Port 5175 already in use (e.g. dev Vite) — safe to ignore
    console.warn('[Electron] OAuth server port conflict (safe to ignore):', err.message);
  });
}

function stopOAuthRedirectServer() {
  if (oauthServer) {
    oauthServer.close();
    oauthServer = null;
    console.log('[Electron] OAuth redirect server stopped.');
  }
}

// Check if port is already in use (Vite already running)
function isPortInUse(port) {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', () => resolve(true))
      .once('listening', () => tester.close(() => resolve(false)))
      .listen(port, '127.0.0.1');
  });
}

// Wait until Vite dev server is ready
function waitForVite(url, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const { net: electronNet } = require('electron');
      electronNet.fetch(url).then((res) => {
        if (res.ok || res.status < 500) resolve();
        else setTimeout(check, 300);
      }).catch(() => {
        if (Date.now() - start > timeout) {
          reject(new Error('Vite dev server timed out'));
        } else {
          setTimeout(check, 300);
        }
      });
    };
    check();
  });
}

// Start Vite dev server as child process
async function startViteDevServer() {
  const port = 5175;
  const alreadyRunning = await isPortInUse(port);
  if (alreadyRunning) {
    console.log(`[Electron] Vite already running on port ${port}, skipping spawn.`);
    return;
  }

  console.log('[Electron] Starting Vite dev server...');
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  viteProcess = spawn(npmCmd, ['run', 'dev'], {
    cwd: __dirname,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });

  viteProcess.stdout.on('data', (data) => {
    process.stdout.write(`[Vite] ${data}`);
  });
  viteProcess.stderr.on('data', (data) => {
    process.stderr.write(`[Vite] ${data}`);
  });
  viteProcess.on('exit', (code) => {
    console.log(`[Electron] Vite exited with code ${code}`);
    viteProcess = null;
  });
}

// Kill Vite dev server on app quit
function stopViteDevServer() {
  if (viteProcess) {
    console.log('[Electron] Killing Vite dev server...');
    if (process.platform === 'win32') {
      try { execSync(`taskkill /PID ${viteProcess.pid} /T /F`); } catch(e) {}
    } else {
      viteProcess.kill('SIGTERM');
    }
    viteProcess = null;
  }
}

// Automatically detect Steam path on Windows via registry
function getSteamPath() {
  try {
    if (process.platform === 'win32') {
      // Query registry for Steam path
      const regCmd = 'reg query "HKCU\\Software\\Valve\\Steam" /v "SteamPath"';
      const output = execSync(regCmd).toString();
      const match = output.match(/SteamPath\s+REG_SZ\s+(.+)/);
      if (match && match[1]) {
        return path.normalize(match[1].trim());
      }
    }
  } catch (e) {
    console.error('Failed to get Steam path from Registry, checking default locations...', e.message);
  }

  // Fallback to default locations
  const fallbacks = [
    'C:\\Program Files (x86)\\Steam',
    'C:\\Program Files\\Steam',
    'D:\\Steam',
  ];
  for (const p of fallbacks) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Nexora',
    backgroundColor: '#0a0a0d',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, // Allows easy IPC access in React
    },
  });

  mainWindow.setMenu(null);

  const devUrl = 'http://localhost:5175';
  if (!app.isPackaged) {
    mainWindow.loadURL(devUrl).catch((err) => {
      console.error('Failed to load dev server URL, falling back to local file:', err);
      mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
    });
  } else {
    // When packaged, load the built files from the app resources
    const indexPath = path.join(__dirname, 'dist', 'index.html');
    mainWindow.loadFile(indexPath).catch((err) => {
      console.error('Failed to load packaged index.html:', indexPath, err);
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// Register custom protocol
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('toolsteam', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('toolsteam');
}

function handleProtocolUrl(urlStr) {
  try {
    const urlObj = new URL(urlStr);
    if (urlObj.hostname === 'auth') {
      const hash = urlObj.hash || urlObj.search;
      const params = new URLSearchParams(hash.substring(1));
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');
      const provider_token = params.get('provider_token');
      if (access_token && refresh_token && mainWindow) {
        mainWindow.webContents.send('auth-session', { access_token, refresh_token, provider_token });
      }
    }
  } catch (e) {
    console.error('Failed to parse protocol URL:', e);
  }
}

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    const url = commandLine.find(arg => arg.startsWith('toolsteam://'));
    if (url) {
      handleProtocolUrl(url);
    }
  });

  app.whenReady().then(async () => {
    if (!app.isPackaged) {
      // DEV mode: auto-start Vite and wait for it to be ready
      await startViteDevServer();
      try {
        await waitForVite('http://localhost:5175');
        console.log('[Electron] Vite is ready!');
      } catch (e) {
        console.error('[Electron] Vite failed to start:', e.message);
      }
    } else {
      // PACKAGED mode: start lightweight OAuth redirect server on port 5175
      startOAuthRedirectServer();
    }

    createWindow();
    
    if (app.isPackaged) {
      autoUpdater.checkForUpdatesAndNotify();
    }
    
    // Check if opened via protocol URL on startup
    const protocolUrl = process.argv.find(arg => arg.startsWith('toolsteam://'));
    if (protocolUrl) {
      setTimeout(() => {
        handleProtocolUrl(protocolUrl);
      }, 1000);
    }
  });
}

app.on('window-all-closed', () => {
  stopViteDevServer();
  stopOAuthRedirectServer();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopViteDevServer();
  stopOAuthRedirectServer();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// IPC Handler to open external URLs in default browser
ipcMain.on('open-external', (event, url) => {
  if (url) {
    shell.openExternal(url);
  }
});

// IPC Handler to get automatically detected Steam path
ipcMain.handle('get-steam-path', () => {
  return getSteamPath();
});

// Fetch SteamSpy top100 in 2 weeks from main process to avoid renderer CORS
ipcMain.handle('fetch-steamspy-top100', async () => {
  const url = 'https://steamspy.com/api.php?request=all&page=0';
  try {
    const { net } = require('electron');
    const response = await net.fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
      }
    });
    if (response.ok) {
      const data = await response.json();
      return { ok: true, data };
    } else {
      return { ok: false, error: `HTTP status ${response.status}` };
    }
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

// Search Steam Store directly from main process to bypass CORS
ipcMain.handle('search-steam-store', async (event, query) => {
  const url = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(query)}&l=english&cc=US`;
  try {
    const { net } = require('electron');
    const response = await net.fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/plain, */*'
      }
    });
    if (response.ok) {
      const data = await response.json();
      return { ok: true, data };
    } else {
      return { ok: false, error: `HTTP status ${response.status}` };
    }
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

// Sumber daftar depot/manifest per AppID (branch per appid, file: {depotid}_{manifestid}.manifest)
const MANIFEST_REPOS = [
  "Gruddieu/ManifestHub2",
  "speedstory/ManifestHub2",
  "SteamAutoCracks/ManifestHub",
];

async function fetchAppPairs(appid) {
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    Accept: "application/vnd.github+json",
  };
  const errors = [];
  const { net } = require('electron');

  for (const repo of MANIFEST_REPOS) {
    try {
      const url = `https://api.github.com/repos/${repo}/git/trees/${appid}?recursive=1`;
      const res = await net.fetch(url, { headers });
      if (!res.ok) {
        errors.push(`${repo}: HTTP ${res.status}`);
        continue;
      }
      const data = await res.json();
      if (!data.tree) {
        errors.push(`${repo}: no tree`);
        continue;
      }

      const pairs = [];
      const otherFiles = [];
      for (const entry of data.tree) {
        if (entry.type !== "blob") continue;
        const m = /^(\d+)_(\d+)\.manifest$/.exec(entry.path);
        if (m) {
          pairs.push({ depotid: m[1], manifestid: m[2] });
        } else if (/\.(lua|vdf|st|key)$/i.test(entry.path)) {
          otherFiles.push(entry.path);
        }
      }
      if (pairs.length > 0) return { repo, pairs, otherFiles };
      errors.push(`${repo}: tree had 0 manifest pairs`);
    } catch (e) {
      errors.push(`${repo}: ${e.message}`);
    }
  }
  return { errorDetail: errors.join(" | ") };
}

// IPC Handler to install bypass manifest file directly from generator.ryuu.lol API
ipcMain.handle('install-manifest', async (event, { apikey, appid, steamPath }) => {
  const { net } = require('electron');
  const finalSteamPath = steamPath || getSteamPath();
  if (!finalSteamPath) {
    throw new Error('Steam installation folder not found.');
  }

  const depotcachePath = path.join(finalSteamPath, 'depotcache');
  const configPath = path.join(finalSteamPath, 'config');
  const stplugPath = path.join(configPath, 'stplug-in');

  // Buat folder jika belum ada
  if (!fs.existsSync(depotcachePath)) fs.mkdirSync(depotcachePath, { recursive: true });
  if (!fs.existsSync(configPath)) fs.mkdirSync(configPath, { recursive: true });
  if (!fs.existsSync(stplugPath)) fs.mkdirSync(stplugPath, { recursive: true });

  const tempDir = path.join(finalSteamPath, 'temp-manifest-' + appid);
  const tempZip = path.join(finalSteamPath, `temp-${appid}.zip`);
  
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  
  try {
    const url = `https://generator.ryuu.lol/api/download/${appid}?file_type=manifest`;
    const response = await net.fetch(url, {
      headers: {
        'X-Auth-Key': 'qsOghcc35M8OAFMB',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Ryuu API failed: HTTP ${response.status}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await fs.promises.writeFile(tempZip, buffer);
    
    // Extract using PowerShell
    try {
      execSync(`powershell -Command "Expand-Archive -Path '${tempZip}' -DestinationPath '${tempDir}' -Force"`);
    } catch (zipErr) {
      throw new Error(`Gagal mengekstrak manifest zip: ${zipErr.message}`);
    }
    
    // Clean up zip
    try { fs.unlinkSync(tempZip); } catch(e){}
    
    const steamappsPath = path.join(finalSteamPath, 'steamapps');
    
    let manifestsDownloaded = 0;
    let configsDownloaded = 0;
    
    async function processDirectory(dir) {
      const files = await fs.promises.readdir(dir, { withFileTypes: true });
      for (const file of files) {
        const fullPath = path.join(dir, file.name);
        if (file.isDirectory()) {
          await processDirectory(fullPath);
        } else {
          const ext = path.extname(file.name).toLowerCase();
          if (ext === '.manifest') {
            await fs.promises.rename(fullPath, path.join(depotcachePath, file.name));
            manifestsDownloaded++;
          } else if (ext === '.acf') {
            await fs.promises.rename(fullPath, path.join(steamappsPath, file.name));
            configsDownloaded++;
          } else if (['.lua', '.vdf', '.st'].includes(ext)) {
            await fs.promises.rename(fullPath, path.join(stplugPath, file.name));
            configsDownloaded++;
          }
        }
      }
    }
    
    await processDirectory(tempDir);
    
    // Clean up tempDir
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch(e){}
    
    if (manifestsDownloaded === 0 && configsDownloaded === 0) {
      throw new Error('Zip didownload tapi tidak ditemukan file manifest (.manifest, .acf, atau .lua) di dalamnya.');
    }
    
    return {
      fileName: `${appid} (Bypass)`,
      manifestsDownloaded,
      configsDownloaded
    };
  } catch (fallbackError) {
    // Clean up zip and tempDir on error
    try { if (fs.existsSync(tempZip)) fs.unlinkSync(tempZip); } catch(e){}
    try { if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true }); } catch(e){}
    throw fallbackError;
  }
});

// IPC Handler to scan local steamapps folder and SteamTools config/depotcache for installed games
ipcMain.handle('scan-local-manifests', async (event, steamPath) => {
  const finalSteamPath = steamPath || getSteamPath();
  if (!finalSteamPath) return [];

  const steamappsPath = path.join(finalSteamPath, 'steamapps');
  const stplugPath = path.join(finalSteamPath, 'config', 'stplug-in');
  
  const manifestsMap = new Map(); // Use map to deduplicate by AppID

  // 1. Scan default steamapps folder for appmanifest_*.acf
  if (fs.existsSync(steamappsPath)) {
    try {
      const files = await fs.promises.readdir(steamappsPath);
      for (const file of files) {
        if (file.startsWith('appmanifest_') && file.endsWith('.acf')) {
          try {
            const filePath = path.join(steamappsPath, file);
            const content = await fs.promises.readFile(filePath, 'utf8');
            const appidMatch = content.match(/"appid"\s+"(\d+)"/i);
            const nameMatch = content.match(/"name"\s+"([^"]+)"/i);
            if (appidMatch) {
              const appid = Number(appidMatch[1]);
              manifestsMap.set(appid, {
                appid,
                title: nameMatch ? nameMatch[1] : `App ID ${appid}`,
                fileName: file,
                type: 'standard'
              });
            }
          } catch (e) {
            console.error(`Failed to parse manifest file ${file}:`, e.message);
          }
        }
      }
    } catch (err) {
      console.error('Failed to read steamapps directory:', err.message);
    }
  }

  // 2. Scan SteamTools config/stplug-in for *.lua files (named by AppID)
  if (fs.existsSync(stplugPath)) {
    try {
      const files = await fs.promises.readdir(stplugPath);
      for (const file of files) {
        if (file.endsWith('.lua')) {
          const appidStr = file.replace('.lua', '');
          if (/^\d+$/.test(appidStr)) {
            const appid = Number(appidStr);
            if (!manifestsMap.has(appid)) {
              manifestsMap.set(appid, {
                appid,
                title: `Game ${appid} (SteamTools)`,
                fileName: file,
                type: 'bypass'
              });
            }
          }
        }
      }
    } catch (err) {
      console.error('Failed to read stplug-in directory:', err.message);
    }
  }

  return Array.from(manifestsMap.values());
});

// IPC Handler to open folder selection dialog
ipcMain.handle('select-steam-path', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Steam Installation Directory',
    properties: ['openDirectory']
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

// IPC Handler to restart Steam
ipcMain.handle('restart-steam', async (event, steamPath) => {
  const finalPath = steamPath || getSteamPath();
  if (!finalPath) {
    throw new Error('Steam path not found');
  }
  const steamExe = path.join(finalPath, 'steam.exe');
  if (!fs.existsSync(steamExe)) {
    throw new Error('steam.exe not found in ' + finalPath);
  }
  
  try {
    // Kill steam.exe
    try {
      execSync('taskkill /F /IM steam.exe');
    } catch (e) {
      // Might not be running, ignore error
    }
    
    // Launch steam.exe asynchronously (detached)
    const { spawn } = require('child_process');
    const child = spawn(steamExe, [], {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();
    return { success: true };
  } catch (err) {
    throw new Error('Failed to restart Steam: ' + err.message);
  }
});

// IPC Handler to delete manifest file from local steamapps or SteamTools cache
ipcMain.handle('uninstall-manifest', async (event, { appid, steamPath }) => {
  const finalSteamPath = steamPath || getSteamPath();
  if (!finalSteamPath) return false;

  const steamappsPath = path.join(finalSteamPath, 'steamapps');
  const depotcachePath = path.join(finalSteamPath, 'depotcache');
  const stplugPath = path.join(finalSteamPath, 'config', 'stplug-in');

  let deletedAny = false;

  try {
    // 1. Delete standard acf if exists
    const acfPath = path.join(steamappsPath, `appmanifest_${appid}.acf`);
    if (fs.existsSync(acfPath)) {
      await fs.promises.unlink(acfPath);
      deletedAny = true;
    }

    // 2. Delete lua configuration from stplug-in
    if (fs.existsSync(stplugPath)) {
      const files = await fs.promises.readdir(stplugPath);
      for (const file of files) {
        if (file.startsWith(`${appid}.`) || file.includes(`_${appid}`)) {
          await fs.promises.unlink(path.join(stplugPath, file));
          deletedAny = true;
        }
      }
    }

    // 3. Delete manifests matching this app's depots from depotcache
    if (fs.existsSync(depotcachePath)) {
      const files = await fs.promises.readdir(depotcachePath);
      // We will look for files starting with depots that match, but to be safe we scan content or delete common formats
      for (const file of files) {
        if (file.endsWith('.manifest')) {
          // If we want to delete manifests, SteamTools names them {depotId}_{manifestId}.manifest
          // We can delete them if they match the scan or let Steam clean them. Usually deleting the .lua is enough to hide/deactivate.
        }
      }
    }

    return deletedAny;
  } catch (err) {
    console.error(`Failed to uninstall manifest/bypass files for ${appid}:`, err.message);
    throw err;
  }
});

// IPC Handler to close Steam and launch with auto-login credentials using Steam CLI
ipcMain.handle('login-steam', async (event, { username, password, steamPath }) => {
  const finalPath = steamPath || getSteamPath();
  if (!finalPath) {
    throw new Error('Steam path not found');
  }
  const steamExe = path.join(finalPath, 'steam.exe');
  if (!fs.existsSync(steamExe)) {
    throw new Error('steam.exe not found in ' + finalPath);
  }

  try {
    // Forcefully kill any running Steam instances first
    try {
      execSync('taskkill /F /IM steam.exe');
      execSync('taskkill /F /IM steamwebhelper.exe');
    } catch (e) {
      // Ignore if not running
    }

    // Wait for Steam to fully close
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Set registry keys for auto-login and remembering password to prevent login prompt on restart
    try {
      if (process.platform === 'win32') {
        execSync(`reg add "HKCU\\Software\\Valve\\Steam" /v "AutoLoginUser" /t REG_SZ /d "${username}" /f`);
        execSync('reg add "HKCU\\Software\\Valve\\Steam" /v "RememberPassword" /t REG_DWORD /d 1 /f');
      }
    } catch (regErr) {
      console.error('Failed to set registry keys for Steam auto-login:', regErr);
    }

    // Use Steam's native -login argument for reliable auto-login
    // Steam accepts: steam.exe -login <username> <password>
    // This bypasses the login screen entirely if no 2FA/Guard is required
    const { spawn } = require('child_process');
    const child = spawn(steamExe, ['-login', username, password, '-noreactlogin'], {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();

    return { success: true };
  } catch (err) {
    throw new Error('Failed to auto-login to Steam: ' + err.message);
  }
});

// IPC Handler to fetch app details from Steam store API to bypass CORS
ipcMain.handle('fetch-steam-app-details', async (event, appid) => {
  const url = `https://store.steampowered.com/api/appdetails?appids=${appid}`;
  try {
    const { net } = require('electron');
    const response = await net.fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      }
    });
    if (response.ok) {
      const data = await response.json();
      return { ok: true, data };
    } else {
      return { ok: false, error: `HTTP status ${response.status}` };
    }
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

// IPC Handler to open directory selection dialog
ipcMain.handle('select-folder', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Game Directory',
    properties: ['openDirectory']
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

// IPC Handler to open Windows Security Settings
ipcMain.handle('open-windows-security', async () => {
  const { exec } = require('child_process');
  exec('start windowsdefender:');
  return { success: true };
});

// IPC Handler to check if a specific file exists in a directory
ipcMain.handle('check-file-exists', async (event, { dirPath, fileName }) => {
  if (!dirPath || !fileName) return false;
  const filePath = path.join(dirPath, fileName);
  return fs.existsSync(filePath);
});

// IPC Handler to download a file from a URL and overwrite it in the directory
ipcMain.handle('download-and-overwrite', async (event, { url, dirPath, fileName }) => {
  const { net } = require('electron');
  if (!url || !dirPath || !fileName) {
    throw new Error('Missing parameter: url, dirPath, or fileName');
  }
  const targetPath = path.join(dirPath, fileName);

  try {
    const response = await net.fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download: HTTP ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await fs.promises.writeFile(targetPath, buffer);
    return { success: true };
  } catch (err) {
    throw new Error(`Failed to overwrite file: ${err.message}`);
  }
});

// IPC Handler to launch a game executable in the directory
ipcMain.handle('launch-game', async (event, { dirPath, exeName }) => {
  if (!dirPath || !exeName) {
    throw new Error('Missing parameter: dirPath or exeName');
  }
  const exePath = path.join(dirPath, exeName);
  if (!fs.existsSync(exePath)) {
    throw new Error(`Executable not found: ${exePath}`);
  }

  const { spawn } = require('child_process');
  const child = spawn(exePath, [], {
    cwd: dirPath,
    detached: true,
    stdio: 'ignore'
  });
  child.unref();
  return { success: true };
});

// IPC Handler to open the game folder in Explorer
ipcMain.handle('open-game-folder', async (event, dirPath) => {
  if (!dirPath || !fs.existsSync(dirPath)) {
    throw new Error('Directory does not exist');
  }
  await shell.openPath(dirPath);
  return { success: true };
});

// WebTorrent Engine Implementation
let torrentClient = null;
let activeTorrent = null;

ipcMain.on('start-torrent-download', (event, { magnet }) => {
  try {
    const WebTorrent = require('webtorrent');
    if (!torrentClient) {
      torrentClient = new WebTorrent();
    }

    // If there is already an active torrent, destroy/cancel it first
    if (activeTorrent) {
      activeTorrent.destroy(() => {
        startNewTorrent(magnet, event.sender);
      });
    } else {
      startNewTorrent(magnet, event.sender);
    }
  } catch (err) {
    console.error('Failed to start torrent client:', err);
    event.sender.send('torrent-progress-update', { status: 'error', message: err.message });
  }
});

function startNewTorrent(magnet, sender) {
  const downloadDir = path.join(app.getPath('downloads'), 'NexoraDownloads');
  if (!fs.existsSync(downloadDir)) {
    fs.mkdirSync(downloadDir, { recursive: true });
  }

  activeTorrent = torrentClient.add(magnet, { path: downloadDir }, (torrent) => {
    console.log('Torrent client added hash:', torrent.infoHash);
    
    sender.send('torrent-progress-update', {
      status: 'metadata',
      name: torrent.name || 'Fetching metadata...',
      totalBytes: torrent.length || 0,
      path: downloadDir
    });

    torrent.on('download', () => {
      sender.send('torrent-progress-update', {
        status: 'downloading',
        name: torrent.name,
        progress: torrent.progress, // float 0 to 1
        downloadSpeed: torrent.downloadSpeed, // bytes/sec
        downloaded: torrent.downloaded,
        totalBytes: torrent.length,
        timeRemaining: torrent.timeRemaining, // ms
        path: downloadDir
      });
    });

    torrent.on('done', () => {
      sender.send('torrent-progress-update', {
        status: 'done',
        name: torrent.name,
        path: downloadDir
      });
      activeTorrent = null;
    });
  });

  activeTorrent.on('error', (err) => {
    console.error('Torrent error:', err);
    sender.send('torrent-progress-update', { status: 'error', message: err.message });
    activeTorrent = null;
  });
}

ipcMain.on('cancel-torrent-download', (event) => {
  if (activeTorrent) {
    activeTorrent.destroy(() => {
      console.log('Torrent download cancelled by user.');
      event.sender.send('torrent-progress-update', { status: 'idle' });
      activeTorrent = null;
    });
  } else {
    event.sender.send('torrent-progress-update', { status: 'idle' });
  }
});

ipcMain.handle('get-active-torrent-status', () => {
  if (activeTorrent) {
    return {
      status: 'downloading',
      name: activeTorrent.name,
      progress: activeTorrent.progress,
      downloadSpeed: activeTorrent.downloadSpeed,
      downloaded: activeTorrent.downloaded,
      totalBytes: activeTorrent.length,
      timeRemaining: activeTorrent.timeRemaining
    };
  }
  return { status: 'idle' };
});



