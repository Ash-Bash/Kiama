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

  // Provide renderer with possible theme/plugin locations (packaged + user data folders)
  ipcMain.handle('kiama-get-paths', () => {
    const paths: { themes: string[]; plugins: string[] } = { themes: [], plugins: [] };

    // Development build location (when running from source)
    paths.themes.push(path.resolve(process.cwd(), '../../dist/client/themes'));
    paths.plugins.push(path.resolve(process.cwd(), '../../dist/client/plugins'));

    // When packaged, resources are available under process.resourcesPath.
    // Try a few common layouts to be resilient.
    paths.themes.push(path.join(process.resourcesPath, 'app', 'dist', 'client', 'themes'));
    paths.themes.push(path.join(process.resourcesPath, 'dist', 'client', 'themes'));
    paths.themes.push(path.join(process.resourcesPath, 'themes'));
    paths.plugins.push(path.join(process.resourcesPath, 'app', 'dist', 'client', 'plugins'));
    paths.plugins.push(path.join(process.resourcesPath, 'dist', 'client', 'plugins'));
    paths.plugins.push(path.join(process.resourcesPath, 'plugins'));

    // Public user-accessible folders (third-party themes/plugins go here)
    const appData = app.getPath('appData'); // Roaming on Windows, ~/Library/Application Support on macOS
    paths.themes.push(path.join(appData, 'Kiama', 'Themes'));
    paths.plugins.push(path.join(appData, 'Kiama', 'Plugins'));

    // Also include userData (per-app) as a fallback
    const userData = app.getPath('userData');
    paths.themes.push(path.join(userData, 'Themes'));
    paths.plugins.push(path.join(userData, 'Plugins'));

    return paths;
  });
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