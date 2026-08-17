import { SCHEDULE_WRITE_DELAY_MS } from './constants';
import * as fs from 'fs';
import { ensureFile } from '../core/paths';

export function createScheduleWrite(
  getCache: () => unknown,
  fileName: string,
): () => void {
  let timer: NodeJS.Timeout | null = null;
  return () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      try {
        fs.writeFileSync(ensureFile(fileName), JSON.stringify(getCache(), null, 2), 'utf-8');
      } catch { /* ignore */ }
    }, SCHEDULE_WRITE_DELAY_MS);
  };
}
