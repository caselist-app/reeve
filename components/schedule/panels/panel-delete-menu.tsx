'use client'

import { useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

// The one delete affordance every schedule panel uses: a three-dots menu in the
// panel header (via PanelShell's headerAction) whose one item opens a confirm
// dialog. It matches the roster contact panel, which is the shape a TM already
// knows. Before REE-86 the day-item, venue and transport panels each drew their
// own: two as a full-width red button glued to the bottom of the form, one as a
// near-identical local copy of this. The full-width button read as a mistake, so
// this exists to stop the three drifting apart again.
//
// The parent owns the delete itself: onConfirm runs the server action and the
// navigation (close the panel, refresh) and returns an error string, or null on
// success. On success the whole panel unmounts, so this component only has to
// hold the dialog open until then and surface an error if one comes back.

interface PanelDeleteMenuProps {
  // The destructive menu item and the confirm button, e.g. "Delete flight",
  // "Remove from the day". The verb is the panel's to choose.
  menuLabel: string
  confirmLabel: string
  // Shown while the delete is in flight, e.g. "Removing...".
  pendingLabel: string
  dialogTitle: string
  dialogDescription: React.ReactNode
  // Accessible label for the trigger, since the button is icon-only.
  triggerLabel: string
  onConfirm: () => Promise<string | null>
  // Non-destructive items rendered above the delete item, separated from it, for
  // panels that hang a second action off the same three-dots menu (e.g. the guest
  // list's per-row "Send confirmation"). The caller passes DropdownMenuItem nodes.
  extraItems?: React.ReactNode
}

export function PanelDeleteMenu({
  menuLabel,
  confirmLabel,
  pendingLabel,
  dialogTitle,
  dialogDescription,
  triggerLabel,
  onConfirm,
  extraItems,
}: PanelDeleteMenuProps) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm(e: React.MouseEvent) {
    // Radix closes the dialog on Action click by default. Hold it open across
    // the await so an error can render inside it; the parent unmounts the whole
    // panel on success, so there is nothing left to close on the happy path.
    e.preventDefault()
    setError(null)
    setPending(true)
    const err = await onConfirm()
    setPending(false)
    if (err) {
      setError(err)
      return
    }
    setOpen(false)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={triggerLabel}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {extraItems}
          {extraItems && <DropdownMenuSeparator />}
          <DropdownMenuItem
            onClick={() => setOpen(true)}
            className="text-destructive focus:text-destructive"
          >
            {menuLabel}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialogTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {dialogDescription}
              {error && <span className="mt-2 block text-destructive">{error}</span>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              disabled={pending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {pending ? pendingLabel : confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
