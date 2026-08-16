import { runPS } from './ps';
import { log } from './logging';

export type StartupImpact = 'LOW' | 'MEDIUM' | 'HIGH';

export interface StartupEntry {
  id: string;
  name: string;
  command: string;
  location: string;
  type: 'registry' | 'folder';
  enabled: boolean;
  impact: StartupImpact;
  publisher: string;
}

const HIGH_IMPACT: string[] = ['discord', 'steam', 'epic', 'overwolf', 'razer', 'curseforge', 'battle.net', 'playstation', 'xbox', 'galaxy', 'rockstar'];
const MEDIUM_IMPACT: string[] = ['chrome', 'edge', 'firefox', 'spotify', 'dropbox', 'onedrive', 'google', 'notion', 'slack', 'telegram', 'skype', 'zoom', 'discord', 'obs', 'vlc', 'spotify'];

function inferImpact(name: string): StartupImpact {
  const n = name.toLowerCase();
  if (HIGH_IMPACT.some((k) => n.includes(k))) return 'HIGH';
  if (MEDIUM_IMPACT.some((k) => n.includes(k))) return 'MEDIUM';
  return 'LOW';
}

function inferPublisher(name: string, command: string): string {
  const c = command.toLowerCase();
  const known: Array<[string, string]> = [
    ['discord', 'Discord Inc.'],
    ['steam', 'Valve Corp.'],
    ['spotify', 'Spotify AB'],
    ['chrome', 'Google LLC'],
    ['edge', 'Microsoft'],
    ['dropbox', 'Dropbox Inc.'],
    ['onedrive', 'Microsoft'],
    ['obs', 'OBS Project'],
    ['slack', 'Slack Technologies'],
    ['zoom', 'Zoom Video Communications'],
    ['google', 'Google LLC'],
    ['telegram', 'Telegram FZ-LLC'],
    ['notion', 'Notion Labs'],
  ];
  for (const [k, p] of known) {
    if (c.includes(k)) return p;
  }
  if (name && name.length > 1) {
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
  return 'Desconocido';
}

const STARTUP_APPROVED_KEYS: Record<string, string> = {
  'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run': 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run',
  'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run': 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run',
  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run': 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run',
};

function entryId(name: string, location: string): string {
  const b = Buffer.from(`${name}\u0000${location}`).toString('base64url');
  return b;
}

function decodeId(id: string): { name: string; location: string } {
  try {
    const s = Buffer.from(id, 'base64url').toString('utf-8');
    const [name, location] = s.split('\u0000');
    return { name, location };
  } catch {
    return { name: id, location: '' };
  }
}

export async function listStartupEntries(): Promise<StartupEntry[]> {
  const script = `
$entries = @()
$approvedMap = @{}
$runKeys = @(
  'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
  'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run',
  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
)
$approvedKeys = @{
  'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' = 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run'
  'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run' = 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run'
  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run'
}
foreach ($k in $runKeys) {
  $p = Get-ItemProperty -Path $k -ErrorAction SilentlyContinue
  if ($p) {
    $p.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' } | ForEach-Object {
      $entries += [PSCustomObject]@{ name=$_.Name; command=$_.Value; location=$k; type='registry'; enabled=$true }
    }
  }
  $aKey = $approvedKeys[$k]
  if ($aKey) {
    $ap = Get-ItemProperty -Path $aKey -ErrorAction SilentlyContinue
    if ($ap) {
      $ap.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' } | ForEach-Object {
        $bytes = $_.Value
        if ($bytes -is [byte[]] -and $bytes.Length -gt 0) {
          $approvedMap[$_.Name + "|" + $k] = ($bytes[0] -ne 3)
        }
      }
    }
  }
}
foreach ($e in $entries) {
  $key = $e.name + "|" + $e.location
  if ($approvedMap.ContainsKey($key)) { $e.enabled = $approvedMap[$key] }
}
$folders = @("$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs\\Startup", "$env:ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\Startup")
foreach ($f in $folders) {
  if (Test-Path $f) {
    Get-ChildItem $f -File -ErrorAction SilentlyContinue | ForEach-Object {
      $entries += [PSCustomObject]@{ name=$_.BaseName; command=$_.FullName; location=$f; type='folder'; enabled=$true }
    }
  }
}
$entries | ConvertTo-Json -Depth 3 -Compress
`;
  const r = await runPS(script, 20000);
  if (!r.stdout.trim()) return [];
  try {
    const parsed = JSON.parse(r.stdout.trim());
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    return arr.map((e: any) => ({
      id: entryId(e.name, e.location),
      name: e.name || 'Desconocido',
      command: e.command || '',
      location: (e.location || '').replace('\\\\', '\\'),
      type: (e.type as 'registry') || 'folder',
      enabled: e.enabled !== false,
      impact: inferImpact(e.name || ''),
      publisher: inferPublisher(e.name || '', e.command || ''),
    }));
  } catch {
    return [];
  }
}

export async function setStartupEnabled(id: string, enabled: boolean): Promise<{ ok: boolean; error?: string }> {
  const { name, location } = decodeId(id);
  if (!location) return { ok: false, error: 'Ubicación de inicio desconocida.' };

  const approvedKey = STARTUP_APPROVED_KEYS[location];
  if (!approvedKey) {
    return { ok: false, error: 'Esta entrada no admite activar/desactivar de forma segura.' };
  }

  const psKey = approvedKey;
  const ps = `
try {
  if (-not (Test-Path '${psKey}')) { New-Item -Path '${psKey}' -Force | Out-Null }
  $b = New-Object byte[] 8
  $b[0] = ${enabled ? '0x02' : '0x03'}
  Set-ItemProperty -Path '${psKey}' -Name '${name.replace(/'/g, "''")}' -Value $b -ErrorAction Stop
  'OK'
} catch { $_.Exception.Message }
`;
  const r = await runPS(ps, 15000);
  if (r.stdout.trim() === 'OK') {
    log('SUCCESS', 'startup', `${enabled ? 'Activada' : 'Desactivada'} entrada de inicio: ${name}`);
    return { ok: true };
  }
  return { ok: false, error: r.stdout.trim() || 'Error desconocido.' };
}
