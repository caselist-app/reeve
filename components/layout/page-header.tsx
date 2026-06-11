import { type ReactNode } from 'react'

interface PageHeaderProps {
  /** Small label rendered above the title, typically the artist act name. */
  eyebrow?: string
  title: string
  description?: string
  /** Buttons or other controls rendered flush-right. */
  actions?: ReactNode
}

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 mb-8">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-sm text-muted-foreground truncate">{eyebrow}</p>
        )}
        <h1 className="text-2xl font-semibold truncate">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0">{actions}</div>
      )}
    </div>
  )
}
