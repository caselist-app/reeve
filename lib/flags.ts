// Feature flags decouple "merged to main" from "a TM can reach it". Merging
// deploys the code the moment CI is green; a flag decides whether anyone can
// see it. See CLAUDE.md, "Feature flags", for the convention this exists to
// enforce, and why it is not the same thing as inbound_qa_enabled /
// morning_message_enabled on tours (those are TM choices, not build gates).
//
// isFeatureEnabled is the one place a flag is checked. Never read a flag's
// env var directly at a call site, the same reason resolveTourDateId() and
// localDateInZone() are the only authorities on their questions: one place
// decides, nowhere else guesses.
//
// Server-only. The env reads below are dynamic (the flag name is a
// caller-supplied string), so this must never be imported into a client
// component: unlike a literal, statically-inlined NEXT_PUBLIC_ variable,
// nothing here gets bundled for the browser, and a flag is not meant to be
// browser-exposed in the first place.

function internalReviewerIds(): Set<string> {
  const raw = process.env.INTERNAL_REVIEW_ACCOUNT_IDS ?? ''
  return new Set(
    raw
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0)
  )
}

// flagEnvVar: the flag's own env var name, e.g. 'FF_LOGISTICS_V2'. Declaring
// it in .env.example is on whoever introduces the flag: check:conventions
// greps for a literal env read, and cannot see a name passed in as a string
// here.
//
// accountId: the caller's account id (accounts.id, the same value as
// requireUser()'s user.id). Pass null/undefined from a context with no
// signed-in account (a webhook, a job with no caller) to fall back to the
// global flag alone.
//
// Resolves true two ways: the flag itself is on for everyone, or the caller
// is a listed internal reviewer and sees it regardless of the flag's state.
// That second path is how a flag gets reviewed live, on real production
// data, before it is flipped on for every TM.
export function isFeatureEnabled(flagEnvVar: string, accountId?: string | null): boolean {
  if (process.env[flagEnvVar] === 'true') {
    return true
  }
  return Boolean(accountId) && internalReviewerIds().has(accountId as string)
}
