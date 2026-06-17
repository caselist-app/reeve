'use client'

import { useState, useTransition, useEffect } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Tables } from '@/lib/types/database'
import { passportStatus, formatExpiry } from '@/lib/roster/passport'
import { getContact, deleteContact } from '@/lib/actions/contacts'
import type { TourMembership } from '@/lib/actions/contacts'
import { useSidePanel } from '@/stores/side-panel-store'
import { Button } from '@/components/ui/button'
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

interface Props {
  contactId: string
  onSuccess: () => void
}

export function ContactPanel({ contactId, onSuccess }: Props) {
  const { close, open } = useSidePanel()
  const [contact, setContact] = useState<Tables<'contacts'> | null>(null)
  const [tours, setTours] = useState<TourMembership[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
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
      // After saving, swap back to the view panel so the user sees updated data.
      onSuccess: (updatedId) => {
        open({ type: 'contact-view', contactId: updatedId ?? contactId, onSuccess })
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

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-5 py-4 shrink-0 border-b border-border">
        <div className="min-w-0">
          {contact?.default_role && (
            <p className="text-xs text-muted-foreground">{contact.default_role}</p>
          )}
          <h2 className="text-sm font-semibold truncate">
            {loading ? 'Loading...' : (contact?.name ?? 'Contact')}
          </h2>
        </div>
        <div className="flex items-center gap-1 shrink-0 mt-0.5">
          {contact && (
            <>
              <Button size="sm" variant="outline" onClick={handleEdit}>
                Edit
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                  >
                    Delete
                  </Button>
                </AlertDialogTrigger>
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
          )}
          <button
            type="button"
            onClick={close}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors ml-1"
            aria-label="Close panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-5">
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

            {(() => {
              const fields = [
                { label: 'Email', value: contact.contact_email, mono: false, copyable: true },
                { label: 'Phone', value: contact.contact_phone, mono: true, copyable: true },
                { label: 'WhatsApp', value: contact.whatsapp_number, mono: true, copyable: true },
                { label: 'Preferred channel', value: contact.preferred_channel ? contact.preferred_channel.charAt(0).toUpperCase() + contact.preferred_channel.slice(1) : null, mono: false, copyable: false },
                { label: 'Home city', value: contact.home_city, mono: false, copyable: false },
                { label: 'T-shirt', value: contact.tshirt_size, mono: false, copyable: false },
                { label: 'Passport number', value: contact.passport_number, mono: true, copyable: true },
                { label: 'Passport country', value: contact.passport_country, mono: false, copyable: false },
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
                  <Link
                    key={t.personId}
                    href={`/tours/${t.tourId}/people`}
                    className="flex items-center justify-between rounded-xl border border-border px-4 py-2.5 text-sm transition-colors hover:bg-muted/50"
                    onClick={close}
                  >
                    <span className="min-w-0">
                      <span className="font-medium">{t.tourName}</span>
                      {t.role && (
                        <span className="text-muted-foreground"> · {t.role}</span>
                      )}
                    </span>
                    <StatusBadge label={t.status} />
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
