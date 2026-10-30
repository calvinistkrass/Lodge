const { app, BrowserWindow, session, desktopCapturer, ipcMain, shell, Menu } = require('electron');
const http = require('http');
const path = require('path');
const fs = require('fs');

// Feste lokale Adresse: so bleiben Login und Einstellungen zwischen Starts erhalten,
// und 127.0.0.1 gilt als sicherer Kontext für Mikrofon, Kamera und Bildschirm.
const PORT = 47831;
const WEB_DIR = app.isPackaged ? path.join(process.resourcesPath, 'web') : path.join(__dirname, '..', 'app', 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

function startStaticServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      let file = path.normalize(path.join(WEB_DIR, urlPath));
      if (!file.startsWith(WEB_DIR)) {
        res.writeHead(403);
        return res.end();
      }
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(WEB_DIR, 'index.html');
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.once('error', reject);
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

let mainWindow;
let pendingUrl = null;

function deepLink(argv) {
  return argv.find((a) => a.startsWith('lodge://'));
}

function openInvite(url) {
  const m = /invite\/([A-Za-z0-9_-]+)/.exec(url || '');
  if (!m || !mainWindow) return;
  mainWindow.loadURL(`http://127.0.0.1:${PORT}/invite/${m[1]}`);
}

// Auswahlfenster für die Bildschirmübertragung (Bildschirme und einzelne Fenster mit Vorschau).
function pickSource(sources) {
  return new Promise((resolve) => {
    const picker = new BrowserWindow({
      parent: mainWindow,
      modal: true,
      width: 760,
      height: 560,
      resizable: false,
      minimizable: false,
      maximizable: false,
      backgroundColor: '#17181f',
      autoHideMenuBar: true,
      title: 'Bildschirm teilen',
      webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
    });
    let done = false;
    const finish = (choice) => {
      if (done) return;
      done = true;
      ipcMain.removeAllListeners('picker:choose');
      resolve(choice);
      if (!picker.isDestroyed()) picker.close();
    };
    ipcMain.once('picker:choose', (_e, choice) => finish(choice));
    picker.on('closed', () => finish(null));
    picker.loadFile(path.join(__dirname, 'picker.html'));
    picker.webContents.once('did-finish-load', () => {
      picker.webContents.send(
        'picker:sources',
        sources.map((s) => ({ id: s.id, name: s.name, thumb: s.thumbnail.toDataURL(), screen: s.id.startsWith('screen:') }))
      );
    });
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 380,
    minHeight: 500,
    backgroundColor: '#121318',
    title: 'Lodge',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, backgroundThrottling: false },
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Mikrofon, Kamera und Benachrichtigungen ohne Rückfrage erlauben – es ist ja die eigene App.
  const allowed = new Set(['media', 'notifications', 'clipboard-sanitized-write', 'clipboard-read', 'fullscreen', 'speaker-selection']);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(allowed.has(permission)));
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));

  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 320, height: 180 } });
      const choice = await pickSource(sources);
      const source = choice && sources.find((s) => s.id === choice.id);
      // Ohne Auswahl wird die Anfrage abgelehnt.
      if (!source) return callback({});
      callback(choice.audio ? { video: source, audio: 'loopback' } : { video: source });
    } catch (e) {
      console.error(e);
      callback({});
    }
  });

  // Links aus Nachrichten im normalen Browser öffnen.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(`http://127.0.0.1:${PORT}`)) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  const link = pendingUrl || deepLink(process.argv);
  const m = /invite\/([A-Za-z0-9_-]+)/.exec(link || '');
  await mainWindow.loadURL(`http://127.0.0.1:${PORT}/${m ? `invite/${m[1]}` : ''}`);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    const link = deepLink(argv);
    if (link) openInvite(link);
  });

  app.on('open-url', (e, url) => {
    e.preventDefault();
    if (mainWindow) openInvite(url);
    else pendingUrl = url;
  });

  app.whenReady().then(async () => {
    if (process.defaultApp) app.setAsDefaultProtocolClient('lodge', process.execPath, [path.resolve(process.argv[1] || '.')]);
    else app.setAsDefaultProtocolClient('lodge');
    Menu.setApplicationMenu(null);
    await startStaticServer();
    await createWindow();
  });

  app.on('window-all-closed', () => app.quit());
}
