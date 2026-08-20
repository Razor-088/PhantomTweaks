import {
  Gauge, Zap, Gamepad2, Activity, Trash2, Wifi, Wrench,
  RotateCcw, FileText, Settings, Timer, ChevronsLeft, ChevronsRight,
  MonitorDot, Crosshair,
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
      { id: 'gaminghub', icon: Gamepad2 },
    ],
  },
  {
    key: 'nav.group.system',
    items: [
      { id: 'performance', icon: Activity },
      { id: 'network', icon: Wifi },
      { id: 'nvidia', icon: MonitorDot },
      { id: 'inputdelay', icon: Timer },
    ],
  },
  {
    key: 'nav.group.tools',
    items: [
      { id: 'cleanup', icon: Trash2 },
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
  title, items, collapsed, badges,
}: {
  title: string;
  items: Array<{ id: PageId; icon: typeof Gauge }>;
  collapsed: boolean;
  badges: Record<string, number | null>;
}) {
  return (
    <div className="mb-2">
      {!collapsed && (
        <div className="px-3 pt-4 pb-1.5 text-[9px] font-extrabold uppercase tracking-[0.18em] text-gdim/50 flex items-center gap-2">
          <span className="h-px flex-1 bg-gradient-to-r from-gborder/60 to-transparent" />
          {title}
          <span className="h-px flex-1 bg-gradient-to-l from-gborder/60 to-transparent" />
        </div>
      )}
      <div className="space-y-0.5">
        {items.map((item) => (
          <NavItem key={item.id} {...item} collapsed={collapsed} badge={badges[item.id]} />
        ))}
      </div>
    </div>
  );
}

function NavItem({
  id, icon: Icon, collapsed, badge,
}: {
  id: PageId;
  icon: typeof Gauge;
  collapsed: boolean;
  badge?: number | null;
}) {
  const page = useAppStore((s) => s.page);
  const setPage = useAppStore((s) => s.setPage);
  const { t } = useI18n();
  const label = t(`nav.${id}`);
  const active = page === id;
  const showBadge = badge && badge > 0 && !active;

  return (
    <button
      onClick={() => setPage(id)}
      title={collapsed ? label : undefined}
      className={`group relative flex items-center gap-3 w-full rounded-xl px-3 py-2.5 text-[13px] transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        active
          ? 'sidebar-item-active text-gaccent'
          : 'text-gmuted hover:text-gtext sidebar-item'
      }`}
    >
      {/* Active glow strip */}
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-7 w-[3px] rounded-r-full bg-gaccent shadow-[0_0_16px_rgba(0,255,136,0.7),0_0_32px_rgba(0,255,136,0.3)]" />
      )}

      {/* Icon container */}
      <span className={`relative flex items-center justify-center w-9 h-9 rounded-xl transition-all duration-300 shrink-0 ${
        active
          ? 'bg-gaccent/15 shadow-[0_0_14px_rgba(0,255,136,0.15),inset_0_1px_0_rgba(255,255,255,0.08)]'
          : 'bg-gpanel3/50 group-hover:bg-gpanel3 group-hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]'
      }`}>
        <Icon
          size={18}
          strokeWidth={active ? 2.3 : 1.7}
          className={`transition-all duration-300 ${
            active
              ? 'drop-shadow-[0_0_8px_rgba(0,255,136,0.6)]'
              : 'group-hover:scale-110 group-hover:drop-shadow-[0_0_4px_rgba(0,255,136,0.2)]'
          }`}
        />
        {/* Active dot */}
        {active && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-gaccent shadow-[0_0_8px_rgba(0,255,136,0.8)]" />
        )}
      </span>

      {!collapsed && (
        <>
          <span className={`truncate font-medium transition-all duration-200 ${active ? 'font-semibold' : ''}`}>
            {label}
          </span>
          {showBadge && (
            <span className="ml-auto text-[10px] font-mono font-bold text-gwarn bg-gwarn/10 border border-gwarn/20 rounded-full px-1.5 py-0.5 min-w-[20px] h-5 flex items-center justify-center shadow-[0_0_10px_rgba(255,184,77,0.2)] animate-pulse-soft">
              {badge}
            </span>
          )}
        </>
      )}
    </button>
  );
}

export function Sidebar() {
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggle = useAppStore((s) => s.toggleSidebar);
  const badges = useAppStore((s) => s.badges);
  const { t } = useI18n();

  return (
    <aside
      className={`relative z-10 flex flex-col shrink-0 h-full border-r border-gborder/50 transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        collapsed ? 'w-[68px]' : 'w-[236px]'
      }`}
      style={{
        background: 'linear-gradient(180deg, color-mix(in srgb, var(--color-gbase2) 96%, var(--color-gaccent) 2%) 0%, var(--color-gbase2) 40%, color-mix(in srgb, var(--color-gbase2) 94%, var(--color-gbase)) 100%)',
      }}
    >
      {/* Subtle side glow */}
      <div className="absolute top-0 right-0 w-px h-full bg-gradient-to-b from-gaccent/10 via-gaccent/5 to-transparent pointer-events-none" />

      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-[68px] border-b border-gborder/40 shrink-0 relative">
        <div className="relative flex items-center justify-center w-11 h-11 rounded-2xl bg-gaccent-dim border border-gaccent/20 shadow-[0_0_24px_rgba(0,255,136,0.2),inset_0_1px_0_rgba(255,255,255,0.08)]">
          <div className="absolute inset-0 rounded-2xl bg-gaccent/5 animate-glow shadow-[0_0_16px_rgba(0,255,136,0.3)]" />
          <Logo size={26} />
        </div>
        {!collapsed && (
          <div className="leading-tight animate-fadein">
            <div className="font-extrabold tracking-[0.22em] text-[13px] text-gtext">
              PHANTOM<span className="text-gaccent text-glow">TWEAKS</span>
            </div>
            <div className="text-[9.5px] text-gdim tracking-widest font-medium mt-0.5">{t('nav.tagline')}</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5 scrollbar-thin">
        {NAV_GROUPS.map((group) => (
          <NavGroup
            key={group.key}
            title={t(group.key)}
            items={group.items}
            collapsed={collapsed}
            badges={badges}
          />
        ))}
      </nav>

      {/* Bottom section */}
      <div className="shrink-0 border-t border-gborder/30 p-2">
        {/* Version pill */}
        {!collapsed && (
          <div className="text-center text-[9px] text-gdim/60 font-mono tracking-wider mb-2">
            v1.0.0
          </div>
        )}
        <button
          onClick={toggle}
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-gdim hover:text-gaccent hover:bg-gpanel2/60 transition-all duration-300 group"
          title={collapsed ? t('nav.expand') : t('nav.collapse')}
        >
          {collapsed ? (
            <ChevronsRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
          ) : (
            <>
              <ChevronsLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
              <span className="text-[11px] font-medium">{t('nav.collapse')}</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
