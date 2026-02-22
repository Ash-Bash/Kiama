import { app, BrowserWindow, ipcMain, protocol } from 'electron';
import * as path from 'path';

let mainWindow: BrowserWindow | null = null;

// Spawn the frameless Electron browser window hosting the renderer bundle.
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  // Load the app
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  createWindow();

  // Relay window control button presses from the renderer to Electron.
  ipcMain.on('window-control', (event, action: 'minimize' | 'maximize' | 'close' | 'restore') => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender) || mainWindow;
    if (!targetWindow) return;

    switch (action) {
      case 'minimize':
        targetWindow.minimize();
        break;
      case 'maximize':
        if (targetWindow.isMaximized()) {
          targetWindow.unmaximize();
        } else {
          targetWindow.maximize();
        }
        break;
      case 'restore':
        targetWindow.restore();
        break;
      case 'close':
        targetWindow.close();
        break;
      default:
        break;
    }
  });

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