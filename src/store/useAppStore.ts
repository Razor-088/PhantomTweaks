import { create } from 'zustand';
import type { AppInfo, AppSettings, MonitorSnapshot, Overview } from '../lib/types';

export type PageId =
  | 'dashboard'
  | 'optimizer'
  | 'gaming'
  | 'performance'
  | 'cleanup'
  | 'startup'
  | 'services'
  | 'processes'
  | 'network'
  | 'privacy'
  | 'tools'
  | 'restore'
  | 'logs'
  | 'settings'
  | 'inputdelay'
  | 'realtime';

export interface Toast {
  id: number;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message?: string;
}

interface AppState {
  page: PageId;
  sidebarCollapsed: boolean;
  settings: AppSettings | null;
  appInfo: AppInfo | null;
  snapshot: MonitorSnapshot | null;
  overview: Overview | null;
  online: boolean;
  toasts: Toast[];
  licenseActivated: boolean;
  licenseData: any | null;
  setPage: (p: PageId) => void;
  toggleSidebar: () => void;
  setSettings: (s: AppSettings) => void;
  setAppInfo: (i: AppInfo) => void;
  setSnapshot: (s: MonitorSnapshot | null) => void;
  setOverview: (o: Overview | null) => void;
  setOnline: (v: boolean) => void;
  setLicenseActivated: (v: boolean) => void;
  setLicenseData: (d: any | null) => void;
  toast: (type: Toast['type'], title: string, message?: string) => void;
  dismissToast: (id: number) => void;
}

let toastId = 0;

export const useAppStore = create<AppState>((set, get) => ({
  page: 'dashboard',
  sidebarCollapsed: false,
  settings: null,
  appInfo: null,
  snapshot: null,
  overview: null,
  online: false,
  toasts: [],
  licenseActivated: false,
  licenseData: null,
  setPage: (p) => set({ page: p }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSettings: (settings) => set({ settings }),
  setAppInfo: (appInfo) => set({ appInfo }),
  setSnapshot: (snapshot) => set({ snapshot }),
  setOverview: (overview) => set({ overview }),
  setOnline: (online) => set({ online }),
  setLicenseActivated: (licenseActivated) => set({ licenseActivated }),
  setLicenseData: (licenseData) => set({ licenseData }),
  toast: (type, title, message) => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts, { id, type, title, message }] }));
    setTimeout(() => get().dismissToast(id), 4800);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
