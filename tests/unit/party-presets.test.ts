import { describe, it, expect } from 'vitest'
import { resolvePreset, type PartyPickerPerson } from '@/lib/party/presets'

const artist1: PartyPickerPerson = { id: 'p1', name: 'Alex', person_type: 'artist' }
const artist2: PartyPickerPerson = { id: 'p2', name: 'Bailey', person_type: 'artist' }
const crew1: PartyPickerPerson = { id: 'p3', name: 'Casey', person_type: 'crew' }
const management1: PartyPickerPerson = { id: 'p4', name: 'Drew', person_type: 'management' }
const support1: PartyPickerPerson = { id: 'p5', name: 'Ellis', person_type: 'support' }

const people = [artist1, artist2, crew1, management1, support1]

describe('resolvePreset', () => {
  it('everyone returns every person passed in', () => {
    expect(resolvePreset({ type: 'everyone' }, people)).toEqual(people)
  })

  it('everyone returns an empty list unchanged', () => {
    expect(resolvePreset({ type: 'everyone' }, [])).toEqual([])
  })

  it('artist filters to person_type artist only', () => {
    expect(resolvePreset({ type: 'artist' }, people)).toEqual([artist1, artist2])
  })

  it('crew filters to person_type crew only', () => {
    expect(resolvePreset({ type: 'crew' }, people)).toEqual([crew1])
  })

  it('artist and crew exclude management and support', () => {
    expect(resolvePreset({ type: 'artist' }, people)).not.toContain(management1)
    expect(resolvePreset({ type: 'crew' }, people)).not.toContain(support1)
  })

  it('named returns exactly the explicitly selected ids, regardless of person_type', () => {
    const result = resolvePreset({ type: 'named', ids: [artist1.id, crew1.id, support1.id] }, people)
    expect(result).toEqual([artist1, crew1, support1])
  })

  it('named returns nothing for ids not present in the roster', () => {
    expect(resolvePreset({ type: 'named', ids: ['does-not-exist'] }, people)).toEqual([])
  })

  it('named returns an empty list for an empty id list', () => {
    expect(resolvePreset({ type: 'named', ids: [] }, people)).toEqual([])
  })
})
