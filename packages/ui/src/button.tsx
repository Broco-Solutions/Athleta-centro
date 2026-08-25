import type { ButtonHTMLAttributes } from 'react';
import { cn } from './lib/utils';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' };
export function Button({ className, variant = 'primary', type = 'button', ...props }: ButtonProps): React.JSX.Element {
  const styles = { primary: 'bg-primary text-primary-foreground hover:bg-primary-hover', secondary: 'border border-border bg-white text-foreground hover:bg-surface-muted', ghost: 'text-muted-foreground hover:bg-surface-muted hover:text-foreground' };
  return <button type={type} className={cn('inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50', styles[variant], className)} {...props} />;
}
