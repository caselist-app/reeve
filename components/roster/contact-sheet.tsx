'use client'

import { useState, useId, useEffect } from 'react'
import { createContact, updateContact, getContactArtistOptions, setContactArtists } from '@/lib/actions/contacts'
import type { ContactArtist } from '@/lib/actions/contacts'
import { addPerson, updatePersonTerms } from '@/lib/actions/people'
import { contactSchema } from '@/lib/validators/contact'
import { normalizeWhatsappNumber } from '@/lib/phone'
import type { Tables } from '@/lib/types/database'
import type { ContactTourContext } from '@/stores/side-panel-store'
import { useSidePanel } from '@/stores/side-panel-store'
import { PanelShell } from '@/components/layout/panel-shell'
import { Button } from '@/components/ui/button'
import { SectionHeader } from '@/components/ui/section-header'
import { Input } from '@/components/ui/input'
import { PlacesAddressInput } from '@/components/shows/places-address-input'
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
import { useEntityForm } from '@/hooks/use-entity-form'
import { readForm } from '@/lib/forms/read-form'

// Empty string represents no operational channel yet, a real state for a
// brand-new contact with no WhatsApp number and no Telegram link.
type OperationalChannel = 'whatsapp' | 'telegram' | ''
type PersonType = 'artist' | 'crew' | 'management' | 'support'

const CURRENCIES = ['GBP', 'USD', 'EUR', 'AUD', 'CAD', 'CHF', 'DKK', 'NOK', 'SEK', 'JPY', 'NZD']

interface Props {
  contact: Tables<'contacts'> | null
  // When provided, a "Tour terms" section is shown and the save path writes to
  // both the contact (identity) and the people/crew_detail rows (tour terms).
  tourContext?: ContactTourContext
  onSuccess: (contactId?: string) => void
}

// Everything this form's three submit paths (add-with-tour-context,
// edit-with-tour-context, roster-only create/update) can resolve to. Each
// path calls a different server action (or two in parallel, for the edit
// path), so this is where they're unified into the one shape useEntityForm
// needs.
type ContactSheetResult = { error: string | null; id?: string }

export function ContactSheet({ contact, tourContext, onSuccess }: Props) {
  const formId = useId()
  const { close } = useSidePanel()

  const isEditing = contact !== null
  const hasTourContext = tourContext !== undefined

  // Controlled so the Places city autocomplete can write the selection back in.
  const [homeCity, setHomeCity] = useState(contact?.home_city ?? '')

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
  const [operationalChannel, setOperationalChannel] = useState<OperationalChannel>(
    (contact?.operational_channel as OperationalChannel) ?? ''
  )
  const [emailEnabled, setEmailEnabled] = useState(contact?.email_enabled ?? false)
  const canUseTelegram = !!contact?.telegram_chat_id
  const [personType, setPersonType] = useState<PersonType>(initialPersonType)
  const [perDiemCurrency, setPerDiemCurrency] = useState(initialPerDiemCurrency)
  const [wageCurrency, setWageCurrency] = useState(initialWageCurrency)

  // Roster-only: which artists this contact belongs to. A tour-context contact
  // gets linked automatically by add_contact_to_tour instead, so this never
  // renders or fetches when hasTourContext.
  const [artistOptions, setArtistOptions] = useState<ContactArtist[]>([])
  const [artistIds, setArtistIds] = useState<string[]>([])

  useEffect(() => {
    if (hasTourContext) return
    getContactArtistOptions(contact?.id ?? null).then(({ data }) => {
      if (data) {
        setArtistOptions(data.options)
        setArtistIds(data.selectedIds)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toggleArtist(artistId: string) {
    setArtistIds((prev) =>
      prev.includes(artistId) ? prev.filter((id) => id !== artistId) : [...prev, artistId]
    )
  }

  const isCrewInTourContext = hasTourContext && personType === 'crew'

  const { submit, pending, error } = useEntityForm<ContactSheetResult>({
    onSuccess: (result) => {
      close()
      onSuccess(result.id)
    },
    action: async (fd): Promise<ContactSheetResult> => {
      // Every field is read the same way now, and the shape no longer has to
      // guess. This form renders three different field sets (tour add, tour
      // edit, roster), so a field's meaning here depends on which branch drew
      // it: `default_role` and the two `default_*` rates exist only in roster
      // context, `tour_role` and the two tour rates only in tour context.
      // readForm reports the ones this render did not draw as undefined and the
      // ones the TM emptied as null, which is the distinction the actions need
      // and the one the old *OrUndefined kinds could not express.
      const strFields = readForm(fd, {
        contact_email: 'string',
        contact_phone: 'string',
        whatsapp_number: 'string',
        sms_number: 'string',
        emergency_contact_name: 'string',
        emergency_contact_phone: 'string',
        dietary: 'string',
        allergies: 'string',
        home_city: 'string',
        passport_first_names: 'string',
        passport_surname: 'string',
        passport_number: 'string',
        passport_expiry: 'string',
        passport_country: 'string',
        date_of_birth: 'string',
        tshirt_size: 'string',
        notes: 'string',
        tour_role: 'string',
        default_role: 'string',
        name: 'requiredString',
      })
      const numFields = readForm(fd, {
        per_diem_rate: 'number',
        daily_wage_rate: 'number',
        default_per_diem_rate: 'number',
        default_daily_wage_rate: 'number',
      })

      // Identity fields common to both paths.
      const identityRaw = {
        name: strFields.name,
        contact_email: strFields.contact_email,
        contact_phone: strFields.contact_phone,
        operational_channel: operationalChannel || null,
        email_enabled: emailEnabled,
        whatsapp_number: strFields.whatsapp_number,
        sms_number: strFields.sms_number,
        emergency_contact_name: strFields.emergency_contact_name,
        emergency_contact_phone: strFields.emergency_contact_phone,
        dietary: strFields.dietary,
        allergies: strFields.allergies,
        home_city: strFields.home_city,
        passport_first_names: strFields.passport_first_names,
        passport_surname: strFields.passport_surname,
        passport_number: strFields.passport_number,
        passport_expiry: strFields.passport_expiry,
        passport_country: strFields.passport_country,
        date_of_birth: strFields.date_of_birth,
        tshirt_size: strFields.tshirt_size,
        notes: strFields.notes,
      }

      // Tour terms only used when tourContext is present, where the input is
      // always rendered, so `?? null` here can only ever be reading a field
      // this render did not draw at all.
      const tourRole = strFields.tour_role ?? null
      // The rates pass straight through. Blank now reads as null and clears the
      // stored rate, which is what a TM emptying the field means and what they
      // could not do before.
      const crewDetailRaw = isCrewInTourContext
        ? {
            per_diem_rate: numFields.per_diem_rate,
            per_diem_currency: perDiemCurrency || null,
            daily_wage_rate: numFields.daily_wage_rate,
            wage_currency: wageCurrency || null,
          }
        : undefined

      if (hasTourContext) {
        // Add mode: create a new contact and tour membership in one shot.
        // addPerson seeds default_person_type and default_role from person_type
        // and role itself, so they are not passed here. They used to be, and
        // personSchema does not declare them, so Zod stripped them and the cast
        // that used to sit on this call hid that it did. The cast is gone: an
        // argument that does not typecheck against personSchema is a field that
        // will be silently dropped, which is how `notes` went missing.
        if (tourContext.mode === 'add') {
          const result = await addPerson(
            tourContext.tourId,
            { ...identityRaw, person_type: personType, role: tourRole },
            crewDetailRaw
          )
          return { error: result.error, id: result.personId }
        }

        // Edit mode: update identity on the contact, tour terms on
        // people/crew_detail.
        //
        // Neither default_person_type nor default_role is sent. This panel
        // renders no input for either (the "Default type" select and the
        // "Default role" input are both roster-only), and the tour's own type
        // and role are a different fact: someone carried as support on one tour
        // is not thereby support on the roster. Sending them wrote the tour's
        // values over the contact's defaults on every save, which is the same
        // shape as the pay-rate wipe with a field nobody thought to check.
        const parsedIdentity = contactSchema.safeParse(identityRaw)
        if (!parsedIdentity.success) {
          return { error: parsedIdentity.error.issues[0].message }
        }

        const [identityResult, termsResult] = await Promise.all([
          updateContact(contact!.id, parsedIdentity.data),
          updatePersonTerms(tourContext.personId, personType, tourRole, crewDetailRaw),
        ])
        const err = identityResult.error ?? termsResult.error
        return { error: err ?? null, id: contact!.id }
      }

      // Roster-only path: this is the render that owns the default fields, so
      // it is the only one that sends them.
      const raw = {
        ...identityRaw,
        default_person_type: personType,
        default_role: strFields.default_role,
        default_per_diem_rate: numFields.default_per_diem_rate,
        default_per_diem_currency: perDiemCurrency || null,
        default_daily_wage_rate: numFields.default_daily_wage_rate,
        default_wage_currency: wageCurrency || null,
      }

      const parsed = contactSchema.safeParse(raw)
      if (!parsed.success) {
        return { error: parsed.error.issues[0].message }
      }

      // Editing: contactId already exists, so identity and artists save in
      // parallel, the same shape as the tour-context edit path above.
      // Creating: setContactArtists needs the new row's id, which only exists
      // once createContact has returned, so that leg runs after.
      if (isEditing) {
        const [identityResult, artistsResult] = await Promise.all([
          updateContact(contact.id, parsed.data),
          setContactArtists(contact.id, artistIds),
        ])
        return { error: identityResult.error ?? artistsResult.error, id: contact.id }
      }

      const result = await createContact(parsed.data)
      if (result.error || !result.contactId) {
        return { error: result.error, id: result.contactId }
      }

      const artistsResult = await setContactArtists(result.contactId, artistIds)
      return { error: artistsResult.error, id: result.contactId }
    },
  })

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
      <form id={formId} onSubmit={submit} className="space-y-4 pb-8">
        <div className="space-y-2">
          <Label htmlFor={`${formId}-name`}>Name</Label>
          <Input id={`${formId}-name`} name="name" defaultValue={contact?.name} required />
        </div>

        {/* Tour terms section, only shown when opened from the people page */}
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

        {/* Default type/role, only shown in roster context */}
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

        {/* Artists, only shown in roster context: a tour-context contact gets
            linked automatically when added to a tour instead. */}
        {!hasTourContext && artistOptions.length > 0 && (
          <div className="space-y-2">
            <Label>Artists</Label>
            <div className="rounded-md border border-input divide-y divide-border">
              {artistOptions.map((artist) => (
                <label
                  key={artist.id}
                  className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50"
                >
                  <input
                    type="checkbox"
                    checked={artistIds.includes(artist.id)}
                    onChange={() => toggleArtist(artist.id)}
                    className="h-4 w-4 shrink-0 rounded border-input accent-foreground"
                  />
                  <span className="truncate">{artist.name}</span>
                </label>
              ))}
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
            <Label>Operational channel</Label>
            <Select
              value={operationalChannel}
              onValueChange={(v) => setOperationalChannel(v as OperationalChannel)}
            >
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="telegram" disabled={!canUseTelegram}>
                  Telegram{!canUseTelegram ? ' (connect first)' : ''}
                </SelectItem>
              </SelectContent>
            </Select>
            {/* No operational channel is a valid state (a brand-new contact),
                but it silently means no day sheets, travel or alerts reach this
                person. State it so a TM does not save it by accident. */}
            {operationalChannel === '' && (
              <p className="text-xs text-amber-600 dark:text-amber-500">
                No operational channel: this person won&apos;t receive day sheets, travel or alerts.
                {emailEnabled ? ' Only formal emails will be sent.' : ''}
              </p>
            )}
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
              onBlur={(e) => {
                // A TM pasting "07944 630 634" should not have to fix it by
                // hand. contactSchema/personSchema normalize the same way on
                // submit, so this is the fast path, not the only one.
                e.currentTarget.value = normalizeWhatsappNumber(e.currentTarget.value)
              }}
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
          <PlacesAddressInput
            id={`${formId}-home_city`}
            name="home_city"
            value={homeCity}
            onChange={setHomeCity}
            placeholder="London"
            types={['(cities)']}
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

        {/* Pay section: tour rates when in tour context (crew only), default rates in roster context */}
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
