# Technical Plan: #471 - Civil Money Claim Multi-Step Form

## Technical Approach

### Architecture Overview
Create a new `@hmcts/money-claims` module in `libs/` following the established patterns from `@hmcts/onboarding`. The module will:
- Store claim data in session storage during the journey
- Persist completed claims to PostgreSQL database
- Use GOV.UK Design System components for all UI
- Integrate with GOV Notify for email confirmations
- Generate 16-digit claim reference numbers (format: XXXX-XXXX-XXXX-XXXX)

### Key Technical Decisions
1. **Session-based state management**: Store form data in Express session between steps, similar to onboarding module
2. **Progressive form validation**: Validate each step server-side before allowing progression
3. **Prisma for database**: New `money_claim` table with proper indexing
4. **Zod for validation**: Type-safe validation schemas matching GOV.UK patterns
5. **One question per page**: Follow GOV.UK Service Manual patterns
6. **GOV Notify integration**: New service layer for email notifications

## Implementation Details

### File Structure
```
libs/money-claims/
├── package.json
├── tsconfig.json
├── prisma/
│   └── schema.prisma                    # Database schema for claims
└── src/
    ├── config.ts                        # Module configuration exports
    ├── index.ts                         # Business logic exports
    ├── locales/
    │   ├── en.ts                        # Shared English translations
    │   └── cy.ts                        # Shared Welsh translations
    ├── pages/
    │   └── money-claim/
    │       ├── start.ts                 # Journey start page
    │       ├── start.njk
    │       ├── start.test.ts
    │       ├── amount.ts                # Claim amount entry
    │       ├── amount.njk
    │       ├── amount.test.ts
    │       ├── defendant-name.ts        # First/last name
    │       ├── defendant-name.njk
    │       ├── defendant-name.test.ts
    │       ├── defendant-address.ts     # Full address
    │       ├── defendant-address.njk
    │       ├── defendant-address.test.ts
    │       ├── reason.ts                # Radio selection with "Other"
    │       ├── reason.njk
    │       ├── reason.test.ts
    │       ├── other-reason.ts          # Text input for custom reason
    │       ├── other-reason.njk
    │       ├── other-reason.test.ts
    │       ├── description.ts           # Textarea for description
    │       ├── description.njk
    │       ├── description.test.ts
    │       ├── mediation.ts             # Yes/No radio
    │       ├── mediation.njk
    │       ├── mediation.test.ts
    │       ├── summary.ts               # Check answers page
    │       ├── summary.njk
    │       ├── summary.test.ts
    │       └── confirmation/
    │           ├── [confirmationId].ts  # Confirmation page
    │           ├── [confirmationId].njk
    │           └── [confirmationId].test.ts
    └── money-claim/
        ├── session.ts                   # Session helpers
        ├── session.test.ts
        ├── validation.ts                # Zod schemas
        ├── validation.test.ts
        ├── service.ts                   # Business logic
        ├── service.test.ts
        ├── queries.ts                   # Database queries
        ├── queries.test.ts
        ├── reference-generator.ts       # Claim reference generation
        ├── reference-generator.test.ts
        ├── navigation.ts                # Journey navigation logic
        ├── navigation.test.ts
        └── notify-service.ts            # GOV Notify integration
            └── notify-service.test.ts
```

### Database Schema
```prisma
model MoneyClaim {
  id                    String   @id @default(cuid())
  referenceNumber       String   @unique @map("reference_number")
  claimAmount           Decimal  @map("claim_amount") @db.Decimal(10, 2)
  defendantFirstName    String   @map("defendant_first_name")
  defendantLastName     String   @map("defendant_last_name")
  defendantAddressLine1 String   @map("defendant_address_line_1")
  defendantAddressLine2 String?  @map("defendant_address_line_2")
  defendantTown         String   @map("defendant_town")
  defendantPostcode     String   @map("defendant_postcode")
  claimReason           String   @map("claim_reason")
  claimReasonOther      String?  @map("claim_reason_other")
  description           String   @db.Text
  mediationAttempted    Boolean  @map("mediation_attempted")
  submittedAt           DateTime @default(now()) @map("submitted_at")

  @@index([referenceNumber])
  @@index([submittedAt])
  @@map("money_claim")
}
```

### Validation Schemas (Zod)
```typescript
// Amount validation
amountSchema = z.object({
  amount: z.string()
    .min(1, "Enter a valid claim amount")
    .refine(val => !isNaN(Number(val)) && Number(val) > 0,
            "Enter a valid claim amount")
})

// Defendant name validation
defendantNameSchema = z.object({
  firstName: z.string().min(1, "Enter the defendant's first name"),
  lastName: z.string().min(1, "Enter the defendant's last name")
})

// Defendant address validation
defendantAddressSchema = z.object({
  addressLine1: z.string().min(1, "Enter address line 1"),
  addressLine2: z.string().optional(),
  town: z.string().min(1, "Enter town or city"),
  postcode: z.string().min(1, "Enter postcode")
})

// Claim reason validation
reasonSchema = z.object({
  reason: z.enum([
    "goods-not-received",
    "goods-faulty",
    "services-not-provided",
    "services-inadequate",
    "money-owed",
    "other"
  ], { errorMessage: "Select a reason for your claim" })
})

// Other reason validation (conditional)
otherReasonSchema = z.object({
  otherReason: z.string().min(1, "Provide a reason for your claim")
})

// Description validation
descriptionSchema = z.object({
  description: z.string().min(1, "Describe what happened")
})

// Mediation validation
mediationSchema = z.object({
  mediation: z.enum(["yes", "no"], {
    errorMessage: "Tell us if you have tried to resolve the matter first"
  })
})
```

### Session Management
```typescript
interface MoneyClaimSession extends Session {
  moneyClaim?: {
    amount?: { amount: string };
    defendantName?: { firstName: string; lastName: string };
    defendantAddress?: {
      addressLine1: string;
      addressLine2?: string;
      town: string;
      postcode: string;
    };
    reason?: { reason: string };
    otherReason?: { otherReason: string };
    description?: { description: string };
    mediation?: { mediation: "yes" | "no" };
  };
}
```

### Navigation Logic
- Linear progression through steps
- Back links enabled on all pages (browser history)
- Edit links from summary page return to specific step
- After edit, redirect back to summary (not next step)
- Prevent access to summary unless all steps complete

### Reference Number Generation
```typescript
// Generate 16-digit number with hyphens every 4 digits
// Format: 1234-5678-9012-3456
// Use timestamp + random for uniqueness
// Verify uniqueness in database before assigning
```

### GOV Notify Integration
New environment variables:
- `GOVUK_NOTIFY_API_KEY`: API key for GOV Notify
- `GOVUK_NOTIFY_CLAIM_TEMPLATE_ID`: Template ID for claim confirmation email

Email sent on successful submission containing:
- Claim reference number
- Claim amount
- Defendant name
- Next steps information

### Homepage Integration
Update `/home/runner/work/expressjs-monorepo-template/expressjs-monorepo-template/apps/web/src/pages/index.njk` to include:
- New section with "Make a money claim" button
- Link to `/money-claim/start`

## Error Handling & Edge Cases

### Validation Errors
- Display GOV.UK error summary at top of page
- Inline error messages next to each field
- Preserve user input when re-rendering with errors
- Specific, actionable error messages (not generic)

### Session Edge Cases
1. **Session expiry**: Redirect to start if session data missing
2. **Direct URL access**: Allow access to any page, pre-populate from session if available
3. **Back button**: Browser back works correctly, session persists
4. **Multiple tabs**: Session is shared, latest submission wins

### Amount Validation
- Must be positive number
- Support decimal values (e.g., 123.45)
- Maximum 10 digits before decimal (£9,999,999,999.99)
- Strip currency symbols if entered (£, $)
- Convert comma separators to decimal points

### Address Validation
- Address line 1 required
- Address line 2 optional
- Town required
- Postcode required
- UK postcode format validation (flexible)

### Reason Selection
- One of predefined reasons must be selected
- If "Other" selected, redirect to other-reason page
- If non-"Other" selected, skip other-reason page
- other-reason validation only applies when reason="other"

### Database Errors
- Duplicate reference number: Regenerate and retry (max 3 attempts)
- Database connection failure: Show "Problem with the service" page
- Transaction failures: Rollback and show error

### GOV Notify Errors
- Log email send failures but don't block submission
- Show confirmation page even if email fails
- Display warning if email couldn't be sent
- Provide alternative contact method

## Acceptance Criteria Mapping

### AC1: Multi-step claim submission flow
**Implementation:**
- Homepage link renders "Make a money claim" button → `/money-claim/start`
- 9 pages under `/money-claim/` path
- Each page has GET handler (render form) and POST handler (validate + redirect)
- Session stores data between steps
- Linear navigation with continue buttons

**Verification:**
- E2E test follows entire journey from homepage to confirmation
- Each step accessible and validates correctly
- Session data persists across steps

### AC2: Defendant name with first/last names
**Implementation:**
- `/money-claim/defendant-name` page
- Two text inputs: firstName and lastName
- Both fields required
- Validation errors displayed inline and in summary

**Verification:**
- Unit tests for validation
- E2E test submits form with valid/invalid data
- Welsh translation present

### AC3: Claim reason with "Other" support
**Implementation:**
- `/money-claim/reason` page with radio buttons
- Options: goods-not-received, goods-faulty, services-not-provided, services-inadequate, money-owed, other
- Conditional routing: if "other" selected, navigate to `/money-claim/other-reason`
- `/money-claim/other-reason` has textarea for custom reason

**Verification:**
- Navigation logic tests for conditional routing
- Validation tests for both pages
- E2E test covers "Other" path

### AC4: Summary page with edit links
**Implementation:**
- `/money-claim/summary` displays all answers using GOV.UK Summary List component
- Each row has "Change" link pointing to respective step
- After edit, return to summary (not next step in flow)
- Submit button triggers database save

**Verification:**
- Summary page unit test checks all data displayed
- E2E test clicks "Change" link and verifies return to summary
- Session data correctly updated after edit

### AC5: Confirmation with reference number
**Implementation:**
- `/money-claim/confirmation/[confirmationId]` shows GOV.UK Panel component
- Reference number format: 1234-5678-9012-3456 (16 digits)
- Data saved to PostgreSQL
- GOV Notify email sent
- Session cleared after successful submission

**Verification:**
- Reference generator tests verify format and uniqueness
- Database query tests verify data stored correctly
- E2E test verifies confirmation page displays reference
- Mock GOV Notify in tests

### AC6: Data stored in PostgreSQL
**Implementation:**
- Prisma schema defines `money_claim` table
- `createMoneyClaim` query function
- Transaction ensures atomicity
- Indexes on referenceNumber and submittedAt

**Verification:**
- Database query unit tests
- Migration applies successfully
- E2E test verifies data in database

### AC7: GOV Notify email confirmation
**Implementation:**
- New `notify-service.ts` with `sendClaimConfirmation` function
- Environment variables for API key and template ID
- Called after database save
- Errors logged but don't block submission

**Verification:**
- Unit tests with mocked GOV Notify client
- Integration test with GOV Notify sandbox (optional)
- Error handling tests

### AC8: Validation and error messages
**Implementation:**
- Zod schemas for each form step
- Server-side validation in POST handlers
- GOV.UK error summary component
- Inline error messages on fields
- Specific error text per requirement

**Verification:**
- Validation unit tests for all schemas
- Controller tests verify error rendering
- E2E tests submit invalid forms and check error messages
- Accessibility tests verify error announcement

### AC9: WCAG 2.2 AA compliance
**Implementation:**
- Use only GOV.UK Design System components
- Proper form labels and fieldsets
- Error summary links to fields
- Keyboard navigation tested
- Screen reader compatibility

**Verification:**
- Playwright axe tests on all pages
- Manual keyboard navigation testing
- Manual screen reader testing (NVDA/JAWS)

## Open Questions

### CLARIFICATIONS NEEDED

1. **Email address collection**: GOV Notify requires an email address to send confirmations. Should we add an email step to the journey, or should confirmation emails not be sent for this demo?

2. **Amount constraints**: Is there a minimum claim amount? What's the maximum?

3. **Defendant address format**: Should we support international addresses or UK-only?

4. **Reason options wording**: What are the exact labels for the predefined reason radio options? (e.g., "Goods not received" vs "I paid for goods that were not delivered")

5. **Description field guidance**: Should there be a character limit? Any hint text about what to include?

6. **Mediation question wording**: Exact question text and hint text? (e.g., "Have you tried to resolve this dispute?" vs "Did you attempt mediation?")

7. **Confirmation page content**: What specific "next steps" information should appear? (e.g., "We will review your claim within 5 working days")

8. **GOV Notify template**: Does the template already exist or should we create it? What variables should it include?

9. **Environment setup**: Do we have GOV Notify credentials for development/testing?

10. **Summary page ordering**: In what order should the answers appear on the summary page?
