'use client'

import { useState, useId, useTransition } from 'react'
import { createContact, updateContact } from '@/lib/actions/contacts'
import { contactSchema } from '@/lib/validators/contact'
import type { Tables } from '@/lib/types/database'
import { useSidePanel } from '@/stores/side-panel-store'
import { PanelShell } from '@/components/layout/panel-shell'
import { Button } from '@/components/ui/button'
import { SectionHeader } from '@/components/ui/section-header'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type Channel = 'whatsapp' | 'email' | 'both'
type PersonType = 'artist' | 'crew' | 'management' | 'support'

const CURRENCIES = ['GBP', 'USD', 'EUR', 'AUD', 'CAD', 'CHF', 'DKK', 'NOK', 'SEK', 'JPY', 'NZD']

interface Props {
  contact: Tables<'contacts'> | null
  onSuccess: (contactId?: string) => void
}

export function ContactSheet({ contact, onSuccess }: Props) {
  const formId = useId()
  const { close } = useSidePanel()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Panel unmounts between opens, so initial state is always fresh.
  const [preferredChannel, setPreferredChannel] = useState<Channel>(
    (contact?.preferred_channel as Channel) ?? 'whatsapp'
  )
  const [defaultType, setDefaultType] = useState<PersonType>(
    (contact?.default_person_type as PersonType) ?? 'crew'
  )
  const [perDiemCurrency, setPerDiemCurrency] = useState(contact?.default_per_diem_currency ?? 'GBP')
  const [wageCurrency, setWageCurrency] = useState(contact?.default_wage_currency ?? 'GBP')

  const isEditing = contact !== null

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const fd = new FormData(e.currentTarget)
    const str = (key: string) => (fd.get(key) as string) || undefined
    const num = (key: string) => (fd.get(key) ? Number(fd.get(key)) : undefined)

    const raw = {
      name: (fd.get('name') as string) ?? '',
      contact_email: str('contact_email'),
      contact_phone: str('contact_phone'),
      preferred_channel: preferredChannel,
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
      passport_first_names: str('passport_first_names'),
      passport_surname: str('passport_surname'),
      tshirt_size: str('tshirt_size'),
      default_person_type: defaultType,
      default_role: str('default_role'),
      default_per_diem_rate: num('default_per_diem_rate'),
      default_per_diem_currency: perDiemCurrency || undefined,
      default_daily_wage_rate: num('default_daily_wage_rate'),
      default_wage_currency: wageCurrency || undefined,
      notes: str('notes'),
    }

    const parsed = contactSchema.safeParse(raw)
    if (!parsed.success) {
      setError(parsed.error.issues[0].message)
      return
    }

    startTransition(async () => {
      const result = isEditing
        ? await updateContact(contact.id, parsed.data)
        : await createContact(parsed.data)

      if (result.error) {
        setError(result.error)
      } else {
        close()
        onSuccess(result.contactId)
      }
    })
  }

  return (
    <PanelShell
      title={isEditing ? `Edit ${contact.name}` : 'New contact'}
      description={
        isEditing
          ? "Update this person's details. Changes apply on every tour they are on."
          : 'Add someone to your roster. You can add them to a tour later.'
      }
      headerAction={
        <Button type="submit" form={formId} size="sm" disabled={pending}>
          {pending ? 'Saving...' : 'Save'}
        </Button>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4 pb-8">
        <div className="space-y-2">
          <Label htmlFor={`${formId}-name`}>Name</Label>
          <Input id={`${formId}-name`} name="name" defaultValue={contact?.name} required />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Default type</Label>
            <Select value={defaultType} onValueChange={(v) => setDefaultType(v as PersonType)}>
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
            <Label htmlFor={`${formId}-default_role`}>Default role</Label>
            <Input
              id={`${formId}-default_role`}
              name="default_role"
              defaultValue={contact?.default_role ?? ''}
              placeholder="FOH Engineer"
            />
          </div>
        </div>

        <Separator />
        <SectionHeader>Contact</SectionHeader>

        <div className="space-y-2">
          <Label htmlFor={`${formId}-contact_email`}>Email</Label>
          <Input
            id={`${formId}-contact_email`}
            name="contact_email"
            type="email"
            defaultValue={contact?.contact_email ?? ''}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${formId}-contact_phone`}>Phone</Label>
          <Input
            id={`${formId}-contact_phone`}
            name="contact_phone"
            defaultValue={contact?.contact_phone ?? ''}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Preferred channel</Label>
            <Select value={preferredChannel} onValueChange={(v) => setPreferredChannel(v as Channel)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="both">Both</SelectItem>
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
              defaultValue={contact?.whatsapp_number ?? ''}
              placeholder="+447700900123"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${formId}-sms_number`}>SMS number</Label>
          <Input id={`${formId}-sms_number`} name="sms_number" defaultValue={contact?.sms_number ?? ''} />
        </div>

        <Separator />
        <SectionHeader>Emergency contact</SectionHeader>

        <div className="space-y-2">
          <Label htmlFor={`${formId}-emergency_contact_name`}>Name</Label>
          <Input
            id={`${formId}-emergency_contact_name`}
            name="emergency_contact_name"
            defaultValue={contact?.emergency_contact_name ?? ''}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${formId}-emergency_contact_phone`}>Phone</Label>
          <Input
            id={`${formId}-emergency_contact_phone`}
            name="emergency_contact_phone"
            defaultValue={contact?.emergency_contact_phone ?? ''}
          />
        </div>

        <Separator />
        <SectionHeader>Travel</SectionHeader>

        <div className="space-y-2">
          <Label htmlFor={`${formId}-passport_first_names`}>First names (as on passport)</Label>
          <Input
            id={`${formId}-passport_first_names`}
            name="passport_first_names"
            defaultValue={contact?.passport_first_names ?? ''}
            placeholder="JAMES EDWARD"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${formId}-passport_surname`}>Surname (as on passport)</Label>
          <Input
            id={`${formId}-passport_surname`}
            name="passport_surname"
            defaultValue={contact?.passport_surname ?? ''}
            placeholder="SMITH"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor={`${formId}-passport_number`}>Passport number</Label>
            <Input
              id={`${formId}-passport_number`}
              name="passport_number"
              defaultValue={contact?.passport_number ?? ''}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${formId}-passport_expiry`}>Expiry</Label>
            <Input
              id={`${formId}-passport_expiry`}
              name="passport_expiry"
              type="date"
              defaultValue={contact?.passport_expiry ?? ''}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${formId}-passport_country`}>Issuing country</Label>
          <Input
            id={`${formId}-passport_country`}
            name="passport_country"
            defaultValue={contact?.passport_country ?? ''}
            placeholder="GBR"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${formId}-home_city`}>Home city</Label>
          <Input
            id={`${formId}-home_city`}
            name="home_city"
            defaultValue={contact?.home_city ?? ''}
            placeholder="London"
          />
        </div>

        <Separator />
        <SectionHeader>Dietary</SectionHeader>

        <div className="space-y-2">
          <Label htmlFor={`${formId}-dietary`}>Requirements</Label>
          <Textarea
            id={`${formId}-dietary`}
            name="dietary"
            defaultValue={contact?.dietary ?? ''}
            placeholder="Vegan"
            rows={2}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${formId}-allergies`}>Allergies</Label>
          <Textarea
            id={`${formId}-allergies`}
            name="allergies"
            defaultValue={contact?.allergies ?? ''}
            placeholder="Nuts, dairy"
            rows={2}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${formId}-tshirt_size`}>T-shirt size</Label>
          <Input
            id={`${formId}-tshirt_size`}
            name="tshirt_size"
            defaultValue={contact?.tshirt_size ?? ''}
            placeholder="L"
          />
        </div>

        <Separator />
        <SectionHeader>Default pay</SectionHeader>
        <p className="text-xs text-muted-foreground">
          Used to pre-fill per diem and wage when this contact is added to a tour. Optional.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor={`${formId}-default_per_diem_rate`}>Per diem</Label>
            <Input
              id={`${formId}-default_per_diem_rate`}
              name="default_per_diem_rate"
              type="number"
              step="0.01"
              min="0"
              defaultValue={contact?.default_per_diem_rate ?? ''}
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
            <Label htmlFor={`${formId}-default_daily_wage_rate`}>Daily wage</Label>
            <Input
              id={`${formId}-default_daily_wage_rate`}
              name="default_daily_wage_rate"
              type="number"
              step="0.01"
              min="0"
              defaultValue={contact?.default_daily_wage_rate ?? ''}
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

        <Separator />

        <div className="space-y-2">
          <Label htmlFor={`${formId}-notes`}>Notes</Label>
          <Textarea
            id={`${formId}-notes`}
            name="notes"
            defaultValue={contact?.notes ?? ''}
            placeholder="Private notes. Never sent to anyone."
            rows={2}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </form>
    </PanelShell>
  )
}
