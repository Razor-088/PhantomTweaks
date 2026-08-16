import { runPS, runPSJson } from './ps';
import { log } from './logging';
import { getTweaks, getTweak } from './windowsTweaks';

export interface PrivacySummary {
  backgroundApps: Array<{ name: string; status: string }>;
  tweaksStatus: Array<{ id: string; name: string; applied: boolean; risk: string }>;
  historyItems: Array<{ name: string; count: number }>;
}

export async function getPrivacySummary(): Promise<PrivacySummary> {
  const bgApps = await runPSJson<Array<{ Name: string; Status: string }>>(
    `$k = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Background Access\\Applications'; if (Test-Path $k) { Get-ChildItem $k | ForEach-Object { $p = Get-ItemProperty -Path $_.PSPath; [PSCustomObject]@{ Name = $_.PSChildName; Status = $p.Status } } } else { @() }`
  );
  const backgroundApps = (bgApps ? (Array.isArray(bgApps) ? bgApps : [bgApps]) : []).map((a) => ({
    name: a.Name || '',
    status: a.Status != null ? String(a.Status) : '',
  }));

  const tweaksStatus = await Promise.all(
    getTweaks('privacy').map(async (t) => ({
      id: t.id,
      name: t.name,
      applied: await t.check(),
      risk: t.risk,
    }))
  );

  // Count MRU items
  const historyItems: Array<{ name: string; count: number }> = [];
  const keys = [
    ['Documentos recientes', 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\RecentDocs'],
    ['Historial de Ejecutar (RunMRU)', 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\RunMRU'],
    ['Historial del Explorador (TypedPaths)', 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\TypedPaths'],
    ['Búsquedas recientes', 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\WordWheelQuery'],
  ];
  for (const [name, key] of keys) {
    const r = await runPSJson<number>(
      `$k = Get-ItemProperty -Path '${key}' -ErrorAction SilentlyContinue; if ($k) { ($k.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' }).Count } else { 0 }`
    );
    historyItems.push({ name, count: r != null ? Number(r) : 0 });
  }

  return { backgroundApps, tweaksStatus, historyItems };
}

export async function clearHistory(): Promise<{ ok: boolean; message: string }> {
  const ps = `
$ok = @()
$keys = @(
  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\RecentDocs',
  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\RunMRU',
  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\TypedPaths',
  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\WordWheelQuery'
)
foreach ($k in $keys) {
  if (Test-Path $k) {
    $p = Get-ItemProperty -Path $k
    $p.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' } | ForEach-Object {
      Remove-ItemProperty -Path $k -Name $_.Name -ErrorAction SilentlyContinue
    }
    $ok += $k
  }
}
$ok.Count
`;
  const r = await runPS(ps, 20000);
  const count = parseInt(r.stdout.trim(), 10);
  log('SUCCESS', 'privacy', `Historiales limpiados (${count} secciones)`);
  return { ok: true, message: `${count} historiales limpiados.` };
}

export async function listBackgroundApps(): Promise<Array<{ name: string; status: string }>> {
  const s = await getPrivacySummary();
  return s.backgroundApps;
}
