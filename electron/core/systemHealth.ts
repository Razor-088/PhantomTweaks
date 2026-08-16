import { getOverview, getMonitorSnapshot } from './systemInfo';
import { listStartupEntries } from './startupManager';
import { runPS } from './ps';
import { getGamingModeState } from './windowsTweaks';

export type FactorStatus = 'ok' | 'warn' | 'bad';

export interface HealthFactor {
  name: string;
  status: FactorStatus;
  detail: string;
  weight: number;
}

export interface HealthReport {
  score: number;
  label: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
  factors: HealthFactor[];
}

export async function computeHealth(): Promise<HealthReport> {
  const factors: HealthFactor[] = [];
  let score = 100;

  const [overview, snapshot, startup] = await Promise.all([
    getOverview(true).catch(() => null),
    getMonitorSnapshot().catch(() => null),
    listStartupEntries().catch(() => []),
  ]);

  const ram = snapshot?.ram;
  if (ram) {
    if (ram.pct > 90) {
      score -= 25;
      factors.push({ name: 'Memoria RAM', status: 'bad', detail: `Uso muy alto (${ram.pct}%)`, weight: 25 });
    } else if (ram.pct > 75) {
      score -= 10;
      factors.push({ name: 'Memoria RAM', status: 'warn', detail: `Uso elevado (${ram.pct}%)`, weight: 10 });
    } else {
      factors.push({ name: 'Memoria RAM', status: 'ok', detail: `Uso normal (${ram.pct}%)`, weight: 0 });
    }
  }

  const disk = overview?.disks?.find((d) => d.drive === 'C:') || overview?.disks?.[0];
  if (disk) {
    if (disk.freeGb < 5 || disk.pct > 90) {
      score -= 25;
      factors.push({ name: 'Espacio en disco', status: 'bad', detail: `Solo ${disk.freeGb} GB libres en ${disk.drive}`, weight: 25 });
    } else if (disk.freeGb < 15 || disk.pct > 80) {
      score -= 8;
      factors.push({ name: 'Espacio en disco', status: 'warn', detail: `${disk.freeGb} GB libres en ${disk.drive}`, weight: 8 });
    } else {
      factors.push({ name: 'Espacio en disco', status: 'ok', detail: `${disk.freeGb} GB libres en ${disk.drive}`, weight: 0 });
    }
  }

  if (startup) {
    const enabled = startup.filter((s) => s.enabled).length;
    if (enabled > 12) {
      score -= 10;
      factors.push({ name: 'Aplicaciones de inicio', status: 'warn', detail: `${enabled} apps al inicio`, weight: 10 });
    } else if (enabled > 5) {
      score -= 5;
      factors.push({ name: 'Aplicaciones de inicio', status: 'warn', detail: `${enabled} apps al inicio`, weight: 5 });
    } else {
      factors.push({ name: 'Aplicaciones de inicio', status: 'ok', detail: `${enabled} apps al inicio`, weight: 0 });
    }
  }

  const cpu = snapshot?.cpu;
  if (cpu && cpu.pct > 85) {
    score -= 8;
    factors.push({ name: 'Uso de CPU', status: 'warn', detail: `CPU al ${Math.round(cpu.pct)}%`, weight: 8 });
  } else if (cpu) {
    factors.push({ name: 'Uso de CPU', status: 'ok', detail: `CPU al ${Math.round(cpu.pct)}%`, weight: 0 });
  }

  const gpu = snapshot?.gpu;
  if (gpu && gpu.pct != null && gpu.pct > 95) {
    score -= 5;
    factors.push({ name: 'Uso de GPU', status: 'warn', detail: `GPU al ${Math.round(gpu.pct)}%`, weight: 5 });
  }

  const cpuTemp = cpu?.temp;
  if (cpuTemp != null) {
    if (cpuTemp > 90) {
      score -= 15;
      factors.push({ name: 'Temperatura CPU', status: 'bad', detail: `${cpuTemp} °C`, weight: 15 });
    } else if (cpuTemp > 80) {
      score -= 6;
      factors.push({ name: 'Temperatura CPU', status: 'warn', detail: `${cpuTemp} °C`, weight: 6 });
    } else {
      factors.push({ name: 'Temperatura CPU', status: 'ok', detail: `${cpuTemp} °C`, weight: 0 });
    }
  }

  const gpuTemp = gpu?.temp;
  if (gpuTemp != null) {
    if (gpuTemp > 90) {
      score -= 10;
      factors.push({ name: 'Temperatura GPU', status: 'bad', detail: `${gpuTemp} °C`, weight: 10 });
    } else if (gpuTemp > 80) {
      score -= 5;
      factors.push({ name: 'Temperatura GPU', status: 'warn', detail: `${gpuTemp} °C`, weight: 5 });
    } else {
      factors.push({ name: 'Temperatura GPU', status: 'ok', detail: `${gpuTemp} °C`, weight: 0 });
    }
  }

  if (overview) {
    if (overview.uptimeHours > 168) {
      score -= 8;
      factors.push({ name: 'Reinicio pendiente', status: 'warn', detail: `Encendido ${overview.uptimeHours} horas`, weight: 8 });
    } else {
      factors.push({ name: 'Reinicio pendiente', status: 'ok', detail: `Encendido ${overview.uptimeHours} h`, weight: 0 });
    }
  }

  const pending = await runPS(
    `$p = Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager' -Name PendingFileRenameOperations -ErrorAction SilentlyContinue; if ($p) { 'yes' } else { 'no' }`,
    10000
  );
  if (pending.stdout.trim() === 'yes') {
    score -= 6;
    factors.push({ name: 'Reinicio pendiente', status: 'warn', detail: 'Hay operaciones pendientes que requieren reinicio', weight: 6 });
  }

  const gaming = await getGamingModeState().catch(() => ({ active: false, applied: [] }));
  if (gaming.active) {
    factors.push({ name: 'Gaming Mode', status: 'ok', detail: 'Optimizaciones de juego activas', weight: 0 });
  }

  score = Math.max(5, Math.min(100, Math.round(score)));
  const label: HealthReport['label'] = score >= 90 ? 'EXCELLENT' : score >= 70 ? 'GOOD' : score >= 45 ? 'FAIR' : 'POOR';
  return { score, label, factors };
}
