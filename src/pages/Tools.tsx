import { useEffect, useRef, useState } from 'react';
import { Wrench, Terminal as TerminalIcon, ChevronRight, Play, ShieldAlert, ShieldCheck, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useAppStore } from '../store/useAppStore';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { StatusBadge } from '../components/ui/StatusBadge';
import type { CommandClass, ConsoleLine } from '../lib/types';

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

export default function Tools() {
  const [tab, setTab] = useState<'tools' | 'terminal'>('tools');
  const [lines, setLines] = useState<ConsoleLine[]>([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<CommandClass>('SAFE');
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const consoleRef = useRef<HTMLDivElement>(null);
  const toast = useAppStore((s) => s.toast);
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
            <button
              onClick={() => setTab('tools')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12.5px] font-semibold border transition-all ${
                tab === 'tools' ? 'bg-gaccent-dim text-gaccent border-gaccent/40' : 'text-gmuted border-gborder hover:text-gtext'
              }`}
            >
              <Wrench size={13} /> {t('tools.tabTools')}
            </button>
            <button
              onClick={() => setTab('terminal')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12.5px] font-semibold border transition-all ${
                tab === 'terminal' ? 'bg-gaccent-dim text-gaccent border-gaccent/40' : 'text-gmuted border-gborder hover:text-gtext'
              }`}
            >
              <TerminalIcon size={13} /> {t('tools.tabTerminal')}
            </button>
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
