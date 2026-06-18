import { cn } from '@/lib/utils'

export type StatusVariant = 'default' | 'success' | 'warning' | 'danger' | 'info'

const VARIANT_CLASSES: Record<StatusVariant, string> = {
  default: 'bg-muted text-muted-foreground',
  success: 'bg-green-500/10 text-green-700 dark:text-green-400',
  warning: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  danger: 'bg-red-500/10 text-red-700 dark:text-red-400',
  info: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
}

interface StatusBadgeProps {
  label: string
  variant?: StatusVariant
  className?: string
}

export function StatusBadge({ label, variant = 'default', className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        VARIANT_CLASSES[variant],
        className
      )}
    >
      {label}
    </span>
  )
}

// Variant maps for common Reeve status strings. Callers import the map they need.

export const TRANSPORT_VARIANT: Record<string, StatusVariant> = {
  planned: 'warning',
  booked: 'success',
  ticketed: 'info',
  changed: 'warning',
  cancelled: 'default',
}

export const TOUR_STATUS_VARIANT: Record<string, StatusVariant> = {
  planning: 'default',
  active: 'success',
  completed: 'default',
  archived: 'default',
}

// 'none' and 'ok' are intentionally absent — no badge when passport is fine or not set.
export const PASSPORT_VARIANT: Record<string, StatusVariant> = {
  soon: 'warning',
  expired: 'danger',
}
