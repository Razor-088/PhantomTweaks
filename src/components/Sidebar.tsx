import {
  Gauge,
  Zap,
  Gamepad2,
  Activity,
  Trash2,
  Rocket,
  Server,
  Cpu,
  Wifi,
  Shield,
  Wrench,
  RotateCcw,
  FileText,
  Settings,
  MousePointer,
  Timer,
  ChevronsLeft,
  ChevronsRight,
  MonitorDot,
  Crosshair,
} from 'lucide-react';
import { useAppStore, PageId } from '../store/useAppStore';
import { useI18n } from '../lib/i18n';
import { Logo } from './Logo';

const NAV_GROUPS: Array<{
  key: string;
  items: Array<{ id: PageId; icon: typeof Gauge }>;
}> = [
  {
    key: 'nav.group.main',
    items: [
      { id: 'dashboard', icon: Gauge },
      { id: 'optimizer', icon: Zap },
      { id: 'gaming', icon: Gamepad2 },
    ],
  },
  {
    key: 'nav.group.system',
    items: [
      { id: 'performance', icon: Activity },
      { id: 'startup', icon: Rocket },
      { id: 'processes', icon: Cpu },
      { id: 'services', icon: Server },
      { id: 'network', icon: Wifi },
      { id: 'inputdelay', icon: Timer },
      { id: 'realtime', icon: Zap },
      { id: 'nvidia', icon: MonitorDot },
      { id: 'gameopt', icon: Crosshair },
    ],
  },
  {
    key: 'nav.group.tools',
    items: [
      { id: 'cleanup', icon: Trash2 },
      { id: 'privacy', icon: Shield },
      { id: 'tools', icon: Wrench },
    ],
  },
  {
    key: 'nav.group.history',
    items: [
      { id: 'restore', icon: RotateCcw },
      { id: 'logs', icon: FileText },
    ],
  },
  {
    key: 'nav.group.settings',
    items: [{ id: 'settings', icon: Settings }],
  },
];

function NavGroup({
  title,
  items,
  collapsed,
}: {
  title: string;
  items: Array<{ id: PageId; icon: typeof Gauge }>;
  collapsed: boolean;
}) {
  return (
    <div className="mb-1.5">
      {!collapsed && (
        <div className="px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-gdim">
          {title}
        </div>
      )}
      <div className="space-y-0.5">
        {items.map((item) => (
          <NavItem key={item.id} {...item} collapsed={collapsed} />
        ))}
      </div>
    </div>
  );
}

function NavItem({
  id,
  icon: Icon,
  collapsed,
}: {
  id: PageId;
  icon: typeof Gauge;
  collapsed: boolean;
}) {
  const page = useAppStore((s) => s.page);
  const setPage = useAppStore((s) => s.setPage);
  const { t } = useI18n();
  const label = t(`nav.${id}`);
  const active = page === id;
  return (
    <button
      onClick={() => setPage(id)}
      title={collapsed ? label : undefined}
      className={`group relative flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-sm transition-all duration-150 ${
        active
          ? 'text-gaccent bg-gaccent-dim shadow-[inset_0_1px_0_rgba(0,255,136,0.15)]'
          : 'text-gmuted hover:text-gtext hover:bg-gpanel2 hover:translate-x-0.5'
      }`}
    >
      {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-gaccent shadow-[0_0_8px_rgba(0,255,136,0.8)] animate-blink" />}
      <Icon size={18} strokeWidth={active ? 2.2 : 1.8} className={`shrink-0 transition-transform duration-200 ${active ? '' : 'group-hover:scale-110'}`} />
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  );
}

export function Sidebar() {
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggle = useAppStore((s) => s.toggleSidebar);
  const { t } = useI18n();

  return (
    <aside
      className={`relative z-10 flex flex-col shrink-0 h-full border-r border-gborder bg-gbase2 transition-[width] duration-200 ${
        collapsed ? 'w-[64px]' : 'w-[220px]'
      }`}
    >
      <div className="flex items-center gap-3 px-4 h-[58px] border-b border-gborder shrink-0">
        <div className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-gaccent-dim border border-gaccent/30 shadow-[0_0_14px_rgba(0,255,136,0.25)]">
          <Logo size={22} />
        </div>
        {!collapsed && (
          <div className="leading-tight">
            <div className="font-bold tracking-[0.18em] text-[13px] text-gtext">
              PHANTOM<span className="text-gaccent">TWEAKS</span>
            </div>
            <div className="text-[10px] text-gdim tracking-wide">{t('nav.tagline')}</div>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        {NAV_GROUPS.map((group) => (
          <NavGroup
            key={group.key}
            title={t(group.key)}
            items={group.items}
            collapsed={collapsed}
          />
        ))}
      </nav>

      <button
        onClick={toggle}
        className="shrink-0 flex items-center justify-center gap-2 py-2.5 border-t border-gborder text-gdim hover:text-gaccent transition-colors"
        title={collapsed ? t('nav.expand') : t('nav.collapse')}
      >
        {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
      </button>
    </aside>
  );
}
