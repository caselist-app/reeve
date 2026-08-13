import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { staticMapUrl, googleMapsUrl } from '@/lib/schedule/venue-map'

describe('staticMapUrl', () => {
  const original = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

  beforeEach(() => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = 'test-maps-key'
  })

  afterEach(() => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = original
  })

  it('centers on the given coordinates with a zoom and the maps key', () => {
    const url = staticMapUrl(51.5, -0.1)
    expect(url).toContain('center=51.5,-0.1')
    expect(url).toMatch(/[?&]zoom=\d+/)
    expect(url).toContain('key=test-maps-key')
  })
})

describe('googleMapsUrl', () => {
  it('links straight to a Google Maps search on the given coordinates', () => {
    expect(googleMapsUrl(51.5, -0.1)).toBe(
      'https://www.google.com/maps/search/?api=1&query=51.5,-0.1'
    )
  })
})
