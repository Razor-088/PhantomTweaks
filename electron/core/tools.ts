import { runPS } from './ps';
import { log } from './logging';

export interface ToolDef {
  id: string;
  name: string;
  description: string;
  command: string;
}

export const TOOLS: ToolDef[] = [
  { id: 'taskmgr', name: 'Administrador de tareas', description: 'Procesos, rendimiento e inicio', command: 'taskmgr' },
  { id: 'devmgmt', name: 'Administrador de dispositivos', description: 'Hardware y controladores', command: 'devmgmt.msc' },
  { id: 'diskmgmt', name: 'Administración de discos', description: 'Particiones y volúmenes', command: 'diskmgmt.msc' },
  { id: 'services', name: 'Servicios', description: 'Administrador de servicios de Windows', command: 'services.msc' },
  { id: 'eventvwr', name: 'Visor de eventos', description: 'Registros de eventos del sistema', command: 'eventvwr.msc' },
  { id: 'control', name: 'Panel de control', description: 'Configuración clásica de Windows', command: 'control' },
  { id: 'settings', name: 'Configuración de Windows', description: 'Ajustes de Windows modernos', command: 'start ms-settings:' },
  { id: 'cmd', name: 'Símbolo del sistema', description: 'Terminal clásico de comandos', command: 'cmd' },
  { id: 'powershell', name: 'PowerShell', description: 'Terminal avanzada de Windows', command: 'powershell' },
  { id: 'regedit', name: 'Editor del registro', description: 'Editor del registro de Windows', command: 'regedit' },
  { id: 'msinfo32', name: 'Información del sistema', description: 'Resumen del hardware y software', command: 'msinfo32' },
  { id: 'resmon', name: 'Monitor de recursos', description: 'Monitorización avanzada de recursos', command: 'resmon' },
  { id: 'perfmon', name: 'Monitor de rendimiento', description: 'Contadores de rendimiento avanzados', command: 'perfmon' },
  { id: 'cleanmgr', name: 'Liberador de espacio', description: 'Limpieza de disco de Windows', command: 'cleanmgr' },
  { id: 'msconfig', name: 'Configuración del sistema', description: 'Opciones de arranque y servicios', command: 'msconfig' },
];

export async function openTool(id: string): Promise<{ ok: boolean; error?: string }> {
  const tool = TOOLS.find((t) => t.id === id);
  if (!tool) return { ok: false, error: 'Herramienta desconocida.' };
  const r = await runPS(`Start-Process '${tool.command.replace(/'/g, "''")}'`, 10000);
  if (r.code !== 0) {
    return { ok: false, error: r.stderr || `No se pudo abrir ${tool.name}.` };
  }
  log('INFO', 'tools', `Herramienta abierta: ${tool.name}`);
  return { ok: true };
}
