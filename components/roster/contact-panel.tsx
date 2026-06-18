'use client'

import { useState, useTransition, useEffect } from 'react'
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Tables } from '@/lib/types/database'
import { passportStatus, formatExpiry } from '@/lib/roster/passport'
import { getContact, deleteContact } from '@/lib/actions/contacts'
import type { TourMembership } from '@/lib/actions/contacts'
import type { ContactTourContext } from '@/stores/side-panel-store'
import { useSidePanel } from '@/stores/side-panel-store'
import { PanelShell } from '@/components/layout/panel-shell'
import { Button } from '@/components/ui/button'
import { ListRow } from '@/components/ui/list-row'
import { Separator } from '@/components/ui/separator'
import { DataField } from '@/components/ui/data-field'
import { SectionHeader } from '@/components/ui/section-header'
import { StatusBadge, PASSPORT_VARIANT } from '@/components/ui/status-badge'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface Props {
  contactId: string
  // When provided, the panel shows tour-specific terms (type, role, per diems)
  // and the edit flow passes them through to ContactSheet.
  tourContext?: ContactTourContext & { mode: 'edit' }
  onSuccess: () => void
}

export function ContactPanel({ contactId, tourContext, onSuccess }: Props) {
  const { close, open } = useSidePanel()
  const [contact, setContact] = useState<Tables<'contacts'> | null>(null)
  const [tours, setTours] = useState<TourMembership[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    getContact(contactId)
      .then(({ data, error }) => {
        if (data) {
          setContact(data.contact)
          setTours(data.tours)
        } else {
          setFetchError(error ?? 'Could not load contact.')
        }
      })
      .catch(() => setFetchError('Could not load contact.'))
      .finally(() => setLoading(false))
  }, [contactId])

  function handleEdit() {
    if (!contact) return
    open({
      type: 'contact',
      contact,
      tourContext,
      // After saving, swap back to the view panel so the user sees updated data.
      onSuccess: (updatedId) => {
        open({ type: 'contact-view', contactId: updatedId ?? contactId, tourContext, onSuccess })
      },
    })
  }

  function handleDelete() {
    setDeleteError(null)
    startTransition(async () => {
      const result = await deleteContact(contactId)
      if (result.error) {
        setDeleteError(result.error)
      } else {
        close()
        onSuccess()
      }
    })
  }

  const status = contact?.passport_expiry ? passportStatus(contact.passport_expiry) : null

  const headerAction = contact ? (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleEdit}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => setDeleteOpen(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {contact.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes them from your roster. A contact on a tour cannot be deleted;
              remove them from their tours first. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={pending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  ) : undefined

  // Tour terms shown at the top when opened from the people page.
  const tourTermsFields = tourContext
    ? [
        { label: 'Type', value: tourContext.personType, mono: false, copyable: false },
        { label: 'Role', value: tourContext.role, mono: false, copyable: false },
        tourContext.personType === 'crew' && tourContext.crewDetail?.per_diem_rate != null
          ? { label: 'Per diem', value: `${tourContext.crewDetail.per_diem_rate} ${tourContext.crewDetail.per_diem_currency ?? ''}`.trim(), mono: false, copyable: false }
          : null,
        tourContext.personType === 'crew' && tourContext.crewDetail?.daily_wage_rate != null
          ? { label: 'Daily wage', value: `${tourContext.crewDetail.daily_wage_rate} ${tourContext.crewDetail.wage_currency ?? ''}`.trim(), mono: false, copyable: false }
          : null,
      ].filter((f): f is NonNullable<typeof f> => f !== null && f.value != null && f.value !== '')
    : []

  return (
    <PanelShell
      title={loading ? 'Loading...' : (contact?.name ?? 'Contact')}
      description={tourContext ? tourContext.role ?? tourContext.personType : (contact?.default_role ?? undefined)}
      headerAction={headerAction}
    >
      {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {fetchError && <p className="text-sm text-destructive">{fetchError}</p>}
      {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}

      {contact && (
        <>
          {/* Passport expiry alert — only shown when flagged */}
          {(status === 'expired' || status === 'soon') && contact.passport_expiry && (
            <div className={cn(
              'mb-5 flex items-center justify-between rounded-lg border px-4 py-3',
              status === 'expired' ? 'border-red-200 bg-red-500/5' : 'border-amber-200 bg-amber-500/5'
            )}>
              <p className="text-xs font-medium text-muted-foreground">Passport expiry</p>
              <StatusBadge
                label={`${formatExpiry(contact.passport_expiry)}${status === 'expired' ? ' (expired)' : ' (soon)'}`}
                variant={PASSPORT_VARIANT[status]}
              />
            </div>
          )}

          {/* Tour terms — only when opened from people page */}
          {tourTermsFields.length > 0 && (
            <>
              <SectionHeader>On this tour</SectionHeader>
              <div className="mb-5 grid grid-cols-2 gap-x-6 gap-y-5">
                {tourTermsFields.map((f) => (
                  <DataField key={f.label} label={f.label} value={f.value!} mono={f.mono} copyable={f.copyable} />
                ))}
              </div>
              <Separator className="mb-5" />
            </>
          )}

          {(() => {
            const fields = [
              { label: 'Email', value: contact.contact_email, mono: false, copyable: true },
              { label: 'Phone', value: contact.contact_phone, mono: true, copyable: true },
              { label: 'Preferred channel', value: contact.preferred_channel ? contact.preferred_channel.charAt(0).toUpperCase() + contact.preferred_channel.slice(1) : null, mono: false, copyable: false },
              { label: 'Home city', value: contact.home_city, mono: false, copyable: false },
              { label: 'T-shirt', value: contact.tshirt_size, mono: false, copyable: false },
              { label: 'Date of birth', value: contact.date_of_birth ? new Date(contact.date_of_birth).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : null, mono: false, copyable: false },
              { label: 'Passport number', value: contact.passport_number, mono: true, copyable: true },
              { label: 'Issuing country', value: contact.passport_country, mono: false, copyable: false },
              { label: 'Expiry', value: contact.passport_expiry ? formatExpiry(contact.passport_expiry) : null, mono: false, copyable: false },
              { label: 'First names (passport)', value: contact.passport_first_names, mono: false, copyable: true },
              { label: 'Surname (passport)', value: contact.passport_surname, mono: false, copyable: true },
              { label: 'Dietary', value: contact.dietary, mono: false, copyable: false },
              { label: 'Allergies', value: contact.allergies, mono: false, copyable: false },
              { label: 'Emergency contact', value: contact.emergency_contact_name, mono: false, copyable: false },
              { label: 'Emergency phone', value: contact.emergency_contact_phone, mono: true, copyable: true },
            ].filter((f) => f.value)

            return fields.length > 0 ? (
              <div className="grid grid-cols-2 gap-x-6 gap-y-5">
                {fields.map((f) => (
                  <DataField key={f.label} label={f.label} value={f.value} mono={f.mono} copyable={f.copyable} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No details added yet.</p>
            )
          })()}

          {contact.notes && (
            <>
              <Separator className="my-5" />
              <SectionHeader>Notes</SectionHeader>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{contact.notes}</p>
            </>
          )}

          <Separator className="my-5" />

          <SectionHeader>On tours</SectionHeader>
          {tours.length === 0 ? (
            <p className="text-sm text-muted-foreground">Not on any tours yet.</p>
          ) : (
            <div className="space-y-1.5">
              {tours.map((t) => (
                <ListRow
                  key={t.personId}
                  href={`/tours/${t.tourId}/people`}
                  onClick={close}
                  className="flex items-center justify-between py-2.5 text-sm"
                >
                  <span className="min-w-0">
                    <span className="font-medium">{t.tourName}</span>
                    {t.role && (
                      <span className="text-muted-foreground"> · {t.role}</span>
                    )}
                  </span>
                  <StatusBadge label={t.status} />
                </ListRow>
              ))}
            </div>
          )}
        </>
      )}
    </PanelShell>
  )
}
