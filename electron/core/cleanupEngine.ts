import * as fs from 'fs';
import * as path from 'path';
import { runPS } from './ps';
import { log } from './logging';

export interface CleanupCategory {
  id: string;
  name: string;
  description: string;
  path: string | null | (() => string);
  size: number;
  files: number;
  selected: boolean;
  available: boolean;
  special: 'folder' | 'recyclebin' | 'pattern';
  pattern?: string;
}

const winDir = () => process.env.windir || 'C:\\Windows';
const user = () => process.env.USERPROFILE || 'C:\\Users\\' + process.env.USERNAME;
const local = () => process.env.LOCALAPPDATA || path.join(user(), 'AppData', 'Local');
const programData = () => process.env.ProgramData || 'C:\\ProgramData';

const CATEGORY_DEFS: Omit<CleanupCategory, 'size' | 'files' | 'selected' | 'available'>[] = [
  {
    id: 'temp_user',
    name: 'Archivos temporales (usuario)',
    description: 'Archivos temporales de tu sesión de usuario (%TEMP%). Seguros de eliminar.',
    path: () => path.join(process.env.TEMP || path.join(user(), 'AppData', 'Local', 'Temp')),
    special: 'folder',
  },
  {
    id: 'temp_system',
    name: 'Archivos temporales del sistema',
    description: 'Archivos temporales de Windows (C:\\Windows\\Temp). Pueden requerir administrador.',
    path: () => path.join(winDir(), 'Temp'),
    special: 'folder',
  },
  {
    id: 'browser_chrome',
    name: 'Caché del navegador (Chrome)',
    description: 'Caché de Chrome/Edge Chromium. Se regenera automáticamente al navegar.',
    path: () => path.join(local(), 'Google', 'Chrome', 'User Data'),
    special: 'pattern',
    pattern: 'cache',
  },
  {
    id: 'browser_edge',
    name: 'Caché del navegador (Edge)',
    description: 'Caché de Microsoft Edge. Se regenera automáticamente al navegar.',
    path: () => path.join(local(), 'Microsoft', 'Edge', 'User Data'),
    special: 'pattern',
    pattern: 'cache',
  },
  {
    id: 'browser_firefox',
    name: 'Caché del navegador (Firefox)',
    description: 'Caché de Firefox. Se regenera automáticamente al navegar.',
    path: () => path.join(local(), 'Mozilla', 'Firefox', 'Profiles'),
    special: 'pattern',
    pattern: 'cache2',
  },
  {
    id: 'windows_update',
    name: 'Caché de Windows Update',
    description: 'Archivos descargados de Windows Update ya instalados. Requiere administrador.',
    path: () => path.join(winDir(), 'SoftwareDistribution', 'Download'),
    special: 'folder',
  },
  {
    id: 'recycle_bin',
    name: 'Papelera de reciclaje',
    description: 'Vacía la papelera de reciclaje de todas las unidades.',
    path: null,
    special: 'recyclebin',
  },
  {
    id: 'logs',
    name: 'Archivos de registro (logs)',
    description: 'Registros temporales del sistema y aplicaciones (CBS logs, .log en temp).',
    path: () => path.join(winDir(), 'Logs'),
    special: 'pattern',
    pattern: 'log',
  },
  {
    id: 'thumbnails',
    name: 'Miniaturas (thumbnails)',
    description: 'Caché de miniaturas del Explorador. Se regeneran al ver las carpetas.',
    path: () => path.join(local(), 'Microsoft', 'Windows', 'Explorer'),
    special: 'pattern',
    pattern: 'thumbcache',
  },
  {
    id: 'error_reports',
    name: 'Informes de errores (WER)',
    description: 'Informes de errores y quejas de Windows y aplicaciones.',
    path: () => path.join(local(), 'Microsoft', 'Windows', 'WER'),
    special: 'folder',
  },
  {
    id: 'crash_dumps',
    name: 'Vuelcos de memoria (crash dumps)',
    description: 'Archivos de volcado de memoria de procesos bloqueados.',
    path: () => path.join(local(), 'CrashDumps'),
    special: 'folder',
  },
  {
    id: 'prefetch',
    name: 'Prefetch',
    description:
      'Caché de carga de programas de Windows. Windows la reconstruye con el uso. Algunos la consideran útil; su impacto es bajo.',
    path: () => path.join(winDir(), 'Prefetch'),
    special: 'folder',
  },
];

// ---------------------------------------------------------------------------
// size scanning
// ---------------------------------------------------------------------------

const MAX_FILES = 250000;

async function dirSizeAsync(root: string, onProgress?: (files: number) => void): Promise<{ size: number; files: number }> {
  let size = 0;
  let files = 0;
  let aborted = false;

  async function walk(dir: string, depth: number): Promise<void> {
    if (aborted || depth > 10) return;
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (aborted) return;
      const full = path.join(dir, e.name);
      try {
        if (e.isDirectory()) {
          await walk(full, depth + 1);
        } else {
          const st = await fs.promises.stat(full);
          size += st.size;
          files++;
          if (files % 2000 === 0) onProgress?.(files);
          if (files >= MAX_FILES) {
            aborted = true;
            return;
          }
        }
      } catch {
        /* skip locked/denied */
      }
    }
  }

  await walk(root, 0);
  return { size, files };
}

async function recycleBinSize(): Promise<{ size: number; files: number }> {
  const r = await runPS(
    `$s = Get-ChildItem -Path 'C:\\$Recycle.Bin' -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum; if ($s) { $s.Sum } else { 0 }`,
    30000
  );
  const n = parseInt(r.stdout.trim(), 10);
  return { size: isNaN(n) ? 0 : n, files: 0 };
}

function resolveCategories(): CleanupCategory[] {
  return CATEGORY_DEFS.map((c) => {
    let p: string | null = null;
    try {
      p = typeof c.path === 'function' ? c.path() : c.path;
    } catch {
      p = null;
    }
    return {
      ...c,
      path: p,
      size: 0,
      files: 0,
      selected: true,
      available: p ? fs.existsSync(p) : c.special === 'recyclebin',
    };
  });
}

export async function scanCleanup(
  onProgress?: (current: string, done: number, total: number) => void
): Promise<CleanupCategory[]> {
  const cats = resolveCategories();
  const total = cats.length;
  let done = 0;

  for (const c of cats) {
    onProgress?.(c.name, done, total);
    try {
      if (c.special === 'recyclebin') {
        const r = await recycleBinSize();
        c.size = r.size;
        c.files = r.files;
        c.available = r.size > 0 || true;
      } else if (c.path && c.available) {
        const p = typeof c.path === 'function' ? c.path() : c.path;
        const res = await dirSizeAsync(p, () => onProgress?.(c.name, done, total));
        c.size = res.size;
        c.files = res.files;
      }
    } catch {
      c.size = 0;
      c.files = 0;
      c.available = false;
    }
    done++;
  }
  onProgress?.('Completado', total, total);
  log('INFO', 'cleanup', 'Escaneo de limpieza completado');
  return cats;
}

// ---------------------------------------------------------------------------
// cleaning
// ---------------------------------------------------------------------------

async function removeChildren(dir: string): Promise<{ removedBytes: number; removedFiles: number }> {
  let removedBytes = 0;
  let removedFiles = 0;
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return { removedBytes, removedFiles };
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    try {
      const st = await fs.promises.stat(full);
      removedBytes += st.size;
      await fs.promises.rm(full, { recursive: true, force: true });
      removedFiles++;
    } catch {
      /* locked file - skip */
    }
  }
  return { removedBytes, removedFiles };
}

async function removeMatching(root: string, keyword: string): Promise<{ removedBytes: number; removedFiles: number }> {
  let removedBytes = 0;
  let removedFiles = 0;

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 8) return;
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      try {
        if (e.isDirectory()) {
          const kw = (keyword || '').toLowerCase();
          if (e.name.toLowerCase().includes(kw)) {
            const st = await fs.promises.stat(full);
            removedBytes += st.size;
            await fs.promises.rm(full, { recursive: true, force: true });
            removedFiles++;
          } else {
            await walk(full, depth + 1);
          }
        } else if (e.name.toLowerCase().includes((keyword || '').toLowerCase())) {
          const st = await fs.promises.stat(full);
          removedBytes += st.size;
          await fs.promises.rm(full, { recursive: true, force: true });
          removedFiles++;
        }
      } catch {
        /* ignore */
      }
    }
  }

  await walk(root, 0);
  return { removedBytes, removedFiles };
}

async function emptyRecycleBin(): Promise<{ removedBytes: number; removedFiles: number }> {
  await runPS(`Clear-RecycleBin -Force -ErrorAction SilentlyContinue`, 60000);
  return { removedBytes: 0, removedFiles: 1 };
}

export interface CleanResult {
  results: Array<{ id: string; name: string; removedBytes: number; removedFiles: number; error?: string }>;
  totalRemovedBytes: number;
  totalFiles: number;
}

export async function cleanCategories(
  categories: CleanupCategory[],
  onProgress?: (name: string, done: number, total: number) => void
): Promise<CleanResult> {
  const results: CleanResult['results'] = [];
  let totalBytes = 0;
  let totalFiles = 0;
  const selected = categories.filter((c) => c.selected && c.available);
  const total = selected.length;
  let done = 0;

  for (const c of selected) {
    onProgress?.(c.name, done, total);
    try {
      let r: { removedBytes: number; removedFiles: number };
      if (c.special === 'recyclebin') {
        r = await emptyRecycleBin();
      } else if (c.special === 'pattern') {
        const p = typeof c.path === 'function' ? c.path() : c.path;
        r = p ? await removeMatching(p, c.pattern || 'cache') : { removedBytes: 0, removedFiles: 0 };
      } else {
        const p = typeof c.path === 'function' ? c.path() : c.path;
        r = p ? await removeChildren(p) : { removedBytes: 0, removedFiles: 0 };
      }
      results.push({ id: c.id, name: c.name, removedBytes: r.removedBytes, removedFiles: r.removedFiles });
      totalBytes += r.removedBytes;
      totalFiles += r.removedFiles;
    } catch (e: any) {
      results.push({ id: c.id, name: c.name, removedBytes: 0, removedFiles: 0, error: e.message });
    }
    done++;
  }
  onProgress?.('Completado', total, total);
  log('SUCCESS', 'cleanup', `Limpieza completada: ${totalFiles} archivos, ${Math.round(totalBytes / 1024 / 1024)} MB`);
  return { results, totalRemovedBytes: totalBytes, totalFiles };
}
