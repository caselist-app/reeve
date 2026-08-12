'use client'

import Link from 'next/link'
import { useRef } from 'react'
import { X, Users, Plane, Building2, FileText, MessageCircle, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDismiss } from '@/hooks/use-dismiss'

interface TourSettingsPanelProps {
  tourId: string
  isOpen: boolean
  onClose: () => void
}

// Extractions is gone from here (REE-154): reviewing a forwarded email's
// proposed rows now happens in the Inbox, the same place every other kind of
// attention item is reviewed, rather than in a tour-scoped settings page of
// its own.
const SETTINGS_NAV = [
  { key: 'people',      href: (id: string) => `/tours/${id}/people`,      label: 'People',        icon: Users },
  { key: 'transport',   href: (id: string) => `/tours/${id}/transport`,   label: 'Transport',     icon: Plane },
  { key: 'hotels',      href: (id: string) => `/tours/${id}/hotels`,      label: 'Hotels',        icon: Building2 },
  { key: 'documents',   href: (id: string) => `/tours/${id}/documents`,   label: 'Documents',     icon: FileText },
  { key: 'whatsapp',    href: (id: string) => `/tours/${id}/settings`,    label: 'WhatsApp',      icon: MessageCircle },
  { key: 'settings',    href: (id: string) => `/tours/${id}/settings`,    label: 'Tour settings', icon: Settings },
] as const

export function TourSettingsPanel({
  tourId,
  isOpen,
  onClose,
}: TourSettingsPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useDismiss({ isOpen, onClose, ref: panelRef })

  return (
    <div
      ref={panelRef}
      className={cn(
        'absolute inset-0 bg-sidebar flex flex-col transition-transform duration-200 ease-out z-10 overflow-hidden',
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
        {SETTINGS_NAV.map(({ key, href, label, icon: Icon }) => (
          <Link
            key={key}
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
