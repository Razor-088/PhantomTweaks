import * as os from 'os';
import { spawn, execFile } from 'child_process';
import { runPS, runPSJson, spawnPS } from './ps';
import { log } from './logging';
import { isAdmin } from './admin';

export interface NetInfo {
  status: string;
  interfaceName: string | null;
  ip: string | null;
  gateway: string | null;
  dns: string[];
  mac: string | null;
  adapters: Array<{ name: string; status: string; speedMbps: number | null; mac: string | null; ipv4: string | null }>;
  connections: number;
}

function firstIPv4() {
  const ifaces = os.networkInterfaces();
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (!addrs) continue;
    const a = addrs.find((x) => x.family === 'IPv4' && !x.internal);
    if (a) return { name, address: a.address, mac: a.mac || null };
  }
  return { name: 'Sin conexión', address: null, mac: null };
}

export async function getNetInfo(): Promise<NetInfo> {
  const primary = firstIPv4();

  let gateway: string | null = null;
  let dns: string[] = [];
  let adapters: NetInfo['adapters'] = [];

  const gw = await runPSJson<{ NextHop: string }>(
    `$r = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Select-Object -First 1; if ($r) { [PSCustomObject]@{ NextHop = $r.NextHop } }`
  );
  gateway = gw?.NextHop || null;

  const dnsR = await runPSJson<Array<{ ServerAddresses: string[] }>>(
    `Get-DnsClientServerAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.ServerAddresses } | Select-Object -First 3 ServerAddresses`
  );
  if (dnsR) {
    const arr = Array.isArray(dnsR) ? dnsR : [dnsR];
    dns = arr.flatMap((d) => d.ServerAddresses || []);
  }

  const ad = await runPSJson<Array<{ Name: string; Status: string; LinkSpeed: string; MacAddress: string; IPAddress: string[] }>>(
    `Get-NetAdapter -ErrorAction SilentlyContinue | Select-Object Name,Status,LinkSpeed,MacAddress,@{n='IPAddress';e={(Get-NetIPAddress -InterfaceIndex $_.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue).IPAddress}}`
  );
  if (ad) {
    const arr = Array.isArray(ad) ? ad : [ad];
    adapters = arr.map((a) => {
      const speedMatch = String(a.LinkSpeed || '').match(/([\d.]+)\s*(Gbps|Mbps)/i);
      let speedMbps: number | null = null;
      if (speedMatch) {
        speedMbps = speedMatch[2].toLowerCase() === 'gbps' ? Math.round(Number(speedMatch[1]) * 1000) : Math.round(Number(speedMatch[1]));
      }
      return {
        name: a.Name || '',
        status: a.Status || '',
        speedMbps,
        mac: a.MacAddress || null,
        ipv4: (a.IPAddress || [])[0] || null,
      };
    });
  }

  const connR = await runPSJson<number>(
    `(Get-NetTCPConnection -ErrorAction SilentlyContinue | Measure-Object).Count`
  );
  const connections = connR != null ? Number(connR) : 0;

  const status = primary.address ? 'connected' : 'disconnected';
  return {
    status,
    interfaceName: primary.name,
    ip: primary.address,
    gateway,
    dns,
    mac: primary.mac,
    adapters,
    connections,
  };
}

export interface ConsoleOutput {
  kind: 'out' | 'err' | 'exit' | 'info';
  text: string;
}

export type ConsoleSink = (out: ConsoleOutput) => void;

async function execStream(cmd: string, args: string[], sink: ConsoleSink, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
      sink({ kind: 'err', text: '\n[PhantomTweaks] La operación excedió el tiempo límite y fue cancelada.\n' });
      sink({ kind: 'exit', text: 'TIMEOUT' });
      resolve();
    }, timeoutMs);

    child.stdout.on('data', (d) => sink({ kind: 'out', text: d.toString() }));
    child.stderr.on('data', (d) => sink({ kind: 'err', text: d.toString() }));
    child.on('close', (code) => {
      clearTimeout(timer);
      if (!timedOut) {
        sink({ kind: 'exit', text: String(code ?? 1) });
        resolve();
      }
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      sink({ kind: 'err', text: `Error: ${e.message}\n` });
      sink({ kind: 'exit', text: 'ERROR' });
      resolve();
    });
  });
}

function safeHost(host: string): string {
  const cleaned = host.trim().replace(/[;&|`$]/g, '');
  if (!cleaned) return '8.8.8.8';
  return cleaned;
}

export async function runNetworkTool(
  tool: 'ping' | 'traceroute',
  host: string,
  sink: ConsoleSink
): Promise<void> {
  const h = safeHost(host);
      sink({ kind: 'info', text: `PhantomTweaks Network > ${tool} ${h}\n` });
  if (tool === 'ping') {
    await execStream('ping.exe', ['-n', '6', h], sink, 30000);
  } else {
    await execStream('tracert.exe', ['-d', '-h', '15', h], sink, 90000);
  }
  log('INFO', 'network', `${tool} ${h}`);
}

export async function flushDns(sink: ConsoleSink): Promise<void> {
  sink({ kind: 'info', text: 'Ejecutando: ipconfig /flushdns\n' });
  await execStream('ipconfig.exe', ['/flushdns'], sink, 15000);
}

export async function renewIp(sink: ConsoleSink): Promise<void> {
  if (!(await isAdmin())) {
    sink({ kind: 'err', text: '[PhantomTweaks] ipconfig /renew requiere privilegios de administrador.\n' });
    sink({ kind: 'exit', text: 'BLOCKED' });
    return;
  }
  sink({ kind: 'info', text: 'Ejecutando: ipconfig /release + /renew (requiere administrador)\n' });
  await execStream('ipconfig.exe', ['/release'], sink, 30000);
  await execStream('ipconfig.exe', ['/renew'], sink, 60000);
}

export async function releaseIp(sink: ConsoleSink): Promise<void> {
  sink({ kind: 'info', text: 'Ejecutando: ipconfig /release\n' });
  await execStream('ipconfig.exe', ['/release'], sink, 30000);
}

export async function resetNetworkStack(sink: ConsoleSink): Promise<void> {
  if (!(await isAdmin())) {
    sink({ kind: 'err', text: '[PhantomTweaks] netsh winsock reset requiere privilegios de administrador. Reinicia PhantomTweaks como administrador.\n' });
    sink({ kind: 'exit', text: 'BLOCKED' });
    return;
  }
  sink({ kind: 'info', text: 'Ejecutando: netsh winsock reset (requiere administrador y reinicio)\n' });
  await execStream('netsh.exe', ['winsock', 'reset'], sink, 30000);
  await execStream('netsh.exe', ['int', 'ip', 'reset'], sink, 30000);
}

export async function listAdapters(sink: ConsoleSink): Promise<void> {
  sink({ kind: 'info', text: 'Adaptadores de red:\n' });
  const child = spawnPS(`Get-NetAdapter | Sort-Object ifIndex | Format-Table -AutoSize`);
  child.child.stdout?.on('data', (d) => sink({ kind: 'out', text: d.toString() }));
  child.child.stderr?.on('data', (d) => sink({ kind: 'err', text: d.toString() }));
  await new Promise((res) => child.child.on('close', res));
  sink({ kind: 'exit', text: '0' });
}

export async function listConnections(sink: ConsoleSink): Promise<void> {
  sink({ kind: 'info', text: 'Conexiones TCP activas:\n' });
  const child = spawnPS(
    `Get-NetTCPConnection -State Established -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,RemoteAddress,RemotePort,@{n='Process';e={(Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName}} | Sort-Object Process | Format-Table -AutoSize`
  );
  child.child.stdout?.on('data', (d) => sink({ kind: 'out', text: d.toString() }));
  child.child.stderr?.on('data', (d) => sink({ kind: 'err', text: d.toString() }));
  await new Promise((res) => child.child.on('close', res));
  sink({ kind: 'exit', text: '0' });
}

export async function getLatency(sink?: ConsoleSink): Promise<number | null> {
  return new Promise((resolve) => {
    execFile('ping.exe', ['-n', '4', '-w', '1500', '8.8.8.8'], { windowsHide: true, timeout: 12000 }, (err, stdout) => {
      if (err || !stdout) return resolve(null);
      const m = stdout.match(/Media = (\d+)ms|Promedio = (\d+)ms|Average = (\d+)ms/);
      const v = m ? Number(m[1] || m[2] || m[3]) : null;
      if (sink) sink({ kind: 'info', text: `Latencia a 8.8.8.8: ${v ?? 'desconocida'} ms\n` });
      resolve(v);
    });
  });
}
