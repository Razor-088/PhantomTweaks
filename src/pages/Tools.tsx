import { useEffect, useRef, useState } from 'react';
import {
  Wrench, Terminal as TerminalIcon, ChevronRight, Play, ShieldAlert, ShieldCheck,
  AlertTriangle, ChevronDown, Rocket, Server, Cpu, RefreshCw, Search,
  Square, RotateCcw, MemoryStick, XCircle, ArrowUpDown,
} from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useAppStore } from '../store/useAppStore';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { ConfirmDialog } from '../components/ui/Modal';
import { PageSpinner, EmptyState } from '../components/ui/Spinner';
import { formatBytes } from '../lib/format';
import type { CommandClass, ConsoleLine, StartupEntry, ServiceRow, ProcessRow } from '../lib/types';

type Tab = 'tools' | 'terminal' | 'system';

const TOOL_DEFS = [
  { id: 'taskmgr', name: 'Administrador de tareas', desc: 'Procesos, rendimiento e inicio' },
  { id: 'devmgmt', name: 'Administrador de dispositivos', desc: 'Hardware y controladores' },
  { id: 'diskmgmt', name: 'Administración de discos', desc: 'Particiones y volúmenes' },
  { id: 'services', name: 'Servicios', desc: 'Administrador de servicios de Windows' },
  { id: 'eventvwr', name: 'Visor de eventos', desc: 'Registros de eventos del sistema' },
  { id: 'control', name: 'Panel de control', desc: 'Configuración clásica de Windows' },
  { id: 'settings', name: 'Configuración de Windows', desc: 'Ajustes de Windows modernos' },
  { id: 'cmd', name: 'Símbolo del sistema', desc: 'Terminal clásico de comandos' },
  { id: 'powershell', name: 'PowerShell', desc: 'Terminal avanzada de Windows' },
  { id: 'regedit', name: 'Editor del registro', desc: 'Editor del registro de Windows' },
  { id: 'msinfo32', name: 'Información del sistema', desc: 'Resumen del hardware y software' },
  { id: 'resmon', name: 'Monitor de recursos', desc: 'Monitorización avanzada de recursos' },
];

const MODE_META: Record<CommandClass, { label: string; tone: 'ok' | 'warn' | 'bad' }> = {
  SAFE: { label: 'SAFE', tone: 'ok' },
  ADMIN: { label: 'ADMIN', tone: 'warn' },
  ADVANCED: { label: 'ADVANCED', tone: 'bad' },
};

const HISTORY_HINTS = [
  'ping 8.8.8.8',
  'ipconfig',
  'systeminfo',
  'netstat -ano',
  'tracert 8.8.8.8',
  'powercfg /energy',
  'whoami',
];

const SYS_TABS = [
  { key: 'startup', labelKey: 'startup.title', icon: Rocket },
  { key: 'services', labelKey: 'services.title', icon: Server },
  { key: 'processes', labelKey: 'processes.title', icon: Cpu },
] as const;

type SysTab = 'startup' | 'services' | 'processes';

export default function Tools() {
  const [tab, setTab] = useState<Tab>('tools');
  const [lines, setLines] = useState<ConsoleLine[]>([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<CommandClass>('SAFE');
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const consoleRef = useRef<HTMLDivElement>(null);
  const toast = useAppStore((s) => s.toast);
  const appInfo = useAppStore((s) => s.appInfo);
  const { t } = useI18n();

  useEffect(() => {
    const off = api.on('terminal:output', (o) => {
      setLines((prev) => [...prev.slice(-500), { ...o, time: new Date().toLocaleTimeString() }]);
    });
    return off;
  }, []);

  useEffect(() => {
    consoleRef.current?.scrollTo({ top: consoleRef.current.scrollHeight });
  }, [lines]);

  const openTool = async (id: string) => {
    const r = await api.app.openTool(id);
    if (r.ok) toast('success', t('tools.opened'));
    else toast('error', t('tools.openFailed'), r.error);
  };

  const classifyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const classify = async (cmd: string) => {
    const c = await api.terminal.classify(cmd);
    setMode(c);
    if (c === 'ADVANCED') {
      const b = await api.terminal.blocked(cmd);
      setBlocked(b);
    } else {
      setBlocked(false);
    }
  };

  const debouncedClassify = (cmd: string) => {
    if (classifyTimer.current) clearTimeout(classifyTimer.current);
    classifyTimer.current = setTimeout(() => classify(cmd), 300);
  };

  const run = async () => {
    const cmd = input.trim();
    if (!cmd || busy) return;
    setBusy(true);
    setBlocked(false);
    await api.terminal.exec(cmd, mode);
    setBusy(false);
    setInput('');
  };

  const lineColor = (kind: string) => {
    if (kind === 'err') return 'text-gdanger';
    if (kind === 'info') return 'text-ginfo';
    if (kind === 'exit') return 'text-gdim';
    return 'text-gmuted';
  };

  return (
    <div className="max-w-[1100px] mx-auto">
      <PageHeader
        title={t('tools.title')}
        subtitle={t('tools.subtitle')}
        actions={
          <div className="flex gap-1.5">
            {(['tools', 'system', 'terminal'] as Tab[]).map((id) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12.5px] font-semibold border transition-all ${
                  tab === id ? 'bg-gaccent-dim text-gaccent border-gaccent/40' : 'text-gmuted border-gborder hover:text-gtext'
                }`}
              >
                {id === 'tools' && <Wrench size={13} />}
                {id === 'system' && <Cpu size={13} />}
                {id === 'terminal' && <TerminalIcon size={13} />}
                {id === 'tools' ? t('tools.tabTools') : id === 'system' ? t('tools.tabSystem') : t('tools.tabTerminal')}
              </button>
            ))}
          </div>
        }
      />

      {tab === 'tools' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {TOOL_DEFS.map((t) => (
            <button
              key={t.id}
              onClick={() => openTool(t.id)}
              className="panel p-4 flex items-center gap-3 text-left hover:border-gaccent/50 hover:bg-gpanel2 transition-all group"
            >
              <div className="w-9 h-9 rounded-lg bg-gaccent-dim border border-gaccent/25 flex items-center justify-center shrink-0">
                <Wrench size={16} className="text-gaccent" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-gtext">{t.name}</div>
                <div className="text-[11px] text-gdim">{t.desc}</div>
              </div>
              <ChevronRight size={15} className="text-gdim group-hover:text-gaccent group-hover:translate-x-0.5 transition-all" />
            </button>
          ))}
        </div>
      )}

      {tab === 'system' && (
        <SystemManagerInline toast={toast} t={t} appInfo={appInfo} />
      )}

      {tab === 'terminal' && (
        <Card title={t('tools.terminalTitle')} subtitle={t('tools.terminalSubtitle')}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[11px] uppercase tracking-wider text-gdim">{t('tools.modeLabel')}</span>
            <div className="flex gap-1.5">
              {(['SAFE', 'ADMIN', 'ADVANCED'] as CommandClass[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-2.5 py-1 rounded-md text-[10.5px] font-bold border transition-all ${
                    mode === m
                      ? m === 'SAFE'
                        ? 'bg-gaccent-dim text-gaccent border-gaccent/40'
                        : m === 'ADMIN'
                          ? 'bg-gwarn/10 text-gwarn border-gwarn/40'
                          : 'bg-gdanger/10 text-gdanger border-gdanger/40'
                      : 'text-gdim border-gborder'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-1.5 text-[11px] text-gdim">
              <ShieldCheck size={12} className="text-gaccent" />
              {t('tools.autoBlock')}
            </div>
          </div>

          <div className="flex items-center gap-2 mb-2">
            <span className="font-mono text-[12px] text-gaccent">PS C:\&gt;</span>
            <input
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                debouncedClassify(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') run();
              }}
              placeholder={t('tools.inputPlaceholder')}
              className="flex-1 bg-gbase3 border border-gborder rounded-lg px-3 py-2 text-[12.5px] font-mono text-gtext placeholder:text-gdim focus:border-gaccent/50 focus:outline-none"
            />
            <button
              onClick={run}
              disabled={!input.trim() || busy}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-gaccent text-gbase font-semibold text-[12.5px] disabled:opacity-50 hover:bg-gaccent3 transition-colors"
            >
              <Play size={13} />
              {t('tools.run')}
            </button>
          </div>

          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <StatusBadge tone={MODE_META[mode].tone}>{MODE_META[mode].label}</StatusBadge>
            {blocked && input.trim() && (
              <span className="flex items-center gap-1.5 text-[11.5px] text-gdanger">
                <ShieldAlert size={13} />
                {t('tools.blocked')}
              </span>
            )}
            {input && !blocked && mode === 'ADVANCED' && (
              <span className="flex items-center gap-1.5 text-[11.5px] text-gwarn">
                <AlertTriangle size={13} />
                {t('tools.advancedWarning')}
              </span>
            )}
          </div>

          <div className="flex gap-1.5 flex-wrap mb-3">
            {HISTORY_HINTS.map((h) => (
              <button
                key={h}
                onClick={() => {
                  setInput(h);
                  classify(h);
                }}
                className="text-[11px] font-mono px-2 py-0.5 rounded bg-gpanel2 border border-gborder text-gdim hover:text-gaccent hover:border-gaccent/40 transition-colors"
              >
                {h}
              </button>
            ))}
          </div>

          <div ref={consoleRef} className="bg-gbase2 rounded-lg border border-gborder p-3 h-[340px] overflow-y-auto font-mono text-[12px] leading-relaxed">
            {lines.length === 0 && <div className="text-gdim">{t('tools.consoleEmpty')}</div>}
            {lines.map((l, i) => (
              <div key={i} className={`whitespace-pre-wrap break-all ${lineColor(l.kind)}`}>
                {l.kind === 'info' ? (
                  <>
                    <span className="text-gaccent">[GT]</span> <span className="text-ginfo">{l.text}</span>
                  </>
                ) : l.kind === 'exit' ? (
                  <span className="text-gdim">[{l.time}] exit: {l.text.trim()}</span>
                ) : (
                  l.text
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function SystemManagerInline({ toast, t, appInfo }: { toast: any; t: (key: string, params?: any) => string; appInfo: any }) {
  const [activeTab, setActiveTab] = useState<SysTab>('startup');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleCollapse = (key: string) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-4">
        {SYS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setCollapsed(prev => ({ ...prev, [tab.key]: false })); }}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12.5px] font-semibold border transition-all ${
              activeTab === tab.key ? 'bg-gaccent-dim text-gaccent border-gaccent/40' : 'text-gmuted border-gborder hover:text-gtext'
            }`}
          >
            <tab.icon size={13} />
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      {SYS_TABS.map((tab) => {
        const isOpen = activeTab === tab.key && !collapsed[tab.key];
        return (
          <div key={tab.key} className="panel overflow-hidden">
            <button
              onClick={() => {
                setActiveTab(tab.key);
                setCollapsed(prev => ({ ...prev, [tab.key]: !prev[tab.key] }));
              }}
              className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gpanel2 transition-colors"
            >
              <tab.icon size={16} className="text-gaccent shrink-0" />
              <span className="text-[13px] font-semibold text-gtext flex-1 text-left">{t(tab.labelKey)}</span>
              <ChevronDown size={16} className={`text-gdim transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
              <div className="border-t border-gborder/50">
                {tab.key === 'startup' && <StartupTab toast={toast} t={t} />}
                {tab.key === 'services' && <ServicesTab toast={toast} t={t} />}
                {tab.key === 'processes' && <ProcessesTab toast={toast} t={t} appInfo={appInfo} />}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const IMPACT_TONE = { LOW: 'muted', MEDIUM: 'info', HIGH: 'warn' } as const;
type Filter = 'all' | 'running' | 'stopped' | 'manual' | 'automatic';
const FILTERS: Filter[] = ['all', 'running', 'stopped', 'manual', 'automatic'];
type SortKey = 'cpuPct' | 'memMb';
type SortDir = 'asc' | 'desc';

function StartupTab({ toast, t }: { toast: any; t: (key: string, params?: any) => string }) {
  const [entries, setEntries] = useState<StartupEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const list = await api.startup.list().catch(() => []);
    setEntries(list);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = entries.filter((e) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return e.name.toLowerCase().includes(q) || e.publisher.toLowerCase().includes(q) || e.command.toLowerCase().includes(q);
  });

  const toggle = async (id: string, enabled: boolean) => {
    setBusyId(id);
    const r = await api.startup.setEnabled(id, enabled);
    setBusyId(null);
    if (r.ok) {
      toast('success', t(enabled ? 'startup.enabledToast' : 'startup.disabledToast'));
      load();
    } else {
      toast('error', t('startup.toggleError'), r.error);
    }
  };

  const enabledCount = entries.filter((e) => e.enabled).length;

  if (loading) return <PageSpinner text={t('startup.loading')} />;

  return (
    <div className="p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gdim" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('common.search')}
            className="bg-gpanel border border-gborder rounded-lg pl-8 pr-3 py-1.5 text-[12.5px] text-gtext placeholder:text-gdim focus:border-gaccent/50 focus:outline-none w-44"
          />
        </div>
        <Button variant="secondary" size="sm" icon={<RefreshCw size={13} />} onClick={load}>
          {t('common.refresh')}
        </Button>
      </div>
      <div className="text-[12px] text-gdim mb-3">
        {t('startup.count', { n: enabledCount, m: entries.length - enabledCount })}
      </div>
      {entries.length === 0 ? (
        <EmptyState icon={<Rocket size={32} />} title={t('startup.emptyTitle')} description={t('startup.emptyDesc')} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gborder text-[10.5px] uppercase tracking-widest text-gdim">
                <th className="px-4 py-3 font-medium">{t('startup.colApp')}</th>
                <th className="px-4 py-3 font-medium">{t('startup.colPublisher')}</th>
                <th className="px-4 py-3 font-medium">{t('startup.colImpact')}</th>
                <th className="px-4 py-3 font-medium">{t('startup.colStatus')}</th>
                <th className="px-4 py-3 font-medium text-right">{t('startup.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id} className="border-b border-gborder/40 last:border-0 hover:bg-gpanel2/60 transition-colors">
                  <td className="px-4 py-3">
                    <div className="text-[13px] font-medium text-gtext">{e.name}</div>
                    <div className="text-[10.5px] text-gdim font-mono truncate max-w-[260px]" title={e.command}>{e.command}</div>
                  </td>
                  <td className="px-4 py-3 text-[12.5px] text-gmuted">{e.publisher}</td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={IMPACT_TONE[e.impact]}>{t(`startup.impact.${e.impact.toLowerCase()}`)}</StatusBadge>
                  </td>
                  <td className="px-4 py-3">
                    {e.enabled ? (
                      <StatusBadge tone="ok" dot>{t('startup.statusEnabled')}</StatusBadge>
                    ) : (
                      <StatusBadge tone="muted">{t('startup.statusDisabled')}</StatusBadge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {e.enabled ? (
                      <Button variant="outline-danger" size="sm" loading={busyId === e.id} onClick={() => toggle(e.id, false)}>
                        {t('startup.disable')}
                      </Button>
                    ) : (
                      <Button variant="secondary" size="sm" loading={busyId === e.id} onClick={() => toggle(e.id, true)}>
                        {t('startup.enable')}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ServicesTab({ toast, t }: { toast: any; t: (key: string, params?: any) => string }) {
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    service: ServiceRow;
    action: 'stop' | 'restart' | 'startup';
    startup?: string;
  } | null>(null);

  const load = async () => {
    setLoading(true);
    const list = await api.services.list().catch(() => []);
    setServices(list);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = services.filter((s) => {
    if (filter === 'running' && s.status !== 'running') return false;
    if (filter === 'stopped' && s.status !== 'stopped') return false;
    if (filter === 'manual' && s.startMode !== 'manual') return false;
    if (filter === 'automatic' && s.startMode !== 'automatic') return false;
    const q = query.trim().toLowerCase();
    if (q) return s.name.toLowerCase().includes(q) || s.displayName.toLowerCase().includes(q) || s.description.toLowerCase().includes(q);
    return true;
  });

  const runAction = async (service: ServiceRow, action: 'start' | 'stop' | 'restart', startup?: string) => {
    setConfirmAction(null);
    setBusy(service.name);
    const r = await api.services.control(service.name, action, startup ?? null);
    setBusy(null);
    if (r.ok) {
      toast('success', t(action === 'start' ? 'services.startedToast' : action === 'stop' ? 'services.stoppedToast' : 'services.restartedToast'), service.displayName);
      if (r.error) toast('info', t('services.notice'), r.error);
      setTimeout(load, 800);
    } else {
      toast('error', t('services.actionFailed'), r.error);
    }
  };

  const importantCount = services.filter((s) => s.important).length;

  if (loading) return <PageSpinner text={t('services.loading')} />;

  return (
    <div className="p-5">
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-[11.5px] font-semibold border transition-all ${
              filter === f ? 'bg-gaccent-dim text-gaccent border-gaccent/40' : 'text-gmuted border-gborder hover:text-gtext'
            }`}
          >
            {t(`services.filter.${f}`)}
          </button>
        ))}
        <div className="relative ml-auto">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gdim" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('services.search')}
            className="bg-gpanel border border-gborder rounded-lg pl-8 pr-3 py-1.5 text-[12.5px] text-gtext placeholder:text-gdim focus:border-gaccent/50 focus:outline-none w-52"
          />
        </div>
      </div>
      <div className="flex items-center gap-2 text-[11.5px] text-gdim mb-3">
        <Server size={13} />
        {t('services.count', { n: services.length, m: importantCount })}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="sticky top-0 bg-gpanel z-10">
            <tr className="border-b border-gborder text-[10.5px] uppercase tracking-widest text-gdim">
              <th className="px-4 py-3 font-medium">{t('services.colService')}</th>
              <th className="px-4 py-3 font-medium">{t('services.colStatus')}</th>
              <th className="px-4 py-3 font-medium">{t('services.colStartType')}</th>
              <th className="px-4 py-3 font-medium">{t('services.colDescription')}</th>
              <th className="px-4 py-3 font-medium text-right">{t('services.colActions')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.name} className="border-b border-gborder/40 last:border-0 hover:bg-gpanel2/60 transition-colors">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-gtext">{s.displayName || s.name}</span>
                    {s.important && (
                      <span className="flex items-center gap-1 text-[10px] text-gwarn" title={t('services.importantTooltip')}>
                        <ShieldAlert size={11} /> {t('services.critical')}
                      </span>
                    )}
                  </div>
                  <div className="text-[10.5px] text-gdim font-mono">{s.name}</div>
                </td>
                <td className="px-4 py-2.5">
                  {s.status === 'running' ? (
                    <StatusBadge tone="ok" dot>{t('services.statusRunning')}</StatusBadge>
                  ) : (
                    <StatusBadge tone="muted" dot>{t('services.statusStopped')}</StatusBadge>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <span className="text-[11.5px] uppercase tracking-wide text-gmuted font-mono">{s.startMode || '—'}</span>
                </td>
                <td className="px-4 py-2.5 text-[11.5px] text-gdim max-w-[320px] truncate" title={s.description}>
                  {s.description}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center justify-end gap-1.5">
                    {s.status === 'running' ? (
                      <>
                        <Button variant="ghost" size="sm" icon={<Square size={12} />} loading={busy === s.name}
                          onClick={() => setConfirmAction({ service: s, action: 'stop' })} className="text-gdanger hover:text-gdanger">
                          {t('services.stop')}
                        </Button>
                        <Button variant="ghost" size="sm" icon={<RotateCcw size={12} />} loading={busy === s.name}
                          onClick={() => setConfirmAction({ service: s, action: 'restart' })}>
                          {t('services.restart')}
                        </Button>
                      </>
                    ) : (
                      <Button variant="ghost" size="sm" icon={<Play size={12} />} loading={busy === s.name}
                        onClick={() => runAction(s, 'start')}>
                        {t('services.start')}
                      </Button>
                    )}
                    <select
                      className="gt-select bg-gpanel2 border border-gborder rounded-md text-[11px] text-gmuted px-2 py-1 focus:border-gaccent/50 focus:outline-none"
                      value={s.startMode}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val !== s.startMode) setConfirmAction({ service: s, action: 'startup', startup: val });
                      }}
                      disabled={busy === s.name}
                    >
                      <option value="automatic">{t('services.startModeAuto')}</option>
                      <option value="manual">{t('services.startModeManual')}</option>
                      <option value="disabled">{t('services.startModeDisabled')}</option>
                    </select>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ConfirmDialog
        open={!!confirmAction}
        title={confirmAction?.action === 'stop' ? t('services.stopTitle') : confirmAction?.action === 'restart' ? t('services.restartTitle') : t('services.startupTitle')}
        danger={confirmAction?.action === 'stop'}
        confirmLabel={t('common.confirm')}
        busy={busy === confirmAction?.service.name}
        message={confirmAction && (
          <>
            <p>
              <strong className="text-gtext">{confirmAction.service.displayName || confirmAction.service.name}</strong>{' '}
              {confirmAction.action === 'stop' ? t('services.confirmStopMsg') : confirmAction.action === 'restart' ? t('services.confirmRestartMsg') : t('services.confirmStartupMsg', { mode: confirmAction.startup })}
            </p>
            {confirmAction.service.important && (
              <p className="mt-2 flex items-start gap-1.5 text-gwarn"><AlertTriangle size={14} className="shrink-0 mt-0.5" />{t('services.confirmImportant')}</p>
            )}
          </>
        )}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          if (!confirmAction) return;
          if (confirmAction.action === 'startup') {
            runAction(confirmAction.service, confirmAction.service.status === 'running' ? 'restart' : 'start', confirmAction.startup);
          } else {
            runAction(confirmAction.service, confirmAction.action, undefined);
          }
        }}
      />
    </div>
  );
}

function ProcessesTab({ toast, t, appInfo }: { toast: any; t: (key: string, params?: any) => string; appInfo: any }) {
  const [processes, setProcesses] = useState<ProcessRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('cpuPct');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [busy, setBusy] = useState<number | null>(null);
  const [killTarget, setKillTarget] = useState<ProcessRow | null>(null);

  const load = async () => {
    setLoading(true);
    const list = await api.processes.list().catch(() => []);
    setProcesses(list);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const iv = setInterval(load, 5000);
    return () => clearInterval(iv);
  }, []);

  const sorted = processes.filter((p) => {
    const q = query.trim().toLowerCase();
    return q ? p.name.toLowerCase().includes(q) || String(p.pid).includes(q) : true;
  }).sort((a, b) => {
    const r = a[sortKey] - b[sortKey];
    return sortDir === 'desc' ? -r : r;
  });

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const kill = async () => {
    if (!killTarget) return;
    setBusy(killTarget.pid);
    const r = await api.processes.kill(killTarget.pid);
    setBusy(null);
    setKillTarget(null);
    if (r.ok) {
      toast('success', t('processes.killedToast'), killTarget.name);
      load();
    } else {
      toast('error', t('processes.killFailedToast'), r.error);
    }
  };

  const totalCpu = processes.reduce((s, p) => s + (p.cpuPct || 0), 0);
  const totalMem = processes.reduce((s, p) => s + (p.memMb || 0), 0);

  if (loading && processes.length === 0) return <PageSpinner text={t('processes.loading')} />;

  return (
    <div className="p-5">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gdim" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('processes.search')}
            className="bg-gpanel border border-gborder rounded-lg pl-8 pr-3 py-1.5 text-[12.5px] text-gtext placeholder:text-gdim focus:border-gaccent/50 focus:outline-none w-60"
          />
        </div>
        <div className="text-[12px] text-gdim">
          {t('processes.summary', { n: processes.length, cpu: totalCpu.toFixed(1), ram: formatBytes(totalMem * 1024 ** 2) })}
        </div>
        <Button variant="secondary" size="sm" icon={<RefreshCw size={13} />} onClick={load} loading={loading}>
          {t('common.refresh')}
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="sticky top-0 bg-gpanel z-10">
            <tr className="border-b border-gborder text-[10.5px] uppercase tracking-widest text-gdim">
              <th className="px-4 py-3 font-medium">{t('processes.colProcess')}</th>
              <th className="px-4 py-3 font-medium">{t('processes.colPid')}</th>
              <th className="px-4 py-3 font-medium">
                <button onClick={() => toggleSort('cpuPct')} className="flex items-center gap-1 hover:text-gmuted">{t('processes.colCpu')} <ArrowUpDown size={11} /></button>
              </th>
              <th className="px-4 py-3 font-medium">
                <button onClick={() => toggleSort('memMb')} className="flex items-center gap-1 hover:text-gmuted">{t('processes.colRam')} <ArrowUpDown size={11} /></button>
              </th>
              <th className="px-4 py-3 font-medium text-right">{t('processes.colAction')}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, 300).map((p) => (
              <tr key={p.pid} className="border-b border-gborder/40 last:border-0 hover:bg-gpanel2/60 transition-colors">
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <Cpu size={13} className="text-gdim shrink-0" />
                    <span className="text-[13px] font-medium text-gtext truncate max-w-[220px]" title={p.path || p.name}>{p.name}</span>
                    {p.protected && <ShieldCheck size={12} className="text-gaccent shrink-0" />}
                  </div>
                </td>
                <td className="px-4 py-2 font-mono text-[12px] text-gmuted">{p.pid}</td>
                <td className="px-4 py-2 font-mono text-[12.5px] text-gmuted">{p.cpuPct.toFixed(1)}%</td>
                <td className="px-4 py-2 font-mono text-[12.5px] text-gmuted">{formatBytes(p.memMb * 1024 ** 2)}</td>
                <td className="px-4 py-2 text-right">
                  {!p.protected ? (
                    <Button variant="ghost" size="sm" icon={<XCircle size={13} />} className="text-gdanger hover:text-gdanger"
                      loading={busy === p.pid} onClick={() => setKillTarget(p)}>
                      {t('processes.kill')}
                    </Button>
                  ) : (
                    <span className="text-[11px] text-gdim">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ConfirmDialog
        open={!!killTarget}
        title={t('processes.confirmKillTitle')}
        danger
        confirmLabel={t('processes.confirmKillTitle')}
        busy={busy === killTarget?.pid}
        message={killTarget && (
          <>
            <p>{t('processes.confirmKillMessage', { name: killTarget.name, pid: killTarget.pid })}</p>
            <p className="mt-2 text-gmuted">{t('processes.confirmKillWarning')}</p>
          </>
        )}
        onCancel={() => setKillTarget(null)}
        onConfirm={kill}
      />
    </div>
  );
}
