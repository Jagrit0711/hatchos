const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const { spawn } = require('child_process');

// Start backend server
const server = require('./backend/server');

let mainWindow;

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  
  mainWindow = new BrowserWindow({
    width: width,
    height: height,
    fullscreen: true,
    frame: false,
    kiosk: true, // Auto-kiosk mode as per PRD
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, '../assets/hatch-icon.png')
  });

  const startUrl = isDev 
    ? 'http://localhost:3000' 
    : `file://${path.join(__dirname, '../build/index.html')}`;
  
  mainWindow.loadURL(startUrl);

  // Hide menu bar for distraction-free experience
  mainWindow.setMenuBarVisibility(false);

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Security: Prevent new window creation
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (navigationEvent, url) => {
    navigationEvent.preventDefault();
    // Only allow internal navigation
    if (url.startsWith('http://localhost:3000') || url.startsWith('file://')) {
      mainWindow.loadURL(url);
    }
  });
});

// IPC handlers for system integration
ipcMain.handle('get-system-info', async () => {
  const si = require('systeminformation');
  return {
    cpu: await si.cpu(),
    memory: await si.mem(),
    os: await si.osInfo(),
    network: await si.networkInterfaces()
  };
});

ipcMain.handle('authenticate-user', async (event, credentials) => {
  const auth = require('./backend/auth');
  return await auth.authenticateUser(credentials);
});

ipcMain.handle('sync-cloud-data', async (event, data) => {
  const cloudSync = require('./backend/cloudSync');
  return await cloudSync.syncData(data);
});