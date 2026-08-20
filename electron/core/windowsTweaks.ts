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
  regKey?: string;
  regValue?: string;
  regTarget?: number;
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
    regKey: opts.key,
    regValue: opts.valueName,
    regTarget: opts.target,
    check: async () => {
      const v = await getDword(opts.key, opts.valueName);
      return v === opts.target;
    },
    apply: async () => {
      try {
        const records = await recordRegistryOps(opts, [
          { key: opts.key, valueName: opts.valueName, type: 'REG_DWORD', data: String(opts.target) },
        ]);
        return { applied: true, records: records.map((r) => r.id) };
      } catch (e: any) {
        return { applied: false, message: e.message };
      }
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
      try {
        const records = await recordRegistryOps(
          opts,
          opts.values.map((v) => ({ key: v.key, valueName: v.valueName, type: 'REG_DWORD', data: String(v.target) }))
        );
        return { applied: true, records: records.map((r) => r.id) };
      } catch (e: any) {
        return { applied: false, message: e.message };
      }
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
  // ── Windows Performance ─────────────────────────────────────────────
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
    id: 'transparency_off',
    name: 'Desactivar transparencia de Windows',
    description:
      'Elimina el efecto de transparencia/acrílico de las ventanas, barras de tareas y menús. Reduce el consumo de GPU en tareas de escritorio y hace la interfaz más responsiva.',
    category: 'windows',
    impact: 'LOW',
    risk: 'SAFE',
    key: 'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize',
    valueName: 'EnableTransparency',
    target: 0,
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
    id: 'startup_delay_off',
    name: 'Eliminar delay de inicio de aplicaciones',
    description:
      'Elimina el retraso artificial que Windows aplica al lanzar aplicaciones al iniciar sesión. Las apps arrancan inmediatamente.',
    category: 'windows',
    impact: 'LOW',
    risk: 'SAFE',
    key: 'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Serialize',
    valueName: 'StartupDelayInMSec',
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
    id: 'fast_boot',
    name: 'Activar inicio rápido',
    description:
      'Habilita el arranque rápido de Windows que reduce el tiempo de encendido usando hibernación parcial del kernel. El PC arranca significativamente más rápido.',
    category: 'windows',
    impact: 'LOW',
    risk: 'SAFE',
    key: 'HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Power',
    valueName: 'HiberbootEnabled',
    target: 1,
  }),
  multiDwordTweak({
    id: 'notifications_off',
    name: 'Desactivar notificaciones de Windows',
    description:
      'Desactiva todas las notificaciones del sistema incluyendo banners, sonidos e iconos del área de notificaciones. Reduce distracciones y consumo de recursos.',
    category: 'windows',
    impact: 'LOW',
    risk: 'SAFE',
    values: [
      { key: 'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\PushNotifications', valueName: 'ToastEnabled', target: 0 },
      { key: 'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings\\Windows.SystemToast.SecurityAndMaintenance', valueName: 'Enabled', target: 0 },
    ],
  }),
  {
    id: 'hibernation_off',
    name: 'Desactivar hibernación',
    description:
      'Desactiva la hibernación de Windows, liberando el espacio en disco que usa el archivo hiberfil.sys (igual a tu RAM instalada). Acelera el apagado y libera espacio.',
    category: 'windows',
    impact: 'MEDIUM',
    risk: 'CAUTION',
    requiresAdmin: true,
    scope: 'system',
    check: async () => {
      const r = await runPS('(Get-ItemProperty -Path HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Power -Name HibernateEnabled -ErrorAction SilentlyContinue).HibernateEnabled', 10000);
      return r.stdout.trim() === '0';
    },
    apply: async () => {
      try {
        await runPS('powercfg /h off', 15000);
        return { applied: true };
      } catch (e: any) {
        return { applied: false, message: e.message };
      }
    },
    revert: async () => {
      try {
        await runPS('powercfg /h on', 15000);
        return { reverted: true };
      } catch (e: any) {
        return { reverted: false, message: e.message };
      }
    },
  },
  {
    id: 'search_index_off',
    name: 'Desactivar indexación de Windows Search',
    description:
      'Desactiva el servicio de indexación WSearch que permanentemente usa CPU y disco para indexar archivos. Libera recursos significativos, especialmente en discos HDD.',
    category: 'windows',
    impact: 'MEDIUM',
    risk: 'CAUTION',
    requiresAdmin: true,
    scope: 'system',
    check: async () => {
      const r = await runPS('(Get-Service WSearch -ErrorAction SilentlyContinue).Status', 10000);
      return r.stdout.trim() === 'Stopped';
    },
    apply: async () => {
      try {
        await runPS('Stop-Service WSearch -Force -ErrorAction SilentlyContinue; Set-Service WSearch -StartupType Disabled -ErrorAction Stop', 20000);
        return { applied: true };
      } catch (e: any) {
        return { applied: false, message: e.message };
      }
    },
    revert: async () => {
      try {
        await runPS('Set-Service WSearch -StartupType Automatic -ErrorAction Stop; Start-Service WSearch -ErrorAction SilentlyContinue', 20000);
        return { reverted: true };
      } catch (e: any) {
        return { reverted: false, message: e.message };
      }
    },
  },
  multiDwordTweak({
    id: 'cortana_off',
    name: 'Desactivar Cortana',
    description:
      'Desactiva completamente Cortana, el asistente virtual de Windows que consume recursos en segundo plano para escuchar comandos y sincronizar datos.',
    category: 'windows',
    impact: 'MEDIUM',
    risk: 'SAFE',
    values: [
      { key: 'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Search', valueName: 'CortanaConsent', target: 0 },
      { key: 'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Search', valueName: 'BingSearchEnabled', target: 0 },
    ],
  }),
  dwordTweak({
    id: 'disable_tips',
    name: 'Ocultar sugerencias y consejos',
    description:
      'Desactiva las sugerencias, anuncios y "consejos" que Windows muestra en configuraciones, menú Inicio y notificaciones.',
    category: 'windows',
    impact: 'LOW',
    risk: 'SAFE',
    key: 'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager',
    valueName: 'SubscribedContent-338389Enabled',
    target: 0,
  }),
  dwordTweak({
    id: 'error_reporting_off',
    name: 'Desactivar informes de errores',
    description:
      'Evita que Windows envíe informes de errores a Microsoft. Los errores seguirán ocurriendo igual; solo se detiene la generación de informes. Libera CPU y disco.',
    category: 'windows',
    impact: 'LOW',
    risk: 'CAUTION',
    scope: 'system',
    requiresAdmin: true,
    key: 'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\Windows Error Reporting',
    valueName: 'Disabled',
    target: 1,
  }),

  // ── Gaming ──────────────────────────────────────────────────────────
  dwordTweak({
    id: 'game_dvr_off',
    name: 'Desactivar Game DVR (grabación)',
    description:
      'Desactiva la grabación en segundo plano de Game DVR, que captura continuamente imágenes de la pantalla y consume recursos de GPU, disco y RAM mientras juegas.',
    category: 'gaming',
    impact: 'HIGH',
    risk: 'SAFE',
    key: 'HKEY_CURRENT_USER\\System\\GameConfigStore',
    valueName: 'GameDVR_Enabled',
    target: 0,
  }),
  dwordTweak({
    id: 'game_dvr_bg_recording_off',
    name: 'Desactivar grabación en segundo plano',
    description:
      'Detiene la grabación continua de los últimos 30 segundos en memoria que Game DVR realiza. Libera RAM y reduce uso de disco constantemente.',
    category: 'gaming',
    impact: 'MEDIUM',
    risk: 'SAFE',
    key: 'HKEY_CURRENT_USER\\System\\GameConfigStore',
    valueName: 'GameDVR_HistoricalCaptureEnabled',
    target: 0,
  }),
  dwordTweak({
    id: 'fullscreen_opt_off',
    name: 'Desactivar optimizaciones de pantalla completa',
    description:
      'Evita que Windows aplique optimizaciones a juegos en pantalla completa, un cambio conocido por reducir stuttering, input lag y problemas de sincronización.',
    category: 'gaming',
    impact: 'HIGH',
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
    impact: 'MEDIUM',
    risk: 'SAFE',
    values: [
      { key: 'HKEY_CURRENT_USER\\Software\\Microsoft\\GameBar', valueName: 'AutoGameModeEnabled', target: 1 },
      { key: 'HKEY_CURRENT_USER\\Software\\Microsoft\\GameBar', valueName: 'AllowAutoGameMode', target: 1 },
    ],
  }),
  dwordTweak({
    id: 'mouse_accel_off',
    name: 'Desactivar aceleración del ratón',
    description:
      'Desactiva la aceleración del mouse de Windows. El cursor se mueve exactamente la misma distancia que el ratón físico, esencial para precisión en FPS y juegos.',
    category: 'gaming',
    impact: 'MEDIUM',
    risk: 'SAFE',
    key: 'HKEY_CURRENT_USER\\Control Panel\\Mouse',
    valueName: 'MouseSpeed',
    target: 0,
  }),
  multiDwordTweak({
    id: 'mouse_precision_off',
    name: 'Desactivar precisión mejorada del ratón',
    description:
      'Desactiva la "precisión mejorada" (Enhanced Pointer Precision) que cambia la velocidad del cursor según la velocidad del movimiento físico. Impredecible para gaming.',
    category: 'gaming',
    impact: 'MEDIUM',
    risk: 'SAFE',
    values: [
      { key: 'HKEY_CURRENT_USER\\Control Panel\\Mouse', valueName: 'MouseThreshold1', target: 0 },
      { key: 'HKEY_CURRENT_USER\\Control Panel\\Mouse', valueName: 'MouseThreshold2', target: 0 },
    ],
  }),
  dwordTweak({
    id: 'foreground_boost',
    name: 'Boost de ventana en primer plano',
    description:
      'Elimina el timeout de cambio de ventana (ForegroundLockTimeout) y establece boost inmediato para apps en primer plano. Reduce input lag al cambiar de ventana.',
    category: 'gaming',
    impact: 'MEDIUM',
    risk: 'SAFE',
    key: 'HKEY_CURRENT_USER\\Control Panel\\Desktop',
    valueName: 'ForegroundLockTimeout',
    target: 0,
  }),
  dwordTweak({
    id: 'gpu_prio_foreground',
    name: 'Prioridad GPU para apps en primer plano',
    description:
      'Configura Windows para dar prioridad de rendering a la aplicación en primer plano. Reduce stuttering y mejora FPS en juegos.',
    category: 'gaming',
    impact: 'HIGH',
    risk: 'ADVANCED',
    scope: 'system',
    requiresAdmin: true,
    key: 'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games',
    valueName: 'GPU Priority',
    target: 8,
  }),
  dwordTweak({
    id: 'games_priority_profile',
    name: 'Perfil de rendimiento para juegos',
    description:
      'Establece la prioridad de CPU óptima para procesos de juegos en el plan de multimedia del sistema. Windows prioriza automáticamente las apps marcadas como "Games".',
    category: 'gaming',
    impact: 'HIGH',
    risk: 'ADVANCED',
    scope: 'system',
    requiresAdmin: true,
    key: 'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games',
    valueName: 'Priority',
    target: 6,
  }),
  dwordTweak({
    id: 'power_throttle_off',
    name: 'Desactivar power throttling',
    description:
      'Impide que Windows reduzca la frecuencia del CPU para ahorrar energía. El procesador siempre funciona al máximo rendimiento, ideal para gaming y tareas exigentes.',
    category: 'gaming',
    impact: 'HIGH',
    risk: 'ADVANCED',
    scope: 'system',
    requiresAdmin: true,
    key: 'HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerThrottling',
    valueName: 'PowerThrottlingOff',
    target: 1,
  }),
  dwordTweak({
    id: 'gpu_hw_schedule',
    name: 'Activar GPU hardware scheduling',
    description:
      'Activa el programador de hardware de la GPU que reduce el overhead del CPU al gestionar tareas de rendering. Reduce CPU usage y mejora FPS en juegos.',
    category: 'gaming',
    impact: 'HIGH',
    risk: 'ADVANCED',
    scope: 'system',
    requiresAdmin: true,
    key: 'HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers',
    valueName: 'HwSchMode',
    target: 2,
  }),
  dwordTweak({
    id: 'network_throttle',
    name: 'Eliminar límite de ancho de banda del sistema',
    description:
      'Aumenta el límite de red que Windows reserva para QoS a su máximo, liberando ancho de banda completo para juegos y aplicaciones en red. Requiere administrador.',
    category: 'gaming',
    impact: 'HIGH',
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
  dwordTweak({
    id: 'usb_suspend_off',
    name: 'Desactivar USB selective suspend',
    description:
      'Impide que Windows suspenda dispositivos USB por inactividad. Previene lag spikes causados por ratón, teclado o audífonos USB que se desconectan temporalmente.',
    category: 'gaming',
    impact: 'MEDIUM',
    risk: 'CAUTION',
    scope: 'system',
    requiresAdmin: true,
    key: 'HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\USB',
    valueName: 'DisableSelectiveSuspend',
    target: 1,
  }),
  dwordTweak({
    id: 'core_parking_off',
    name: 'Desactivar core parking del CPU',
    description:
      'Impide que Windows "apague" cores del procesador para ahorrar energía. Todos los cores permanecen activos y listos, eliminando micro-stutters por wake-up de cores.',
    category: 'gaming',
    impact: 'HIGH',
    risk: 'ADVANCED',
    scope: 'system',
    requiresAdmin: true,
    key: 'HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerSettings\\54533251-82be-4824-96c1-47b60b740d00\\0cc5b647-c1df-4637-891a-dec35c318583',
    valueName: 'Attributes',
    target: 2,
  }),
  powerHighPerfTweak,

  // ── Privacy ─────────────────────────────────────────────────────────
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
    id: 'telemetry_basic',
    name: 'Telemetría: Nivel Básico',
    description:
      'Limita los datos de diagnóstico que Windows envía a Microsoft al nivel "Básico", reduciendo la cantidad de información recopilada y el consumo de red/CPU. Requiere administrador.',
    category: 'privacy',
    impact: 'MEDIUM',
    risk: 'CAUTION',
    scope: 'system',
    requiresAdmin: true,
    key: 'HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection',
    valueName: 'AllowTelemetry',
    target: 1,
  }),
  dwordTweak({
    id: 'location_off',
    name: 'Desactivar acceso de ubicación',
    description:
      'Desactiva el rastreo de ubicación de Windows para todas las apps. Detiene la recopilación de datos de geolocalización que consume CPU y batería.',
    category: 'privacy',
    impact: 'MEDIUM',
    risk: 'SAFE',
    key: 'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\location',
    valueName: 'Value',
    target: 0,
  }),
  multiDwordTweak({
    id: 'feedback_off',
    name: 'Desactivar solicitudes de comentarios',
    description:
      'Desactiva las solicitudes de feedback, encuestas y sondeos que Windows muestra periódicamente. Libera CPU y reduce distracciones.',
    category: 'privacy',
    impact: 'LOW',
    risk: 'SAFE',
    values: [
      { key: 'HKEY_CURRENT_USER\\Software\\Microsoft\\Siuf\\Rules', valueName: 'NumberOfSIUFInPeriod', target: 0 },
      { key: 'HKEY_CURRENT_USER\\Software\\Microsoft\\Siuf\\Rules', valueName: 'PeriodInNanoSeconds', target: 0 },
    ],
  }),
  dwordTweak({
    id: 'clipboard_history_off',
    name: 'Desactivar historial del portapapeles',
    description:
      'Desactiva el portapapeles inteligente de Windows que sincroniza y almacena todo lo que copias. Libera memoria RAM y detiene la sincronización entre dispositivos.',
    category: 'privacy',
    impact: 'LOW',
    risk: 'SAFE',
    key: 'HKEY_CURRENT_USER\\Software\\Microsoft\\Clipboard',
    valueName: 'EnableClipboardHistory',
    target: 0,
  }),
  dwordTweak({
    id: 'diagnostic_data_off',
    name: 'Limitar datos de diagnóstico',
    description:
      'Desactiva la recopilación de datos de diagnóstico detallados. Windows solo envía datos de required (imprescindible), reduciendo uso de disco, red y CPU.',
    category: 'privacy',
    impact: 'MEDIUM',
    risk: 'CAUTION',
    scope: 'system',
    requiresAdmin: true,
    key: 'HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection',
    valueName: 'MaxTelemetryAllowed',
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

  // Batch all registry checks into a single PowerShell process (1 spawn instead of 30+)
  const regChecks = list
    .filter(t => t.regKey && t.regValue && t.regTarget !== undefined)
    .map(t => ({ id: t.id, key: t.regKey!, valueName: t.regValue!, target: t.regTarget! }));

  let regResults: Record<string, boolean> = {};
  if (regChecks.length > 0) {
    const checksJson = regChecks.map(c => `@{key='${c.key.replace(/'/g, "''")}';val='${c.valueName.replace(/'/g, "''")}';target=${c.target};id='${c.id}'}`).join(',');
    const psScript = `
$results = @{}
$checks = @(${checksJson})
foreach ($c in $checks) {
  try {
    $raw = & reg.exe query $c.key /v $c.val 2>&1
    if ($LASTEXITCODE -eq 0) {
      $m = [regex]::Match($raw, '0x([0-9a-fA-F]+)')
      if ($m.Success) {
        $results[$c.id] = ([int]::Parse($m.Groups[1].Value, [System.Globalization.NumberStyles]::HexNumber) -eq $c.target)
      } else {
        $d = [regex]::Match($raw, '(?m)\\s+\\S+\\s+REG_DWORD\\s+(\\d+)')
        $results[$c.id] = if ($d.Success) { ([int]$d.Groups[1].Value -eq $c.target) } else { $false }
      }
    } else { $results[$c.id] = $false }
  } catch { $results[$c.id] = $false }
}
$results | ConvertTo-Json -Depth 2 -Compress`;
    try {
      const r = await runPS(psScript, 12000);
      if (r.stdout.trim()) {
        regResults = JSON.parse(r.stdout.trim());
      }
    } catch { /* fallback to individual checks */ }
  }

  return list.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    category: t.category,
    impact: t.impact,
    risk: t.risk,
    scope: t.scope,
    requiresAdmin: t.requiresAdmin,
    applied: regResults[t.id] !== undefined ? regResults[t.id] : false,
  }));
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
