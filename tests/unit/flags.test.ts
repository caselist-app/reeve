import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { isFeatureEnabled } from '@/lib/flags'

// isFeatureEnabled is the one gate between "merged" and "visible to a TM".
// These pin both ways it resolves true: the global flag, and the
// internal-reviewer allowlist overriding a flag that is still off for
// everyone else. See CLAUDE.md, "Feature flags".

const FLAG = 'FF_TEST_ONLY_NEVER_A_REAL_FLAG'
const REVIEWER = 'a35f1c1e-0000-4000-8000-000000000001'
const OTHER_ACCOUNT = 'a35f1c1e-0000-4000-8000-000000000002'

describe('isFeatureEnabled', () => {
  const originalFlag = process.env[FLAG]
  const originalReviewers = process.env.INTERNAL_REVIEW_ACCOUNT_IDS

  beforeEach(() => {
    delete process.env[FLAG]
    delete process.env.INTERNAL_REVIEW_ACCOUNT_IDS
  })

  afterEach(() => {
    if (originalFlag === undefined) delete process.env[FLAG]
    else process.env[FLAG] = originalFlag
    if (originalReviewers === undefined) delete process.env.INTERNAL_REVIEW_ACCOUNT_IDS
    else process.env.INTERNAL_REVIEW_ACCOUNT_IDS = originalReviewers
  })

  it('is off by default, unset and no accountId', () => {
    expect(isFeatureEnabled(FLAG)).toBe(false)
  })

  it('is off for a real account when the flag is unset and the account is not a reviewer', () => {
    expect(isFeatureEnabled(FLAG, OTHER_ACCOUNT)).toBe(false)
  })

  it('is on for everyone once the flag is set to true, no accountId needed', () => {
    process.env[FLAG] = 'true'
    expect(isFeatureEnabled(FLAG)).toBe(true)
    expect(isFeatureEnabled(FLAG, OTHER_ACCOUNT)).toBe(true)
  })

  it('is on for a listed reviewer even while the flag itself is off', () => {
    process.env.INTERNAL_REVIEW_ACCOUNT_IDS = REVIEWER
    expect(isFeatureEnabled(FLAG, REVIEWER)).toBe(true)
    expect(isFeatureEnabled(FLAG, OTHER_ACCOUNT)).toBe(false)
  })

  it('reads a comma-separated allowlist of more than one reviewer', () => {
    process.env.INTERNAL_REVIEW_ACCOUNT_IDS = `${OTHER_ACCOUNT}, ${REVIEWER}`
    expect(isFeatureEnabled(FLAG, REVIEWER)).toBe(true)
    expect(isFeatureEnabled(FLAG, OTHER_ACCOUNT)).toBe(true)
  })

  it('does not throw when accountId is null or undefined', () => {
    expect(isFeatureEnabled(FLAG, null)).toBe(false)
    expect(isFeatureEnabled(FLAG, undefined)).toBe(false)
  })
})
