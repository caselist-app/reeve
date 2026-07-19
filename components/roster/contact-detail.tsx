'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Tables } from '@/lib/types/database'
import { passportStatus, formatExpiry } from '@/lib/roster/passport'
import { deleteContact } from '@/lib/actions/contacts'
import { PageHeader } from '@/components/layout/page-header'
import { ConnectTelegramDialog } from '@/components/roster/connect-telegram-dialog'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { DataField } from '@/components/ui/data-field'
import { ListRow } from '@/components/ui/list-row'
import { SectionHeader } from '@/components/ui/section-header'
import { StatusBadge, PASSPORT_VARIANT } from '@/components/ui/status-badge'
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

export function ContactDetail({ contact, tours }: Props) {
  const router = useRouter()
  const { open } = useSidePanel()
  const [error, setError] = useState<string | null>(null)
  const [telegramOpen, setTelegramOpen] = useState(false)
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
            {!contact.telegram_chat_id && (
              <Button size="sm" variant="outline" onClick={() => setTelegramOpen(true)}>
                <Send className="mr-1.5 h-3.5 w-3.5" />
                Connect Telegram
              </Button>
            )}
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

      <ConnectTelegramDialog
        contactId={contact.id}
        contactName={contact.name}
        open={telegramOpen}
        onOpenChange={setTelegramOpen}
      />

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      {/* Passport expiry alert — only shown when flagged */}
      {(status === 'expired' || status === 'soon') && contact.passport_expiry && (
        <div className={cn(
          'mb-6 flex items-center justify-between rounded-lg border px-4 py-3',
          status === 'expired' ? 'border-red-200 bg-red-500/5' : 'border-amber-200 bg-amber-500/5'
        )}>
          <p className="text-xs font-medium text-muted-foreground">Passport expiry</p>
          <StatusBadge
            label={`${formatExpiry(contact.passport_expiry)}${status === 'expired' ? ' (expired)' : ' (soon)'}`}
            variant={PASSPORT_VARIANT[status]}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-3">
        <DataField label="Email" value={contact.contact_email} />
        <DataField label="Phone" value={contact.contact_phone} mono />
        <DataField label="WhatsApp" value={contact.whatsapp_number} mono />
        <DataField
          label="Operational channel"
          value={contact.operational_channel ? contact.operational_channel.charAt(0).toUpperCase() + contact.operational_channel.slice(1) : null}
        />
        <DataField label="Formal emails" value={contact.email_enabled ? 'Enabled' : 'Disabled'} />
        <DataField
          label="Telegram"
          value={contact.telegram_chat_id ? (contact.telegram_username ? `Connected as @${contact.telegram_username}` : 'Connected') : null}
        />
        <DataField label="Home city" value={contact.home_city} />
        <DataField label="T-shirt" value={contact.tshirt_size} />
        <DataField label="Passport number" value={contact.passport_number} mono />
        <DataField label="Passport country" value={contact.passport_country} />
        <DataField label="Dietary" value={contact.dietary} />
        <DataField label="Allergies" value={contact.allergies} />
        <DataField label="Emergency contact" value={contact.emergency_contact_name} />
        <DataField label="Emergency phone" value={contact.emergency_contact_phone} mono />
      </div>

      {contact.notes && (
        <>
          <Separator className="my-6" />
          <SectionHeader>Notes</SectionHeader>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{contact.notes}</p>
        </>
      )}

      <Separator className="my-6" />

      <SectionHeader>On tours</SectionHeader>
      {tours.length === 0 ? (
        <p className="text-sm text-muted-foreground">Not on any tours yet.</p>
      ) : (
        <div className="space-y-1.5">
          {tours.map((t) => (
            <ListRow
              key={t.personId}
              href={`/tours/${t.tourId}/people`}
              className="flex items-center justify-between py-2.5 text-sm"
            >
              <span className="min-w-0">
                <span className="font-medium">{t.tourName}</span>
                {t.role && <span className="text-muted-foreground"> · {t.role}</span>}
              </span>
              <StatusBadge label={t.status} />
            </ListRow>
          ))}
        </div>
      )}
    </>
  )
}
