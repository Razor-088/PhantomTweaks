import * as fs from 'fs';
import { ensureFile } from './paths';
import { getTweaks, getTweak } from './windowsTweaks';
import { getMonitorSnapshot, getOverview } from './systemInfo';
import { runPS, runPSJson } from './ps';
import { isAdmin } from './admin';
import { listStartupEntries } from './startupManager';
import { log } from './logging';

const HIGH_PERF_GUID = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c';

export interface OptMetric {
  cpuPct: number;
  ramPct: number;
  ramUsedGb: number;
  gpuPct: number | null;
  processes: number;
  workingSetGb: number;
}

export type OptStatus = 'apply' | 'applied' | 'already' | 'requires-admin' | 'not-needed' | 'skipped-risky' | 'failed';

export interface OptAction {
  id: string;
  name: string;
  description: string;
  category: 'windows' | 'gaming' | 'privacy';
  impact: 'LOW' | 'MEDIUM' | 'HIGH';
  risk: 'SAFE' | 'CAUTION' | 'ADVANCED';
  scope: 'user' | 'system';
  requiresAdmin: boolean;
  status: OptStatus;
  reasonKey?: string;
  reason?: string;
}

export interface DiagnosisFact {
  id: string;
  value: string;
  status: 'ok' | 'warn' | 'info';
}

export interface OptimizationReport {
  actions: OptAction[];
  diagnosis: DiagnosisFact[];
  baseline: OptMetric;
  requiresRestart: boolean;
  tempBytes: number;
  warnings: string[];
  appliedCount: number;
  alreadyCount: number;
  requiresAdminCount: number;
  notNeededCount: number;
  failedCount: number;
  executedAt: string;
}

export interface OptimizationPreview {
  actions: OptAction[];
  diagnosis: DiagnosisFact[];
  baseline: OptMetric;
  availableCount: number;
  riskyAvailable: number;
  already: number;
  requiresAdmin: number;
  notNeeded: number;
  tempBytes: number;
  lastRun: string | null;
  isAdmin: boolean;
}

export type OptProgress = { step: string; message: string };
export type OptProgressSink = (p: OptProgress) => void;

/** Cambios con riesgo; solo se aplican si el usuario los confirma. */
const RISKY_OPT = new Set([
  'power_high_performance',
  'telemetry_basic',
  'error_reporting_off',
  'network_throttle',
  'system_responsiveness',
]);

async function measure(): Promise<OptMetric> {
  const snap = await getMonitorSnapshot();
  const p = await runPSJson<{ Count: number; WS: number }>(
    `$p = Get-Process -ErrorAction SilentlyContinue; [PSCustomObject]@{ Count = @($p).Count; WS = [math]::Round((($p | Measure-Object WorkingSet64 -Sum).Sum)/1GB, 2) }`
  );
  return {
    cpuPct: Math.round(snap.cpu.pct),
    ramPct: Math.round(snap.ram.pct),
    ramUsedGb: Math.round(snap.ram.usedGb * 10) / 10,
    gpuPct: snap.gpu.pct != null ? Math.round(snap.gpu.pct) : null,
    processes: p?.Count ?? 0,
    workingSetGb: p?.WS ?? 0,
  };
}

async function tempBytes(): Promise<number> {
  const r = await runPS(
    `$t = 0
foreach ($d in @($env:TEMP, "$env:SystemRoot\Temp")) {
  if (Test-Path $d) { $t += (Get-ChildItem $d -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum }
}
[long]$t`,
    45000
  );
  const first = r.stdout.trim().split(/\r?\n/)[0] || '0';
  const v = Number(first);
  return isNaN(v) ? 0 : v;
}

function fmtBytes(n: number): string {
  if (n >= 1024 * 1024 * 1024) return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}

async function getActiveScheme(): Promise<{ guid: string; name: string } | null> {
  const r = await runPS(`powercfg /getactivescheme`, 15000);
  const m = r.stdout.match(/\(([0-9a-fA-F-]{36})\)/);
  if (!m) return null;
  const guid = m[1].toLowerCase();
  const r2 = await runPS(`powercfg /query ${guid}`, 15000);
  const m2 = r2.stdout.match(/Scheme GUID: .*?\((.*?)\)/s);
  const m3 = r2.stdout.match(/Nombre del plan de energía: (.*)/);
  return { guid, name: m2 ? m2[1].trim() : m3 ? m3[1].trim() : guid };
}

function lastRunFile() {
  return ensureFile('optimization-last.json');
}

function getLastRun(): string | null {
  try {
    const d = JSON.parse(fs.readFileSync(lastRunFile(), 'utf-8'));
    return d?.executedAt || null;
  } catch {
    return null;
  }
}

function setLastRun() {
  fs.writeFileSync(lastRunFile(), JSON.stringify({ executedAt: new Date().toLocaleString('es-ES') }), 'utf-8');
}

async function classifyTweaks(opts: {
  includeRisky: boolean;
  admin: boolean;
  diskFreeGb: number | null;
  activeScheme: string | null;
}): Promise<OptAction[]> {
  const tweaks = getTweaks();
  const actions: OptAction[] = [];
  for (const t of tweaks) {
    const applied = await t.check().catch(() => false);
    let status: OptStatus;
    let reasonKey: string | undefined;
    let reason: string | undefined;

    if (applied) {
      status = 'already';
      reasonKey = 'optimization.reason.already';
      reason = 'Ya está aplicado.';
    } else if (t.requiresAdmin && !opts.admin) {
      status = 'requires-admin';
      reasonKey = 'optimization.reason.requiresAdmin';
      reason = 'Requiere ejecutar PhantomTweaks como administrador.';
    } else if (t.risk !== 'SAFE' && !opts.includeRisky) {
      status = 'skipped-risky';
      reasonKey = 'optimization.reason.skippedRisky';
      reason = 'Cambio con riesgo; solo se aplica si lo confirmas.';
    } else if (t.id === 'power_high_performance' && opts.activeScheme === HIGH_PERF_GUID) {
      status = 'not-needed';
      reasonKey = 'optimization.reason.notNeeded.power';
      reason = 'El plan de energía activo ya es Alto rendimiento.';
    } else if (t.id === 'storage_sense' && opts.diskFreeGb != null && opts.diskFreeGb >= 50) {
      status = 'not-needed';
      reasonKey = 'optimization.reason.notNeeded.disk';
      reason = `El disco tiene ${Math.round(opts.diskFreeGb)} GB libres (suficiente).`;
    } else {
      status = 'apply';
      reasonKey = 'optimization.reason.apply';
      reason = 'Se recomienda aplicar.';
    }

    actions.push({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      impact: t.impact,
      risk: t.risk,
      scope: t.scope,
      requiresAdmin: t.requiresAdmin,
      status,
      reasonKey,
      reason,
    });
  }
  return actions;
}

async function buildDiagnosis(admin: boolean): Promise<DiagnosisFact[]> {
  const facts: DiagnosisFact[] = [];
  try {
    const o = await getOverview();
    facts.push({ id: 'windows', value: `${o.windows.productName} (${o.windows.displayVersion}, build ${o.windows.build})`, status: 'info' });
    facts.push({ id: 'cpu', value: `${o.cpu.name} · ${o.cpu.cores} núcleos / ${o.cpu.threads} hilos`, status: 'info' });
    facts.push({ id: 'ram', value: `${Math.round(o.ram.totalGb)} GB (${Math.round(o.ram.pct)}% en uso)`, status: 'info' });
    if (o.gpus[0]) facts.push({ id: 'gpu', value: o.gpus[0].name, status: 'info' });
  } catch {
    /* ignore */
  }

  facts.push({ id: 'admin', value: admin ? 'Sí' : 'No', status: admin ? 'ok' : 'warn' });

  try {
    const scheme = await getActiveScheme();
    if (scheme) {
      const isHighPerf = scheme.guid === HIGH_PERF_GUID;
      facts.push({ id: 'powerPlan', value: scheme.name, status: isHighPerf ? 'ok' : 'warn' });
    }
  } catch {
    /* ignore */
  }

  try {
    const gm = getTweak('game_mode_on');
    const on = gm ? await gm.check().catch(() => false) : false;
    facts.push({ id: 'gameMode', value: on ? 'Activado' : 'Desactivado', status: on ? 'ok' : 'warn' });
  } catch {
    /* ignore */
  }

  try {
    const entries = await listStartupEntries();
    const enabled = entries.filter((e) => e.enabled).length;
    facts.push({ id: 'startupApps', value: `${enabled}`, status: enabled <= 8 ? 'ok' : 'warn' });
  } catch {
    /* ignore */
  }

  try {
    const snap = await getMonitorSnapshot();
    facts.push({ id: 'processes', value: `${(await measure()).processes}`, status: 'info' });
    facts.push({ id: 'cpuUsage', value: `${Math.round(snap.cpu.pct)}%`, status: 'info' });
    facts.push({ id: 'ramUsage', value: `${Math.round(snap.ram.pct)}%`, status: 'info' });
    if (snap.gpu.pct != null) facts.push({ id: 'gpuUsage', value: `${Math.round(snap.gpu.pct)}%`, status: 'info' });
  } catch {
    /* ignore */
  }

  try {
    const o = await getOverview();
    const d = o.disks[0];
    if (d) {
      const low = d.pct >= 85;
      facts.push({ id: 'disk', value: `${Math.round(d.freeGb)} GB libres de ${Math.round(d.totalGb)} GB`, status: low ? 'warn' : 'ok' });
    }
  } catch {
    /* ignore */
  }

  try {
    const t = await tempBytes();
    facts.push({ id: 'temp', value: fmtBytes(t), status: t > 500 * 1024 * 1024 ? 'warn' : 'ok' });
  } catch {
    /* ignore */
  }

  return facts;
}

export async function scanOptimization(): Promise<OptimizationPreview> {
  const admin = await isAdmin();
  const baseline = await measure();
  const [overview, scheme] = await Promise.all([getOverview().catch(() => null), getActiveScheme()]);
  const diskFreeGb = overview && overview.disks[0] ? overview.disks[0].freeGb : null;
  const actions = await classifyTweaks({ includeRisky: false, admin, diskFreeGb, activeScheme: scheme?.guid ?? null });
  const temp = await tempBytes().catch(() => 0);

  return {
    actions,
    diagnosis: await buildDiagnosis(admin),
    baseline,
    availableCount: actions.filter((a) => a.status === 'apply').length,
    riskyAvailable: actions.filter((a) => a.status === 'apply' && a.risk !== 'SAFE').length,
    already: actions.filter((a) => a.status === 'already').length,
    requiresAdmin: actions.filter((a) => a.status === 'requires-admin').length,
    notNeeded: actions.filter((a) => a.status === 'not-needed').length,
    tempBytes: temp,
    lastRun: getLastRun(),
    isAdmin: admin,
  };
}

export async function runOptimization(
  opts: { includeRisky: boolean },
  onProgress?: OptProgressSink
): Promise<OptimizationReport> {
  const progress = (step: string, message: string) => onProgress?.({ step, message });
  const includeRisky = !!opts.includeRisky;
  const admin = await isAdmin();

  progress('measure', 'Midiendo estado actual del sistema…');
  const baseline = await measure();

  progress('scan', 'Analizando el sistema…');
  const [overview, scheme] = await Promise.all([getOverview().catch(() => null), getActiveScheme()]);
  const diskFreeGb = overview && overview.disks[0] ? overview.disks[0].freeGb : null;
  const actions = await classifyTweaks({ includeRisky, admin, diskFreeGb, activeScheme: scheme?.guid ?? null });
  const warnings: string[] = [];
  let requiresRestart = false;

  const toApply = actions.filter((a) => a.status === 'apply');
  progress('apply', `Aplicando ${toApply.length} cambio${toApply.length === 1 ? '' : 's'}…`);
  for (const a of toApply) {
    const t = getTweak(a.id);
    if (!t) continue;
    try {
      const r = await t.apply();
      if (r.applied) {
        a.status = 'applied';
        if (t.requiresAdmin) requiresRestart = true;
      } else {
        a.status = 'failed';
        warnings.push(`${a.name}: ${r.message || 'No se pudo aplicar.'}`);
      }
    } catch (e: any) {
      a.status = 'failed';
      warnings.push(`${a.name}: ${e.message}`);
    }
  }

  progress('verify', 'Verificando cambios aplicados…');
  for (const a of actions) {
    if (a.status !== 'applied') continue;
    const t = getTweak(a.id);
    if (!t) continue;
    const ok = await t.check().catch(() => false);
    if (!ok) {
      a.status = 'failed';
      warnings.push(`${a.name}: el cambio no se pudo confirmar.`);
    }
  }

  const appliedCount = actions.filter((a) => a.status === 'applied').length;
  const alreadyCount = actions.filter((a) => a.status === 'already').length;
  const requiresAdminCount = actions.filter((a) => a.status === 'requires-admin').length;
  const notNeededCount = actions.filter((a) => a.status === 'not-needed').length;
  const failedCount = actions.filter((a) => a.status === 'failed').length;

  setLastRun();
  progress('done', 'Optimización completada.');
  log('SUCCESS', 'optimization', `Optimización completada: ${appliedCount} aplicados, ${alreadyCount} ya optimizados, ${failedCount} fallidos.`);

  return {
    actions,
    diagnosis: await buildDiagnosis(admin),
    baseline,
    requiresRestart,
    tempBytes: await tempBytes().catch(() => 0),
    warnings,
    appliedCount,
    alreadyCount,
    requiresAdminCount,
    notNeededCount,
    failedCount,
    executedAt: new Date().toLocaleString('es-ES'),
  };
}
