'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { X, Users, Plane, Building2, FileText, MessageCircle, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TourSettingsPanelProps {
  tourId: string
  isOpen: boolean
  onClose: () => void
}

const SETTINGS_NAV = [
  { href: (id: string) => `/tours/${id}/people`,    label: 'People',        icon: Users },
  { href: (id: string) => `/tours/${id}/transport`, label: 'Transport',     icon: Plane },
  { href: (id: string) => `/tours/${id}/hotels`,    label: 'Hotels',        icon: Building2 },
  { href: (id: string) => `/tours/${id}/settings`,  label: 'Documents',     icon: FileText },
  { href: (id: string) => `/tours/${id}/settings`,  label: 'WhatsApp',      icon: MessageCircle },
  { href: (id: string) => `/tours/${id}/settings`,  label: 'Tour settings', icon: Settings },
] as const

export function TourSettingsPanel({ tourId, isOpen, onClose }: TourSettingsPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Close on Escape.
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  // Close on outside click.
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (isOpen && panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isOpen, onClose])

  return (
    <div
      ref={panelRef}
      className={cn(
        'absolute inset-0 bg-sidebar flex flex-col transition-transform duration-200 ease-out z-10',
        isOpen ? 'translate-x-0' : '-translate-x-full',
      )}
    >
      <div className="flex items-center justify-between px-4 pt-5 pb-4">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--sidebar-muted-foreground)' }}>
          Tour
        </p>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close settings"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <nav className="px-3 space-y-0.5">
        {SETTINGS_NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={label}
            href={href(tourId)}
            onClick={onClose}
            className={cn(
              'flex items-center gap-2.5 rounded-lg px-2 h-7 text-xs font-medium transition-colors',
              'hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
            )}
            style={{ color: 'var(--sidebar-muted-foreground)' }}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  )
}
