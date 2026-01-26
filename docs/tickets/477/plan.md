# Technical Plan: Civil Money Claim Submission Feature

## 1. Technical Approach

### High-Level Strategy
Create a new module `@hmcts/money-claim` under `libs/` following the established onboarding pattern. The module will implement a multi-page form journey for submitting civil money claims with session-based state management, Zod validation, and PostgreSQL persistence.

### Architecture Decisions

**Module Structure**: Follow the existing onboarding module pattern with domain-driven folder structure:
- `libs/money-claim/src/pages/money-claim/` - Page controllers and templates
- `libs/money-claim/src/money-claim/` - Business logic (service, validation, queries, session)
- `libs/money-claim/prisma/` - Database schema
- Session storage for form data during user journey
- PostgreSQL for final submission persistence

**Claim Reference Format**: 16-digit format `NNNN-NNNN-NNNN-NNNN` generated server-side

**Integration Points**:
- GOV.UK Notify for email confirmation (requires environment configuration)
- Session storage using existing Redis-backed session management
- Registration in `apps/web/src/app.ts` alongside existing modules

### Key Technical Considerations

**Session Management**: Store claim data in namespaced session object `moneyClaim` with fields matching form pages to allow navigation, back links, and summary page change links.

**Conditional Routing**: When user selects "Other" for reason, show additional page (`/money-claim/reason-other`) to collect custom reason. Skip this page for standard reasons.

**Validation Strategy**: Use Zod schemas for each form page, following the onboarding pattern with `formatZodErrors` and `createErrorSummary` helpers for GOV.UK-compliant error display.

**GOV.UK Notify**: Use GOV.UK Notify service to send confirmation email after successful submission. Configuration via environment variables. Template should include claim reference number and next steps.

## 2. Implementation Details

### File Structure

```
libs/money-claim/
├── package.json
├── tsconfig.json
├── prisma/
│   └── schema.prisma                     # Database schema for claim submission
└── src/
    ├── config.ts                          # Module exports (pageRoutes, prismaSchemas)
    ├── index.ts                           # Business logic exports
    ├── money-claim/
    │   ├── service.ts                     # Business logic for each form step
    │   ├── service.test.ts
    │   ├── validation.ts                  # Zod schemas for each page
    │   ├── validation.test.ts
    │   ├── queries.ts                     # Database operations
    │   ├── queries.test.ts
    │   ├── session.ts                     # Session helpers
    │   ├── session.test.ts
    │   ├── navigation.ts                  # Page flow logic
    │   ├── navigation.test.ts
    │   ├── notify.ts                      # GOV.UK Notify integration
    │   └── notify.test.ts
    └── pages/money-claim/
        ├── index.ts                       # Landing page with "Start now"
        ├── index.njk
        ├── amount.ts                      # Claim amount page
        ├── amount.njk
        ├── amount.test.ts
        ├── defendant-name.ts              # Defendant name page
        ├── defendant-name.njk
        ├── defendant-name.test.ts
        ├── defendant-address.ts           # Defendant address page
        ├── defendant-address.njk
        ├── defendant-address.test.ts
        ├── reason.ts                      # Claim reason selection
        ├── reason.njk
        ├── reason.test.ts
        ├── reason-other.ts                # Custom reason (conditional)
        ├── reason-other.njk
        ├── reason-other.test.ts
        ├── description.ts                 # Claim description
        ├── description.njk
        ├── description.test.ts
        ├── attempted-resolution.ts        # Attempted resolution
        ├── attempted-resolution.njk
        ├── attempted-resolution.test.ts
        ├── summary.ts                     # Check your answers
        ├── summary.njk
        ├── summary.test.ts
        ├── confirmation/
        │   ├── [confirmationId].ts        # Confirmation page with claim reference
        │   ├── [confirmationId].njk
        │   └── [confirmationId].test.ts
```

### Database Schema

```prisma
model MoneyClaimSubmission {
  id                    String   @id @default(cuid())
  claimReference        String   @unique @map("claim_reference")
  amount                Decimal  @db.Decimal(10, 2)
  defendantName         String   @map("defendant_name")
  defendantAddress      String   @map("defendant_address")
  reason                String
  reasonOther           String?  @map("reason_other")
  description           String   @db.Text
  attemptedResolution   Boolean  @map("attempted_resolution")
  submittedAt           DateTime @default(now()) @map("submitted_at")

  @@map("money_claim_submission")
}
```

### Validation Schemas (validation.ts)

```typescript
// Amount validation
export const amountSchema = z.object({
  amount: z.string()
    .min(1, "Enter the amount you want to claim")
    .regex(/^\d+(\.\d{1,2})?$/, "Enter a valid amount in pounds and pence")
    .refine(val => parseFloat(val) > 0, "Amount must be greater than £0")
});

// Defendant name validation
export const defendantNameSchema = z.object({
  defendantName: z.string()
    .min(1, "Enter the defendant's full name")
    .trim()
});

// Defendant address validation
export const defendantAddressSchema = z.object({
  defendantAddress: z.string()
    .min(1, "Enter the defendant's address")
    .trim()
});

// Reason validation
export const reasonSchema = z.object({
  reason: z.enum(
    ["unpaid-invoice", "damage-to-property", "personal-loan", "rental-deposit", "other"],
    { errorMap: () => ({ message: "Select a reason for your claim" }) }
  )
});

// Custom reason (only required if reason is "other")
export const reasonOtherSchema = z.object({
  reasonOther: z.string()
    .min(1, "Enter the reason for your claim")
    .trim()
});

// Description validation
export const descriptionSchema = z.object({
  description: z.string()
    .min(1, "Describe what happened")
    .max(5000, "Description must be 5000 characters or fewer")
    .trim()
});

// Attempted resolution validation
export const attemptedResolutionSchema = z.object({
  attemptedResolution: z.enum(
    ["yes", "no"],
    { errorMap: () => ({ message: "Confirm whether you have attempted to resolve the matter first" }) }
  )
});
```

### Session Interface (session.ts)

```typescript
export interface MoneyClaimSession extends Session {
  moneyClaim?: {
    amount?: { amount: string };
    defendantName?: { defendantName: string };
    defendantAddress?: { defendantAddress: string };
    reason?: { reason: string };
    reasonOther?: { reasonOther: string };
    description?: { description: string };
    attemptedResolution?: { attemptedResolution: string };
  };
}
```

### Navigation Logic (navigation.ts)

Page flow with conditional routing for "other" reason:

1. `/money-claim/` → `/money-claim/amount`
2. `/money-claim/amount` → `/money-claim/defendant-name`
3. `/money-claim/defendant-name` → `/money-claim/defendant-address`
4. `/money-claim/defendant-address` → `/money-claim/reason`
5. `/money-claim/reason` →
   - If "other": `/money-claim/reason-other`
   - Else: `/money-claim/description`
6. `/money-claim/reason-other` → `/money-claim/description`
7. `/money-claim/description` → `/money-claim/attempted-resolution`
8. `/money-claim/attempted-resolution` → `/money-claim/summary`
9. `/money-claim/summary` (POST) → `/money-claim/confirmation/[claimReference]`

### Service Functions (service.ts)

```typescript
// Process each form page
export function processAmountSubmission(session: Session, formData: unknown): AmountData;
export function processDefendantNameSubmission(session: Session, formData: unknown): DefendantNameData;
export function processDefendantAddressSubmission(session: Session, formData: unknown): DefendantAddressData;
export function processReasonSubmission(session: Session, formData: unknown): ReasonData;
export function processReasonOtherSubmission(session: Session, formData: unknown): ReasonOtherData;
export function processDescriptionSubmission(session: Session, formData: unknown): DescriptionData;
export function processAttemptedResolutionSubmission(session: Session, formData: unknown): AttemptedResolutionData;

// Generate claim reference in format NNNN-NNNN-NNNN-NNNN
export function generateClaimReference(): string;

// Prepare and submit claim
export function prepareSubmissionData(session: Session): MoneyClaimSubmission;
export async function submitMoneyClaim(session: Session, email?: string): Promise<string>;

// Get session data for pre-population
export function getSessionDataForPage(session: Session, page: string): any;
```

### GOV.UK Notify Integration (notify.ts)

```typescript
export async function sendClaimConfirmationEmail(
  email: string,
  claimReference: string,
  personalisation: Record<string, string>
): Promise<void>;
```

Configuration via environment variables:
- `GOVUK_NOTIFY_API_KEY`
- `GOVUK_NOTIFY_CLAIM_CONFIRMATION_TEMPLATE_ID`

### Database Operations (queries.ts)

```typescript
export async function createMoneyClaimSubmission(
  data: MoneyClaimSubmissionData
): Promise<MoneyClaimSubmission>;

export async function getMoneyClaimByReference(
  claimReference: string
): Promise<MoneyClaimSubmission | null>;
```

## 3. Error Handling & Edge Cases

### Validation Errors
- Empty fields: Display field-specific error messages from Zod schemas
- Invalid amounts: Check numeric format, decimal places (max 2), and minimum value (> £0)
- Character limits: Description limited to 5000 characters with character count component

### Session Edge Cases
- Missing session data when accessing summary: Redirect to first incomplete page
- Browser back button: Session preserves data, users can navigate freely
- Session expiry: Standard Redis session timeout, users must restart journey

### Conditional Logic
- "Other" reason handling: Only validate `reasonOther` if `reason === "other"`
- Skip `/money-claim/reason-other` when editing from summary if reason is not "other"

### Database Constraints
- Claim reference uniqueness: Use retry logic with max 3 attempts if collision occurs
- Transaction handling: Wrap database insert and email send in try-catch for proper error recovery

### GOV.UK Notify Failures
- Email send failure: Log error but still show confirmation page (claim is submitted)
- Retry logic: Max 2 retries with exponential backoff
- Fallback: Display confirmation page even if email fails (user has claim reference)

## 4. Acceptance Criteria Mapping

### AC1: Homepage link to money claim
- Update `apps/web/src/pages/index.njk` to add "Make a money claim" button
- Link points to `/money-claim/`
- Button uses GOV.UK Button component with primary styling

### AC2-8: Form journey pages
Each page maps to a controller + template:
- AC2: `/money-claim/amount` - Number input with £ prefix
- AC3: `/money-claim/defendant-name` - Text input
- AC4: `/money-claim/defendant-address` - Textarea
- AC5: `/money-claim/reason` - Radio buttons with 5 options
- AC6: Conditional "Other" page with text input (shown only if "Other" selected)
- AC7: `/money-claim/description` - Textarea with character count
- AC8: `/money-claim/attempted-resolution` - Radio buttons (Yes/No)

### AC9: Summary page
- Display all collected data using GOV.UK Summary List component
- Each row has "Change" link that returns to specific page with `?return=summary` query param
- Page controllers check for `return` parameter and redirect to summary after successful POST

### AC10: Confirmation page
- Display claim reference in format NNNN-NNNN-NNNN-NNNN using GOV.UK Panel component
- Show "What happens next" section with information about next steps
- Send confirmation email via GOV.UK Notify
- Dynamic route: `/money-claim/confirmation/[confirmationId]`

### Verification Approach
- E2E test covering happy path from homepage to confirmation
- Unit tests for all validation schemas
- Unit tests for service functions
- Unit tests for navigation logic
- Manual testing with Welsh language toggle (`?lng=cy`)
- Accessibility testing with axe-core in Playwright

## 5. Open Questions / Clarifications Needed

### CLARIFICATIONS NEEDED

**Email Collection**:
- Where in the journey should we collect the user's email address for GOV.UK Notify?
- Should we create a separate page for email collection?
- Or should we add email field to one of the existing pages (e.g., confirmation page asks for email)?
- Current plan: Add email collection page after attempted-resolution, before summary

**Email Template**:
- What should the GOV.UK Notify template contain beyond claim reference?
- Should it include a summary of claim details (amount, defendant, etc.)?
- What "next steps" information should be in the email?

**Claim Reference Collision**:
- Chance of collision with random 16-digit numbers is extremely low, but should we implement retry logic?
- Current plan: Max 3 generation attempts with different seeds

**Session Timeout Behavior**:
- Should we display a specific message if session expires mid-journey?
- Or rely on standard session expiry behavior (redirect to start)?

**Data Retention**:
- How long should submitted claims be retained in the database?
- Should there be an admin interface to view submissions (out of scope for this ticket)?

**Accessibility Testing**:
- Should confirmation email be screen-reader friendly (plain text vs HTML)?
- Current plan: Use plain text template in GOV.UK Notify

**Welsh Translation**:
- Should claim reference format remain in English numerals for both languages?
- Current plan: Yes, numbers are universal

**Start Page Content**:
- What content should appear on `/money-claim/` landing page?
- Should it include eligibility information or just be "Start now" button?
- Current plan: Simple start page with service name and "Start now" button
