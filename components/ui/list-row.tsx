import Link from 'next/link'
import { cn } from '@/lib/utils'

const SEVERITY_CLASSES = {
  danger: 'border-destructive/30 bg-destructive/5',
  warning: 'border-amber-500/20 bg-amber-50/50 dark:bg-amber-950/20',
} as const

interface ListRowProps {
  /** Renders as a next/link when set. */
  href?: string
  /** Renders as a button when set (and no href). Also allowed alongside href. */
  onClick?: () => void
  /** Hover affordance. Defaults to true when href or onClick is present. */
  interactive?: boolean
  /** Tints the border and background for attention items. */
  severity?: keyof typeof SEVERITY_CLASSES
  className?: string
  children: React.ReactNode
}

// The shared clickable-row card. Owns the chrome (rounded-xl border, hover,
// severity tint); callers supply the inner layout via className (flex, gap,
// padding overrides). Replaces the rounded-xl border row markup that had been
// copy-pasted across the roster, people and attention surfaces.
export function ListRow({ href, onClick, interactive, severity, className, children }: ListRowProps) {
  const isInteractive = interactive ?? (href != null || onClick != null)

  const classes = cn(
    'rounded-xl border border-border px-4 py-3 transition-colors',
    isInteractive && 'hover:bg-muted/50',
    severity && SEVERITY_CLASSES[severity],
    className,
  )

  if (href) {
    return (
      <Link href={href} onClick={onClick} className={classes}>
        {children}
      </Link>
    )
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn('w-full text-left', classes)}>
        {children}
      </button>
    )
  }

  return <div className={classes}>{children}</div>
}
