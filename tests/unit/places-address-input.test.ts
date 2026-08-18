import { describe, it, expect } from 'vitest'
import { shouldPreventEnterSubmit } from '@/components/shows/places-address-input'

// The component can't be rendered (no @testing-library, no jsdom/happy-dom in
// this repo), so the Enter-key predicate is a pure function in the same file
// and this pins it directly (REE-285). Both render branches of
// PlacesAddressInput wire their onKeyDown through this predicate: REE-126
// added it only to the plain-input fallback, leaving the apiKey/Places-script
// branch (the one actually used whenever NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is
// set, i.e. always in production) free to let Enter submit the form before a
// selected address had settled.

describe('shouldPreventEnterSubmit', () => {
  it('is true for Enter', () => {
    expect(shouldPreventEnterSubmit('Enter')).toBe(true)
  })

  it('is false for a regular character key', () => {
    expect(shouldPreventEnterSubmit('a')).toBe(false)
  })

  it('is false for Tab', () => {
    expect(shouldPreventEnterSubmit('Tab')).toBe(false)
  })
})
