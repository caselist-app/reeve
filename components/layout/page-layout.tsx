import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface PageLayoutProps {
  children: ReactNode
  /** Tailwind max-width class. Defaults to max-w-5xl. */
  maxWidth?: 'max-w-lg' | 'max-w-2xl' | 'max-w-3xl' | 'max-w-5xl' | 'max-w-7xl'
  className?: string
}

export function PageLayout({ children, maxWidth = 'max-w-5xl', className }: PageLayoutProps) {
  return (
    <div className={cn('mx-auto px-6 py-10', maxWidth, className)}>
      {children}
    </div>
  )
}
