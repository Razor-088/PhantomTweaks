import { Tray, Menu, app, BrowserWindow, nativeImage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { getSettings } from './core/settings';

let tray: Tray | null = null;

function createTrayIcon(): Electron.NativeImage {
  const trayPng = path.join(__dirname, '..', 'build', 'tray.png');
  if (fs.existsSync(trayPng)) {
    return nativeImage.createFromPath(trayPng).resize({ width: 16, height: 16 });
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 512 512" fill="none">
  <path d="M61 188 A195 165 0 0 1 451 188 L448 388 C491 418 501 458 438 490 C376 520 296 520 256 516 C206 512 146 512 126 502 C66 488 56 453 64 388 Z" fill="#00ff88" stroke="#00d66b" stroke-width="11" stroke-linejoin="round"/>
  <rect x="124" y="132" width="100" height="56" rx="28" fill="#041a10"/>
  <rect x="288" y="132" width="100" height="56" rx="28" fill="#041a10"/>
  <path d="M220 200 L288 200 L244 252 L284 252 L226 328 L252 270 L214 270 Z" fill="#eaffc4" stroke="#96c85a" stroke-width="4" stroke-linejoin="round"/>
  </svg>`;
  const img = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);
  return img.resize({ width: 16, height: 16 });
}

export function createTray(getWindow: () => BrowserWindow | null) {
  const icon = createTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip('PhantomTweaks');

  const open = (page?: string) => {
    const w = getWindow();
    if (!w) return;
    if (w.isMinimized()) w.restore();
    w.show();
    w.focus();
    if (page) w.webContents.send('navigate:page', page);
  };

  const menu = Menu.buildFromTemplate([
    { label: 'Abrir PhantomTweaks', click: () => open() },
    { label: 'Optimizar', click: () => open('optimizer') },
    { label: 'Modo Gaming', click: () => open('gaminghub') },
    { label: 'Rendimiento', click: () => open('performance') },
    { label: 'Limpieza', click: () => open('cleanup') },
    { label: 'Restaurar', click: () => open('restore') },
    { type: 'separator' },
    { label: 'Salir', click: () => { app.quit(); } },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => open());
  return tray;
}

export function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
