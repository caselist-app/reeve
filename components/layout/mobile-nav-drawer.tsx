'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import * as SheetPrimitive from '@radix-ui/react-dialog'
import { useMobileNav } from '@/stores/mobile-nav-store'
import { Sidebar } from '@/components/nav/sidebar'

interface Tour {
  id: string
  name: string
  artist_id: string
  artist_name: string
}

interface MobileNavDrawerProps {
  tours: Tour[]
  lastTourId?: string | null
}

// Renders the Sidebar inside a left-side Sheet on mobile. Controlled by
// useMobileNav so the hamburger in MobileTopBar can open it. Closes
// automatically whenever the pathname changes (i.e. the user navigated).
export function MobileNavDrawer({ tours, lastTourId }: MobileNavDrawerProps) {
  const { isOpen, close } = useMobileNav()
  const pathname = usePathname()

  useEffect(() => {
    close()
  }, [pathname, close])

  return (
    <SheetPrimitive.Root open={isOpen} onOpenChange={(open) => { if (!open) close() }}>
      <SheetPrimitive.Portal>
        <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 md:hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <SheetPrimitive.Content
          className="fixed inset-y-0 left-0 z-50 w-72 md:hidden bg-sidebar data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left duration-200"
        >
          <SheetPrimitive.Title className="sr-only">Navigation</SheetPrimitive.Title>
          <Sidebar tours={tours} lastTourId={lastTourId} />
        </SheetPrimitive.Content>
      </SheetPrimitive.Portal>
    </SheetPrimitive.Root>
  )
}
