import { runPS } from './ps';
import { log } from './logging';

export interface ServiceRow {
  name: string;
  displayName: string;
  status: 'running' | 'stopped';
  startMode: string;
  description: string;
  path: string | null;
  important: boolean;
}

const CRITICAL_SERVICES = new Set([
  'rpcss',
  'DcomLaunch',
  'RpcEptMapper',
  'PlugPlay',
  'Power',
  'EventLog',
  'EventSystem',
  'Schedule',
  'Winmgmt',
  'gpsvc',
  'ProfSvc',
  'UserManager',
  'Wlansvc',
  'Dhcp',
  'Dnscache',
  'NlaSvc',
  'AudioSrv',
  'Audiosrv',
  'FontCache',
  'SessionEnv',
  'TermService',
  'winlogon',
  'LanmanServer',
  'LanmanWorkstation',
  'Themes',
  'SENS',
  'SysMain',
  'CryptSvc',
  'BITS',
  'wuauserv',
  'TrustedInstaller',
  'UsoSvc',
  'DoSvc',
  'AppXSvc',
  'StateRepository',
  'ClipSVC',
  'StorSvc',
  'TimeBrokerSvc',
  'CscService',
  'MapsBroker',
  'WpnService',
  'TiledDataModelSvc',
]);

export function isImportantService(name: string): boolean {
  const n = name.toLowerCase();
  if (CRITICAL_SERVICES.has(n)) return true;
  if (n.startsWith('EventSystem') || n.startsWith('BITS')) return true;
  return false;
}

export async function listServices(): Promise<ServiceRow[]> {
  const r = await runPS(
    `Get-CimInstance Win32_Service | Select-Object Name,DisplayName,State,StartMode,Description,PathName | ConvertTo-Json -Depth 3 -Compress`,
    20000
  );
  if (!r.stdout.trim()) return [];
  try {
    const parsed = JSON.parse(r.stdout.trim());
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    return arr.map((s: any) => ({
      name: s.Name || '',
      displayName: s.DisplayName || s.Name || '',
      status: (s.State || '').toLowerCase() === 'running' ? 'running' as const : 'stopped' as const,
      startMode: (s.StartMode || '').toLowerCase(),
      description: (s.Description || '').trim(),
      path: s.PathName || null,
      important: isImportantService(s.Name || ''),
    }));
  } catch {
    return [];
  }
}

export interface ServiceControlResult {
  ok: boolean;
  error?: string;
}

export async function controlService(
  name: string,
  action: 'start' | 'stop' | 'restart',
  startup: 'auto' | 'manual' | 'disabled' | null
): Promise<ServiceControlResult> {
  const important = isImportantService(name);
  const cmd = action === 'start' ? 'Start-Service' : action === 'stop' ? 'Stop-Service' : 'Restart-Service';
  let script = `try { ${cmd} -Name '${name.replace(/'/g, "''")}' -Force -ErrorAction Stop; 'OK' } catch { $_.Exception.Message }`;
  if (action === 'stop') {
    script = `try { Stop-Service -Name '${name.replace(/'/g, "''")}' -Force -ErrorAction Stop; 'OK' } catch { $_.Exception.Message }`;
  }

  const r = await runPS(script, 20000);
  if (r.stdout.trim() !== 'OK') {
    return { ok: false, error: r.stdout.trim() || 'La operación falló. Puede requerir permisos de administrador.' };
  }
  log('SUCCESS', 'service', `${action}: ${name}`);

  if (startup) {
    const startupMap: Record<string, string> = {
      auto: 'Automatic',
      manual: 'Manual',
      disabled: 'Disabled',
    };
    const mode = startupMap[startup];
    if (mode) {
      const c = await runPS(
        `try { Set-Service -Name '${name.replace(/'/g, "''")}' -StartupType ${mode} -ErrorAction Stop; 'OK' } catch { $_.Exception.Message }`,
        15000
      );
      if (c.stdout.trim() !== 'OK') {
        return { ok: true, error: `El servicio se ${action === 'start' ? 'inició' : 'detuvo'}, pero no se pudo cambiar el tipo de inicio: ${c.stdout.trim()}` };
      }
      log('SUCCESS', 'service', `Tipo de inicio de ${name} -> ${mode}`);
    }
  }
  return { ok: true };
}
