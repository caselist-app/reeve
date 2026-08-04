import { describe, it, expect } from 'vitest'
import { safeRelativePath } from '@/lib/auth/helpers'

// safeRelativePath is the open-redirect guard on the `next=` query param.
// CLAUDE.md: only allow relative paths starting with / and not //.
describe('safeRelativePath', () => {
  it('allows a plain relative path', () => {
    expect(safeRelativePath('/tours/abc/schedule')).toBe('/tours/abc/schedule')
  })

  it('allows a relative path with a query string', () => {
    expect(safeRelativePath('/tours/abc/schedule?date=2026-06-14')).toBe(
      '/tours/abc/schedule?date=2026-06-14'
    )
  })

  it('rejects a protocol-relative URL, which would leave the site', () => {
    expect(safeRelativePath('//evil.example.com')).toBe('/')
  })

  it('rejects an absolute URL', () => {
    expect(safeRelativePath('https://evil.example.com')).toBe('/')
  })

  it('rejects a path that does not start with a slash', () => {
    expect(safeRelativePath('tours/abc')).toBe('/')
  })

  it('rejects a non-string', () => {
    // The value arrives from a query param, so it is genuinely unknown at
    // runtime whatever the type says.
    expect(safeRelativePath(undefined as unknown as string)).toBe('/')
  })
})
