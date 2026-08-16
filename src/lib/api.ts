import type {
  AppInfo,
  AppSettings,
  BoostStatus,
  ChangeRecord,
  CleanResult,
  CleanupCategory,
  CommandClass,
  GamingModeResult,
  GamingState,
  HealthReport,
  InputDelayItem,
  GameProfile,
  LogEntry,
  MonitorSnapshot,
  NetInfo,
  OptimizationPreview,
  OptimizationReport,
  Overview,
  PerfReport,
  PrivacySummary,
  ProcessRow,
  ServiceRow,
  StartupEntry,
  TweakView,
} from './types';

function invoke<T>(channel: string, ...args: any[]): Promise<T> {
  return window.phantom.invoke(channel, ...args) as Promise<T>;
}

export const api = {
  app: {
    getInfo: () => invoke<AppInfo>('app:getInfo'),
    isAdmin: () => invoke<boolean>('app:isAdmin'),
    relaunchAsAdmin: () => invoke<{ ok: boolean; error?: string }>('app:relaunchAsAdmin'),
    openTool: (id: string) => invoke<{ ok: boolean; error?: string }>('app:openTool', id),
    openLogsFolder: () => invoke<{ ok: boolean }>('app:openLogsFolder'),
    quit: () => invoke<void>('app:quit'),
    setStartup: (enabled: boolean) => invoke<void>('app:setStartup', enabled),
    getStartup: () => invoke<boolean>('app:getStartup'),
  },
  system: {
    overview: () => invoke<Overview>('system:overview'),
    snapshot: () => invoke<MonitorSnapshot>('system:snapshot'),
    health: () => invoke<HealthReport>('system:health'),
  },
  perf: {
    report: () => invoke<PerfReport>('perf:report'),
  },
  processes: {
    list: () => invoke<ProcessRow[]>('processes:list'),
    kill: (pid: number) => invoke<{ ok: boolean; error?: string }>('processes:kill', pid),
    info: (pid: number) => invoke<any>('processes:info', pid),
  },
  services: {
    list: () => invoke<ServiceRow[]>('services:list'),
    control: (name: string, action: 'start' | 'stop' | 'restart', startup?: string | null) =>
      invoke<{ ok: boolean; error?: string }>('services:control', { name, action, startup }),
  },
  startup: {
    list: () => invoke<StartupEntry[]>('startup:list'),
    setEnabled: (id: string, enabled: boolean) => invoke<{ ok: boolean; error?: string }>('startup:setEnabled', id, enabled),
  },
  cleanup: {
    scan: () => invoke<CleanupCategory[]>('cleanup:scan'),
    clean: (categories: CleanupCategory[]) => invoke<CleanResult>('cleanup:clean', categories),
  },
  tweaks: {
    list: (category?: string) => invoke<TweakView[]>('tweaks:list', category),
    check: (id: string) => invoke<boolean>('tweaks:check', id),
    apply: (id: string, opts?: { createRestorePoint?: boolean }) =>
      invoke<{ applied: boolean; message?: string }>('tweaks:apply', id, opts),
    revert: (id: string) => invoke<{ reverted: boolean; message?: string }>('tweaks:revert', id),
  },
  gaming: {
    status: () => invoke<GamingState>('gaming:status'),
    activate: (opts: { applyPowerPlan: boolean; memoryClean: boolean }) =>
      invoke<GamingModeResult>('gaming:activate', opts),
    deactivate: () => invoke<GamingModeResult>('gaming:deactivate'),
    memoryClean: () => invoke<{ ok: boolean; message: string }>('gaming:memoryClean'),
  },
  maintenance: {
    run: () => invoke<{ ok: boolean; message: string }>('maintenance:run'),
  },
  rt: {
    memoryClean: () => invoke<{ ok: boolean; message: string }>('rt:memoryClean'),
    cleanStandby: () => invoke<{ ok: boolean; message: string }>('rt:cleanStandby'),
  },
  boost: {
    status: () => invoke<BoostStatus>('boost:status'),
    gamingStart: () => invoke<BoostStatus>('boost:gamingStart'),
    gamingStop: () => invoke<BoostStatus>('boost:gamingStop'),
    networkStart: () => invoke<BoostStatus>('boost:networkStart'),
    networkStop: () => invoke<BoostStatus>('boost:networkStop'),
  },
  optimization: {
    scan: () => invoke<OptimizationPreview>('optimization:scan'),
    run: (opts: { includeRisky: boolean }) => invoke<OptimizationReport>('optimization:run', opts),
  },
  network: {
    info: () => invoke<NetInfo>('network:info'),
    run: (tool: 'ping' | 'traceroute', host: string) => invoke<void>('network:run', tool, host),
    flushDns: () => invoke<void>('network:flushDns'),
    renew: () => invoke<void>('network:renew'),
    release: () => invoke<void>('network:release'),
    reset: () => invoke<void>('network:reset'),
    adapters: () => invoke<void>('network:adapters'),
    connections: () => invoke<void>('network:connections'),
  },
  privacy: {
    summary: () => invoke<PrivacySummary>('privacy:summary'),
    historyClean: () => invoke<{ ok: boolean; message: string }>('privacy:historyClean'),
  },
  restore: {
    history: () => invoke<ChangeRecord[]>('restore:history'),
    revert: (id: string) => invoke<{ ok: boolean; error?: string }>('restore:revert', id),
    createPoint: (description?: string) => invoke<{ ok: boolean; error?: string }>('restore:createPoint', description),
    points: () => invoke<Array<{ date: string; description: string }>>('restore:points'),
  },
  logs: {
    get: (limit?: number) => invoke<LogEntry[]>('logs:get', limit),
    export: () => invoke<string>('logs:export'),
    clear: () => invoke<{ ok: boolean }>('logs:clear'),
  },
  settings: {
    get: () => invoke<AppSettings>('settings:get'),
    set: (key: keyof AppSettings, value: any) => invoke<AppSettings>('settings:set', key, value),
    setMany: (partial: Partial<AppSettings>) => invoke<AppSettings>('settings:setMany', partial),
    reset: () => invoke<AppSettings>('settings:reset'),
  },
  terminal: {
    classify: (command: string) => invoke<CommandClass>('terminal:classify', command),
    exec: (command: string, mode: CommandClass) => invoke<void>('terminal:exec', command, mode),
    blocked: (command: string) => invoke<boolean>('terminal:blocked', command),
  },
  inputDelay: {
    scan: () => invoke<InputDelayItem[]>('input-delay:scan'),
    apply: (itemId: string) => invoke<{ ok: boolean; error?: string }>('input-delay:apply', itemId),
  },
  profiles: {
    list: () => invoke<GameProfile[]>('profiles:list'),
    get: (id: string) => invoke<GameProfile | null>('profiles:get', id),
    save: (profile: GameProfile) => invoke<GameProfile>('profiles:save', profile),
    delete: (id: string) => invoke<{ ok: boolean }>('profiles:delete', id),
    apply: (id: string) => invoke<{ ok: boolean; applied: string[]; errors: string[] }>('profiles:apply', id),
    restore: (id: string) => invoke<{ ok: boolean; message: string }>('profiles:restore', id),
    detectGames: () => invoke<string[]>('profiles:detectGames'),
  },
  license: {
    activate: (key: string) => invoke<{ ok: boolean; error?: string; data?: any }>('license:activate', key),
    validate: () => invoke<{ valid: boolean; error?: string; data?: any }>('license:validate'),
    deactivate: () => invoke<{ ok: boolean; error?: string }>('license:deactivate'),
    getStatus: () => invoke<{ valid: boolean; license: any | null; reason?: string }>('license:getStatus'),
  },
  on: window.phantom.on,
};
