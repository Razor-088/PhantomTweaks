import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { initPaths } from './core/paths';
import * as logging from './core/logging';
import { getSettings } from './core/settings';
import { registerIpc, Push } from './ipc';
import { createTray, destroyTray } from './tray';

const isSmokeTest = process.argv.includes('--smoke-test');

const devIcon = path.join(__dirname, '..', 'build', 'icon.png');
const winIcon = fs.existsSync(devIcon) ? devIcon : undefined;

let mainWindow: BrowserWindow | null = null;
let quitting = false;

const push: Push = (channel, payload) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
};

function createWindow() {
  const settings = getSettings();
  nativeTheme.themeSource = settings.theme;
  const theme = settings.theme === 'light' ? 'light' : settings.theme === 'system'
    ? (nativeTheme.shouldUseDarkColors ? 'dark' : 'light')
    : 'dark';
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 840,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: theme === 'dark' ? '#080b0a' : '#eef2f0',
    show: false,
    title: 'PhantomTweaks',
    autoHideMenuBar: true,
    ...(winIcon ? { icon: winIcon } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (settings.transparency) {
    mainWindow.setBackgroundColor(theme === 'dark' ? '#080b0a' : '#eef2f0');
  }

  mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html')).catch((e) => {
    logging.log('ERROR', 'app', `No se pudo cargar la UI: ${e.message}`);
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('close', (e) => {
    const s = getSettings();
    if (!quitting && s.minimizeToTray) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.setAppUserModelId('com.phantontweaks.app');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    if (!app.isPackaged) {
      const devData = path.join(app.getPath('userData'), 'dev');
      // keep user data separate in dev to avoid polluting prod data
    }
    initPaths(app.getPath('userData'));
    logging.initLog();
    logging.log('SYSTEM', 'app', `PhantomTweaks iniciado (v${app.getVersion()}) — PID ${process.pid}`);

    registerIpc(() => mainWindow, push);

    createWindow();
    createTray(() => mainWindow);

    if (isSmokeTest) {
      setTimeout(() => {
        logging.log('SYSTEM', 'app', 'Smoke test OK — saliendo');
        app.quit();
      }, 6000);
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
      else mainWindow?.show();
    });
  });

  app.on('before-quit', () => {
    quitting = true;
  });

  app.on('window-all-closed', () => {
    const s = getSettings();
    if (s.minimizeToTray) {
      // keep running in tray
    } else {
      app.quit();
    }
  });

  app.on('will-quit', () => {
    destroyTray();
  });
}
