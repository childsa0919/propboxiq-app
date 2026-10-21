# Deal Sharing — Design Spec

- **Feature:** Send a Flip deal to another user; it arrives in their "Shared deals" inbox, and accepting creates their own editable copy.
- **Target release:** v1.8.0 (PR #34)
- **Status:** Mockups approved 2026-10-21 (`deal-share-mocks.png`). Spec awaiting user review.
- **Repo:** github.com/childsa0919/propboxiq-app (main at `67e005f6`, v1.7.6)

---

## 1. Decisions (locked with the user)

| # | Decision | Choice |
|---|---|---|
| 1 | What the recipient gets | **Their own independent copy.** The sender's deal is never modified. |
| 2 | How the recipient is addressed | **Email (required).** If they have no account, they get a Resend invite email. |
| 3 | Phone number | **Optional.** If entered, the sender's own Messages app opens with a pre-filled text (`sms:` link). No SMS provider, no A2P 10DLC. |
| 4 | How it arrives | **Inbox → Accept / Decline.** Nothing is added to the recipient's deal list until they accept. |
| 5 | Snapshot history | **Not copied.** The recipient's copy starts with one snapshot labeled "Received from {sender name}". |
| 6 | Scope | **Flip deals only.** Hold deals live in localStorage and are out of scope. |
| 7 | Alerts to existing users | **In-app badge only.** No email or push for recipients who already have an account. |

## 2. User flows

### 2.1 Sender — Send deal
1. Entry points on a Flip deal: a **"Send deal"** item in the three-dot menu on `QuickResult.tsx`, and a share icon in the deal header.
2. A bottom sheet opens (mockup screen 1):
   - **Email** (required). Trimmed, lowercased, validated as an email.
   - **Mobile number** (optional). US numbers only: 10 digits after removing formatting, with an optional leading 1. Shown as `(410) 555-0182`. Helper text: "Adding a number opens your Messages app with a pre-written text and link."
   - **Note** (optional). Up to 280 characters, with a live counter.
   - **Included** chips (read-only): Deal inputs · ARV + comps · Sources & Uses · Walkthrough Budget · Comp Hero.
   - Subtext: "They'll get their own copy to edit. Your deal stays unchanged."
3. Tapping **Send deal** calls `POST /api/deals/:id/share`.
4. On success:
   - Toast: "Sent to marcus@…" (or "Invite emailed to dana.r@…" if they have no account).
   - If a phone number was entered, the client then opens `sms:` with the pre-filled body (mockup screen 2):
     ```
     Hey, I just sent you a deal on PropBoxIQ:
     {street}, {city}
     ARV ${ARV short} · Est. profit ${profit short}
     {shareUrl}
     ```
     Use `sms:{E164}?&body={encoded}`; this form works on both iOS and Android. If the phone has no SMS handler, fall back to copying the text to the clipboard and showing the toast "Text copied — paste into Messages."
5. Errors are shown inline in the sheet (see §6).

### 2.2 Recipient — Inbox
1. The header gets a **tray icon** with a gold badge showing the count of pending inbox shares (hidden when 0). It polls `GET /api/shares/inbox/count` on app focus and every 60 seconds while visible.
2. The tray opens **/shared** with two segmented tabs: **Inbox · N** and **Sent** (mockup screens 3 and 4).
3. Inbox cards, newest first. Each shows: sender avatar and name, relative time, **NEW** pill, address, `city · SF · style`, ARV / Profit / Price KPI tiles, the note (if any), and **Decline** / **Accept & copy** buttons.
4. **Accept & copy** → `POST /api/shares/:id/accept` → navigate to the new deal (`/deal/:newId`) with the toast "Deal added to your list."
5. **Decline** → confirmation sheet ("Decline this deal? The sender will see it was declined.") → `POST /api/shares/:id/decline` → the card is removed.
6. Accepted and declined shares leave the Inbox. The recipient has no history view for v1.8.0.

### 2.3 Sender — Sent tab
- Lists every share the user has sent, newest first: address, status pill, then `To {email} · texted (if phone used) · {relative time}`.
- Status pills (palette colors, already in use):
  - **PENDING** — gold `#f5c948`. Recipient has an account and hasn't acted yet.
  - **INVITED** — cyan `#5fd4e7`. Recipient had no account when the deal was sent and hasn't signed up yet. Shows "Invite expires in N days."
  - **ACCEPTED** — green `#7fd4a8`
  - **DECLINED** — red `#e56666`
  - **EXPIRED** — gray. An invite that passed 30 days without signup.
- No resend or unsend in v1.8.0 (see §9).

### 2.4 Share link `/s/:token`
- The link goes in the text message and the invite email.
- **Signed in, email matches the recipient:** go to `/shared` and scroll to that card, highlighted.
- **Signed in, different email:** screen saying "This deal was sent to m•••@capitalpartners.com. Sign in with that Google account to view it," with a **Switch account** button.
- **Not signed in:** Google sign-in, then the logic above.
- **Accepted, declined, or expired:** "This shared deal is no longer available."
- The link never shows deal numbers without an authenticated, matching recipient.

### 2.5 New users (invite)
- When the recipient email has no account, send a Resend email from `info@propboxiq.com`:
  - Subject: `{Sender name} sent you a deal on PropBoxIQ`
  - Body: sender name, address, ARV, est. profit, note, and a **View deal** button linking to `/s/:token`, using the existing Resend template styling from PR #23.
- When that person signs in with Google for the first time using the same email, `upsertUser` links every pending share for that email to the new user ID, and their inbox badge shows them.
- Invites expire **30 days** after `created_at`. Expiry is computed at read time; no cron job.

## 3. Data model

One new table, `deal_shares`, added the same way as existing tables: a Drizzle schema in `shared/schema.ts` plus a runtime `CREATE TABLE IF NOT EXISTS` guard. No migration files.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK autoincrement | |
| `token` | TEXT UNIQUE NOT NULL | 10-char URL-safe random string (`crypto.randomBytes`) |
| `sender_user_id` | INTEGER NOT NULL FK → users.id | |
| `source_deal_id` | INTEGER NOT NULL FK → deals.id | For the Sent tab and the duplicate guard. If the source deal is deleted, the share still works because the payload is frozen. |
| `recipient_email` | TEXT NOT NULL | Lowercased |
| `recipient_user_id` | INTEGER NULL FK → users.id | Set when sent (if an account exists) or on first signup |
| `invited` | INTEGER (bool) NOT NULL DEFAULT 0 | 1 if no account existed when sent |
| `texted` | INTEGER (bool) NOT NULL DEFAULT 0 | 1 if the sender entered a phone number. **The phone number itself is not stored.** |
| `note` | TEXT NULL | ≤ 280 chars, server-enforced |
| `payload` | TEXT (JSON) NOT NULL | Frozen deal bundle, see §4 |
| `summary` | TEXT (JSON) NOT NULL | `{street, city, state, zip, sqft, style, arv, profit, price}` for inbox cards without parsing the payload |
| `status` | TEXT NOT NULL | `pending` \| `accepted` \| `declined` |
| `accepted_deal_id` | INTEGER NULL FK → deals.id | The recipient's new deal |
| `created_at` | INTEGER NOT NULL | Epoch ms |
| `responded_at` | INTEGER NULL | Epoch ms |

**Indexes:** `(recipient_email, status)`, `(sender_user_id, created_at)`, `token`.

**Derived display status** (server-side, returned to the client):
- `accepted` / `declined` → as stored
- `pending` and `invited=1` and `recipient_user_id IS NULL`: **EXPIRED** if older than 30 days, otherwise **INVITED**
- `pending` otherwise → **PENDING**

## 4. Frozen payload

Built at send time from the sender's current data, serialized to JSON, and versioned with `payloadVersion: 1`:

```
{
  payloadVersion: 1,
  deal:          <deals row minus id, user_id, timestamps>,
  budget:        <Walkthrough Budget rows/state for the deal, if any>,
  compHero:      <comp_hero_state for the deal: selections + manual comps, if any>,
  sourcesUses:   <edited Sources & Uses overrides, if stored separately>,
  comps:         <cached comps used for ARV, if stored with the deal>
}
```

- Snapshots (PR #27) are **excluded**.
- Accept runs in **one SQLite transaction**:
  1. Insert a new `deals` row owned by the recipient, from `payload.deal`.
  2. Insert budget, Comp Hero state, and any Sources & Uses overrides keyed to the new deal ID.
  3. Create snapshot v1 labeled `Received from {sender name}`, using the existing snapshot helper.
  4. Mark the share `accepted`, set `accepted_deal_id` and `responded_at`.
- The new deal has a nullable `received_from_user_id` (runtime `ALTER TABLE` guard) so the deal list can show a small "From {name}" tag.
- **Implementer note:** the exact tables and fields behind Walkthrough Budget, Comp Hero, and Sources & Uses come from the existing code. The copy must include every per-deal table those features read, so the copied deal renders identically to the sender's at send time. Verify this by comparing the sender's and recipient's computed ARV, profit, and budget totals in a test.

## 5. API

All routes require an authenticated session.

| Method | Route | Body / response |
|---|---|---|
| POST | `/api/deals/:id/share` | Body `{email, phone?, note?}` → `201 {shareId, token, shareUrl, displayStatus: 'PENDING'\|'INVITED', smsBody?}`. `smsBody` is returned only when `phone` is sent; the server builds the text, and the client opens `sms:`. |
| GET | `/api/shares/inbox` | `[{id, token, sender:{name, avatarUrl}, summary, note, createdAt}]`. Pending only, for the caller's user ID **or** email. |
| GET | `/api/shares/inbox/count` | `{count}` |
| GET | `/api/shares/sent` | `[{id, summary, recipientEmail, texted, displayStatus, createdAt, respondedAt, expiresInDays?}]` |
| POST | `/api/shares/:id/accept` | → `{dealId}`. Recipient only. Must be pending and not expired. |
| POST | `/api/shares/:id/decline` | → `{ok:true}`. Recipient only. Must be pending. |
| GET | `/api/shares/by-token/:token` | → `{shareId, state:'mine'\|'other-account'\|'unavailable', maskedEmail?}`. Used by `/s/:token`. |

## 6. Validation and guards

| Rule | Error shown in sheet |
|---|---|
| Deal must belong to the caller and be a Flip deal | 403/404 → "You can't share this deal." |
| Valid email required | "Enter a valid email." |
| Not the caller's own email | "You can't send a deal to yourself." |
| No existing **pending** share for the same deal + email | "Already sent to this person — waiting on their response." |
| Max **25 shares per sender per rolling 24h** | "Daily send limit reached (25). Try again tomorrow." |
| Note ≤ 280 chars | Counter turns red; Send button disabled |
| Phone must be 10 US digits if present | "Enter a 10-digit US mobile number." |
| Resend failure on invite | The share is still created. Response includes `inviteEmailFailed: true` → toast "Deal saved, but the invite email failed — share the link by text instead." |
| Accept or decline by someone other than the recipient | 403 |
| Accept or decline a non-pending or expired share | 409 → "This shared deal is no longer available." |

Recipient matching is by `recipient_user_id` **or** a case-insensitive match of `recipient_email` to the caller's Google email.

## 7. UI components

- `SendDealSheet.tsx`: bottom sheet (screen 1). Reuses the existing sheet, input, and button primitives.
- `SharedDealsPage.tsx`: `/shared` route with the Inbox and Sent tabs (screens 3 and 4).
- `SharedDealCard.tsx`: inbox card with KPI tiles, note, and Accept/Decline.
- `SentShareRow.tsx`: Sent row with status pill.
- `InboxTrayButton.tsx`: header icon with badge, placed in the existing header and following the safe-area header rule.
- `ShareLinkPage.tsx`: `/s/:token` resolver states.
- `lib/sms.ts`: builds the `sms:` URI and the clipboard fallback.
- All styling uses the locked Coastal Teal tokens and matches `deal-share-mocks.png`. **Phones first**; the main QA target is iPhone width (390–430 px).

## 8. Testing and verification

- `npm run check` (tsc) and `npm run build` must both pass. There's no CI.
- A script-level test (same pattern as `pr33_testCompHeroPdf.ts`) using a temp SQLite DB:
  1. Send → accept → the recipient deal's computed ARV, profit, and budget totals equal the sender's at send time.
  2. The sender edits their deal after sending → the recipient copy is unchanged.
  3. Duplicate pending send rejected; 26th send in 24 h rejected; self-send rejected.
  4. Invite to an unknown email → `INVITED`; simulate `upsertUser` with that email → share appears in the new user's inbox; a share created 31 days ago → `EXPIRED`, and accepting it returns 409.
  5. Non-recipient accept or decline → 403.
  6. Deleting the source deal doesn't break accepting.
- Manual phone QA checklist goes in the PR body: send with and without a phone, the Messages handoff on iOS, accept, decline, the badge count, and the `/s/:token` states.

## 9. Out of scope (v1.8.0)

- Hold deals (would need a localStorage → SQLite migration first)
- Live and collaborative shared deals, permissions, or sync
- Automatic SMS (OpenPhone, Twilio)
- Email or push alerts to existing users
- Unsend, resend, or editing a sent share
- Saved contacts / recipient autocomplete
- Copying snapshot history
- A recipient history view of accepted or declined shares

## 10. Do not touch

Coastal Teal palette values · logo geometry · Hold scoring engine (`holdCalc.ts`) · Gateway `?gateway=skip` · Unified ARV formula (PR #25) · Snapshot system internals (PR #27, only *call* its create helper) · Walkthrough Budget internals (PRs #26/28) · Comp tier ranking (PR #29) · Editable Sources & Uses logic (PR #30) · Comp Hero data layer and PDF (PRs #31–33) · email drip code (PR #23; the invite email is a new standalone template) · safe-area header rule.

## 11. Release

- `shared/version.ts` and `package.json` → `1.8.0`
- `CHANGELOG.md` and `shared/releaseNotes.ts`:
  ```
  ## [1.8.0] — 2026-10-21
  ### Added
  - Send Flip deals to other users by email, with an optional pre-filled text from your phone
  - "Shared deals" inbox with Accept & copy / Decline, plus a badge in the header
  - Sent tab showing Pending, Invited, Accepted, Declined, and Expired status
  - Email invites for recipients without a PropBoxIQ account (30-day expiry)
  ```
- Branch `feat/v1.8.0-deal-sharing` → PR #34, which includes this spec at `docs/specs/2026-10-21-deal-sharing-design.md`.
