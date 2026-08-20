import { useEffect, useRef, useState } from 'react';
import {
  Wifi, WifiOff, Globe, Route, RefreshCcw, RotateCw, Undo2, ShieldX,
  ListOrdered, Network as NetworkIcon, Terminal, Rocket, CheckCircle2,
  AlertTriangle, Timer,
} from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useAppStore } from '../store/useAppStore';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Spinner } from '../components/ui/Spinner';
import { ConfirmDialog } from '../components/ui/Modal';
import type { NetInfo, ConsoleLine, BoostStatus } from '../lib/types';

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-gborder/40 last:border-0 gap-3">
      <span className="text-[11px] uppercase tracking-wider text-gdim shrink-0">{label}</span>
      <span className="font-mono text-[12.5px] text-gmuted text-right break-all">{value}</span>
    </div>
  );
}

export default function Network() {
  const [info, setInfo] = useState<NetInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [lines, setLines] = useState<ConsoleLine[]>([]);
  const [busyTool, setBusyTool] = useState<string | null>(null);
  const [host, setHost] = useState('8.8.8.8');
  const [confirmReset, setConfirmReset] = useState(false);
  const consoleRef = useRef<HTMLDivElement>(null);
  const toast = useAppStore((s) => s.toast);
  const { t } = useI18n();

  const [boost, setBoost] = useState<BoostStatus | null>(null);
  const [boostBusy, setBoostBusy] = useState(false);

  const toggleBoost = async () => {
    setBoostBusy(true);
    const r = boost?.network.active
      ? await api.boost.networkStop().catch(() => null)
      : await api.boost.networkStart().catch(() => null);
    setBoostBusy(false);
    if (!r) {
      toast('error', t('common.error'), t('network.commError'));
      return;
    }
    setBoost(r);
    const ping =
      r.network.pingBefore != null && r.network.pingAfter != null
        ? ` ${t('network.boost.pingLabel')} ${r.network.pingBefore} ms → ${r.network.pingAfter} ms.`
        : '';
    if (r.network.active) {
      toast('success', t('network.boost.activated'), `${r.network.details.join(' · ')}${ping}`);
    } else {
      toast('info', t('network.boost.deactivated'), `${r.network.details.join(' · ') || t('network.boost.restored')}${ping}`);
    }
    if (r.network.warnings.length) {
      toast('info', t('network.boost.warnings'), r.network.warnings.join(' · '));
    }
  };

  const loadInfo = async () => {
    setLoading(true);
    const i = await api.network.info().catch(() => null);
    setInfo(i);
    setLoading(false);
  };

  useEffect(() => {
    loadInfo();
    api.boost.status().then(setBoost).catch(() => undefined);
    const off = api.on('network:output', (o) => {
      setLines((prev) => [...prev.slice(-400), { ...o, time: new Date().toLocaleTimeString() }]);
    });
    return off;
  }, []);

  useEffect(() => {
    consoleRef.current?.scrollTo({ top: consoleRef.current.scrollHeight });
  }, [lines]);

  const appendInfo = (text: string) => {
    setLines((prev) => [...prev.slice(-400), { kind: 'info', text, time: new Date().toLocaleTimeString() }]);
  };

  const runTool = async (id: string, fn: () => Promise<void>) => {
    setBusyTool(id);
    await fn().catch((e) => appendInfo(t('network.tools.error', { message: e.message })));
    setBusyTool(null);
  };

  const lineColor = (kind: string) => {
    if (kind === 'err') return 'text-gdanger';
    if (kind === 'info') return 'text-ginfo';
    if (kind === 'exit') return 'text-gdim';
    return 'text-gmuted';
  };

  return (
    <div className="max-w-[1200px] mx-auto">
      <PageHeader title={t('network.title')} subtitle={t('network.subtitle')} />

      {/* Network Boost Hero */}
      <Card
        variant="glow"
        title={
          <span className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gaccent/10 flex items-center justify-center">
              <Rocket size={16} className="text-gaccent" />
            </div>
            {t('network.boost.title')}
          </span>
        }
        subtitle={t('network.boost.subtitle')}
        className={`relative overflow-hidden mb-4 ${boost?.network.active ? 'border-gaccent/40 shadow-[0_0_30px_-8px_rgba(0,255,136,0.15)]' : ''}`}
      >
        {boost?.network.active && <div className="scanline" />}
        <div className="flex flex-col lg:flex-row lg:items-center gap-5">
          <div className="flex-1 min-w-0">
            {boost?.network.active ? (
              <div className="space-y-2.5">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <StatusBadge tone="active" dot>{t('network.boost.active')}</StatusBadge>
                  {boost.network.pingBefore != null && boost.network.pingAfter != null && (
                    <span className="flex items-center gap-1.5 text-[12.5px] text-gmuted">
                      <Timer size={14} className="text-gaccent" />
                      {t('network.boost.pingLabel')} <span className="font-mono text-gdim line-through">{boost.network.pingBefore} ms</span>
                      <span className="text-gaccent font-mono font-bold">→ {boost.network.pingAfter} ms</span>
                    </span>
                  )}
                </div>
                <ul className="space-y-1">
                  {boost.network.details.map((d, i) => (
                    <li key={i} className="flex items-start gap-2 text-[12.5px] text-gmuted">
                      <CheckCircle2 size={14} className="text-gaccent shrink-0 mt-0.5" />
                      {d}
                    </li>
                  ))}
                  {boost.network.warnings.map((w, i) => (
                    <li key={`w${i}`} className="flex items-start gap-2 text-[12.5px] text-gwarn">
                      <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="text-[13px] text-gmuted leading-relaxed">{t('network.boost.description')}</div>
            )}
          </div>
          <div className="shrink-0 flex items-center gap-3">
            {boost?.network.active && (
              <div className="flex items-center gap-1.5 text-[11px] text-gdim">
                <span className="live-dot inline-block w-2 h-2 rounded-full bg-gaccent" />
                {t('network.boost.live')}
              </div>
            )}
            <Button
              size="lg"
              variant={boost?.network.active ? 'outline-danger' : undefined}
              icon={boost?.network.active ? <Undo2 size={16} /> : <Rocket size={16} />}
              loading={boostBusy}
              onClick={toggleBoost}
            >
              {boost?.network.active ? t('network.boost.stop') : t('network.boost.activate')}
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4 stagger">
        {/* Connection Info */}
        <Card title={t('network.info.title')} subtitle={t('network.info.subtitle')}>
          {loading ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : info ? (
            <div>
              <div className="flex items-center gap-3 mb-3">
                {info.status === 'connected' ? (
                  <StatusBadge tone="ok" dot>{t('network.info.connected')}</StatusBadge>
                ) : (
                  <StatusBadge tone="bad" dot>{t('network.info.disconnected')}</StatusBadge>
                )}
                <span className="text-[12px] text-gmuted">{info.interfaceName || '—'}</span>
              </div>
              <InfoRow label={t('network.info.ip')} value={info.ip || '—'} />
              <InfoRow label={t('network.info.gateway')} value={info.gateway || '—'} />
              <InfoRow label={t('network.info.dns')} value={info.dns.join(', ') || '—'} />
              <InfoRow label={t('network.info.mac')} value={info.mac || '—'} />
              <InfoRow label={t('network.info.tcpConnections')} value={String(info.connections)} />
            </div>
          ) : (
            <div className="text-[12px] text-gdim">{t('network.info.failed')}</div>
          )}
        </Card>

        {/* Adapters */}
        <Card title={t('network.adapters.title')} subtitle={t('network.adapters.subtitle')}>
          {loading ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : info && info.adapters.length ? (
            <div className="space-y-2">
              {info.adapters.map((a) => (
                <div key={a.name} className="flex items-center justify-between py-1.5 border-b border-gborder/40 last:border-0 gap-2">
                  <div className="min-w-0">
                    <div className="text-[12.5px] text-gmuted truncate">{a.name}</div>
                    <div className="text-[10.5px] text-gdim font-mono">{a.ipv4 || t('performance.noIp')}</div>
                  </div>
                  <div className="text-right shrink-0">
                    {a.status === 'Up' ? (
                      <StatusBadge tone="ok" dot>{t('network.adapters.up')}</StatusBadge>
                    ) : (
                      <StatusBadge tone="muted">{t('network.adapters.down')}</StatusBadge>
                    )}
                    {a.speedMbps && <div className="text-[10px] text-gdim font-mono mt-0.5">{a.speedMbps >= 1000 ? `${a.speedMbps / 1000} Gbps` : `${a.speedMbps} Mbps`}</div>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[12px] text-gdim flex items-center gap-2">
              <WifiOff size={14} /> {t('network.adapters.empty')}
            </div>
          )}
        </Card>

        {/* Tools */}
        <Card title={t('network.tools.title')} subtitle={t('network.tools.subtitle')}>
          <div className="grid grid-cols-2 gap-2 stagger">
            <Button variant="secondary" size="sm" icon={<Globe size={13} />} loading={busyTool === 'ping'} onClick={() => runTool('ping', () => api.network.run('ping', host))}>
              {t('network.tools.ping')}
            </Button>
            <Button variant="secondary" size="sm" icon={<Route size={13} />} loading={busyTool === 'traceroute'} onClick={() => runTool('traceroute', () => api.network.run('traceroute', host))}>
              {t('network.tools.traceroute')}
            </Button>
            <Button variant="secondary" size="sm" icon={<RefreshCcw size={13} />} loading={busyTool === 'flush'} onClick={() => runTool('flush', () => api.network.flushDns())}>
              {t('network.tools.flushDns')}
            </Button>
            <Button variant="secondary" size="sm" icon={<RotateCw size={13} />} loading={busyTool === 'renew'} onClick={() => runTool('renew', () => api.network.renew())}>
              {t('network.tools.renew')}
            </Button>
            <Button variant="secondary" size="sm" icon={<Undo2 size={13} />} loading={busyTool === 'release'} onClick={() => runTool('release', () => api.network.release())}>
              {t('network.tools.release')}
            </Button>
            <Button variant="outline-danger" size="sm" icon={<ShieldX size={13} />} onClick={() => setConfirmReset(true)}>
              {t('network.tools.reset')}
            </Button>
            <Button variant="secondary" size="sm" icon={<ListOrdered size={13} />} loading={busyTool === 'adapters'} onClick={() => runTool('adapters', () => api.network.adapters())}>
              {t('network.tools.adapters')}
            </Button>
            <Button variant="secondary" size="sm" icon={<NetworkIcon size={13} />} loading={busyTool === 'connections'} onClick={() => runTool('connections', () => api.network.connections())}>
              {t('network.tools.connections')}
            </Button>
          </div>
          <div className="mt-3">
            <div className="text-[11px] uppercase tracking-wider text-gdim mb-1">{t('network.tools.host')}</div>
            <input
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder={t('network.tools.hostPlaceholder')}
              className="w-full bg-gbase3 border border-gborder rounded-lg px-3 py-2 text-[12.5px] font-mono text-gtext placeholder:text-gdim focus:border-gaccent/50 focus:outline-none transition-colors"
            />
          </div>
        </Card>
      </div>

      {/* Console */}
      <Card
        title={
          <span className="flex items-center gap-2">
            <Terminal size={14} className="text-gaccent" />
            {t('network.console.title')}
          </span>
        }
        subtitle={t('network.console.subtitle')}
        actions={
          <Button variant="ghost" size="sm" icon={<Terminal size={13} />} onClick={() => setLines([])}>
            {t('network.console.clear')}
          </Button>
        }
      >
        <div ref={consoleRef} className="bg-gbase2 rounded-lg border border-gborder p-3 h-56 overflow-y-auto font-mono text-[12px] leading-relaxed">
          {lines.length === 0 && <div className="text-gdim">{t('network.console.empty')}</div>}
          {lines.map((l, i) => (
            <div key={i} className={`whitespace-pre-wrap break-all ${lineColor(l.kind)}`}>
              {l.kind === 'info' ? (
                <>
                  <span className="text-gaccent">[GT]</span> <span className="text-ginfo">{l.text}</span>
                </>
              ) : l.kind === 'exit' ? (
                <span className="text-gdim">[exit: {l.text.trim()}]</span>
              ) : (
                l.text
              )}
            </div>
          ))}
        </div>
      </Card>

      <ConfirmDialog
        open={confirmReset}
        title={t('network.reset.title')}
        danger
        confirmLabel={t('network.reset.confirm')}
        message={
          <>
            {t('network.reset.willRun')} <code className="text-gtext">netsh winsock reset</code> {t('network.reset.and')}{' '}
            <code className="text-gtext">netsh int ip reset</code>
            {t('network.reset.resetsConfig')}
            <br /><br />
            <strong className="text-gwarn">{t('network.reset.requiresAdmin')}</strong>{' '}
            {t('network.reset.effectsNote')}
          </>
        }
        onCancel={() => setConfirmReset(false)}
        onConfirm={async () => {
          setConfirmReset(false);
          setBusyTool('reset');
          const r = await api.network.reset().catch(() => null);
          setBusyTool(null);
          if (r) {
            toast('success', t('network.reset.success'), t('network.reset.successDesc'));
            loadInfo();
          } else {
            toast('error', t('common.error'), t('network.commError'));
          }
        }}
      />
    </div>
  );
}
