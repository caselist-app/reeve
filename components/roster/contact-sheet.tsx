'use client'

import { useState, useId, useTransition } from 'react'
import { createContact, updateContact } from '@/lib/actions/contacts'
import { addPerson, updatePersonTerms } from '@/lib/actions/people'
import { contactSchema } from '@/lib/validators/contact'
import type { Tables } from '@/lib/types/database'
import type { ContactTourContext } from '@/stores/side-panel-store'
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
  // When provided, a "Tour terms" section is shown and the save path writes to
  // both the contact (identity) and the people/crew_detail rows (tour terms).
  tourContext?: ContactTourContext
  onSuccess: (contactId?: string) => void
}

export function ContactSheet({ contact, tourContext, onSuccess }: Props) {
  const formId = useId()
  const { close } = useSidePanel()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const isEditing = contact !== null
  const hasTourContext = tourContext !== undefined

  // Tour-context initial values come from the membership row; roster defaults
  // come from the contact.
  const initialPersonType: PersonType = hasTourContext
    ? tourContext.mode === 'edit'
      ? (tourContext.personType as PersonType)
      : tourContext.defaultType
    : (contact?.default_person_type as PersonType) ?? 'crew'

  const initialPerDiemCurrency =
    hasTourContext && tourContext.mode === 'edit'
      ? (tourContext.crewDetail?.per_diem_currency ?? 'GBP')
      : (contact?.default_per_diem_currency ?? 'GBP')

  const initialWageCurrency =
    hasTourContext && tourContext.mode === 'edit'
      ? (tourContext.crewDetail?.wage_currency ?? 'GBP')
      : (contact?.default_wage_currency ?? 'GBP')

  // Panel unmounts between opens so initial state is always fresh.
  const [preferredChannel, setPreferredChannel] = useState<Channel>(
    (contact?.preferred_channel as Channel) ?? 'whatsapp'
  )
  const [personType, setPersonType] = useState<PersonType>(initialPersonType)
  const [perDiemCurrency, setPerDiemCurrency] = useState(initialPerDiemCurrency)
  const [wageCurrency, setWageCurrency] = useState(initialWageCurrency)

  const isCrewInTourContext = hasTourContext && personType === 'crew'

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const fd = new FormData(e.currentTarget)
    const str = (key: string) => (fd.get(key) as string) || undefined
    const num = (key: string) => (fd.get(key) ? Number(fd.get(key)) : undefined)

    // Identity fields common to both paths.
    const identityRaw = {
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
      passport_first_names: str('passport_first_names'),
      passport_surname: str('passport_surname'),
      passport_number: str('passport_number'),
      passport_expiry: str('passport_expiry'),
      passport_country: str('passport_country'),
      date_of_birth: str('date_of_birth'),
      tshirt_size: str('tshirt_size'),
      notes: str('notes'),
    }

    // Tour terms only used when tourContext is present.
    const tourRole = str('tour_role') ?? null
    const crewDetailRaw = isCrewInTourContext
      ? {
          per_diem_rate: num('per_diem_rate'),
          per_diem_currency: perDiemCurrency || undefined,
          daily_wage_rate: num('daily_wage_rate'),
          wage_currency: wageCurrency || undefined,
        }
      : undefined

    if (hasTourContext) {
      // Add mode: create a new contact and tour membership in one shot.
      if (tourContext.mode === 'add') {
        const personRaw = {
          ...identityRaw,
          person_type: personType,
          role: tourRole ?? undefined,
          // Seed the contact's defaults from the tour terms so future tours
          // pre-fill correctly.
          default_person_type: personType,
          default_role: tourRole ?? undefined,
        }

        startTransition(async () => {
          const result = await addPerson(tourContext.tourId, personRaw as Parameters<typeof addPerson>[1], crewDetailRaw)
          if (result.error) {
            setError(result.error)
          } else {
            close()
            onSuccess(result.personId)
          }
        })
        return
      }

      // Edit mode: update identity on the contact, tour terms on people/crew_detail.
      const parsedIdentity = contactSchema.safeParse({
        ...identityRaw,
        default_person_type: personType,
        default_role: tourRole ?? undefined,
      })
      if (!parsedIdentity.success) {
        setError(parsedIdentity.error.issues[0].message)
        return
      }

      startTransition(async () => {
        const [identityResult, termsResult] = await Promise.all([
          updateContact(contact!.id, parsedIdentity.data),
          updatePersonTerms(tourContext.personId, personType, tourRole, crewDetailRaw),
        ])
        const err = identityResult.error ?? termsResult.error
        if (err) {
          setError(err)
        } else {
          close()
          onSuccess(contact!.id)
        }
      })
      return
    }

    // Roster-only path: create or update the contact with default pay fields.
    const raw = {
      ...identityRaw,
      default_person_type: personType,
      default_role: str('default_role'),
      default_per_diem_rate: num('default_per_diem_rate'),
      default_per_diem_currency: perDiemCurrency || undefined,
      default_daily_wage_rate: num('default_daily_wage_rate'),
      default_wage_currency: wageCurrency || undefined,
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

  const title = hasTourContext
    ? tourContext.mode === 'add'
      ? `Add ${personType}`
      : `Edit ${contact?.name ?? ''}`
    : isEditing
      ? `Edit ${contact.name}`
      : 'New contact'

  const description = hasTourContext
    ? tourContext.mode === 'add'
      ? 'Adds to your roster and to this tour.'
      : "Changes to identity apply on every tour they are on."
    : isEditing
      ? "Changes apply on every tour they are on."
      : 'Add someone to your roster. You can add them to a tour later.'

  return (
    <PanelShell
      title={title}
      description={description}
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

        {/* Tour terms section — only shown when opened from the people page */}
        {hasTourContext && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={personType}
                  onValueChange={(v) => setPersonType(v as PersonType)}
                  disabled={tourContext.mode === 'edit'}
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
                <Label htmlFor={`${formId}-tour_role`}>Role</Label>
                <Input
                  id={`${formId}-tour_role`}
                  name="tour_role"
                  defaultValue={tourContext.mode === 'edit' ? (tourContext.role ?? '') : ''}
                  placeholder="FOH Engineer"
                />
              </div>
            </div>

            <Separator />
          </>
        )}

        {/* Default type/role — only shown in roster context */}
        {!hasTourContext && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Default type</Label>
              <Select value={personType} onValueChange={(v) => setPersonType(v as PersonType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
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
        )}

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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Preferred channel</Label>
            <Select value={preferredChannel} onValueChange={(v) => setPreferredChannel(v as Channel)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
          <Label htmlFor={`${formId}-date_of_birth`}>Date of birth</Label>
          <Input
            id={`${formId}-date_of_birth`}
            name="date_of_birth"
            type="date"
            defaultValue={contact?.date_of_birth ?? ''}
          />
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

        {/* Pay section — tour rates when in tour context (crew only), default rates in roster context */}
        {(isCrewInTourContext || !hasTourContext) && (
          <>
            <Separator />
            {isCrewInTourContext ? (
              <>
                <SectionHeader>Pay and per diems</SectionHeader>
                <p className="text-xs text-muted-foreground">
                  All optional. Used for settlement and per diem calculations on this tour.
                </p>
              </>
            ) : (
              <>
                <SectionHeader>Default pay</SectionHeader>
                <p className="text-xs text-muted-foreground">
                  Used to pre-fill per diem and wage when this contact is added to a tour. Optional.
                </p>
              </>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor={`${formId}-${isCrewInTourContext ? 'per_diem_rate' : 'default_per_diem_rate'}`}>Per diem</Label>
                <Input
                  id={`${formId}-${isCrewInTourContext ? 'per_diem_rate' : 'default_per_diem_rate'}`}
                  name={isCrewInTourContext ? 'per_diem_rate' : 'default_per_diem_rate'}
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={isCrewInTourContext
                    ? (tourContext?.mode === 'edit' ? (tourContext.crewDetail?.per_diem_rate ?? '') : '')
                    : (contact?.default_per_diem_rate ?? '')
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select value={perDiemCurrency} onValueChange={setPerDiemCurrency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${formId}-${isCrewInTourContext ? 'daily_wage_rate' : 'default_daily_wage_rate'}`}>Daily wage</Label>
                <Input
                  id={`${formId}-${isCrewInTourContext ? 'daily_wage_rate' : 'default_daily_wage_rate'}`}
                  name={isCrewInTourContext ? 'daily_wage_rate' : 'default_daily_wage_rate'}
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={isCrewInTourContext
                    ? (tourContext?.mode === 'edit' ? (tourContext.crewDetail?.daily_wage_rate ?? '') : '')
                    : (contact?.default_daily_wage_rate ?? '')
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Wage currency</Label>
                <Select value={wageCurrency} onValueChange={setWageCurrency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </>
        )}

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
