import { ReactNode, HTMLAttributes } from 'react';

interface Props extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  inset?: boolean;       // pressed-in look (useful for inputs/inner regions)
  padding?: 'sm' | 'md' | 'lg';
}

/**
 * Soft Neumorphism card.
 *  - Uses CSS-variable-driven shadows so it adapts to dark / light theme.
 *  - Outer variant: floats above the surface
 *  - Inset variant: pressed-in look
 */
export default function SoftCard({
  children,
  inset = false,
  padding = 'md',
  className = '',
  ...rest
}: Props) {
  const pad = padding === 'sm' ? 'p-3' : padding === 'lg' ? 'p-6' : 'p-4';
  const shadow = inset ? 'shadow-soft-inset' : 'shadow-soft';
  return (
    <div
      className={`bg-surface rounded-2xl ${shadow} ${pad} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
