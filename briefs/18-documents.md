# Brief 18. Reeve — documents

## Goal

Build the documents page: a tour-level view of every document uploaded to the tour, organised by type, with share and acknowledgement status per recipient. The TM can upload a new version of a document, see who has opened or acknowledged each send, and trigger a resend. No new document types are introduced — the types already exist in the schema. No new sending infrastructure is built — `sendRider` (Brief 11) is the send action.

## Why

Documents today are buried inside individual show tabs. A TM advancing a 30-date tour may have sent 15 riders across 10 shows and needs to know: who has acknowledged, who has not opened, and which documents have changed since the last send. That view does not exist. The documents page is the paper trail made visible.

## Document types

The `doc_type` column on `documents` holds a string key. The set in use:

| Key | Label |
|---|---|
| `tech_rider` | Tech rider |
| `hospitality_rider` | Hospitality rider |
| `lighting_rider` | Lighting rider |
| `staging_rider` | Staging rider |
| `day_sheet` | Day sheet |
| `contract` | Contract |
| `tech_pack` | Tech pack |
| `settlement` | Settlement |
| `other` | Other |

The UI renders these as section headings. Unknown keys fall into an "Other" section. Keep the label map in a constants file so it can be extended without editing the component.

## Data shape

Two fetches, both server-side:

**Documents with version history:**
```sql
select * from documents
where tour_id = $tour_id
order by doc_type, created_at desc
```

Within each `doc_type`, the row with `is_current = true` is the active document. Older versions are shown in a collapsible version history drawer.

**Share ledger:**
```sql
select
  ds.*,
  p.name as recipient_name,
  p.contact_email,
  s.venue_name,
  s.date as show_date
from document_shares ds
join people p on p.id = ds.recipient_person_id
left join shows s on s.id = ds.show_id
where ds.tour_id = $tour_id
order by ds.created_at desc
```

Index shares by `document_id` client-side for O(1) lookup per document card.

## Page layout

`app/(app)/tours/[id]/documents/page.tsx`

```
[PageHeader]
  eyebrow: artist act
  title: "Documents"
  description: "12 documents — 8 acknowledged, 3 opened, 1 not opened"
  actions: [Upload document]

[Document sections]

  Tech rider
  ──────────────────────────────────────────────────────────────

  [Document card]                                     [Upload new version]
  Tech Rider v3   Uploaded 12 Jun
  
  Share log:
  Sarah Chen (Audio)   Hellfest · 21 Jun   Sent 12 Jun   Opened 13 Jun   Acknowledged 13 Jun   ✓
  Mike Okafor (Audio)  Werchter · 4 Jul    Sent 14 Jun   Opened —         Acknowledged —        [Resend]
  
  [Send to...]

  Hospitality rider
  ──────────────────────────────────────────────────────────────

  (no document)                                       [Upload]

  ...
```

## Document card

One card per `doc_type`, rendered whether or not a document exists for that type (the empty state prompts an upload).

**When a document exists:**
- Header: doc type label (e.g. "Tech rider") as a section heading (`text-sm font-medium`).
- Document line: `{title}  v{version}  ·  Uploaded {date}`. Clicking the title opens the file in a new tab (generate a signed URL from Supabase Storage on demand — do not pre-sign all URLs on page load).
- "Upload new version" button (secondary, small) in the top-right of the card.
- Share log table (see below).
- "Send to..." button (primary, small) below the share log.
- Version history: `{n} older version(s)` collapse toggle below the send button. Expands to show previous document rows (title, version, date) with their own share counts.

**When no document exists:**
- Greyed card with label and an "Upload" button. No share log.

## Share log table

Compact table inside each document card. One row per `document_shares` row for that document.

Columns:

| Recipient | Show | Sent | Opened | Acknowledged | Action |
|---|---|---|---|---|---|

- **Recipient**: person name and role in parentheses (e.g. "Sarah Chen (Audio)"). Truncate at 30 chars.
- **Show**: `{venue_name} · {date}` (short date, e.g. "21 Jun"). If `show_id` is null (tour-level send), show "Tour".
- **Sent**: short date, e.g. "12 Jun". If null, show "—".
- **Opened**: short date if set, "—" if not.
- **Acknowledged**: short date + green checkmark if set. "—" if not.
- **Action**: `Resend` link (text-style, muted) if `acknowledged_at` is null and the document is current. If acknowledged, no action.

If the share log is empty (document exists but has never been sent), show a single line: "Not yet sent." in muted text.

## Upload flow

"Upload document" in the PageHeader and "Upload" / "Upload new version" buttons all open the same sheet.

`UploadDocumentSheet` (client component, `Sheet` from shadcn):
- `doc_type` select (pre-filled if opened from a specific card).
- `title` text input (pre-filled with the current document's title if uploading a new version).
- File input (PDF only, max 10MB — matching the storage bucket policy).
- On submit: `uploadDocument` server action.

```typescript
// lib/actions/documents.ts (add to existing file)
export async function uploadDocument(params: {
  tourId: string
  docType: string
  title: string
  file: File
}): Promise<{ error: string | null; documentId: string | null }>
```

Steps:
1. `requireUser()` — verify tour ownership.
2. Validate: `doc_type` in the known set, `title` non-empty, file is PDF, file size <= 10MB.
3. Set `is_current = false` on all existing documents for this `tour_id` + `doc_type`.
4. Determine `version`: `max(version) + 1` for this tour + doc_type, or 1 if none exist.
5. Upload to Supabase Storage: path `{tour_id}/{doc_type}/v{version}_{filename}`.
6. Insert `documents` row with `is_current = true`.
7. Return `{ error: null, documentId }`.

After upload, `router.refresh()` to reload the page with the new document.

## Send flow

"Send to..." opens a minimal sheet:

`SendDocumentSheet`:
- Recipient select (people from this tour with a `contact_email`).
- Show select (optional — links the share to a specific show for the advance tracker).
- Note textarea (optional — appended below the email body).
- Submit calls the existing `sendRider` action from `lib/actions/documents.ts`.

This is the same action Brief 11 built. No new sending infrastructure needed.

## Summary line

The PageHeader `description` counts across all shares for the tour:
- "Acknowledged" = `acknowledged_at` is set.
- "Opened" = `opened_at` is set, `acknowledged_at` is null.
- "Not opened" = `sent_at` is set, `opened_at` is null.

Compute server-side from the fetched shares.

## Section ordering

Render doc type sections in this fixed order:
1. Tech rider
2. Hospitality rider
3. Lighting rider
4. Staging rider
5. Day sheet
6. Contract
7. Tech pack
8. Settlement
9. Other (any unknown doc_type keys, grouped together)

Sections with no document and no shares are rendered last within their tier (i.e. known types with content appear before known types that are empty, but empty known types appear before "Other").

## Components

```
app/(app)/tours/[id]/documents/page.tsx        — server component, data fetch
components/documents/documents-view.tsx        — client component, section layout
components/documents/document-card.tsx         — per-doc-type card with share log
components/documents/upload-document-sheet.tsx — upload sheet
components/documents/send-document-sheet.tsx   — send sheet
```

## File locations

```
app/(app)/tours/[id]/documents/page.tsx
components/documents/documents-view.tsx
components/documents/document-card.tsx
components/documents/upload-document-sheet.tsx
components/documents/send-document-sheet.tsx
lib/actions/documents.ts                        — add uploadDocument to existing file
```

The sidebar stub in `components/nav/sidebar.tsx` currently maps `documents` to `settings`. Update `SECTION_ROUTE` to map `documents` to `documents` once this page is live.

## Acceptance criteria

- [ ] All known doc types rendered as sections in the specified order
- [ ] Empty sections rendered last, with an "Upload" prompt
- [ ] "Upload new version" sets `is_current = false` on previous versions and inserts a new row
- [ ] Version increments correctly: `max(version) + 1` per tour + doc_type
- [ ] Document title opens a signed Supabase Storage URL in a new tab (on-demand, not pre-signed)
- [ ] Share log table shows sent / opened / acknowledged dates for each send
- [ ] "Resend" link appears for un-acknowledged sends; absent for acknowledged sends
- [ ] "Send to..." sheet pre-populated with current document; calls existing `sendRider` action
- [ ] PageHeader description counts acknowledged / opened / not opened correctly
- [ ] Upload validates: PDF only, max 10MB, known doc_type, non-empty title
- [ ] Version history collapse shows older documents with share counts
- [ ] Sidebar `SECTION_ROUTE` updated: `documents` no longer stubs to `settings`
- [ ] No em-dashes in code, comments, or copy

## Common pitfalls

- Pre-signing all Storage URLs on page load. Only sign a URL when the user clicks the document title. With many documents and versions, pre-signing is wasteful and exposes signed URLs unnecessarily.
- Hardcoding doc type labels in the component. Keep them in a constants object so they can be extended without editing render logic.
- Inserting the new document row before setting `is_current = false` on the old one. Do them in order: update old, insert new. A race condition that leaves two `is_current = true` rows for the same type is a data integrity bug.
- Sending directly from the upload sheet. Upload and send are separate user actions. Upload first, then the TM chooses when and to whom to send.
- Showing share rows for older (non-current) document versions in the main log. Show only shares for the current version in the main log; older version shares appear in the collapsed version history drawer.
