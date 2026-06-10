# App Store Listing — PropBox IQ

Copy-paste this into App Store Connect when you fill out the iOS App 1.0
listing. Character limits noted next to each field — these copies are within
limits.

---

## App name (30 char max)
```
PropBox IQ
```

## Subtitle (30 char max)
```
Flip Analyzer & Deal Scoring
```

## Promotional text (170 char max — editable any time without review)
```
Analyze any flip in seconds. Enter address, purchase, rehab, ARV — see profit, ROI, holding costs, and live ZIP market data side by side.
```

## Description (4000 char max)
```
PropBox IQ is a flip analyzer for real estate investors and house flippers. Type an address, drop in purchase price, rehab budget, and your ARV — and in seconds you get a deal score, projected profit, ROI, holding costs, and a live market snapshot for the ZIP code.

WHAT YOU CAN DO

• Quick Analyze — go from address to deal score in under 60 seconds.
• Detailed Analyzer — full underwriting with closing costs, financing, holding period, agent commissions.
• Live Market Stats — every deal gets a ZIP-level snapshot: median days on market, active listings, months of supply, median sale price.
• Save your deals — every analysis is saved to your account, accessible across devices via propboxiq.com.
• Export to PDF — one tap to share a clean printout with partners, lenders, or contractors.
• Light + dark mode — the Coastal Teal palette is designed for on-site use, day or night.

WHO IT'S FOR

• House flippers running multiple projects.
• Wholesalers screening leads fast.
• Buy-and-hold investors sanity-checking BRRRR numbers.
• Real estate agents helping investor clients evaluate listings.

DATA SOURCES

PropBox IQ pulls live market data from ATTOM Data and RentCast, the same providers used by the major listing platforms. Property data refreshes automatically; market snapshots are cached for performance.

ACCOUNT

Sign in with your email — we send a one-tap magic link. No passwords to remember. Your deals sync to your account at propboxiq.com.

PRIVACY

We collect only your email (for sign-in) and the deals you save. We do not sell, share, or use your data for advertising. Full policy at propboxiq.com/privacy.

QUESTIONS

Email info@propboxiq.com — we read every message.
```

## Keywords (100 char max, comma separated, no spaces after commas)
```
flip,real estate,investor,arv,rehab,roi,deal,analyzer,wholesale,brrrr,property,house,flipping,zip
```

## What's New in This Version (4000 char max)
For v1.0.0 — the first release:
```
First release of PropBox IQ for iPhone. Quick Analyze, detailed underwriting, live ZIP market snapshots, PDF export, and deal sync with propboxiq.com.
```

## Support URL
```
https://propboxiq.com/support
```
*(or replace with `mailto:info@propboxiq.com` if you haven't built a /support page yet)*

## Marketing URL (optional)
```
https://propboxiq.com
```

## Privacy Policy URL (required)
```
https://propboxiq.com/privacy
```

## Copyright
```
© 2026 PropBox IQ
```

---

## App Privacy questionnaire answers

In App Store Connect → App Privacy:

**Do you or your third-party partners collect data from this app?** → **Yes**

**Data types collected:**

1. **Contact Info → Email Address**
   - Linked to user? **Yes**
   - Used for tracking? **No**
   - Purposes: **App Functionality** (sign-in)

2. **User Content → Other User Content** (the deals they save)
   - Linked to user? **Yes**
   - Used for tracking? **No**
   - Purposes: **App Functionality**

3. **Identifiers → User ID**
   - Linked to user? **Yes**
   - Used for tracking? **No**
   - Purposes: **App Functionality**

4. **Diagnostics → Crash Data** (if you ship a crash reporter; skip otherwise)
   - Linked to user? **No**
   - Used for tracking? **No**
   - Purposes: **App Functionality, Analytics**

**Tracking question:** "Does this app or its third-party partners track users?" → **No**

---

## Age rating

- All categories: **None**
- Result: **4+**

## Category
- Primary: **Finance**
- Secondary (optional): **Business**

## Pricing
- **Free**
- Availability: **All countries**

---

## Test account for App Review

Apple's reviewer needs working credentials to test your app. Provide:

- **Email:** `appreview@propboxiq.com` (create this mailbox first; magic link goes there)
- **Password:** _N/A — magic link login_
- **Notes for reviewer:**
  ```
  This app uses passwordless magic-link sign-in.
  1. Tap "Continue with email"
  2. Enter: appreview@propboxiq.com
  3. We will pre-load a valid session for the review address (no email
     round-trip needed) — tap "Sign in" on the next screen.
  4. The app loads with a sample saved deal and an empty Quick Analyze form.
  ```

**⚠️ Before submitting:** Add a server-side shortcut so any `/api/auth/request`
for `appreview@propboxiq.com` auto-issues a session immediately instead of
sending an email. Otherwise the reviewer will fail to sign in and reject.
This is a small server change — flag it and we'll add it before submission.
