import { describe, it, expect } from 'vitest'
import { wmoToIcon, wmoToLabel } from '@/lib/weather/wmo-codes'

describe('wmoToIcon / wmoToLabel', () => {
  it.each([
    [0, 'Sun', 'Clear'],
    [2, 'CloudSun', 'Partly cloudy'],
    [45, 'CloudFog', 'Fog'],
    [61, 'CloudRain', 'Rain'],
    [71, 'Snowflake', 'Snow'],
    [95, 'CloudLightning', 'Thunderstorm'],
  ])('maps code %i to icon %s and label %s', (code, icon, label) => {
    expect(wmoToIcon(code)).toBe(icon)
    expect(wmoToLabel(code)).toBe(label)
  })

  it('falls back to the generic bucket for an unrecognised code rather than throwing', () => {
    expect(() => wmoToIcon(5)).not.toThrow()
    expect(() => wmoToLabel(5)).not.toThrow()
    expect(wmoToIcon(5)).toBe('Cloud')
    expect(wmoToLabel(5)).toBe('Unknown')
  })
})
