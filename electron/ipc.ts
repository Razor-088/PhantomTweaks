import { ipcMain, app, dialog, shell, Notification, nativeTheme } from 'electron';
import { BrowserWindow } from 'electron';
import { getDataDir } from './core/paths';
import { getSettings, setSetting, setSettings, resetSettings } from './core/settings';
import * as logging from './core/logging';
import { getOverview, getMonitorSnapshot } from './core/systemInfo';
import { getPerfReport } from './core/perf';
import { listProcesses, killProcess, getProcessInfo } from './core/processManager';
import { listServices, controlService } from './core/serviceManager';
import { listStartupEntries, setStartupEnabled } from './core/startupManager';
import { scanCleanup, cleanCategories, CleanupCategory } from './core/cleanupEngine';
import { getTweaks, getTweaksView, getTweak, activateGamingMode, deactivateGamingMode, getGamingModeState, optimizeMemory, emptyStandbyList, runWindowsMaintenance } from './core/windowsTweaks';
import {
  getNetInfo,
  runNetworkTool,
  flushDns,
  renewIp,
  releaseIp,
  resetNetworkStack,
  listAdapters,
  listConnections,
} from './core/networkTools';
import { getPrivacySummary, clearHistory } from './core/privacyManager';
import { addChange, revertChange, createRestorePoint, getHistory, listRestorePoints } from './core/restoreManager';
import { boostGamingStart, boostGamingStop, boostNetworkStart, boostNetworkStop, getBoostStatus } from './core/boostManager';
import { scanOptimization, runOptimization } from './core/optimizationEngine';
import { computeHealth } from './core/systemHealth';
import { openTool } from './core/tools';
import { runTerminalCommand, classifyCommand, isBlocked, CommandClass } from './core/commandExecutor';
import { isAdmin, relaunchAsAdmin } from './core/admin';
import { scanInputDelay, applyInputDelay, applyAllInputDelay } from './core/inputDelay';
import { listProfiles, getProfile, saveProfile, deleteProfile, applyProfile, restoreProfile, detectRunningGames } from './core/profileManager';
import { activateLicense, validateLicense, deactivateLocal, getLicenseStatusAsync } from './core/licenseClient';
import {
  detectNvidiaGpus, isNvidiaAvailable, getNvidiaSmiOutput,
  listNvidiaProfiles, getNvidiaProfile, saveNvidiaProfile, deleteNvidiaProfile,
  applyNvidiaProfile, applyPresetProfile, getPresetProfiles, getNvidiaSystemInfo,
  applyQuickSetting, setPowerLimit, setMaxFps, setPreRender
} from './core/nvidiaProfiles';
import {
  detectInstalledGames, detectRunningGames as detectRunningGamesOpt,
  listGameOptimizations, getGameOptimization, saveGameOptimization, deleteGameOptimization,
  applyGameOptimization, deactivateGameOptimization, getGameBoostStatus,
  loadCustomGames, saveCustomGame, deleteCustomGame
} from './core/gameOptimizer';

export type Push = (channel: string, payload: any) => void;

const intervalTimers: NodeJS.Timeout[] = [];

function syncNativeTheme(theme: AppTheme) {
  try {
    nativeTheme.themeSource = theme;
  } catch {
    /* ignore */
  }
}

type AppTheme = 'dark' | 'light' | 'system';

function notify(title: string, body: string) {
  if (!getSettings().notifications) return;
  try {
    new Notification({ title, body }).show();
  } catch {
    /* ignore */
  }
}

let snapshotTimer: NodeJS.Timeout | null = null;
let snapshotRunning = false;

function stopSnapshotTimer() {
  if (snapshotTimer) {
    clearInterval(snapshotTimer);
    snapshotTimer = null;
  }
  snapshotRunning = false;
}

function startSnapshotTimer(getWin: () => BrowserWindow | null) {
  if (snapshotTimer) return;
  snapshotRunning = true;
  const tick = async () => {
    const w = getWin();
    if (!snapshotRunning || !w || w.isDestroyed()) return;
    try {
      const snap = await getMonitorSnapshot();
      if (!w.isDestroyed()) w.webContents.send('monitor:snapshot', snap);
    } catch {
      /* ignore */
    }
  };
  tick();
  snapshotTimer = setInterval(tick, 2500);
}

async function setRunOnStartup(enabled: boolean) {
  const exe = process.execPath;
  const appArg = app.isPackaged ? '' : ` "${app.getAppPath().replace(/"/g, '\\"')}"`;
  const cmd = `"${exe}"${appArg}`;
  const { runPS } = await import('./core/ps.js');
  const key = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
  if (enabled) {
    await runPS(`Set-ItemProperty -Path '${key}' -Name 'PhantomTweaks' -Value '${cmd.replace(/'/g, "''")}' -Type String`, 10000);
  } else {
    await runPS(`Remove-ItemProperty -Path '${key}' -Name 'PhantomTweaks' -ErrorAction SilentlyContinue`, 10000);
  }
}

async function getRunOnStartup(): Promise<boolean> {
  const { runPS } = await import('./core/ps.js');
  const r = await runPS(`(Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -Name 'PhantomTweaks' -ErrorAction SilentlyContinue).PhantomTweaks`, 10000);
  return !!r.stdout.trim();
}

export function registerIpc(getWin: () => BrowserWindow | null, push: Push) {
  const win = getWin;

  // ---------- app ----------
  ipcMain.handle('app:getInfo', async () => {
    return {
      version: app.getVersion(),
      dataDir: getDataDir(),
      isAdmin: await isAdmin(),
    };
  });

  ipcMain.handle('app:isAdmin', () => isAdmin());
  ipcMain.handle('app:relaunchAsAdmin', () => relaunchAsAdmin());
  ipcMain.handle('app:openTool', (_e, id: string) => openTool(id));
  ipcMain.handle('app:quit', () => app.quit());
  ipcMain.handle('app:setStartup', (_e, enabled: boolean) => setRunOnStartup(enabled));
  ipcMain.handle('app:getStartup', () => getRunOnStartup());
  ipcMain.handle('app:openLogsFolder', () => {
    shell.openPath(getDataDir());
    return { ok: true };
  });
  ipcMain.handle('app:openExternal', (_e, url: string) => {
    shell.openExternal(url);
    return { ok: true };
  });

  // ---------- system ----------
  ipcMain.handle('system:overview', () => getOverview());
  ipcMain.handle('system:snapshot', () => getMonitorSnapshot());
  ipcMain.handle('system:health', () => computeHealth());

  // ---------- performance ----------
  ipcMain.handle('perf:report', () => getPerfReport());

  // ---------- processes ----------
  ipcMain.handle('processes:list', () => listProcesses());
  ipcMain.handle('processes:kill', (_e, pid: number) => killProcess(pid));
  ipcMain.handle('processes:info', (_e, pid: number) => getProcessInfo(pid));

  // ---------- services ----------
  ipcMain.handle('services:list', () => listServices());
  ipcMain.handle(
    'services:control',
    (_e, payload: { name: string; action: 'start' | 'stop' | 'restart'; startup?: string | null }) =>
      controlService(payload.name, payload.action, (payload.startup as any) || null)
  );

  // ---------- startup ----------
  ipcMain.handle('startup:list', () => listStartupEntries());
  ipcMain.handle('startup:setEnabled', (_e, id: string, enabled: boolean) => setStartupEnabled(id, enabled));

  // ---------- cleanup ----------
  ipcMain.handle('cleanup:scan', async () => {
    const cats = await scanCleanup((current, done, total) => {
      win()?.webContents.send('cleanup:progress', { current, done, total });
    });
    return cats;
  });
  ipcMain.handle('cleanup:clean', async (_e, categories: CleanupCategory[]) => {
    const result = await cleanCategories(categories, (current, done, total) => {
      win()?.webContents.send('cleanup:progress', { current, done, total });
    });
    return result;
  });

  // ---------- tweaks ----------
  ipcMain.handle('tweaks:list', (_e, category?: string) =>
    getTweaksView((category as any) || undefined)
  );
  ipcMain.handle('tweaks:check', async (_e, id: string) => {
    const t = getTweak(id);
    return t ? t.check() : false;
  });
  ipcMain.handle('tweaks:apply', async (_e, id: string, opts?: { createRestorePoint?: boolean }) => {
    const t = getTweak(id);
    if (!t) return { applied: false, message: 'Optimización desconocida.' };
    if (t.requiresAdmin && !(await isAdmin())) {
      return { applied: false, message: 'Esta optimización requiere privilegios de administrador.' };
    }
    const settings = getSettings();
    const needsRestore =
      opts?.createRestorePoint ||
      (settings.autoRestorePoint && (t.impact === 'HIGH' || t.risk !== 'SAFE'));
    if (needsRestore) {
      const name = `PhantomTweaks: ${t.name}`;
      createRestorePoint(name).catch(() => undefined);
    }
    const r = await t.apply();
    return r;
  });
  ipcMain.handle('tweaks:revert', async (_e, id: string) => {
    const t = getTweak(id);
    if (!t) return { reverted: false, message: 'Optimización desconocida.' };
    if (t.requiresAdmin && !(await isAdmin())) {
      return { reverted: false, message: 'Esta optimización requiere privilegios de administrador.' };
    }
    return t.revert();
  });

  // ---------- gaming ----------
  ipcMain.handle('gaming:status', () => getGamingModeState());
  ipcMain.handle('gaming:activate', (_e, opts: { applyPowerPlan: boolean; memoryClean: boolean }) =>
    activateGamingMode(opts)
  );
  ipcMain.handle('gaming:deactivate', () => deactivateGamingMode());
  ipcMain.handle('gaming:memoryClean', () => optimizeMemory());

  // ---------- maintenance ----------
  ipcMain.handle('maintenance:run', () => runWindowsMaintenance());

  // ---------- real-time optimizations ----------
  ipcMain.handle('rt:memoryClean', () => optimizeMemory());
  ipcMain.handle('rt:cleanStandby', () => emptyStandbyList());

  // ---------- real-time boosts (gaming fps + network) ----------
  ipcMain.handle('boost:status', () => getBoostStatus());
  ipcMain.handle('boost:gamingStart', () => boostGamingStart());
  ipcMain.handle('boost:gamingStop', () => boostGamingStop());
  ipcMain.handle('boost:networkStart', () => boostNetworkStart());
  ipcMain.handle('boost:networkStop', () => boostNetworkStop());

  // ---------- optimization engine ----------
  ipcMain.handle('optimization:scan', () => scanOptimization());
  ipcMain.handle('optimization:run', async (_e, opts: { includeRisky: boolean }) => {
    const r = await runOptimization(opts || { includeRisky: false }, (p) => win()?.webContents.send('optimization:progress', p));
    notify(
      'PhantomTweaks — Optimización completada',
      `${r.appliedCount} cambios aplicados, ${r.alreadyCount} ya optimizados, ${r.requiresAdminCount} requieren administrador.`
    );
    return r;
  });

  // ---------- network ----------
  ipcMain.handle('network:info', () => getNetInfo());
  ipcMain.handle('network:run', (_e, tool: 'ping' | 'traceroute', host: string) =>
    runNetworkTool(tool, host, (o) => win()?.webContents.send('network:output', o))
  );
  ipcMain.handle('network:flushDns', () => flushDns((o) => win()?.webContents.send('network:output', o)));
  ipcMain.handle('network:renew', () => renewIp((o) => win()?.webContents.send('network:output', o)));
  ipcMain.handle('network:release', () => releaseIp((o) => win()?.webContents.send('network:output', o)));
  ipcMain.handle('network:reset', () => resetNetworkStack((o) => win()?.webContents.send('network:output', o)));
  ipcMain.handle('network:adapters', () => listAdapters((o) => win()?.webContents.send('network:output', o)));
  ipcMain.handle('network:connections', () => listConnections((o) => win()?.webContents.send('network:output', o)));

  // ---------- privacy ----------
  ipcMain.handle('privacy:summary', () => getPrivacySummary());
  ipcMain.handle('privacy:historyClean', () => clearHistory());

  // ---------- restore ----------
  ipcMain.handle('restore:history', () => getHistory());
  ipcMain.handle('restore:revert', (_e, id: string) => revertChange(id));
  ipcMain.handle('restore:createPoint', (_e, description?: string) =>
    createRestorePoint(description || `PhantomTweaks ${new Date().toLocaleString('es-ES')}`)
  );
  ipcMain.handle('restore:points', () => listRestorePoints());

  // ---------- logs ----------
  ipcMain.handle('logs:get', (_e, limit?: number) => logging.getLogs(limit));
  ipcMain.handle('logs:export', () => logging.exportLogs());
  ipcMain.handle('logs:clear', () => {
    logging.clearLogs();
    logging.log('SYSTEM', 'logs', 'Registros limpiados');
    return { ok: true };
  });

  // ---------- settings ----------
  ipcMain.handle('settings:get', () => getSettings());
  ipcMain.handle('settings:set', (_e, key: string, value: any) => {
    const s = setSetting(key as any, value);
    syncNativeTheme(s.theme);
    return s;
  });
  ipcMain.handle('settings:setMany', (_e, partial: any) => {
    const s = setSettings(partial);
    syncNativeTheme(s.theme);
    return s;
  });
  ipcMain.handle('settings:reset', () => {
    const s = resetSettings();
    syncNativeTheme(s.theme);
    return s;
  });

  // ---------- terminal ----------
  ipcMain.handle('terminal:classify', (_e, command: string) => classifyCommand(command));
  ipcMain.handle(
    'terminal:exec',
    (_e, command: string, mode: CommandClass) =>
      runTerminalCommand(command, mode, (o) => win()?.webContents.send('terminal:output', o))
  );
  ipcMain.handle('terminal:blocked', (_e, command: string) => isBlocked(command));

  // ---------- input delay ----------
  ipcMain.handle('input-delay:scan', () => scanInputDelay());
  ipcMain.handle('input-delay:apply', (_e, itemId: string) => applyInputDelay(itemId));
  ipcMain.handle('input-delay:applyAll', () => applyAllInputDelay());

  // ---------- profiles ----------
  ipcMain.handle('profiles:list', () => listProfiles());
  ipcMain.handle('profiles:get', (_e, id: string) => getProfile(id) || null);
  ipcMain.handle('profiles:save', (_e, profile: any) => saveProfile(profile));
  ipcMain.handle('profiles:delete', (_e, id: string) => deleteProfile(id));
  ipcMain.handle('profiles:apply', (_e, id: string) => applyProfile(id));
  ipcMain.handle('profiles:restore', (_e, id: string) => restoreProfile(id));
  ipcMain.handle('profiles:detectGames', () => detectRunningGames());

   // ---------- license ----------
  ipcMain.handle('license:activate', (_e, key: string) => activateLicense(key));
  ipcMain.handle('license:validate', () => validateLicense());
  ipcMain.handle('license:deactivate', () => deactivateLocal());
  ipcMain.handle('license:getStatus', () => getLicenseStatusAsync());

  // ---------- monitor polling (page-aware) ----------
  ipcMain.handle('monitor:startPolling', () => {
    startSnapshotTimer(getWin);
  });
  ipcMain.handle('monitor:stopPolling', () => {
    stopSnapshotTimer();
  });

  // ---------- nvidia ----------
  ipcMain.handle('nvidia:systemInfo', () => getNvidiaSystemInfo());
  ipcMain.handle('nvidia:gpus', () => detectNvidiaGpus());
  ipcMain.handle('nvidia:available', () => isNvidiaAvailable());
  ipcMain.handle('nvidia:smi', () => getNvidiaSmiOutput());
  ipcMain.handle('nvidia:profiles', () => listNvidiaProfiles());
  ipcMain.handle('nvidia:getProfile', (_e, id: string) => getNvidiaProfile(id) || null);
  ipcMain.handle('nvidia:saveProfile', (_e, profile: any) => saveNvidiaProfile(profile));
  ipcMain.handle('nvidia:deleteProfile', (_e, id: string) => deleteNvidiaProfile(id));
  ipcMain.handle('nvidia:applyProfile', (_e, id: string) => applyNvidiaProfile(id));
  ipcMain.handle('nvidia:applyPreset', (_e, presetId: string) => applyPresetProfile(presetId));
  ipcMain.handle('nvidia:presets', () => getPresetProfiles());
  ipcMain.handle('nvidia:quickSetting', (_e, setting: string) => applyQuickSetting(setting as any));
  ipcMain.handle('nvidia:powerLimit', (_e, watts: number) => setPowerLimit(watts));
  ipcMain.handle('nvidia:maxFps', (_e, fps: number) => setMaxFps(fps));
  ipcMain.handle('nvidia:preRender', (_e, frames: number) => setPreRender(frames));

  // ---------- game optimizer ----------
  ipcMain.handle('games:installed', () => detectInstalledGames());
  ipcMain.handle('games:running', () => detectRunningGamesOpt());
  ipcMain.handle('games:optimizations', () => listGameOptimizations());
  ipcMain.handle('games:getOptimization', (_e, id: string) => getGameOptimization(id) || null);
  ipcMain.handle('games:saveOptimization', (_e, opt: any) => saveGameOptimization(opt));
  ipcMain.handle('games:deleteOptimization', (_e, id: string) => deleteGameOptimization(id));
  ipcMain.handle('games:applyOptimization', (_e, id: string) => applyGameOptimization(id));
  ipcMain.handle('games:deactivateOptimization', (_e, id: string) => deactivateGameOptimization(id));
  ipcMain.handle('games:boostStatus', () => getGameBoostStatus());
  ipcMain.handle('games:customList', () => loadCustomGames());
  ipcMain.handle('games:customSave', (_e, game: any) => saveCustomGame(game));
  ipcMain.handle('games:customDelete', (_e, id: string) => deleteCustomGame(id));
}
