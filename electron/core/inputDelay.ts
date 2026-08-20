import { runPS, runPSJson } from './ps';
import { getDword, setDword, regQuery, regSet } from './registry';
import { log } from './logging';
import { isAdmin } from './admin';

export interface InputDelayItem {
  id: string;
  name: string;
  description: string;
  before: string;
  after: string;
  applied: boolean;
  category: 'display' | 'power' | 'mouse' | 'system' | 'network';
}

const MouseAccelPath = 'HKCU:\\Control Panel\\Mouse';
const HagsPath = 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers';
const TimerPath = 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\kernel';
const UsbPath = 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\mouclass\\Parameters';
const ForegroundPath = 'HKCU:\\Control Panel\\Desktop';

const HIGH_PERF = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c';
const ULTRA_PERF = 'e9a42b02-d5df-448d-aa00-03f14749eb61';

async function scanGameMode(): Promise<{ enabled: boolean }> {
  const val = await getDword('HKCU:\\Software\\Microsoft\\GameBar', 'AllowAutoGameMode');
  return { enabled: val === 1 };
}

async function scanHags(): Promise<{ enabled: boolean }> {
  const val = await getDword(HagsPath, 'HwSchMode');
  return { enabled: val === 2 };
}

async function scanMouseAccel(): Promise<{ enabled: boolean }> {
  const val = await regQuery(MouseAccelPath, 'MouseSpeed');
  return { enabled: val.data === '1' };
}

async function scanTimerResolution(): Promise<string> {
  const r = await runPS(`
    $t = & bcdedit /enum 2>$null | Select-String 'platformclock'
    if ($t -and $t.Line -match 'Yes') { 'Enabled' } else { 'Disabled' }
  `, 10000);
  return r.stdout.trim() || 'Disabled';
}

async function scanPowerPlan(): Promise<string> {
  const r = await runPS(`
    $p = powercfg /getactivescheme
    if ($p -match '(\\S+)$') { $matches[1] } else { 'Unknown' }
  `, 8000);
  return r.stdout.trim() || 'Unknown';
}

async function scanForegroundLock(): Promise<string> {
  const val = await regQuery(ForegroundPath, 'ForegroundLockTimeout');
  return val.data || '0';
}

async function scanNagle(): Promise<{ enabled: boolean }> {
  const r = await runPS(`
    $adapters = Get-ChildItem 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces' -ErrorAction SilentlyContinue
    $nagle = $false
    foreach ($a in $adapters) {
      $t = (Get-ItemProperty -Path $a.PSPath -Name 'TcpAckFrequency' -ErrorAction SilentlyContinue).TcpAckFrequency
      $n = (Get-ItemProperty -Path $a.PSPath -Name 'TcpNoDelay' -ErrorAction SilentlyContinue).TcpNoDelay
      if ($t -eq 1 -and $n -eq 1) { $nagle = $true; break }
    }
    if ($nagle) { 'true' } else { 'false' }
  `, 12000);
  return { enabled: r.stdout.trim() === 'true' };
}

async function scanNetworkThrottle(): Promise<{ enabled: boolean }> {
  const val = await getDword('HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile', 'NetworkThrottlingIndex');
  return { enabled: val === 0xffffffff || val === 4294967295 };
}

async function scanSysMainService(): Promise<{ running: boolean }> {
  const r = await runPS(`
    $s = Get-Service -Name 'SysMain' -ErrorAction SilentlyContinue
    if ($s -and $s.Status -eq 'Running') { 'true' } else { 'false' }
  `, 8000);
  return { running: r.stdout.trim() === 'true' };
}

export async function scanInputDelay(): Promise<InputDelayItem[]> {
  const [gameMode, hags, mouse, timerRes, powerPlan, foregroundLock, nagle, netThrottle, sysMain] = await Promise.all([
    scanGameMode(),
    scanHags(),
    scanMouseAccel(),
    scanTimerResolution(),
    scanPowerPlan(),
    scanForegroundLock(),
    scanNagle(),
    scanNetworkThrottle(),
    scanSysMainService(),
  ]);

  const items: InputDelayItem[] = [
    {
      id: 'game_mode',
      name: 'Game Mode',
      description: 'Prioriza recursos del sistema para el juego en primer plano.',
      before: gameMode.enabled ? 'Activado' : 'Desactivado',
      after: 'Activado',
      applied: gameMode.enabled,
      category: 'system',
    },
    {
      id: 'hags',
      name: 'Hardware-Accelerated GPU Scheduling',
      description: 'Reduce la latencia de input al permitir que la GPU gestione su propio planificador.',
      before: hags.enabled ? 'Activado' : 'Desactivado',
      after: 'Activado',
      applied: hags.enabled,
      category: 'display',
    },
    {
      id: 'mouse_accel',
      name: 'Aceleración del ratón',
      description: 'Desactiva la aceleración para mayor consistencia y precisión en apuntado.',
      before: mouse.enabled ? 'Activada' : 'Desactivada',
      after: 'Desactivada',
      applied: !mouse.enabled,
      category: 'mouse',
    },
    {
      id: 'timer_resolution',
      name: 'Alta resolución de temporizador',
      description: 'Mejora la precisión del temporizador del sistema para timings más exactos.',
      before: timerRes,
      after: 'Enabled',
      applied: timerRes === 'Enabled',
      category: 'system',
    },
    {
      id: 'power_plan',
      name: 'Plan de energía alto rendimiento',
      description: 'Activa Alto rendimiento o Ultra rendimiento para máxima respuesta del CPU.',
      before: powerPlan.includes(HIGH_PERF) || powerPlan.includes(ULTRA_PERF) ? 'Alto/Ultra' : 'Equilibrado/Otro',
      after: 'Alto rendimiento',
      applied: powerPlan.includes(HIGH_PERF) || powerPlan.includes(ULTRA_PERF),
      category: 'power',
    },
    {
      id: 'foreground_lock',
      name: 'Bloqueo de ventana activa',
      description: 'Desactiva el delay al cambiar entre ventanas para transiciones instantáneas.',
      before: foregroundLock === '0' ? 'Sin delay' : `Delay: ${foregroundLock}`,
      after: 'Sin delay (0)',
      applied: foregroundLock === '0',
      category: 'system',
    },
    {
      id: 'nagle_off',
      name: 'Nagle Algorithm Off',
      description: 'Desactiva la agrupación de paquetes TCP para reducir latencia en red.',
      before: nagle.enabled ? 'Activo (con delay)' : 'Inactivo (sin delay)',
      after: 'Inactivo (sin delay)',
      applied: !nagle.enabled,
      category: 'network',
    },
    {
      id: 'network_throttle',
      name: 'Network Throttling Off',
      description: 'Desactiva la limitación de ancho de banda multimedia para gaming sin lag.',
      before: netThrottle.enabled ? 'Limitado' : 'Sin límite',
      after: 'Sin límite',
      applied: !netThrottle.enabled,
      category: 'network',
    },
    {
      id: 'sysmain_off',
      name: 'Desactivar Superfetch/SysMain',
      description: 'Detiene el servicio que precarga apps, liberando RAM y reduciendo I/O.',
      before: sysMain.running ? 'Activo' : 'Detenido',
      after: 'Detenido',
      applied: !sysMain.running,
      category: 'system',
    },
  ];

  log('SYSTEM', 'inputDelay', `Escaneo completado: ${items.filter(i => i.applied).length}/${items.length} aplicados`);
  return items;
}

export async function applyInputDelay(itemId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    switch (itemId) {
      case 'game_mode':
        await regSet('HKCU:\\Software\\Microsoft\\GameBar', 'AllowAutoGameMode', 'DWORD', '1');
        log('SUCCESS', 'inputDelay', 'Game Mode activado');
        return { ok: true };

      case 'hags':
        await regSet(HagsPath, 'HwSchMode', 'DWORD', '2');
        log('SUCCESS', 'inputDelay', 'HAGS activado (requiere reinicio)');
        return { ok: true };

      case 'mouse_accel':
        await regSet(MouseAccelPath, 'MouseSpeed', 'String', '0');
        await regSet(MouseAccelPath, 'MouseThreshold1', 'String', '0');
        await regSet(MouseAccelPath, 'MouseThreshold2', 'String', '0');
        log('SUCCESS', 'inputDelay', 'Aceleración del ratón desactivada');
        return { ok: true };

      case 'timer_resolution':
        if (!(await isAdmin())) {
          return { ok: false, error: 'bcdedit requiere privilegios de administrador. Reinicia PhantomTweaks como administrador.' };
        }
        await runPS('bcdedit /set useplatformclock yes', 10000);
        log('SUCCESS', 'inputDelay', 'Alta resolución de temporizador activada');
        return { ok: true };

      case 'power_plan':
        await runPS(`powercfg /setactive ${HIGH_PERF}`, 10000);
        log('SUCCESS', 'inputDelay', 'Plan de energía Alto rendimiento activado');
        return { ok: true };

      case 'foreground_lock':
        await regSet(ForegroundPath, 'ForegroundLockTimeout', 'String', '0');
        log('SUCCESS', 'inputDelay', 'Bloqueo de ventana desactivado');
        return { ok: true };

      case 'nagle_off':
        await runPS(`
          $adapters = Get-ChildItem 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces' -ErrorAction SilentlyContinue
          foreach ($a in $adapters) {
            Set-ItemProperty -Path $a.PSPath -Name 'TcpAckFrequency' -Value 1 -Type DWord -ErrorAction SilentlyContinue
            Set-ItemProperty -Path $a.PSPath -Name 'TcpNoDelay' -Value 1 -Type DWord -ErrorAction SilentlyContinue
            Set-ItemProperty -Path $a.PSPath -Name 'TcpDelAckTicks' -Value 0 -Type DWord -ErrorAction SilentlyContinue
          }
        `, 15000);
        log('SUCCESS', 'inputDelay', 'Nagle Algorithm desactivado');
        return { ok: true };

      case 'network_throttle':
        await runPS(`
          $path = 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile'
          if (!(Test-Path $path)) { New-Item -Path $path -Force | Out-Null }
          Set-ItemProperty -Path $path -Name 'NetworkThrottlingIndex' -Value 0xFFFFFFFF -Type DWord -ErrorAction SilentlyContinue
        `, 10000);
        log('SUCCESS', 'inputDelay', 'Network Throttling desactivado');
        return { ok: true };

      case 'sysmain_off':
        await runPS(`
          Stop-Service -Name 'SysMain' -Force -ErrorAction SilentlyContinue
          Set-Service -Name 'SysMain' -StartupType Disabled -ErrorAction SilentlyContinue
        `, 12000);
        log('SUCCESS', 'inputDelay', 'Superfetch/SysMain desactivado');
        return { ok: true };

      default:
        return { ok: false, error: 'Elemento desconocido.' };
    }
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

export async function applyAllInputDelay(): Promise<{ ok: boolean; applied: number; failed: number; errors: string[] }> {
  const items = await scanInputDelay();
  const pending = items.filter(i => !i.applied);
  let applied = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const item of pending) {
    const r = await applyInputDelay(item.id);
    if (r.ok) applied++;
    else { failed++; if (r.error) errors.push(`${item.name}: ${r.error}`); }
  }

  log('SYSTEM', 'inputDelay', `Apply All: ${applied} aplicados, ${failed} fallidos`);
  return { ok: failed === 0, applied, failed, errors };
}
