import { contextBridge, ipcRenderer } from 'electron';

const ALLOWED_INVOKE = new Set([
  'app:getInfo', 'app:isAdmin', 'app:relaunchAsAdmin', 'app:openTool',
  'app:quit', 'app:setStartup', 'app:getStartup', 'app:openLogsFolder', 'app:openExternal',
  'system:overview', 'system:snapshot', 'system:health',
  'perf:report',
  'processes:list', 'processes:kill', 'processes:info',
  'services:list', 'services:control',
  'startup:list', 'startup:setEnabled',
  'cleanup:scan', 'cleanup:clean',
  'tweaks:list', 'tweaks:check', 'tweaks:apply', 'tweaks:revert',
  'gaming:status', 'gaming:activate', 'gaming:deactivate', 'gaming:memoryClean',
  'maintenance:run',
  'rt:memoryClean', 'rt:cleanStandby',
  'boost:status', 'boost:gamingStart', 'boost:gamingStop', 'boost:networkStart', 'boost:networkStop',
  'optimization:scan', 'optimization:run',
  'network:info', 'network:run', 'network:flushDns', 'network:renew',
  'network:release', 'network:reset', 'network:adapters', 'network:connections',
  'privacy:summary', 'privacy:historyClean',
  'restore:history', 'restore:revert', 'restore:createPoint', 'restore:points',
  'logs:get', 'logs:export', 'logs:clear',
  'settings:get', 'settings:set', 'settings:setMany', 'settings:reset',
  'terminal:classify', 'terminal:exec', 'terminal:blocked',
  'input-delay:scan', 'input-delay:apply', 'input-delay:applyAll',
  'profiles:list', 'profiles:get', 'profiles:save', 'profiles:delete', 'profiles:apply', 'profiles:restore', 'profiles:detectGames',
  'license:activate', 'license:validate', 'license:deactivate', 'license:getStatus',
  'nvidia:systemInfo', 'nvidia:gpus', 'nvidia:available', 'nvidia:smi',
  'nvidia:profiles', 'nvidia:getProfile', 'nvidia:saveProfile', 'nvidia:deleteProfile',
  'nvidia:applyProfile', 'nvidia:applyPreset', 'nvidia:presets',
  'nvidia:quickSetting', 'nvidia:powerLimit', 'nvidia:maxFps', 'nvidia:preRender',
  'games:installed', 'games:running', 'games:optimizations', 'games:getOptimization',
  'games:saveOptimization', 'games:deleteOptimization', 'games:applyOptimization',
  'games:deactivateOptimization', 'games:boostStatus',
  'games:customList', 'games:customSave', 'games:customDelete',
  'monitor:startPolling', 'monitor:stopPolling',
]);

const ALLOWED_ON = new Set([
  'monitor:snapshot', 'navigate:page', 'cleanup:progress',
  'terminal:output', 'network:output', 'optimization:progress',
]);

const api = {
  invoke: (channel: string, ...args: any[]) => {
    if (!ALLOWED_INVOKE.has(channel)) {
      return Promise.reject(new Error(`IPC channel not allowed: ${channel}`));
    }
    return ipcRenderer.invoke(channel, ...args);
  },
  on: (channel: string, cb: (...args: any[]) => void) => {
    if (!ALLOWED_ON.has(channel)) {
      return () => {};
    }
    const listener = (_e: any, ...args: any[]) => cb(...args);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
};

contextBridge.exposeInMainWorld('phantom', api);

export type PhantomApi = typeof api;
