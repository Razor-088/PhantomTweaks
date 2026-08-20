import React, { Suspense, useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { Toasts } from './components/ui/Toasts';
import { AdminBanner } from './components/AdminBanner';
import { useAppStore } from './store/useAppStore';
import { api } from './lib/api';
import { useI18n } from './lib/i18n';
import type { PageId } from './store/useAppStore';
import type { AppSettings } from './lib/types';

import { ProgressLoader } from './components/ui/Spinner';

const Activation = React.lazy(() => import('./pages/Activation'));
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const Optimizer = React.lazy(() => import('./pages/Optimizer'));
const GamingHub = React.lazy(() => import('./pages/GamingHub'));
const Performance = React.lazy(() => import('./pages/Performance'));
const Network = React.lazy(() => import('./pages/Network'));
const NvidiaSettings = React.lazy(() => import('./pages/NvidiaSettings'));
const InputDelay = React.lazy(() => import('./pages/InputDelay'));
const Cleanup = React.lazy(() => import('./pages/Cleanup'));
const Tools = React.lazy(() => import('./pages/Tools'));
const Restore = React.lazy(() => import('./pages/Restore'));
const Logs = React.lazy(() => import('./pages/Logs'));
const Settings = React.lazy(() => import('./pages/Settings'));

function resolveTheme(pref: AppSettings['theme']): 'dark' | 'light' {
  if (pref === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return pref;
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="flex flex-col items-center justify-center h-full text-gdim text-sm gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gdanger/10 flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gdanger">
              <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <span>Something went wrong. Navigate to another page and back.</span>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const page = useAppStore((s) => s.page);
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const settings = useAppStore((s) => s.settings);
  const licenseActivated = useAppStore((s) => s.licenseActivated);
  const setSnapshot = useAppStore((s) => s.setSnapshot);
  const setOverview = useAppStore((s) => s.setOverview);
  const setAppInfo = useAppStore((s) => s.setAppInfo);
  const setSettings = useAppStore((s) => s.setSettings);
  const setOnline = useAppStore((s) => s.setOnline);
  const setLicenseActivated = useAppStore((s) => s.setLicenseActivated);
  const setLicenseData = useAppStore((s) => s.setLicenseData);
  const setPage = useAppStore((s) => s.setPage);
  const toast = useAppStore((s) => s.toast);
  const { t } = useI18n();
  const [checkingLicense, setCheckingLicense] = useState(false);
  const LIVE_PAGES = new Set(['dashboard', 'performance', 'gaminghub']);

  useEffect(() => {
    (async () => {
      try {
        const status = await api.license.getStatus();
        if (status.valid) {
          setLicenseActivated(true);
          setLicenseData(status.license);
        } else {
          setLicenseActivated(false);
        }
      } catch {
        setLicenseActivated(false);
      } finally {
        setCheckingLicense(false);
      }
    })();
  }, [setLicenseActivated, setLicenseData]);

  useEffect(() => {
    const needsLive = LIVE_PAGES.has(page);
    if (needsLive) {
      api.system.startPolling();
    } else {
      api.system.stopPolling();
    }
    return () => {
      api.system.stopPolling();
    };
  }, [page]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden || !LIVE_PAGES.has(page)) {
        api.system.stopPolling();
      } else {
        api.system.startPolling();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onVisibility);
    window.addEventListener('blur', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onVisibility);
      window.removeEventListener('blur', onVisibility);
    };
  }, [page]);

  useEffect(() => {
    if (!licenseActivated) return;
    (async () => {
      try {
        const [info, settings, overview] = await Promise.all([
          api.app.getInfo(),
          api.settings.get(),
          api.system.overview(),
        ]);
        setAppInfo(info);
        setSettings(settings);
        setOverview(overview);
        setOnline(true);
      } catch {
        setOnline(false);
        toast('error', t('app.connError'), t('app.connErrorDesc'));
      }
    })();
  }, [licenseActivated, setAppInfo, setSettings, setOverview, setOnline, toast, t]);

  useEffect(() => {
    if (!settings) return;
    const apply = () => {
      document.documentElement.dataset.theme = resolveTheme(settings.theme);
    };
    apply();
    if (settings.theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
  }, [settings]);

  useEffect(() => {
    const off = api.on('monitor:snapshot', (snap) => setSnapshot(snap));
    return off;
  }, [setSnapshot]);

  useEffect(() => {
    const off = api.on('navigate:page', (p: string) => {
      if (['dashboard', 'optimizer', 'gaminghub', 'performance', 'network', 'nvidia', 'inputdelay', 'cleanup', 'tools', 'restore', 'logs', 'settings'].includes(p)) {
        setPage(p as PageId);
      }
    });
    return off;
  }, [setPage]);

  useEffect(() => {
    const onVisibility = () => {
      const el = document.documentElement;
      if (document.hidden) {
        el.classList.add('pause-aurora');
      } else {
        el.classList.remove('pause-aurora');
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', () => document.documentElement.classList.add('pause-aurora'));
    window.addEventListener('focus', () => document.documentElement.classList.remove('pause-aurora'));
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', () => document.documentElement.classList.add('pause-aurora'));
      window.removeEventListener('focus', () => document.documentElement.classList.remove('pause-aurora'));
    };
  }, []);

  if (!licenseActivated) {
    return (
      <div className="h-screen w-screen bg-gbase overflow-hidden">
        <Suspense fallback={<ProgressLoader text={t('common.loading')} />}>
          <Activation />
        </Suspense>
        <Toasts />
      </div>
    );
  }

  const renderPage = () => {
    switch (page) {
      case 'dashboard': return <Dashboard />;
      case 'optimizer': return <Optimizer />;
      case 'gaminghub': return <GamingHub />;
      case 'performance': return <Performance />;
      case 'network': return <Network />;
      case 'nvidia': return <NvidiaSettings />;
      case 'inputdelay': return <InputDelay />;
      case 'cleanup': return <Cleanup />;
      case 'tools': return <Tools />;
      case 'restore': return <Restore />;
      case 'logs': return <Logs />;
      case 'settings': return <Settings />;
      default: return <Dashboard />;
    }
  };

  return (
    <div
      className={`h-screen w-screen flex bg-gbase text-gtext overflow-hidden bg-aurora noise-overlay ${
        settings && !settings.animations ? 'no-anim' : ''
      } ${settings && !settings.transparency ? 'no-transparency' : ''}`}
    >
      <div className="bg-grid absolute inset-0 pointer-events-none opacity-50" />
      <Sidebar />
      <div className="relative flex-1 flex flex-col min-w-0">
        <Topbar />
        <main
          key={page}
          className={`flex-1 overflow-y-auto px-5 md:px-7 pt-5 pb-8 animate-pageload transition-[padding] duration-200 ${
            collapsed ? 'md:pl-4' : ''
          }`}
        >
          <ErrorBoundary>
            <Suspense fallback={<ProgressLoader />}>
              {renderPage()}
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
      <AdminBanner />
      <Toasts />
    </div>
  );
}
