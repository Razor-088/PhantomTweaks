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

const Activation = React.lazy(() => import('./pages/Activation'));
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const Optimizer = React.lazy(() => import('./pages/Optimizer'));
const Gaming = React.lazy(() => import('./pages/Gaming'));
const Performance = React.lazy(() => import('./pages/Performance'));
const Cleanup = React.lazy(() => import('./pages/Cleanup'));
const Startup = React.lazy(() => import('./pages/Startup'));
const Services = React.lazy(() => import('./pages/Services'));
const Processes = React.lazy(() => import('./pages/Processes'));
const Network = React.lazy(() => import('./pages/Network'));
const Privacy = React.lazy(() => import('./pages/Privacy'));
const Tools = React.lazy(() => import('./pages/Tools'));
const Restore = React.lazy(() => import('./pages/Restore'));
const Logs = React.lazy(() => import('./pages/Logs'));
const Settings = React.lazy(() => import('./pages/Settings'));
const InputDelay = React.lazy(() => import('./pages/InputDelay'));
const RealTimeOptimizer = React.lazy(() => import('./pages/RealTimeOptimizer'));

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
        <div className="flex items-center justify-center h-full text-gdim text-sm">
          Something went wrong. Please navigate to another page and back.
        </div>
      );
    }
    return this.props.children;
  }
}

function PageSpinner() {
  return (
    <div className="flex items-center justify-center h-40">
      <div className="w-6 h-6 border-2 border-gborder border-t-gaccent rounded-full animate-spin" />
    </div>
  );
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
  const [checkingLicense, setCheckingLicense] = useState(true);

  // Check license on startup
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
        // Server unreachable — check local cache
        setLicenseActivated(false);
      } finally {
        setCheckingLicense(false);
      }
    })();
  }, [setLicenseActivated, setLicenseData]);

  // Load app data after license is confirmed
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
      if (['dashboard', 'optimizer', 'gaming', 'performance', 'cleanup', 'startup', 'services', 'processes', 'network', 'privacy', 'tools', 'restore', 'logs', 'settings', 'inputdelay', 'realtime'].includes(p)) {
        setPage(p as PageId);
      }
    });
    return off;
  }, [setPage]);

  // Show loading spinner while checking license
  if (checkingLicense) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gbase">
        <div className="bg-grid absolute inset-0 pointer-events-none opacity-40" />
        <div className="relative text-center">
          <div className="w-12 h-12 border-2 border-gborder border-t-gaccent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gdim text-[13px]">{t('activation.checking')}</p>
        </div>
      </div>
    );
  }

  // Show activation page if not licensed
  if (!licenseActivated) {
    return (
      <div className="h-screen w-screen bg-gbase overflow-hidden">
        <Suspense fallback={
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-2 border-gborder border-t-gaccent rounded-full animate-spin" />
          </div>
        }>
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
      case 'gaming': return <Gaming />;
      case 'performance': return <Performance />;
      case 'cleanup': return <Cleanup />;
      case 'startup': return <Startup />;
      case 'services': return <Services />;
      case 'processes': return <Processes />;
      case 'network': return <Network />;
      case 'privacy': return <Privacy />;
      case 'tools': return <Tools />;
      case 'restore': return <Restore />;
      case 'logs': return <Logs />;
      case 'settings': return <Settings />;
      case 'inputdelay': return <InputDelay />;
      case 'realtime': return <RealTimeOptimizer />;
      default: return <Dashboard />;
    }
  };

  return (
    <div
      className={`h-screen w-screen flex bg-gbase text-gtext overflow-hidden bg-aurora ${
        settings && !settings.animations ? 'no-anim' : ''
      } ${settings && !settings.transparency ? 'no-transparency' : ''}`}
    >
      <div className="bg-grid absolute inset-0 pointer-events-none opacity-60" />
      <Sidebar />
      <div className="relative flex-1 flex flex-col min-w-0">
        <Topbar />
        <main
          key={page}
          className={`flex-1 overflow-y-auto px-5 md:px-7 pt-4 pb-8 animate-pageload transition-[padding] duration-200 ${
            collapsed ? 'md:pl-4' : ''
          }`}
        >
          <ErrorBoundary>
            <Suspense fallback={<PageSpinner />}>
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
