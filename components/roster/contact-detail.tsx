'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Tables } from '@/lib/types/database'
import { passportStatus, formatExpiry, PASSPORT_CLASS } from '@/lib/roster/passport'
import { deleteContact } from '@/lib/actions/contacts'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useSidePanel } from '@/stores/side-panel-store'
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

type TourMembership = {
  personId: string
  tourId: string
  tourName: string
  artistAct: string
  status: string
  role: string | null
  personType: string
}

interface Props {
  contact: Tables<'contacts'>
  tours: TourMembership[]
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm">{value || '-'}</p>
    </div>
  )
}

export function ContactDetail({ contact, tours }: Props) {
  const router = useRouter()
  const { open } = useSidePanel()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const status = passportStatus(contact.passport_expiry)

  function handleDelete() {
    setError(null)
    startTransition(async () => {
      const result = await deleteContact(contact.id)
      if (result.error) {
        setError(result.error)
      } else {
        router.push('/roster')
      }
    })
  }

  function handleEdit() {
    open({
      type: 'contact',
      contact,
      onSuccess: () => router.refresh(),
    })
  }

  return (
    <>
      <Link
        href="/roster"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Roster
      </Link>

      <PageHeader
        eyebrow={contact.default_role ?? undefined}
        title={contact.name}
        actions={
          <>
            <Button size="sm" variant="outline" onClick={handleEdit}>
              Edit
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {contact.name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This removes them from your roster. A contact who is on a tour cannot be deleted;
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
        }
      />

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      {contact.passport_expiry && (
        <div className="mb-6 rounded-md border px-4 py-3">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Passport expiry</p>
          <p className={cn('text-sm', PASSPORT_CLASS[status])}>
            {formatExpiry(contact.passport_expiry)}
            {status === 'expired' && ', expired'}
            {status === 'soon' && ', within 90 days'}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
        <Field label="Email" value={contact.contact_email} />
        <Field label="Phone" value={contact.contact_phone} />
        <Field label="WhatsApp" value={contact.whatsapp_number} />
        <Field label="Preferred channel" value={contact.preferred_channel} />
        <Field label="Home city" value={contact.home_city} />
        <Field label="T-shirt" value={contact.tshirt_size} />
        <Field label="Passport number" value={contact.passport_number} />
        <Field label="Passport country" value={contact.passport_country} />
        <Field label="Dietary" value={contact.dietary} />
        <Field label="Allergies" value={contact.allergies} />
        <Field label="Emergency contact" value={contact.emergency_contact_name} />
        <Field label="Emergency phone" value={contact.emergency_contact_phone} />
      </div>

      {contact.notes && (
        <>
          <Separator className="my-6" />
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Notes</p>
          <p className="mt-1 whitespace-pre-wrap text-sm">{contact.notes}</p>
        </>
      )}

      <Separator className="my-6" />

      <h2 className="mb-3 text-sm font-semibold">On tours</h2>
      {tours.length === 0 ? (
        <p className="text-sm text-muted-foreground">Not on any tours yet.</p>
      ) : (
        <div className="space-y-1.5">
          {tours.map((t) => (
            <Link
              key={t.personId}
              href={`/tours/${t.tourId}/people`}
              className="flex items-center justify-between rounded-md border px-4 py-2.5 text-sm transition-colors hover:bg-muted/30"
            >
              <span className="min-w-0">
                <span className="font-medium">{t.tourName}</span>
                {t.role && <span className="text-muted-foreground"> · {t.role}</span>}
              </span>
              <span className="shrink-0 text-xs uppercase tracking-wider text-muted-foreground">
                {t.status}
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
