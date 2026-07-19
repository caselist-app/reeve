'use client'

import { useState, useId, useTransition } from 'react'
import { addPerson, updatePerson } from '@/lib/actions/people'
import { personSchema, crewDetailSchema } from '@/lib/validators/person'
import type { Tables } from '@/lib/types/database'
import type { PersonWithContact } from '@/components/people/people-view'
import { useSidePanel } from '@/stores/side-panel-store'
import { PanelShell } from '@/components/layout/panel-shell'
import { Button } from '@/components/ui/button'
import { SectionHeader } from '@/components/ui/section-header'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type PersonType = 'artist' | 'crew' | 'management' | 'support'
// Empty string represents no operational channel yet, a real state for a
// brand-new contact with no WhatsApp number and no Telegram link.
type OperationalChannel = 'whatsapp' | 'telegram' | ''

const CURRENCIES = ['GBP', 'USD', 'EUR', 'AUD', 'CAD', 'CHF', 'DKK', 'NOK', 'SEK', 'JPY', 'NZD']

interface Props {
  tourId: string
  defaultType: PersonType
  person: PersonWithContact | null
  crewDetail: Tables<'crew_detail'> | null
  onSuccess: () => void
}

export function PersonSheet({
  tourId,
  defaultType,
  person,
  crewDetail,
  onSuccess,
}: Props) {
  const formId = useId()
  const { close } = useSidePanel()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // The panel unmounts between opens so initial state is always fresh.
  const [personType, setPersonType] = useState<PersonType>(
    (person?.person_type as PersonType) ?? defaultType
  )
  const [operationalChannel, setOperationalChannel] = useState<OperationalChannel>(
    (person?.contacts.operational_channel as OperationalChannel) ?? ''
  )
  const [emailEnabled, setEmailEnabled] = useState(person?.contacts.email_enabled ?? false)
  const canUseTelegram = !!person?.contacts.telegram_chat_id
  const [perDiemCurrency, setPerDiemCurrency] = useState(crewDetail?.per_diem_currency ?? 'GBP')
  const [wageCurrency, setWageCurrency] = useState(crewDetail?.wage_currency ?? 'GBP')

  const isEditing = person !== null
  const isCrewType = personType === 'crew'

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const fd = new FormData(e.currentTarget)
    const str = (key: string) => (fd.get(key) as string) || undefined

    const rawPerson = {
      person_type: personType,
      name: (fd.get('name') as string) ?? '',
      role: str('role'),
      contact_email: str('contact_email'),
      contact_phone: str('contact_phone'),
      operational_channel: (operationalChannel || null) as 'whatsapp' | 'telegram' | null,
      email_enabled: emailEnabled,
      whatsapp_number: str('whatsapp_number'),
      sms_number: str('sms_number'),
      emergency_contact_name: str('emergency_contact_name'),
      emergency_contact_phone: str('emergency_contact_phone'),
      dietary: str('dietary'),
      allergies: str('allergies'),
      home_city: str('home_city'),
      passport_number: str('passport_number'),
      passport_expiry: str('passport_expiry'),
      passport_country: str('passport_country'),
      tshirt_size: str('tshirt_size'),
    }

    const parsed = personSchema.safeParse(rawPerson)
    if (!parsed.success) {
      setError(parsed.error.issues[0].message)
      return
    }

    const rawCrewDetail = isCrewType
      ? {
          per_diem_rate: fd.get('per_diem_rate') ? Number(fd.get('per_diem_rate')) : undefined,
          per_diem_currency: perDiemCurrency || undefined,
          daily_wage_rate: fd.get('daily_wage_rate') ? Number(fd.get('daily_wage_rate')) : undefined,
          wage_currency: wageCurrency || undefined,
        }
      : undefined

    const parsedCrew = rawCrewDetail ? crewDetailSchema.safeParse(rawCrewDetail) : null
    if (parsedCrew && !parsedCrew.success) {
      setError(parsedCrew.error.issues[0].message)
      return
    }

    startTransition(async () => {
      const result = isEditing
        ? await updatePerson(person.id, parsed.data, parsedCrew?.data)
        : await addPerson(tourId, parsed.data, parsedCrew?.data)

      if (result.error) {
        setError(result.error)
      } else {
        close()
        onSuccess()
      }
    })
  }

  return (
    <PanelShell
      title={isEditing ? `Edit ${person.contacts.name}` : `Add ${personType}`}
      description={isEditing ? "Update this person's details." : 'Add someone to the tour party.'}
    >
      <form onSubmit={handleSubmit} className="space-y-4 pb-8">
        <div className="space-y-2">
          <Label>Type</Label>
          <Select
            value={personType}
            onValueChange={(v) => setPersonType(v as PersonType)}
            disabled={isEditing}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="artist">Artist</SelectItem>
              <SelectItem value="crew">Crew</SelectItem>
              <SelectItem value="management">Management</SelectItem>
              <SelectItem value="support">Support</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${formId}-name`}>Name</Label>
          <Input
            id={`${formId}-name`}
            name="name"
            defaultValue={person?.contacts.name}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${formId}-role`}>Role</Label>
          <Input
            id={`${formId}-role`}
            name="role"
            defaultValue={person?.role ?? ''}
            placeholder="FOH Engineer"
          />
        </div>

        <Separator />
        <SectionHeader>Contact</SectionHeader>

        <div className="space-y-2">
          <Label htmlFor={`${formId}-contact_email`}>Email</Label>
          <Input
            id={`${formId}-contact_email`}
            name="contact_email"
            type="email"
            defaultValue={person?.contacts.contact_email ?? ''}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${formId}-contact_phone`}>Phone</Label>
          <Input
            id={`${formId}-contact_phone`}
            name="contact_phone"
            defaultValue={person?.contacts.contact_phone ?? ''}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Operational channel</Label>
            <Select
              value={operationalChannel}
              onValueChange={(v) => setOperationalChannel(v as OperationalChannel)}
            >
              <SelectTrigger>
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="telegram" disabled={!canUseTelegram}>
                  Telegram{!canUseTelegram ? ' (connect first)' : ''}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${formId}-whatsapp_number`}>
              WhatsApp
              <span className="ml-1 text-xs text-muted-foreground">E.164</span>
            </Label>
            <Input
              id={`${formId}-whatsapp_number`}
              name="whatsapp_number"
              defaultValue={person?.contacts.whatsapp_number ?? ''}
              placeholder="+447700900123"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3">
          <div className="space-y-0.5">
            <Label htmlFor={`${formId}-email_enabled`}>Also send formal emails</Label>
            <p className="text-xs text-muted-foreground">
              Riders and advancing documents, independent of the operational channel above.
            </p>
          </div>
          <Switch
            id={`${formId}-email_enabled`}
            checked={emailEnabled}
            onCheckedChange={setEmailEnabled}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${formId}-sms_number`}>SMS number</Label>
          <Input
            id={`${formId}-sms_number`}
            name="sms_number"
            defaultValue={person?.contacts.sms_number ?? ''}
          />
        </div>

        <Separator />
        <SectionHeader>Emergency contact</SectionHeader>

        <div className="space-y-2">
          <Label htmlFor={`${formId}-emergency_contact_name`}>Name</Label>
          <Input
            id={`${formId}-emergency_contact_name`}
            name="emergency_contact_name"
            defaultValue={person?.contacts.emergency_contact_name ?? ''}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${formId}-emergency_contact_phone`}>Phone</Label>
          <Input
            id={`${formId}-emergency_contact_phone`}
            name="emergency_contact_phone"
            defaultValue={person?.contacts.emergency_contact_phone ?? ''}
          />
        </div>

        <Separator />
        <SectionHeader>Travel</SectionHeader>

        <div className="space-y-2">
          <Label htmlFor={`${formId}-home_city`}>Home city</Label>
          <Input
            id={`${formId}-home_city`}
            name="home_city"
            defaultValue={person?.contacts.home_city ?? ''}
            placeholder="London"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor={`${formId}-passport_number`}>Passport number</Label>
            <Input
              id={`${formId}-passport_number`}
              name="passport_number"
              defaultValue={person?.contacts.passport_number ?? ''}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${formId}-passport_expiry`}>Expiry</Label>
            <Input
              id={`${formId}-passport_expiry`}
              name="passport_expiry"
              type="date"
              defaultValue={person?.contacts.passport_expiry ?? ''}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${formId}-passport_country`}>Issuing country</Label>
          <Input
            id={`${formId}-passport_country`}
            name="passport_country"
            defaultValue={person?.contacts.passport_country ?? ''}
            placeholder="GBR"
          />
        </div>

        <Separator />
        <SectionHeader>Dietary</SectionHeader>
        <p className="text-xs text-muted-foreground">
          Source of truth for riders and day sheets. Never duplicated elsewhere.
        </p>

        <div className="space-y-2">
          <Label htmlFor={`${formId}-dietary`}>Requirements</Label>
          <Textarea
            id={`${formId}-dietary`}
            name="dietary"
            defaultValue={person?.contacts.dietary ?? ''}
            placeholder="Vegan"
            rows={2}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${formId}-allergies`}>Allergies</Label>
          <Textarea
            id={`${formId}-allergies`}
            name="allergies"
            defaultValue={person?.contacts.allergies ?? ''}
            placeholder="Nuts, dairy"
            rows={2}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${formId}-tshirt_size`}>T-shirt size</Label>
          <Input
            id={`${formId}-tshirt_size`}
            name="tshirt_size"
            defaultValue={person?.contacts.tshirt_size ?? ''}
            placeholder="L"
          />
        </div>

        {isCrewType && (
          <>
            <Separator />
            <SectionHeader>Pay and per diems</SectionHeader>
            <p className="text-xs text-muted-foreground">
              All optional. Used for settlement and per diem calculations.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor={`${formId}-per_diem_rate`}>Per diem</Label>
                <Input
                  id={`${formId}-per_diem_rate`}
                  name="per_diem_rate"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={crewDetail?.per_diem_rate ?? ''}
                />
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select value={perDiemCurrency} onValueChange={setPerDiemCurrency}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${formId}-daily_wage_rate`}>Daily wage</Label>
                <Input
                  id={`${formId}-daily_wage_rate`}
                  name="daily_wage_rate"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={crewDetail?.daily_wage_rate ?? ''}
                />
              </div>
              <div className="space-y-2">
                <Label>Wage currency</Label>
                <Select value={wageCurrency} onValueChange={setWageCurrency}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" disabled={pending} className="w-full">
          {pending
            ? 'Saving...'
            : isEditing
              ? 'Save changes'
              : `Add ${personType}`}
        </Button>
      </form>
    </PanelShell>
  )
}
