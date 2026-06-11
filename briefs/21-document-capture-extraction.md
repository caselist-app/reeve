# Brief 21: Reeve, document capture and extraction

## What this is

Today every field arrives by typing. A TM adding FOH Dave types his passport number and expiry by hand; a TM recording a flight types the PNR, flight numbers and times off a confirmation email. This brief lets the TM upload the document instead. Claude reads it, proposes structured fields, and the TM confirms. Nothing is written to the record until they do.

It covers three document classes, split by where the data belongs:

1. **Identity documents** (passport, visa, national ID). These describe a *human*, not a tour, so they belong to a `contact` at the account level (Brief 20). Extracting a passport fills the contact's `passport_number`, `passport_expiry` and `passport_country` once, and every tour the contact is on reads them live.
2. **Flight confirmations.** These describe a tour's travel, so they extract to `transport_segments` plus per-person `transport_assignments` (PNR, seat) on a specific tour.
3. **Hotel bookings.** These extract to `hotel_stays` plus `room_assignments` on a specific tour.

It builds directly on three existing briefs and adds no new AI surface: Brief 12 (the extraction job, tool-use schema enforcement, confirm-before-write), Brief 18 (the documents page and Storage upload pattern), Brief 20 (contacts as account-level identity). The only genuinely new things are a place to store identity documents safely, a vision call instead of an email-body call, and the wiring that surfaces a passport number at the moment the TM books.

## Why

Two reasons, one per pillar.

**Input.** Manual entry is the trust model, but retyping a 9 character passport number and an expiry date off a photo is the kind of input that is both tedious and easy to get wrong by one digit. A wrong passport number is a denied boarding, which is the most expensive mistake on tour. Upload-and-confirm keeps the human in control (they confirm every field) while removing the transcription error.

**Act, via the booking loop.** Reeve does not book in V1: the planner ranks, the TM books off-platform, the reference comes back (CLAUDE.md). But to book a flight off-platform the TM needs the passenger's passport number, expiry, nationality and date of birth in front of them. Right now that means digging through 12 people's records or a WhatsApp thread. If the passport is captured once and surfaced live at the booking step, the off-platform booking gets faster without Reeve ever booking anything itself.

Matt's headline requirement: store the passport scans safely, and store the extracted passport numbers so they are usable for flight and hotel bookings. This brief does both, and it does the second one the Brief 20 way: the number lives once on the contact and is read live, never copied onto each tour.

## The model in one line

A passport is captured once onto a `contact`, stored as a file in a locked-down private bucket, and read live wherever a booking needs it. A flight or hotel confirmation is captured onto a tour, extracted to the operational tables, and confirmed by the TM exactly like a forwarded email (Brief 12).

### Why identity documents do not go in the existing `documents` table

The `documents` table is tour-scoped (`owns_tour(tour_id)`) and built for shareable advance paperwork: riders, tech packs, day sheets, settlements. Those get *sent to crew*. A passport is the opposite: it is account-level identity (it follows the human across tours), it is sensitive PII, and it must never be sent to anyone. Putting it in the tour `documents` table would scope it wrong (tour, not account), risk it appearing in a share flow, and duplicate it per tour. So identity documents get their own table and their own bucket.

### Why the passport number is not copied onto the booking

Brief 20's rule: there is one true current passport number, it lives on the contact, and it is read live. A boarding pass already sent is a stored artifact that captured its value at generation time and does not change. The same applies here. `transport_assignments` holds the PNR and seat (genuinely per-trip), but it does not store the passport number. When the TM is booking, the passport number is read live from the contact and shown next to the passenger. This is the design that makes "Sarah's passport renewed" a one-place fix.

---

## Data model changes

### New table: `identity_documents` (account-level, attached to a contact)

The full captured record plus a pointer to the stored file. The canonical quick-lookup fields stay on `contacts` (Brief 20 already defines `passport_number`, `passport_expiry`, `passport_country`); this table holds the richer detail and the scan itself, and is what a confirm writes back to the contact from.

```sql
-- supabase/migrations/<timestamp>_identity_documents.sql
create table identity_documents (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  doc_kind text not null check (doc_kind in ('passport', 'visa', 'national_id')),
  storage_path text not null,                 -- path inside the private identity bucket
  -- extracted snapshot: what the scan said at capture time
  document_number text,
  surname text,
  given_names text,
  nationality text,                           -- ISO 3166 alpha-3 where possible
  date_of_birth date,
  sex text,
  issue_date date,
  expiry_date date,
  issuing_country text,
  mrz_raw text,                               -- the two MRZ lines, verbatim, for audit
  -- visa-specific, null for passports
  visa_type text,
  visa_country text,
  extraction_status text not null default 'pending'
    check (extraction_status in ('pending', 'extracted', 'confirmed', 'failed')),
  proposed_fields jsonb,                      -- Claude's output, pre-confirmation
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on identity_documents(account_id);
create index on identity_documents(contact_id);

alter table identity_documents enable row level security;

-- Account-level, same inline pattern as contacts (cannot use owns_tour: not tour-scoped).
create policy "account reads own identity_documents" on identity_documents
  for select using (account_id = auth.uid());

create policy "account writes own identity_documents" on identity_documents
  for all using (account_id = auth.uid())
  with check (account_id = auth.uid());
```

GRANTs follow the existing service-role pattern (the extraction job runs as service role):

```sql
grant select, insert, update, delete on identity_documents to service_role;
```

`contacts` already has the canonical fields from Brief 20, so no column add is strictly required there. If richer live lookup is wanted (date of birth and nationality are both needed for most airline bookings), add them to `contacts` in the same migration so they are read live alongside the passport number:

```sql
alter table contacts
  add column date_of_birth date,
  add column passport_given_names text,
  add column passport_surname text;
```

Keep these on `contacts` (live identity), not only on `identity_documents` (the captured snapshot), so the booking surface reads them without joining to a document. Regenerate types after the migration: `pnpm types:gen`.

### Flights and hotels: no new tables

Flight and hotel confirmations extract to the tables that already exist (`transport_segments` + `transport_assignments`, `hotel_stays` + `room_assignments`). No schema change. The only nuance is `status`, covered below.

---

## Storage: the locked-down identity bucket

The existing `documents` bucket is private but its RLS is loose: the select policy allows any authenticated user to read any object in the bucket (`bucket_id = 'documents' and auth.role() = 'authenticated'`), with no path-to-owner check. That is acceptable-ish for tour paperwork behind signed URLs, but it is not acceptable for passports. Identity documents get a separate bucket with path-scoped policies.

```sql
-- supabase/migrations/<timestamp>_identity_documents_bucket.sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'identity-documents',
  'identity-documents',
  false,
  10485760, -- 10 MB
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Path convention: {account_id}/{contact_id}/{identity_document_id}.{ext}
-- The first path segment is the owning account. Scope every policy to it so a
-- TM can only ever touch their own account's identity files.
create policy "account reads own identity files"
  on storage.objects for select
  using (
    bucket_id = 'identity-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "account writes own identity files"
  on storage.objects for insert
  with check (
    bucket_id = 'identity-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "account deletes own identity files"
  on storage.objects for delete
  using (
    bucket_id = 'identity-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
```

Rules for this bucket, all non-negotiable:

- **Private, always.** `public = false`. No object is ever served by a public URL.
- **Signed URLs on demand, short TTL.** Generate a signed URL only when the TM clicks to view a scan, with a 60 second expiry. Never pre-sign on page load (Brief 18 pitfall), never store a signed URL.
- **Path is the access control.** The first folder segment is the account id and every policy checks it. A file at another account's path is unreadable even to an authenticated user.
- **Encryption at rest** is provided by Supabase Storage and Postgres by default; do not roll your own. Do not base64 the file into a table column.

A separate follow-up (note it, do not silently fix here): tighten the existing `documents` bucket select policy to a path-scoped check too. Out of scope for this brief but worth a one-line ticket.

---

## Upload and extraction flow

The flow mirrors Brief 12 (forwarded-email extraction) with two differences: the input is an uploaded file rather than an email body, and identity documents need a vision call because the data is in the image, not in text.

### Where uploads start

The entry point determines the document class, so the TM never has to classify manually in the common case:

- From a contact's detail page in the roster: "Add passport / visa". Class is identity, `contact_id` is known.
- From a tour's travel page: "Upload confirmation". Class is flight or hotel (detected below), `tour_id` is known.

A generic "Add document" can also let the TM pick the class explicitly. When in doubt, ask the TM rather than guess where data should land.

### Step 1: upload server action

```typescript
// lib/actions/identity.ts
export async function uploadIdentityDocument(params: {
  contactId: string
  docKind: 'passport' | 'visa' | 'national_id'
  file: File
}): Promise<{ error: string | null; identityDocumentId: string | null }>
```

Steps:

1. `requireUser()`; verify the contact belongs to the caller's account (`account_id = auth.uid()`).
2. Validate: `doc_kind` in the set, file is PDF or image, size <= 10 MB (matches the bucket policy).
3. Insert an `identity_documents` row with `extraction_status = 'pending'` to get an id.
4. Upload to `identity-documents` at `{account_id}/{contact_id}/{identity_document_id}.{ext}`; write the path back to `storage_path`.
5. Enqueue `trigger/jobs/extract-identity.ts`. Return the id.

Flight and hotel uploads use the equivalent `uploadConfirmation` action writing to the `documents`-style flow and enqueuing `extract-confirmation`. They can reuse Brief 12's `forwarded_emails` machinery by treating an uploaded file as a forward with an attachment and no body, or add a parallel `extract-confirmation` job. Prefer reuse: a forwarded hotel email and an uploaded hotel PDF should hit the same extraction code.

### Step 2: extraction job (vision for identity, document for confirmations)

```typescript
// trigger/jobs/extract-identity.ts
export const extractIdentityTask = task({
  id: 'extract-identity',
  run: async ({ identityDocumentId }: { identityDocumentId: string }) => {
    const doc = await getIdentityDocument(identityDocumentId)
    const signedUrl = await signedUrlForFile(doc.storage_path, 60)
    const fileBytes = await fetchAsBase64(signedUrl)

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1000,
      system: IDENTITY_EXTRACTION_SYSTEM_PROMPT,    // static constant in lib/ai/prompts.ts
      tools: [EXTRACT_PASSPORT_TOOL],               // tool use enforces the schema
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: doc.mime, data: fileBytes } },
          { type: 'text', text: 'Extract the identity document fields. Use the machine readable zone where present. Return null for anything you cannot read with confidence.' },
        ],
      }],
    })

    const proposed = parseToolUseResponse(response)
    await updateIdentityDocument(identityDocumentId, {
      proposed_fields: proposed,
      extraction_status: 'extracted',
    })
    await logAiCall({ model: 'claude-sonnet-4-5', triggerCase: 'identity_extraction', usage: response.usage })
  },
})
```

Notes:

- **Static system prompt.** Add `IDENTITY_EXTRACTION_SYSTEM_PROMPT` as a constant in `lib/ai/prompts.ts` next to `EXTRACTION_SYSTEM_PROMPT` (Brief 12). Never build it at runtime; dynamic prompts break caching.
- **Tool use, not free-text JSON** (Brief 12 rule). Define `EXTRACT_PASSPORT_TOOL` with optional fields so the model omits what it cannot read rather than guessing. The MRZ makes passport extraction near-perfect, so prefer the MRZ lines over the printed text when they disagree, and store both (`mrz_raw` for audit).
- **Sonnet, not Haiku.** Vision extraction is a synthesis task; cost model puts extraction on Sonnet (CLAUDE.md AI layer). One call per document, well within the under-5-dollars-per-tour budget.
- **`ai_call_log` needs a schema change for identity calls.** As built (Brief 01), `ai_call_log.tour_id` is `NOT NULL` and `trigger_case` is constrained to `crew_qa | email_extraction | logistics_synthesis`. Identity extraction is account-level, so this same migration must make `tour_id` nullable, add `identity_extraction` to the `trigger_case` check, and add an `account_id` column so account-level calls are still attributable. Do not invent a fake tour id to satisfy the not-null, and do not skip logging (the per-tour cost target depends on a complete log).

### Step 3: confirmation UI

Identity extraction surfaces on the contact's detail page (it is account-level, so it does not belong in the tour `extractions` queue). When `extraction_status = 'extracted'`, the contact page shows a review panel:

```
Passport scan read. Confirm the details below.

Surname        OKAFOR
Given names    MICHAEL JAMES
Number         536920341
Nationality    GBR
Date of birth  14 Mar 1990
Expiry         22 Sep 2031

[View scan]   [Confirm and save to contact]   [Discard]
```

Every field is editable before confirm (proposed, not committed). `Confirm` calls `confirmIdentityExtraction`, which writes the canonical fields onto the `contact` (`passport_number`, `passport_expiry`, `passport_country`, and the added `date_of_birth`, `passport_given_names`, `passport_surname`), sets `identity_documents.extraction_status = 'confirmed'`, and keeps the snapshot and scan on the `identity_documents` row. `Discard` sets `failed` and offers re-upload.

Flight and hotel confirmations reuse Brief 12's `extractions` queue and `confirmExtraction`, writing to `transport_segments` / `hotel_stays`. **Status nuance:** Brief 06 says the planner writes `transport_segments` as `planned` and the TM promotes to `booked`. An uploaded confirmation is already booked, so this path is the TM recording a booking. It may write `status = 'booked'` directly with the PNR, because the TM is confirming the row by hand. This is the streamlined version of the existing "TM books off-platform and pastes the reference" loop, not auto-promotion, so it does not break the no-auto-book rule.

---

## Surfacing the passport at the booking step

This is the payoff for Matt's second requirement. When the TM is recording or preparing a flight booking for a person (the travel planner result, or the manual transport segment form), show that passenger's passport details read live from their contact:

```
Passenger: Michael Okafor
Passport 536920341 (GBR), expires 22 Sep 2031   [copy]
DOB 14 Mar 1990
```

Read these from the joined `contact` (Brief 20: identity is read live, never copied onto `people` or `transport_assignments`). If the passport is missing or expires before the travel date, flag it inline (the same warning logic the roster uses, expired or within 90 days). The TM copies the number into the carrier site; Reeve never sends it anywhere. The same panel feeds hotel bookings that need a passport or ID number on check-in.

---

## What fires Claude, and what does not

Consistent with the AI layer (CLAUDE.md): identity extraction and confirmation extraction are TM-initiated, run server-side on Trigger.dev, use static prompts and tool use, and write nothing without TM confirmation. Crew never trigger this and never see identity data.

**Hard rule for the crew Q&A path (Brief 12):** passport numbers, dates of birth and any identity-document field must never enter the crew Q&A context or any crew-facing message. Brief 12 already omits financial data from `assembleTourContext`; extend that exclusion to identity fields. A crew member asking the WhatsApp bot "what is my passport number" must get a "ask your TM" style answer, never the number. Identity data is TM-eyes-only.

---

## File locations

```
supabase/migrations/<ts>_identity_documents.sql          -- table, RLS, GRANTs, contacts column adds
supabase/migrations/<ts>_identity_documents_bucket.sql   -- private bucket + path-scoped policies
lib/types/database.ts                                    -- regenerated, never hand-edited
lib/validators/identity.ts                               -- Zod schema for the contact-confirm form
lib/ai/prompts.ts                                        -- add IDENTITY_EXTRACTION_SYSTEM_PROMPT (static)
lib/ai/extract.ts                                        -- add EXTRACT_PASSPORT_TOOL / EXTRACT_VISA_TOOL
lib/actions/identity.ts                                  -- uploadIdentityDocument, confirmIdentityExtraction
trigger/jobs/extract-identity.ts                         -- vision extraction job
components/roster/identity-upload.tsx                    -- upload control on contact detail
components/roster/identity-review-panel.tsx              -- confirm-before-write panel
components/logistics/passenger-passport.tsx              -- live passport panel at the booking step
```

Flight and hotel capture reuses Brief 12 files (`lib/ai/extract.ts`, `lib/actions/extractions.ts`, `trigger/jobs/extract-forward.ts`, the `extractions` page) plus an upload action.

---

## Acceptance criteria

- [ ] `identity_documents` table created with account-level RLS (`account_id = auth.uid()`), indexes, and service-role GRANTs
- [ ] `identity-documents` Storage bucket is private with path-scoped select, insert and delete policies keyed to the account id as the first path segment
- [ ] Passport scans stored only in that bucket; never base64'd into a row; never given a public URL
- [ ] Signed URLs generated on demand only, 60 second TTL, never pre-signed on page load
- [ ] Identity extraction uses Sonnet with a vision (image) message and Anthropic tool use; no free-text JSON parsing
- [ ] `IDENTITY_EXTRACTION_SYSTEM_PROMPT` is a static constant in `lib/ai/prompts.ts`
- [ ] Extraction prefers the MRZ over printed text and stores `mrz_raw`; unreadable fields return null, never a guess
- [ ] Confirm writes canonical fields to the `contact` (number, expiry, country, DOB, names); snapshot and scan stay on `identity_documents`
- [ ] `extraction_status` progresses `pending -> extracted -> confirmed | failed`; nothing reaches the contact before confirm
- [ ] Flight confirmation extraction writes `transport_segments` + `transport_assignments` with `status = 'booked'` and the PNR (TM-recorded, not auto-promoted)
- [ ] Hotel confirmation extraction writes `hotel_stays` + `room_assignments`
- [ ] Booking surface shows the passenger's passport number, nationality, DOB and expiry read live from the contact, with an expiry warning (expired or within 90 days)
- [ ] Crew Q&A context and all crew-facing messages exclude every identity-document field
- [ ] `ai_call_log` altered so identity calls can be logged: `tour_id` nullable, `account_id` added, `identity_extraction` added to the `trigger_case` check; all AI calls logged
- [ ] Migration, dependent code, and regenerated types committed together
- [ ] No em-dashes anywhere

## Common pitfalls

- Storing passports in the tour `documents` table or bucket. Wrong scope (tour, not account), risks a share flow touching them, and the loose `documents` bucket RLS lets any authenticated user read any object. Identity gets its own table and its own path-scoped bucket.
- Copying the passport number onto `transport_assignments` or `people`. Identity is read live from the contact (Brief 20). Copying it recreates the stale-passport-on-a-boarding-pass failure that Brief 20 exists to prevent.
- Pre-signing scan URLs on page load. Sign on click, 60 second TTL. Pre-signing exposes signed URLs and is wasteful (Brief 18 pitfall).
- Auto-promoting an extracted flight to `booked` from the *planner*. The planner still writes `planned`. Only an uploaded confirmation, which the TM is recording, writes `booked`, and only through the confirm step.
- Letting any identity field reach crew. The Q&A bot must never echo a passport number. Extend Brief 12's context exclusion from financial-only to financial-and-identity.
- Building the extraction prompt dynamically with the contact's data inline. The prompt is static; the image and instruction go in the user message. Dynamic prompts break caching.
- Trusting printed text over the MRZ. The MRZ is machine-designed and more reliable. Prefer it, store both, and let the TM correct either at confirm.
- Writing extracted fields straight to the contact without the confirm step. Extraction proposes, the TM confirms, then it writes. Never skip it.

## What this brief does NOT include

- In-app flight or hotel booking or payment. The planner ranks, the TM books off-platform, the reference comes back (CLAUDE.md). This brief speeds that up by surfacing the passport; it does not book.
- Live passport-expiry alerts as a scheduled job. The data and the inline warning are here; the cross-tour Trigger.dev alert is the natural follow-up (noted in Brief 20 too).
- OCR fallback for unreadable scans. If Sonnet cannot read a field it returns null and the TM types it. No secondary OCR engine.
- Tightening the existing `documents` bucket select policy. Worth a separate ticket; not changed here to keep this brief's blast radius small.
- Sharing or exporting identity documents. They are never sent. There is no share flow for this bucket by design.
