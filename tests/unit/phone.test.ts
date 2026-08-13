import { describe, it, expect } from 'vitest'
import { normalizeWhatsappNumber, E164_REGEX } from '@/lib/phone'
import { contactSchema } from '@/lib/validators/contact'
import { personSchema } from '@/lib/validators/person'

// REE-162. A TM pasting a number copied from their phone's contacts app most
// often gets a leading 0 instead of a country code and spaces between digit
// groups, e.g. "07944 630 634". Both are fixed before E164_REGEX ever sees
// the value, on blur in the UI and again in the schema itself so any other
// entry point (import, API) gets the same treatment.

describe('normalizeWhatsappNumber', () => {
  it('strips gaps between digit groups', () => {
    expect(normalizeWhatsappNumber('+44 7944 630 634')).toBe('+447944630634')
  })

  it('turns a leading 0 into a +', () => {
    expect(normalizeWhatsappNumber('07944630634')).toBe('+7944630634')
  })

  it('strips gaps and swaps a leading 0 together', () => {
    expect(normalizeWhatsappNumber('07944 630 634')).toBe('+7944630634')
  })

  it('leaves an already-clean E.164 number alone', () => {
    expect(normalizeWhatsappNumber('+447944630634')).toBe('+447944630634')
  })

  it('does not touch a 0 that is not the leading character', () => {
    expect(normalizeWhatsappNumber('+4407944630634')).toBe('+4407944630634')
  })
})

describe('whatsapp_number in contactSchema and personSchema', () => {
  it('accepts a gappy, 0-prefixed number by normalizing it first', () => {
    const parsed = contactSchema.safeParse({ name: 'Test', whatsapp_number: '07944 630 634' })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.whatsapp_number).toBe('+7944630634')

    const parsedPerson = personSchema.safeParse({
      person_type: 'crew',
      name: 'Test',
      whatsapp_number: '07944 630 634',
    })
    expect(parsedPerson.success).toBe(true)
    if (parsedPerson.success) expect(parsedPerson.data.whatsapp_number).toBe('+7944630634')
  })

  it('still rejects a number that is not valid E.164 after normalizing', () => {
    const parsed = contactSchema.safeParse({ name: 'Test', whatsapp_number: 'not a number' })
    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toBe(
        'Enter a number in E.164 format, e.g. +447700900123'
      )
    }
  })

  it('still treats an emptied field as null, clearing the stored number', () => {
    const parsed = contactSchema.safeParse({ name: 'Test', whatsapp_number: '' })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.whatsapp_number).toBeNull()
  })
})

describe('E164_REGEX', () => {
  it('matches the normalized form of a gappy, 0-prefixed number', () => {
    expect(E164_REGEX.test(normalizeWhatsappNumber('07944 630 634'))).toBe(true)
  })
})
