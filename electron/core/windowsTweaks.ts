import { regQuery, regSet, regDelete, getDword, setDword } from './registry';
import { addChange, revertChange, ChangeRecord } from './restoreManager';
import { runPS } from './ps';
import { log } from './logging';
import { getSettings } from './settings';
import { getActiveSchemeGuid, setPowerPlan } from '../shared/powercfg';
import { POWER_GUIDS } from '../shared/constants';

export type TweakCategory = 'windows' | 'gaming' | 'privacy';
export type TweakImpact = 'LOW' | 'MEDIUM' | 'HIGH';
export type TweakRisk = 'SAFE' | 'CAUTION' | 'ADVANCED';

export interface Tweak {
  id: string;
  name: string;
  description: string;
  category: TweakCategory;
  impact: TweakImpact;
  risk: TweakRisk;
  scope: 'user' | 'system';
  requiresAdmin: boolean;
  check: () => Promise<boolean>;
  apply: () => Promise<{ applied: boolean; message?: string; records?: string[] }>;
  revert: () => Promise<{ reverted: boolean; message?: string }>;
}

export interface RegistryOp {
  key: string;
  valueName: string;
  type: string;
  data: string;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

async function recordRegistryOps(
  tweak: Pick<Tweak, 'id' | 'name' | 'category'>,
  ops: RegistryOp[]
): Promise<ChangeRecord[]> {
  const records: ChangeRecord[] = [];
  for (const op of ops) {
    const prev = await regQuery(op.key, op.valueName);
    await regSet(op.key, op.valueName, op.type, op.data);
    records.push(
      addChange({
        tweakId: tweak.id,
        name: tweak.name,
        category: tweak.category,
        action: `${op.key} \\ ${op.valueName} = ${op.data}`,
        reversible: true,
        payload: {
          kind: 'registry',
          key: op.key,
          valueName: op.valueName,
          type: op.type,
          revertData: prev.exists ? prev.data : null,
          revertType: prev.exists ? prev.type : op.type,
        },
      })
    );
  }
  return records;
}

async function revertTweakChanges(tweakId: string, name: string): Promise<{ reverted: boolean; message?: string }> {
  const { getHistory } = await import('./restoreManager.js');
  const changes = getHistory().filter((c) => c.tweakId === tweakId && !c.reverted && c.reversible);
  if (changes.length === 0) return { reverted: false, message: 'No hay cambios registrados para revertir.' };
  let ok = true;
  let firstErr = '';
  for (const c of changes) {
    const r = await revertChange(c.id);
    if (!r.ok) {
      ok = false;
      firstErr = r.error || '';
    }
  }
  if (ok) {
    log('SUCCESS', 'tweak', `Revertido: ${name}`);
    return { reverted: true };
  }
  return { reverted: false, message: firstErr };
}

function dwordTweak(opts: {
  id: string;
  name: string;
  description: string;
  category: TweakCategory;
  impact: TweakImpact;
  risk: TweakRisk;
  scope?: 'user' | 'system';
  requiresAdmin?: boolean;
  key: string;
  valueName: string;
  target: number;
}): Tweak {
  return {
    id: opts.id,
    name: opts.name,
    description: opts.description,
    category: opts.category,
    impact: opts.impact,
    risk: opts.risk,
    scope: opts.scope || 'user',
    requiresAdmin: opts.requiresAdmin || false,
    check: async () => {
      const v = await getDword(opts.key, opts.valueName);
      return v === opts.target;
    },
    apply: async () => {
      const records = await recordRegistryOps(opts, [
        { key: opts.key, valueName: opts.valueName, type: 'REG_DWORD', data: String(opts.target) },
      ]);
      return { applied: true, records: records.map((r) => r.id) };
    },
    revert: () => revertTweakChanges(opts.id, opts.name),
  };
}

function multiDwordTweak(opts: {
  id: string;
  name: string;
  description: string;
  category: TweakCategory;
  impact: TweakImpact;
  risk: TweakRisk;
  scope?: 'user' | 'system';
  requiresAdmin?: boolean;
  values: Array<{ key: string; valueName: string; target: number }>;
}): Tweak {
  return {
    id: opts.id,
    name: opts.name,
    description: opts.description,
    category: opts.category,
    impact: opts.impact,
    risk: opts.risk,
    scope: opts.scope || 'user',
    requiresAdmin: opts.requiresAdmin || false,
    check: async () => {
      for (const v of opts.values) {
        const cur = await getDword(v.key, v.valueName);
        if (cur !== v.target) return false;
      }
      return true;
    },
    apply: async () => {
      const records = await recordRegistryOps(
        opts,
        opts.values.map((v) => ({ key: v.key, valueName: v.valueName, type: 'REG_DWORD', data: String(v.target) }))
      );
      return { applied: true, records: records.map((r) => r.id) };
    },
    revert: () => revertTweakChanges(opts.id, opts.name),
  };
}

// ---------------------------------------------------------------------------
// powercfg tweak
// ---------------------------------------------------------------------------

async function getSchemeName(guid: string): Promise<string> {
  const r = await runPS(`powercfg /query ${guid}`, 15000);
  const m = r.stdout.match(/Scheme GUID: .*?\((.*?)\)/s);
  if (m) return m[1].trim();
  const m2 = r.stdout.match(/Nombre del plan de energía: (.*)/);
  return (m2 ? m2[1].trim() : guid);
}

const powerHighPerfTweak: Tweak = {
  id: 'power_high_performance',
  name: 'Plan de energía: Alto rendimiento',
  description:
    'Cambia el plan de energía activo al modo "Alto rendimiento". Mantiene el CPU a frecuencias más altas de forma consistente, mejorando el rendimiento en juegos y tareas exigentes a costa de mayor consumo.',
  category: 'gaming',
  impact: 'HIGH',
  risk: 'CAUTION',
  scope: 'system',
  requiresAdmin: true,
  check: async () => {
    const g = await getActiveSchemeGuid();
    return g === POWER_GUIDS.HIGH_PERF;
  },
  apply: async () => {
    const prev = await getActiveSchemeGuid();
    const prevName = prev ? await getSchemeName(prev) : 'plan actual';
    const r = await runPS(`powercfg -setactive ${POWER_GUIDS.HIGH_PERF}`, 20000);
    if (r.code !== 0) return { applied: false, message: r.stderr || 'No se pudo cambiar el plan de energía.' };
    addChange({
      tweakId: 'power_high_performance',
      name: 'Plan de energía: Alto rendimiento',
      category: 'gaming',
      action: `Plan activo cambiado a Alto rendimiento (antes: ${prevName})`,
      reversible: true,
      payload: { kind: 'powercfg', schemeGuid: prev || POWER_GUIDS.HIGH_PERF, schemeName: prevName },
    });
    return { applied: true };
  },
  revert: () => revertTweakChanges('power_high_performance', 'Plan de energía: Alto rendimiento'),
};

// ---------------------------------------------------------------------------
// tweak list
// ---------------------------------------------------------------------------

export const WINDOWS_TWEAKS: Tweak[] = [
  dwordTweak({
    id: 'animations_off',
    name: 'Desactivar animaciones',
    description:
      'Aplica el modo "Ajustar para obtener el mejor rendimiento" en efectos visuales. Desactiva animaciones de ventanas, menús y transiciones del sistema, lo que hace la interfaz más ligera y rápida.',
    category: 'windows',
    impact: 'LOW',
    risk: 'SAFE',
    key: 'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects',
    valueName: 'VisualEffects',
    target: 2,
  }),
  dwordTweak({
    id: 'menu_delay',
    name: 'Reducir retardo de menús',
    description:
      'Reduce a cero el retraso de apertura de los menús contextuales y del menú Inicio. Hace que la interfaz responda de forma inmediata.',
    category: 'windows',
    impact: 'LOW',
    risk: 'SAFE',
    key: 'HKEY_CURRENT_USER\\Control Panel\\Desktop',
    valueName: 'MenuShowDelay',
    target: 0,
  }),
  dwordTweak({
    id: 'background_apps_off',
    name: 'Bloquear aplicaciones en segundo plano',
    description:
      'Impide que las aplicaciones de la Microsoft Store se ejecuten y consuman recursos en segundo plano cuando no las estás usando. Ahorra RAM, batería y datos.',
    category: 'windows',
    impact: 'MEDIUM',
    risk: 'SAFE',
    key: 'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Background Access',
    valueName: 'GlobalUserDisabled',
    target: 1,
  }),
  dwordTweak({
    id: 'storage_sense',
    name: 'Activar Storage Sense',
    description:
      'Activa Storage Sense, la herramienta de Windows que elimina automáticamente archivos temporales y vacía la papelera de reciclaje de forma periódica.',
    category: 'windows',
    impact: 'LOW',
    risk: 'SAFE',
    key: 'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\StorageSense\\Parameters\\StoragePolicy\\01',
    valueName: 'Enable',
    target: 1,
  }),
  dwordTweak({
    id: 'game_dvr_off',
    name: 'Desactivar Game DVR (grabación)',
    description:
      'Desactiva la grabación en segundo plano de Game DVR, que captura continuamente imágenes de la pantalla y consume recursos de GPU, disco y RAM mientras juegas.',
    category: 'gaming',
    impact: 'MEDIUM',
    risk: 'SAFE',
    key: 'HKEY_CURRENT_USER\\System\\GameConfigStore',
    valueName: 'GameDVR_Enabled',
    target: 0,
  }),
  dwordTweak({
    id: 'fullscreen_opt_off',
    name: 'Desactivar optimizaciones de pantalla completa',
    description:
      'Evita que Windows aplique optimizaciones a juegos en pantalla completa, un cambio conocido por reducir stuttering y problemas de sincronización en varios juegos.',
    category: 'gaming',
    impact: 'MEDIUM',
    risk: 'SAFE',
    key: 'HKEY_CURRENT_USER\\System\\GameConfigStore',
    valueName: 'GameDVR_FSEBehavior',
    target: 2,
  }),
  multiDwordTweak({
    id: 'game_mode_on',
    name: 'Activar Game Mode y Game Bar',
    description:
      'Habilita Game Mode y su inicio automático, priorizando recursos para el juego en primer plano y reduciendo las interrupciones del sistema mientras juegas.',
    category: 'gaming',
    impact: 'LOW',
    risk: 'SAFE',
    values: [
      { key: 'HKEY_CURRENT_USER\\Software\\Microsoft\\GameBar', valueName: 'AutoGameModeEnabled', target: 1 },
      { key: 'HKEY_CURRENT_USER\\Software\\Microsoft\\GameBar', valueName: 'AllowAutoGameMode', target: 1 },
    ],
  }),
  dwordTweak({
    id: 'network_throttle',
    name: 'Eliminar límite de ancho de banda del sistema',
    description:
      'Aumenta el límite de red que Windows reserva para QoS a su máximo, liberando ancho de banda para juegos y aplicaciones en red. Requiere administrador.',
    category: 'gaming',
    impact: 'MEDIUM',
    risk: 'ADVANCED',
    scope: 'system',
    requiresAdmin: true,
    key: 'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile',
    valueName: 'NetworkThrottlingIndex',
    target: 0xffffffff,
  }),
  dwordTweak({
    id: 'system_responsiveness',
    name: 'Maximizar prioridad a juegos/aplicaciones',
    description:
      'Reduce la reserva de tiempo de CPU que Windows destina a tareas del sistema (20% -> 0%), otorgando más ciclos de CPU a la aplicación en primer plano. Requiere administrador.',
    category: 'gaming',
    impact: 'HIGH',
    risk: 'ADVANCED',
    scope: 'system',
    requiresAdmin: true,
    key: 'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile',
    valueName: 'SystemResponsiveness',
    target: 0,
  }),
  powerHighPerfTweak,
  dwordTweak({
    id: 'disable_tips',
    name: 'Ocultar sugerencias y consejos',
    description:
      'Desactiva las sugerencias, anuncios y "consejos" que Windows muestra en configuraciones, menú Inicio y notificaciones.',
    category: 'privacy',
    impact: 'LOW',
    risk: 'SAFE',
    key: 'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager',
    valueName: 'SubscribedContent-338389Enabled',
    target: 0,
  }),
  dwordTweak({
    id: 'ads_off',
    name: 'Desactivar anuncios personalizados',
    description:
      'Desactiva el identificador de publicidad que Windows usa para mostrar anuncios personalizados. No elimina anuncios en sí, pero detiene la personalización.',
    category: 'privacy',
    impact: 'LOW',
    risk: 'SAFE',
    key: 'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo',
    valueName: 'Enabled',
    target: 0,
  }),
  multiDwordTweak({
    id: 'activity_history_off',
    name: 'Limpiar y desactivar historial de actividad',
    description:
      'Desactiva la Línea de tiempo (Timeline) y el historial de actividad que Windows guarda sobre los programas y archivos que usas.',
    category: 'privacy',
    impact: 'MEDIUM',
    risk: 'SAFE',
    values: [
      { key: 'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Privacy\\ActivityHistory', valueName: 'EnabledActivityFeed', target: 0 },
      { key: 'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Privacy\\ActivityHistory', valueName: 'PublishToActivityFeed', target: 0 },
    ],
  }),
  dwordTweak({
    id: 'error_reporting_off',
    name: 'Desactivar informes de errores',
    description:
      'Evita que Windows envíe informes de errores a Microsoft. Los errores seguirán ocurriendo igual; solo se detiene la generación de informes. Requiere administrador.',
    category: 'windows',
    impact: 'LOW',
    risk: 'CAUTION',
    scope: 'system',
    requiresAdmin: true,
    key: 'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\Windows Error Reporting',
    valueName: 'Disabled',
    target: 1,
  }),
  dwordTweak({
    id: 'telemetry_basic',
    name: 'Telemetría: Nivel Básico',
    description:
      'Limita los datos de diagnóstico que Windows envía a Microsoft al nivel "Básico", reduciendo la cantidad de información recopilada. Es un cambio de directiva reversible. Requiere administrador.',
    category: 'privacy',
    impact: 'MEDIUM',
    risk: 'CAUTION',
    scope: 'system',
    requiresAdmin: true,
    key: 'HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection',
    valueName: 'AllowTelemetry',
    target: 1,
  }),
];

export function getTweaks(category?: TweakCategory): Tweak[] {
  const list = WINDOWS_TWEAKS.filter((t) => !category || t.category === category);
  return [...list].sort((a, b) => a.name.localeCompare(b.name));
}

export function getTweak(id: string): Tweak | undefined {
  return WINDOWS_TWEAKS.find((t) => t.id === id);
}

export interface TweakView {
  id: string;
  name: string;
  description: string;
  category: TweakCategory;
  impact: TweakImpact;
  risk: TweakRisk;
  scope: 'user' | 'system';
  requiresAdmin: boolean;
  applied: boolean;
}

export async function getTweaksView(category?: TweakCategory): Promise<TweakView[]> {
  const list = getTweaks(category);
  return Promise.all(
    list.map(async (t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      impact: t.impact,
      risk: t.risk,
      scope: t.scope,
      requiresAdmin: t.requiresAdmin,
      applied: await t.check().catch(() => false),
    }))
  );
}

// ---------------------------------------------------------------------------
// non-persistent quick actions
// ---------------------------------------------------------------------------

export async function optimizeMemory(): Promise<{ ok: boolean; message: string }> {
  const ps = `
$type = Add-Type -MemberDefinition '[DllImport("kernel32.dll")] public static extern bool SetProcessWorkingSetSize(IntPtr proc, int min, int max);' -Name Win32API -Namespace GT -PassThru
$count = 0
Get-Process | Where-Object { $_.Id -ne $PID -and $_.SessionId -eq (Get-Process -Id $PID).SessionId -and $_.MainWindowTitle -eq $null } | ForEach-Object {
  try { $type::SetProcessWorkingSetSize($_.Handle, -1, -1); $count++ } catch {}
}
$count
`;
  const r = await runPS(ps, 30000);
  const count = r.stdout.trim();
  if (r.code === 0) {
    log('SUCCESS', 'performance', `Optimización de memoria completada (${count} procesos)`);
    return { ok: true, message: `${count} procesos optimizados.` };
  }
  log('ERROR', 'performance', `Optimización de memoria falló (code=${r.code}): ${r.stderr}`);
  return { ok: false, message: 'No se pudo optimizar la memoria.' };
}

export async function emptyStandbyList(): Promise<{ ok: boolean; message: string }> {
  const ps = `
Add-Type -Namespace GT -Name Mem -MemberDefinition @'
[DllImport("kernel32.dll", SetLastError = true)]
public static extern bool SetSystemInformation(int SystemInformationClass, ref int SystemInformation, int SystemInformationLength);
'@
$i = 0
[GT.Mem]::SetSystemInformation(76, [ref]$i, 4)
'OK'
`;
  const r = await runPS(ps, 20000);
  const out = r.stdout.trim();
  const ok = out === 'OK';
  log(ok ? 'SUCCESS' : 'WARN', 'performance', ok ? 'Lista de memoria en espera vaciada' : 'No se pudo vaciar la memoria en espera');
  return { ok, message: ok ? 'Memoria en espera liberada. El sistema puede reclamarla al instante.' : 'No se pudo vaciar la memoria en espera.' };
}

export async function runWindowsMaintenance(): Promise<{ ok: boolean; message: string }> {
  const tasks = [
    '\\Microsoft\\Windows\\Defrag\\ScheduledDefrag',
    '\\Microsoft\\Windows\\Defrag\\ScheduledDefragWeekly',
    '\\Microsoft\\Windows\\DiskDiagnostic\\Microsoft-Windows-DiskDiagnosticDataCollector',
  ];
  const results: string[] = [];
  for (const t of tasks) {
    const r = await runPS(`schtasks /Run /TN ${t}`, 20000);
    results.push(`${t} ${r.code === 0 ? 'OK' : 'sin tarea'}`);
  }
  log('SUCCESS', 'maintenance', 'Mantenimiento de Windows ejecutado');
  return { ok: true, message: results.join(' | ') };
}

// ---------------------------------------------------------------------------
// Gaming mode
// ---------------------------------------------------------------------------

export interface GamingModeResult {
  active: boolean;
  applied: string[];
  failed: string[];
  messages: string[];
}

export async function activateGamingMode(opts: {
  applyPowerPlan: boolean;
  memoryClean: boolean;
}): Promise<GamingModeResult> {
  const ids = ['game_dvr_off', 'fullscreen_opt_off', 'game_mode_on'];
  if (opts.applyPowerPlan) ids.push('power_high_performance');
  const applied: string[] = [];
  const failed: string[] = [];
  const messages: string[] = [];

  for (const id of ids) {
    const t = getTweak(id);
    if (!t) continue;
    try {
      const isApplied = await t.check();
      if (isApplied) {
        messages.push(`${t.name}: ya estaba activo.`);
        applied.push(id);
        continue;
      }
      const r = await t.apply();
      if (r.applied) {
        applied.push(id);
        messages.push(`${t.name}: aplicado.`);
      } else {
        failed.push(id);
        messages.push(`${t.name}: ${r.message || 'falló'}.`);
      }
    } catch (e: any) {
      failed.push(id);
      messages.push(`${t.name}: ${e.message}`);
    }
  }

  if (opts.memoryClean) {
    const m = await optimizeMemory();
    messages.push(`Memoria: ${m.message}`);
  }

  const active = applied.length > 0;
  log('SUCCESS', 'gaming', active ? 'Gaming Mode activado' : 'Gaming Mode: no se pudo activar');
  return { active, applied, failed, messages };
}

export async function deactivateGamingMode(): Promise<GamingModeResult> {
  const ids = ['game_dvr_off', 'fullscreen_opt_off', 'game_mode_on', 'power_high_performance'];
  const applied: string[] = [];
  const failed: string[] = [];
  const messages: string[] = [];
  for (const id of ids) {
    const t = getTweak(id);
    if (!t) continue;
    try {
      const r = await t.revert();
      if (r.reverted) {
        applied.push(id);
        messages.push(`${t.name}: revertido.`);
      } else {
        failed.push(id);
        messages.push(`${t.name}: ${r.message || 'nada que revertir'}.`);
      }
    } catch (e: any) {
      failed.push(id);
      messages.push(`${t.name}: ${e.message}`);
    }
  }
  return { active: false, applied, failed, messages };
}

export async function getGamingModeState(): Promise<{ active: boolean; applied: string[] }> {
  const ids = ['game_dvr_off', 'fullscreen_opt_off', 'game_mode_on'];
  const applied: string[] = [];
  for (const id of ids) {
    const t = getTweak(id);
    if (t && (await t.check())) applied.push(id);
  }
  return { active: applied.length > 0, applied };
}

export async function setHighPerfPowerPlanEnabled(enabled: boolean) {
  if (enabled) {
    const r = await powerHighPerfTweak.apply();
    return r;
  }
  return powerHighPerfTweak.revert();
}
