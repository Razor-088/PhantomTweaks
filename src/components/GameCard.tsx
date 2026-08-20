import { Play } from 'lucide-react';
import { Button } from './ui/Button';
import { StatusBadge } from './ui/StatusBadge';
import { Card } from './ui/Card';
import { useI18n } from '../lib/i18n';
import type { DetectedGame, GameOptimization } from '../lib/types';

interface Props {
  game: DetectedGame;
  optimization: GameOptimization | null | undefined;
  onApply: (opt: GameOptimization) => void;
  onDeactivate: (opt: GameOptimization) => void;
  onEdit: (game: DetectedGame) => void;
}

export function GameCard({ game, optimization, onApply, onDeactivate, onEdit }: Props) {
  const { t } = useI18n();
  const isRunning = game.running;

  return (
    <Card className="relative">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-lg shrink-0">{getPlatformIcon(game.platform)}</span>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-gtext truncate">{game.name}</p>
          <p className="text-[10px] text-gdim">{getPlatformLabel(game.platform)}</p>
        </div>
        {isRunning && (
          <StatusBadge tone="ok" dot>
            <Play size={10} /> {t('gameOpt.runningNow')}
          </StatusBadge>
        )}
      </div>

      {game.installPath && (
        <p className="text-[10px] text-gdim font-mono truncate mb-2" title={game.installPath}>
          {game.installPath}
        </p>
      )}

      {optimization ? (
        <div className="flex gap-2">
          <Button variant="primary" size="sm" onClick={() => onApply(optimization)} className="flex-1">
            {t('gameOpt.apply')}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onDeactivate(optimization)}>
            {t('gameOpt.deactivate')}
          </Button>
        </div>
      ) : (
        <Button variant="secondary" size="sm" onClick={() => onEdit(game)} className="w-full">
          {t('gameOpt.createProfile')}
        </Button>
      )}
    </Card>
  );
}

function getPlatformIcon(platform: string): string {
  const icons: Record<string, string> = {
    steam: '🎮',
    epic: '🎯',
    riot: '⚔️',
    xbox: '🟢',
    gog: '🟡',
    other: '🎲',
  };
  return icons[platform] || '🎮';
}

function getPlatformLabel(platform: string): string {
  const labels: Record<string, string> = {
    steam: 'Steam',
    epic: 'Epic Games',
    riot: 'Riot Games',
    xbox: 'Xbox / Game Pass',
    gog: 'GOG',
    other: 'Other',
  };
  return labels[platform] || 'Other';
}
