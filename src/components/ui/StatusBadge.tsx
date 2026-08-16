import React from 'react';

type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'muted' | 'active';

interface Props {
  tone: Tone;
  children: React.ReactNode;
  dot?: boolean;
}

const TONES: Record<Tone, string> = {
  ok: 'text-gaccent bg-gaccent-dim border-gaccent/30',
  warn: 'text-gwarn bg-gwarn/10 border-gwarn/30',
  bad: 'text-gdanger bg-gdanger/10 border-gdanger/30',
  info: 'text-ginfo bg-ginfo/10 border-ginfo/30',
  muted: 'text-gmuted bg-gpanel2 border-gborder2',
  active: 'text-gaccent bg-gaccent-dim border-gaccent/40',
};

const DOT_TONES: Record<Tone, string> = {
  ok: 'bg-gaccent',
  warn: 'bg-gwarn',
  bad: 'bg-gdanger',
  info: 'bg-ginfo',
  muted: 'bg-gdim',
  active: 'bg-gaccent',
};

export function StatusBadge({ tone, children, dot }: Props) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full border ${TONES[tone]}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${DOT_TONES[tone]}`} />}
      {children}
    </span>
  );
}
