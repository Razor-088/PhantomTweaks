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
  category: 'display' | 'power' | 'mouse' | 'system';
}

const MouseAccelPath = 'HKCU:\\Control Panel\\Mouse';
const HagsPath = 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers';
const TimerPath = 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\kernel';

async function scanPollingRate(): Promise<string> {
  const r = await runPS(`
    $kb = Get-CimInstance -ClassName Win32_USBControllerDevice -ErrorAction SilentlyContinue |
      ForEach-Object { [wmi]($_.Dependent) } |
      Where-Object { $_.PNPClass -eq 'Mouse' -or $_.Name -like '*Mouse*' -or $_.Name -like '*HID-compliant*' } |
      Select-Object -First 1 Name
    if ($kb) { 'HID' } else { 'Standard' }
  `, 10000);
  return r.stdout.trim() || 'Standard';
}

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

const HIGH_PERF = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c';
const ULTRA_PERF = 'e9a42b02-d5df-448d-aa00-03f14749eb61';

export async function scanInputDelay(): Promise<InputDelayItem[]> {
  const [gameMode, hags, mouse, timerRes, powerPlan] = await Promise.all([
    scanGameMode(),
    scanHags(),
    scanMouseAccel(),
    scanTimerResolution(),
    scanPowerPlan(),
  ]);

  const items: InputDelayItem[] = [
    {
      id: 'game_mode',
      name: 'Game Mode',
      description: 'Prioriza recursos para el juego en primer plano',
      before: gameMode.enabled ? 'Activado' : 'Desactivado',
      after: 'Activado',
      applied: gameMode.enabled,
      category: 'system',
    },
    {
      id: 'hags',
      name: 'Hardware-Accelerated GPU Scheduling',
      description: 'Reduce latencia de input en juegos con GPU moderna',
      before: hags.enabled ? 'Activado' : 'Desactivado',
      after: 'Activado',
      applied: hags.enabled,
      category: 'display',
    },
    {
      id: 'mouse_accel',
      name: 'Aceleración del ratón',
      description: 'Desactiva la aceleración para mayor consistencia en apuntado',
      before: mouse.enabled ? 'Activada' : 'Desactivada',
      after: 'Desactivada',
      applied: !mouse.enabled,
      category: 'mouse',
    },
    {
      id: 'timer_resolution',
      name: 'Alta resolución de temporizador',
      description: 'Mejora la precisión del temporizador del sistema',
      before: timerRes,
      after: 'Enabled (bcdedit /set useplatformclock yes)',
      applied: timerRes === 'Enabled',
      category: 'system',
    },
    {
      id: 'power_plan',
      name: 'Plan de energía',
      description: 'Activa Alto rendimiento o Ultra rendimiento',
      before: powerPlan,
      after: 'Alto rendimiento',
      applied: powerPlan.includes(HIGH_PERF) || powerPlan.includes(ULTRA_PERF),
      category: 'power',
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

      default:
        return { ok: false, error: 'Elemento desconocido.' };
    }
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}
