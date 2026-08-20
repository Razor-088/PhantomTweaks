import React from 'react';

type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'muted' | 'active';

interface Props {
  tone: Tone;
  children: React.ReactNode;
  dot?: boolean;
}

const TONES: Record<Tone, string> = {
  ok: 'text-green-400 bg-green-500/10 border-green-500/20 shadow-[0_0_8px_rgba(74,222,128,0.08)]',
  warn: 'text-gwarn bg-gwarn/8 border-gwarn/20 shadow-[0_0_8px_rgba(255,184,77,0.08)]',
  bad: 'text-gdanger bg-gdanger/8 border-gdanger/20 shadow-[0_0_8px_rgba(255,77,109,0.08)]',
  info: 'text-ginfo bg-ginfo/8 border-ginfo/20 shadow-[0_0_8px_rgba(77,195,255,0.08)]',
  muted: 'text-gmuted bg-gpanel2 border-gborder2/50',
  active: 'text-gaccent bg-gaccent/8 border-gaccent/20 shadow-[0_0_8px_rgba(0,255,136,0.08)]',
};

const DOT_TONES: Record<Tone, string> = {
  ok: 'bg-green-400',
  warn: 'bg-gwarn',
  bad: 'bg-gdanger',
  info: 'bg-ginfo',
  muted: 'bg-gdim',
  active: 'bg-gaccent',
};

export function StatusBadge({ tone, children, dot }: Props) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10.5px] font-semibold px-2.5 py-0.5 rounded-full border tracking-wide ${TONES[tone]}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${DOT_TONES[tone]} animate-pulse-soft`} />}
      {children}
    </span>
  );
}
