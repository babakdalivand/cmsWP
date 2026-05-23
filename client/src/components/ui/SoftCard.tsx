import { ReactNode, HTMLAttributes } from 'react';

interface Props extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  inset?: boolean;       // pressed-in look (useful for inputs/inner regions)
  padding?: 'sm' | 'md' | 'lg';
  hoverable?: boolean;
}

/**
 * Soft card surface.
 *  - Always has a subtle border so the card is visible in dark mode where
 *    neumorphism shadows alone provide too little contrast.
 *  - In light mode the warm shadow + cream surface gives the puffy
 *    "Soft Neumorphism" look from the RAHA mock-up.
 *  - Inset variant: pressed-in look for inputs / nested regions.
 */
export default function SoftCard({
  children,
  inset = false,
  padding = 'md',
  hoverable = false,
  className = '',
  ...rest
}: Props) {
  const pad = padding === 'sm' ? 'p-3' : padding === 'lg' ? 'p-6' : 'p-4';
  const shadow = inset ? 'shadow-soft-inset' : 'shadow-soft';
  const interactive = hoverable
    ? 'transition-all hover:scale-[1.02] hover:border-blue/40 cursor-pointer'
    : '';
  return (
    <div
      className={`bg-surface border border-border rounded-2xl ${shadow} ${pad} ${interactive} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
